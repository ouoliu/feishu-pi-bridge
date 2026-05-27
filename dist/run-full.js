#!/usr/bin/env node
/**
 * feishu-pi-bridge — 完整版
 *
 * 架构与 feishu-claude-code-bridge 一致：
 * - AgentAdapter 接口 → PiAdapter
 * - RunState 有限状态机 → 流式卡片
 * - SessionStore → 会话延续
 * - 轮询消息（因 WebSocket 事件订阅暂不可用）
 */
import { loadConfig } from './config.js';
import { PiAdapter } from './agent/pi-adapter.js';
import { SessionStore } from './session/store.js';
import { initialState, reduce, finalizeIfRunning } from './card/run-state.js';
import { renderCard } from './card/run-renderer.js';
const cfg = loadConfig();
const CHAT_ID = process.env.FEISHU_CHAT_ID || 'oc_3677cdeaf52b022c778c8097caeefe6c';
let lastMsgId = '';
let token = '';
let tokenExp = 0;
let currentRun = null;
const adapter = new PiAdapter();
const sessions = new SessionStore();
// ─── 飞书 API ────────────────────────────────────
async function getToken() {
    if (token && Date.now() < tokenExp - 300000)
        return token;
    const r = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
    });
    const d = await r.json();
    token = d.tenant_access_token;
    tokenExp = Date.now() + d.expire * 1000;
    return token;
}
async function addReaction(messageId, emoji = 'MUSCLE') {
    const t = await getToken();
    await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reactions`, {
        method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction_type: { emoji_type: emoji } }),
    }).catch(() => { });
}
/** 发送一张新卡片，返回 message_id */
async function sendCard(cardJson) {
    const t = await getToken();
    const r = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
        method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ receive_id: CHAT_ID, msg_type: 'interactive', content: cardJson }),
    });
    const d = await r.json();
    if (d.code !== 0) {
        console.error(`  ⚠️ 卡片发送失败: code=${d.code}`);
        return '';
    }
    return d.data?.message_id ?? '';
}
/** 更新已发送的卡片（同一张卡片变化） */
async function updateCard(messageId, cardJson) {
    if (!messageId)
        return;
    const t = await getToken();
    await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${messageId}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg_type: 'interactive', content: cardJson }),
    }).catch(() => { });
}
/** 获取最新用户消息 ID */
async function initLastMsgId() {
    const t = await getToken();
    const r = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=${CHAT_ID}&page_size=5&sort_type=ByCreateTimeDesc`, { headers: { Authorization: `Bearer ${t}` } });
    const d = await r.json();
    if (d.code === 0 && d.data?.items) {
        for (const m of d.data.items) {
            if (m.sender.sender_type !== 'app')
                return m.message_id;
        }
    }
    return '';
}
// ─── 消息处理 ────────────────────────────────────
async function handleMessage(text, messageId) {
    console.error(`\n📩 ${text.slice(0, 80)}`);
    // 1. 表情 💪
    await addReaction(messageId, 'MUSCLE');
    console.error('  💪 表情已回复');
    // 2. 发送初始卡片（会被持续更新）
    let cardId = await sendCard(JSON.stringify(buildThinkingCard()));
    console.error('  📇 初始卡片已发送');
    // 3. 构建 prompt（带上下文）
    const sessionEntry = sessions.get(CHAT_ID);
    const prompt = `<bridge_context>\nchat_id: ${CHAT_ID}\nchat_type: p2p\n</bridge_context>\n\n${text}`;
    // 4. 运行 pi agent — 单卡片持续更新
    let state = initialState;
    let updateTimer = null;
    let pendingCardJson = '';
    const flushCard = async () => {
        if (updateTimer) {
            clearTimeout(updateTimer);
            updateTimer = null;
        }
        if (!pendingCardJson || !cardId)
            return;
        await updateCard(cardId, pendingCardJson);
        pendingCardJson = '';
    };
    const scheduleUpdate = (cardJson) => {
        pendingCardJson = cardJson;
        if (!updateTimer) {
            updateTimer = setTimeout(() => { flushCard(); }, 300); // 300ms 防抖
        }
    };
    currentRun = adapter.run({
        prompt,
        cwd: cfg.cwd,
        sessionId: sessionEntry?.sessionId,
    });
    try {
        for await (const evt of currentRun.events) {
            if (evt.type === 'system' && evt.sessionId) {
                sessions.set(CHAT_ID, evt.sessionId, cfg.cwd);
                await sessions.save();
                continue;
            }
            if (evt.type === 'usage')
                continue;
            // 更新状态机
            state = reduce(state, evt);
            // 生成卡片 JSON 并安排更新（同一张卡片）
            const rawCard = renderCard(state);
            // 添加页脚
            const elements = rawCard.body.elements;
            elements.push({ tag: 'hr' });
            elements.push({ tag: 'markdown', content: '🤖 小当家Pi · powered by pi coding agent', text_size: 'notation' });
            scheduleUpdate(JSON.stringify(rawCard));
        }
        // 最终更新
        state = finalizeIfRunning(state);
        const rawCard = renderCard(state);
        const elements = rawCard.body.elements;
        elements.push({ tag: 'hr' });
        elements.push({ tag: 'markdown', content: '🤖 小当家Pi · powered by pi coding agent', text_size: 'notation' });
        await flushCard();
        console.error(`  ✅ 卡片已更新`);
    }
    catch (err) {
        console.error(`  ❌ 处理错误:`, err.message);
        if (cardId) {
            // 更新同一张卡片为错误状态
            await updateCard(cardId, JSON.stringify({
                schema: '2.0', config: { wide_screen_mode: true },
                body: { elements: [
                        { tag: 'markdown', content: `❌ **处理出错**` },
                        { tag: 'markdown', content: err.message, text_size: 'notation' },
                        { tag: 'hr' },
                        { tag: 'markdown', content: '🤖 小当家Pi · powered by pi coding agent', text_size: 'notation' },
                    ] },
            }));
        }
    }
    finally {
        currentRun = null;
    }
}
function buildCardResponse(title, body, footer) {
    const elements = [
        { tag: 'markdown', content: `**${title}**` },
        { tag: 'markdown', content: body },
    ];
    if (footer) {
        elements.push({ tag: 'hr' });
        elements.push({ tag: 'markdown', content: footer, text_size: 'notation' });
    }
    return JSON.stringify({ schema: '2.0', config: { wide_screen_mode: true }, body: { elements } });
}
function buildThinkingCard() {
    return {
        schema: '2.0', config: { wide_screen_mode: true },
        body: {
            elements: [
                { tag: 'markdown', content: '💪 **正在思考中...**' },
                { tag: 'markdown', content: '请稍等，小当家Pi 正在处理你的消息', text_size: 'notation' },
            ],
        },
    };
}
// ─── 斜杠命令 ────────────────────────────────────
async function handleSlashCommand(text) {
    const cmd = text.trim().toLowerCase();
    const footer = '🤖 小当家Pi · powered by pi coding agent';
    if (cmd === '/new' || cmd === '/reset') {
        sessions.delete(CHAT_ID);
        await sessions.save();
        await sendCard(buildCardResponse('🔄 会话已重置', '已清空当前对话历史，可以开始新对话了', footer));
        return true;
    }
    if (cmd === '/status') {
        const entry = sessions.get(CHAT_ID);
        const body = entry
            ? `- Session: \`${entry.sessionId.slice(0, 12)}…\`\n- 工作目录: \`${entry.cwd}\``
            : '暂无活跃会话\n\n发送消息将自动创建新会话';
        await sendCard(buildCardResponse('📊 小当家Pi 状态', body, footer));
        return true;
    }
    if (cmd === '/help') {
        const body = '直接发消息 → 小当家Pi 自动回复\n\n'
            + '**命令**\n'
            + '- \`/new\` 重置会话\n'
            + '- \`/status\` 查看状态\n'
            + '- \`/cd <目录>\` 切换工作目录\n'
            + '- \`/help\` 显示此帮助';
        await sendCard(buildCardResponse('小当家Pi 命令指南', body, footer));
        return true;
    }
    return false;
}
// ─── 轮询主循环 ─────────────────────────────────
async function main() {
    console.log('╔══════════════════════════════════════╗');
    console.log('║   feishu-pi-bridge (完整版)          ║');
    console.log('╚══════════════════════════════════════╝\n');
    // 检查 adapter
    if (!(await adapter.isAvailable())) {
        console.error('❌ pi agent 不可用（检查 auth.json 中的 API key）');
        process.exit(1);
    }
    console.log(`✅ pi adapter: ${adapter.displayName}`);
    // 加载 session
    await sessions.load();
    const entry = sessions.get(CHAT_ID);
    console.log(`📝 session: ${entry ? `有 (${entry.sessionId.slice(0, 12)}…)` : '无（首次运行）'}`);
    // 初始化 lastMsgId
    lastMsgId = await initLastMsgId();
    console.log(`📩 监听 chat: ${CHAT_ID.slice(-12)}`);
    console.log(`   lastMsgId: ${lastMsgId.slice(-12)}`);
    console.log('');
    // 开始轮询
    setInterval(poll, 3000);
    await poll(); // 首次立即执行
}
async function poll() {
    try {
        const t = await getToken();
        const r = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=${CHAT_ID}&page_size=10&sort_type=ByCreateTimeDesc`, { headers: { Authorization: `Bearer ${t}` } });
        const d = await r.json();
        if (d.code !== 0 || !d.data?.items)
            return;
        let seenLast = lastMsgId === '';
        const msgs = [...d.data.items].reverse();
        for (const m of msgs) {
            if (m.sender.sender_type === 'app')
                continue;
            if (!seenLast) {
                if (m.message_id === lastMsgId)
                    seenLast = true;
                continue;
            }
            let text = m.body?.content ?? '';
            try {
                text = JSON.parse(text).text || text;
            }
            catch { }
            lastMsgId = m.message_id;
            // 检查斜杠命令
            const handled = await handleSlashCommand(text);
            if (handled)
                continue;
            // 正常消息处理
            await handleMessage(text, m.message_id);
        }
    }
    catch (e) { /* poll err silently */ }
}
main().catch(e => console.error('fatal:', e.message));
