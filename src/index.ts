#!/usr/bin/env node
/**
 * feishu-pi-bridge — 飞书 ↔ pi coding agent 桥接器
 *
 * 架构与 feishu-claude-code-bridge 一致：
 * - AgentAdapter 接口 → PiAdapter
 * - RunState 有限状态机 → 流式卡片
 * - SessionStore → 会话延续
 * - 首次启动扫码向导
 */
import { loadConfig, type BridgeConfig } from './config.js';
import { PiAdapter } from './agent/pi-adapter.js';
import { SessionStore } from './session/store.js';
import { initialState, reduce, finalizeIfRunning } from './card/run-state.js';
import { renderCard } from './card/run-renderer.js';
import type { AgentRun } from './agent/types.js';

let cfg: BridgeConfig;
const CHAT_ID_DEFAULT = 'oc_3677cdeaf52b022c778c8097caeefe6c';
let lastMsgId = '';
let token = '';
let tokenExp = 0;
let currentRun: AgentRun | null = null;

const adapter = new PiAdapter();
const sessions = new SessionStore();

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

/** 发送一张新卡片，返回 message_id */
async function sendCard(cardJson: string): Promise<string> {
  const t = await getToken();
  const CHAT_ID = process.env.FEISHU_CHAT_ID || CHAT_ID_DEFAULT;
  const r = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
    method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ receive_id: CHAT_ID, msg_type: 'interactive', content: cardJson }),
  });
  const d = await r.json() as { code: number; data?: { message_id?: string } };
  if (d.code !== 0) { console.error(`  ⚠️ 卡片发送失败: code=${d.code}`); return ''; }
  return d.data?.message_id ?? '';
}

/** 更新已发送的卡片（同一张卡片变化） */
async function updateCard(messageId: string, cardJson: string): Promise<void> {
  if (!messageId) return;
  const t = await getToken();
  await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${messageId}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg_type: 'interactive', content: cardJson }),
  }).catch(() => {});
}

async function getLatestUserMessageId(chatId: string): Promise<string> {
  const t = await getToken();
  const r = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=${chatId}&page_size=5&sort_type=ByCreateTimeDesc`,
    { headers: { Authorization: `Bearer ${t}` } }
  );
  const d = await r.json() as { code: number; data?: { items?: Array<{ message_id: string; sender: { sender_type: string } }> } };
  if (d.code === 0 && d.data?.items) {
    for (const m of d.data.items) {
      if (m.sender.sender_type !== 'app') return m.message_id;
    }
  }
  return '';
}

// ─── 消息处理 ────────────────────────────────────

async function handleMessage(text: string, messageId: string, CHAT_ID: string): Promise<void> {
  console.error(`\n📩 ${text.slice(0, 80)}`);

  await addReaction(messageId, 'MUSCLE');
  console.error('  💪 表情已回复');

  const thinkingCard = JSON.stringify({
    schema: '2.0', config: { wide_screen_mode: true },
    body: { elements: [
      { tag: 'markdown', content: '💪 **正在思考中...**' },
      { tag: 'markdown', content: '请稍等，小当家Pi 正在处理你的消息', text_size: 'notation' },
    ]},
  });
  let cardId = await sendCard(thinkingCard);
  console.error('  📇 初始卡片已发送');

  const sessionEntry = sessions.get(CHAT_ID);
  const prompt = `<bridge_context>\nchat_id: ${CHAT_ID}\nchat_type: p2p\n</bridge_context>\n\n${text}`;

  let state = initialState;
  let updateTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingCardJson = '';

  const flushCard = async () => {
    if (updateTimer) { clearTimeout(updateTimer); updateTimer = null; }
    if (!pendingCardJson || !cardId) return;
    await updateCard(cardId, pendingCardJson);
    pendingCardJson = '';
  };

  const scheduleUpdate = (json: string) => {
    pendingCardJson = json;
    if (!updateTimer) updateTimer = setTimeout(() => { flushCard(); }, 300);
  };

  currentRun = adapter.run({ prompt, cwd: cfg.cwd, sessionId: sessionEntry?.sessionId });

  try {
    for await (const evt of currentRun.events) {
      if (evt.type === 'system' && evt.sessionId) {
        sessions.set(CHAT_ID, evt.sessionId, cfg.cwd);
        await sessions.save();
        continue;
      }
      if (evt.type === 'usage') continue;
      state = reduce(state, evt);
      const rawCard = renderCard(state) as Record<string, unknown>;
      const elements = (rawCard.body as { elements: unknown[] }).elements;
      elements.push({ tag: 'hr' });
      elements.push({ tag: 'markdown', content: '🤖 feishu-pi-bridge', text_size: 'notation' });
      scheduleUpdate(JSON.stringify(rawCard));
    }

    state = finalizeIfRunning(state);
    const rawCard = renderCard(state) as Record<string, unknown>;
    const elements = (rawCard.body as { elements: unknown[] }).elements;
    elements.push({ tag: 'hr' });
    elements.push({ tag: 'markdown', content: '🤖 feishu-pi-bridge', text_size: 'notation' });
    await flushCard();
    console.error(`  ✅ 卡片已更新`);
  } catch (err) {
    console.error(`  ❌ 错误:`, (err as Error).message);
    if (cardId) {
      await updateCard(cardId, JSON.stringify({
        schema: '2.0', config: { wide_screen_mode: true },
        body: { elements: [
          { tag: 'markdown', content: '❌ **处理出错**' },
          { tag: 'markdown', content: (err as Error).message, text_size: 'notation' },
        ]},
      }));
    }
  } finally {
    currentRun = null;
  }
}

function buildCardResponse(title: string, body: string): string {
  return JSON.stringify({
    schema: '2.0', config: { wide_screen_mode: true },
    body: { elements: [
      { tag: 'markdown', content: `**${title}**` },
      { tag: 'markdown', content: body },
      { tag: 'hr' },
      { tag: 'markdown', content: '🤖 feishu-pi-bridge', text_size: 'notation' },
    ]},
  });
}

async function handleSlashCommand(text: string, CHAT_ID: string): Promise<boolean> {
  const cmd = text.trim().toLowerCase();
  if (cmd === '/new' || cmd === '/reset') {
    sessions.delete(CHAT_ID); await sessions.save();
    await sendCard(buildCardResponse('🔄 会话已重置', '已清空当前对话历史'));
    return true;
  }
  if (cmd === '/status') {
    const entry = sessions.get(CHAT_ID);
    const body = entry
      ? `- Session: \`${entry.sessionId.slice(0, 12)}…\`\n- 工作目录: \`${entry.cwd}\``
      : '暂无活跃会话';
    await sendCard(buildCardResponse('📊 状态', body));
    return true;
  }
  if (cmd === '/help') {
    await sendCard(buildCardResponse('小当家Pi 命令指南',
      '直接发消息 → 自动回复\n\n`/new` 重置会话\n`/status` 查看状态\n`/help` 帮助'));
    return true;
  }
  return false;
}

