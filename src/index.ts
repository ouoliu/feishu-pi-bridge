#!/usr/bin/env node
/**
 * feishu-pi-bridge — 飞书 ↔ pi coding agent 桥接器
 *
 * 支持：
 * - 私聊直接回复
 * - 群聊 @bot 回复
 * - 单卡片持续更新
 * - 会话延续
 */
import { loadConfig, type BridgeConfig } from './config.js';
import { PiAdapter } from './agent/pi-adapter.js';
import { SessionStore } from './session/store.js';
import { initialState, reduce, finalizeIfRunning } from './card/run-state.js';
import { renderCard } from './card/run-renderer.js';
import type { AgentRun } from './agent/types.js';

let cfg: BridgeConfig;
let token = '';
let tokenExp = 0;
let currentRun: AgentRun | null = null;

const adapter = new PiAdapter();
const sessions = new SessionStore();

/** 每个 chat 最新消息 ID */
const chatLastMsg = new Map<string, string>();

// ─── 飞书 API ────────────────────────────────────

async function getToken(): Promise<string> {
  if (token && Date.now() < tokenExp - 300000) return token;
  const r = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
  });
  const d = await r.json() as { code: number; tenant_access_token: string; expire: number };
  token = d.tenant_access_token;
  tokenExp = Date.now() + d.expire * 1000;
  return token;
}

async function addReaction(messageId: string, emoji = 'MUSCLE'): Promise<void> {
  const t = await getToken();
  await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reactions`, {
    method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reaction_type: { emoji_type: emoji } }),
  }).catch(() => {});
}

/** 发送卡片到指定 chat */
async function sendCard(chatId: string, cardJson: string): Promise<string> {
  const t = await getToken();
  const r = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
    method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ receive_id: chatId, msg_type: 'interactive', content: cardJson }),
  });
  const d = await r.json() as { code: number; data?: { message_id?: string } };
  if (d.code !== 0) { console.error(`  ⚠️ 卡片失败: code=${d.code}`); return ''; }
  return d.data?.message_id ?? '';
}

/** 上传图片到飞书，返回 img_key */
async function uploadImage(filePath: string): Promise<string | null> {
  try {
    const t = await getToken();
    const { readFileSync } = await import('node:fs');
    const blob = new Blob([readFileSync(filePath)]);
    const form = new FormData();
    form.append('image_type', 'message');
    form.append('image', blob, 'image.png');
    const r = await fetch('https://open.feishu.cn/open-apis/im/v1/images', {
      method: 'POST', headers: { Authorization: `Bearer ${t}` },
      body: form,
    });
    const d = await r.json() as { code: number; data?: { image_key?: string } };
    if (d.code === 0 && d.data?.image_key) {
      console.error(`  🖼️ 图片已上传: ${d.data.image_key.slice(0, 20)}…`);
      return d.data.image_key;
    }
    console.error(`  ⚠️ 图片上传失败: code=${d.code}`);
  } catch (e) { console.error(`  ⚠️ 图片上传错误:`, (e as Error).message); }
  return null;
}

async function updateCard(messageId: string, cardJson: string): Promise<void> {
  if (!messageId) return;
  const t = await getToken();
  await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${messageId}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg_type: 'interactive', content: cardJson }),
  }).catch(() => {});
}

/** 解析消息文本 */
function parseText(body: { content?: string }): string {
  let text = body?.content ?? '';
  try { text = JSON.parse(text).text || text; } catch {}
  return text;
}

/** 检查消息是否在白名单内 */
function isAllowed(chatId: string, senderOpenId?: string): boolean {
  const wl = cfg.whitelist;
  if (!wl || (wl.chatIds.length === 0 && wl.userIds.length === 0)) {
    return true; // 白名单未配置，全部放行
  }
  let allowed = true;
  if (wl.chatIds.length > 0) {
    allowed = wl.chatIds.includes(chatId);
  }
  if (wl.userIds.length > 0 && senderOpenId) {
    allowed = allowed && wl.userIds.includes(senderOpenId);
  }
  return allowed;
}

/** 检查群聊消息是否 @了 bot */
function isMentionedInGroup(text: string): boolean {
  // 飞书 @ 格式: @_user_xxx 或 @_all
  if (text.includes('@_all') || text.includes('@all')) return false;
  return text.includes('@');
}

// ─── 消息处理 ────────────────────────────────────

async function handleMessage(text: string, messageId: string, chatId: string): Promise<void> {
  console.error(`\n📩 [${chatId.slice(-8)}] ${text.slice(0, 60)}`);

  await addReaction(messageId, 'MUSCLE');
  console.error('  💪 表情');

  // 初始卡片
  let cardId = await sendCard(chatId, JSON.stringify({
    schema: '2.0', config: { wide_screen_mode: true },
    body: { elements: [
      { tag: 'markdown', content: '💪 **正在思考中...**' },
      { tag: 'markdown', content: '请稍等...', text_size: 'notation' },
    ]},
  }));
  console.error('  📇 卡片');

  const sessionEntry = sessions.get(chatId);
  const sessionFile = sessionEntry?.sessionFile;
  const prompt = `<bridge_context>\nchat_id: ${chatId}\nchat_type: group\n</bridge_context>\n\n${text}`;

  // 记录运行前已有的图片文件，用于检测新生成的图片
  const beforeImages = new Set<string>();
  try {
    const { readdirSync } = await import('node:fs');
    const { extname } = await import('node:path');
    for (const f of readdirSync(cfg.cwd)) {
      if (['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(extname(f).toLowerCase())) {
        beforeImages.add(f);
      }
    }
  } catch {}

  let state = initialState;
  let updateTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingJson = '';

  const flushCard = async () => {
    if (updateTimer) { clearTimeout(updateTimer); updateTimer = null; }
    if (!pendingJson || !cardId) return;
    await updateCard(cardId, pendingJson);
    pendingJson = '';
  };
  const scheduleUpdate = (json: string) => {
    pendingJson = json;
    if (!updateTimer) updateTimer = setTimeout(flushCard, 300);
  };

  currentRun = adapter.run({ prompt, cwd: cfg.cwd, sessionId: sessionFile });

  try {
    for await (const evt of currentRun.events) {
      if (evt.type === 'system' && evt.sessionId) {
        // 保存 session 文件路径（从 adapter 返回的 sessionId 其实是文件路径）
        sessions.set(chatId, evt.sessionId, cfg.cwd);
        await sessions.save(); continue;
      }
      if (evt.type === 'usage') continue;
      state = reduce(state, evt);
      const rawCard = renderCard(state) as Record<string, unknown>;
      const el = (rawCard.body as { elements: unknown[] }).elements;
      el.push({ tag: 'hr' });
      el.push({ tag: 'markdown', content: '🤖 feishu-pi-bridge', text_size: 'notation' });
      scheduleUpdate(JSON.stringify(rawCard));
    }
    // 最终状态：先清除 pending 定时器，再发送完成卡片
    state = finalizeIfRunning(state);
    if (updateTimer) { clearTimeout(updateTimer); updateTimer = null; }
    const finalCard = renderCard(state) as Record<string, unknown>;
    const elements = finalCard.body as { elements: unknown[] };

    // 检测新生成的图片并上传到飞书
    const newImages: string[] = [];
    try {
      const { readdirSync, statSync } = await import('node:fs');
      const { extname, join } = await import('node:path');
      for (const f of readdirSync(cfg.cwd)) {
        if (!['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(extname(f).toLowerCase())) continue;
        if (beforeImages.has(f)) continue;
        // 只处理 3 秒内的新文件
        const age = Date.now() - statSync(join(cfg.cwd, f)).mtimeMs;
        if (age < 60000) newImages.push(join(cfg.cwd, f));
      }
    } catch {}

    // 上传图片并单独发送图片消息
    const imageKeys: string[] = [];
    for (const imgPath of newImages.slice(0, 3)) { // 最多 3 张
      const key = await uploadImage(imgPath);
      if (key) imageKeys.push(key);
    }

    // 卡片之后单独发图片消息（卡片不支持内嵌图片）
    if (imageKeys.length > 0) {
      console.error(`  🖼️ 发送 ${imageKeys.length} 张图...`);
      const t = await getToken();
      for (const imgKey of imageKeys) {
        await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
          method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receive_id: chatId, msg_type: 'image',
            content: JSON.stringify({ image_key: imgKey }),
          }),
        }).catch(() => {});
      }
    }
    elements.elements.push(
      { tag: 'hr' },
      { tag: 'markdown', content: '🤖 feishu-pi-bridge', text_size: 'notation' }
    );
    if (cardId) await updateCard(cardId, JSON.stringify(finalCard));
    console.error(`  ✅ 完成${newImages.length > 0 ? ` (${imageKeys.length} 张图)` : ''}`);
  } catch (err) {
    console.error(`  ❌ 错误:`, (err as Error).message);
    if (cardId) {
      await updateCard(cardId, JSON.stringify({
        schema: '2.0', config: { wide_screen_mode: true },
        body: { elements: [
          { tag: 'markdown', content: '❌ **处理出错**' },
          { tag: 'markdown', content: (err as Error).message, text_size: 'notation' },
          { tag: 'hr' },
          { tag: 'markdown', content: '🤖 feishu-pi-bridge', text_size: 'notation' },
        ]},
      }));
    }
  } finally { currentRun = null; }
}

async function handleSlash(text: string, chatId: string): Promise<boolean> {
  const cmd = text.trim().toLowerCase();
  const footer = '🤖 feishu-pi-bridge';
  const card = (title: string, body: string) => JSON.stringify({
    schema: '2.0', config: { wide_screen_mode: true },
    body: { elements: [
      { tag: 'markdown', content: `**${title}**` },
      { tag: 'markdown', content: body },
      { tag: 'hr' },
      { tag: 'markdown', content: footer, text_size: 'notation' },
    ]},
  });

  if (cmd === '/new' || cmd === '/reset') {
    sessions.delete(chatId); await sessions.save();
    await sendCard(chatId, card('🔄 会话已重置', ''));
    return true;
  }
  if (cmd === '/status') {
    const e = sessions.get(chatId);
    await sendCard(chatId, card('📊 状态', e
      ? `上次对话: \`${e.sessionFile.slice(-20)}\`\n目录: \`${e.cwd}\``
      : '暂无活跃会话'));
    return true;
  }
  if (cmd === '/whitelist') {
    const wl = cfg.whitelist;
    if (!wl || (wl.chatIds.length === 0 && wl.userIds.length === 0)) {
      await sendCard(chatId, card('📋 白名单状态', '🔓 **白名单未启用**\n当前所有聊天均可对话。'));
    } else {
      const parts: string[] = [];
      if (wl.chatIds.length > 0) parts.push(`**允许的群聊/私聊 (${wl.chatIds.length}):**\n${wl.chatIds.map(id => `\`${id}\``).join('\n')}`);
      if (wl.userIds.length > 0) parts.push(`**允许的用户 (${wl.userIds.length}):**\n${wl.userIds.map(id => `\`${id}\``).join('\n')}`);
      await sendCard(chatId, card('📋 白名单状态', parts.join('\n\n')));
    }
    return true;
  }
  if (cmd === '/help') {
    await sendCard(chatId, card('命令指南',
      '直接发消息回复\n`/new` 重置\n`/status` 状态\n`/whitelist` 查看白名单\n`/help` 帮助'));
    return true;
  }
  return false;
}

// ─── 轮询 ────────────────────────────────────────

/** 获取 bot 加入的所有聊天 */
async function fetchChats(): Promise<string[]> {
  const chats: string[] = [];
  try {
    const t = await getToken();
    let pageToken = '';
    for (let i = 0; i < 5; i++) { // 最多查 5 页
      const params = new URLSearchParams({ page_size: '50' });
      if (pageToken) params.set('page_token', pageToken);
      const r = await fetch(`https://open.feishu.cn/open-apis/im/v1/chats?${params}`,
        { headers: { Authorization: `Bearer ${t}` } });
      const d = await r.json() as { code: number; data?: { items?: Array<{ chat_id: string }>; page_token?: string } };
      if (d.code !== 0 || !d.data?.items) break;
      for (const c of d.data.items) chats.push(c.chat_id);
      pageToken = d.data.page_token ?? '';
      if (!pageToken) break;
    }
  } catch {}
  return chats;
}