// ─── 轮询主循环 ─────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   feishu-pi-bridge                  ║');
  console.log('╚══════════════════════════════════════╝\n');

  cfg = await loadConfig();
  console.log(`\n✅ App: ${cfg.appId} (${cfg.tenant})`);

  if (!(await adapter.isAvailable())) {
    console.error('❌ pi agent 不可用（检查 ~/.pi/agent/auth.json 中的 API key）');
    process.exit(1);
  }
  console.log(`✅ Adapter: ${adapter.displayName}`);

  await sessions.load();
  const CHAT_ID = process.env.FEISHU_CHAT_ID || CHAT_ID_DEFAULT;
  const entry = sessions.get(CHAT_ID);
  console.log(`📝 Session: ${entry ? entry.sessionId.slice(0, 12) + '…' : '无'}`);

  lastMsgId = await getLatestUserMessageId(CHAT_ID);
  console.log(`📩 监听 chat: ${CHAT_ID.slice(-12)}`);
  console.log(`   lastMsgId: ${lastMsgId.slice(-12)}`);

  // 开始轮询
  setInterval(() => poll(CHAT_ID), 3000);
  await poll(CHAT_ID);
}

async function poll(CHAT_ID: string): Promise<void> {
  try {
    const t = await getToken();
    const r = await fetch(
      `https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=${CHAT_ID}&page_size=10&sort_type=ByCreateTimeDesc`,
      { headers: { Authorization: `Bearer ${t}` } }
    );
    const d = await r.json() as {
      code: number; data?: { items?: Array<{
        message_id: string; sender: { sender_type: string }; body?: { content?: string }
      }> }
    };
    if (d.code !== 0 || !d.data?.items) return;

    let seenLast = lastMsgId === '';
    const msgs = [...d.data.items].reverse();

    for (const m of msgs) {
      if (m.sender.sender_type === 'app') continue;
      if (!seenLast) {
        if (m.message_id === lastMsgId) seenLast = true;
        continue;
      }
      let text = m.body?.content ?? '';
      try { text = JSON.parse(text).text || text; } catch {}
      lastMsgId = m.message_id;

      if (await handleSlashCommand(text, CHAT_ID)) continue;
      await handleMessage(text, m.message_id, CHAT_ID);
    }
  } catch { /* silent */ }
}

main().catch(e => { console.error('❌ 启动失败:', e); process.exit(1); });