interface MsgItem {
  message_id: string; chat_type?: string;
  sender: { sender_type: string; id?: string }; body?: { content?: string };
}

async function fetchMessages(chatId: string): Promise<MsgItem[]> {
  const t = await getToken();
  const r = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=${chatId}&page_size=10&sort_type=ByCreateTimeDesc`,
    { headers: { Authorization: `Bearer ${t}` } }
  );
  const d = await r.json() as { code: number; data?: { items?: MsgItem[] } };
  return (d.code === 0 && d.data?.items) ? d.data.items : [];
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   feishu-pi-bridge                  ║');
  console.log('╚══════════════════════════════════════╝\n');

  cfg = await loadConfig();
  console.log(`✅ App: ${cfg.appId} (${cfg.tenant})`);

  if (!(await adapter.isAvailable())) {
    console.error('❌ pi agent 不可用'); process.exit(1);
  }
  console.log(`✅ ${adapter.displayName}`);
  await sessions.load();
  console.log(`✅ 会话已加载`);

  // 白名单状态
  const wl = cfg.whitelist;
  if (wl && (wl.chatIds.length > 0 || wl.userIds.length > 0)) {
    console.log(`🔒 白名单已启用:`);
    if (wl.chatIds.length > 0) console.log(`   允许的聊天: ${wl.chatIds.join(', ')}`);
    if (wl.userIds.length > 0) console.log(`   允许的用户: ${wl.userIds.join(', ')}`);
  } else {
    console.log(`🔓 白名单未启用 (所有聊天均可对话)`);
  }

  // 周期性轮询所有聊天
  const pollAll = async () => {
    const chats = await fetchChats();
    if (chats.length === 0) {
      console.error('⚠️ Bot 没有加入任何聊天。请把 bot 拉到群聊或私聊它。');
      return;
    }

    for (const chatId of chats) {
      try {
        const msgs = await fetchMessages(chatId);
        let seenLast = !chatLastMsg.has(chatId);
        const reversed = [...msgs].reverse();

        for (const m of reversed) {
          if (m.sender.sender_type === 'app') continue;
          const text = parseText(m.body ?? {});
          // 跳过系统消息（如「xxx 邀请 bot 进群」）
          if (!text || text.startsWith('{') && text.includes('"template"')) continue;

          if (!seenLast) {
            if (m.message_id === chatLastMsg.get(chatId)) seenLast = true;
            continue;
          }
          if (!chatLastMsg.has(chatId)) {
            chatLastMsg.set(chatId, m.message_id);
            continue;
          }

          chatLastMsg.set(chatId, m.message_id);
          const isGroup = m.chat_type === 'group';
          const senderOpenId = m.sender?.id;

          // 白名单检查（含 sender 信息）
          if (!isAllowed(chatId, senderOpenId)) {
            console.error(`  🚫 白名单拦截: chat=${chatId.slice(-8)} sender=${senderOpenId?.slice(-8) ?? '?'}`);
            continue;
          }

          // 群聊：只回复 @bot 的消息
          if (isGroup && !isMentionedInGroup(text)) continue;

          if (await handleSlash(text, chatId)) continue;
          await handleMessage(text, m.message_id, chatId);
        }
      } catch { /* per-chat error */ }
    }
  };

  // 首次延迟 3s 让 bot 有时间获取 chats
  setTimeout(() => {
    pollAll();
    setInterval(pollAll, 5000); // 每 5 秒轮询所有聊天
  }, 3000);

  console.log('🔄 开始轮询所有聊天 (5s)...\n');
}

main().catch(e => { console.error('❌ 失败:', e); process.exit(1); });
