#!/usr/bin/env node
/**
 * feishu-pi-bridge v4 — 修复卡片格式 + 表情回复
 */
import { loadConfig } from './config.js';
import { AuthStorage, ModelRegistry, SessionManager, createAgentSession, } from '@earendil-works/pi-coding-agent';
const cfg = loadConfig();
const CHAT_ID = 'oc_3677cdeaf52b022c778c8097caeefe6c';
let lastMsgId = '';
let session = null;
let token = '';
let tokenExp = 0;
// ─── 飞书 API ─────────────────────────────────────
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
/** 给消息加表情 */
async function addReaction(messageId, emoji = 'THUMBS_UP') {
    const t = await getToken();
    const r = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reactions`, {
        method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction_type: { emoji_type: emoji } }),
    });
    const d = await r.json();
    if (d.code !== 0)
        console.error(`  ⚠️ 表情失败: code=${d.code}`);
    else
        console.error('  ✅ 表情已回复');
}
/** 获取最近一条用户消息的 ID */
async function getLatestUserMessageId() {
    try {
        const t = await getToken();
        const r = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=${CHAT_ID}&page_size=5&sort_type=ByCreateTimeDesc`, { headers: { Authorization: `Bearer ${t}` } });
        const d = await r.json();
        if (d.code === 0 && d.data?.items) {
            for (const m of d.data.items) {
                if (m.sender.sender_type !== 'app')
                    return m.message_id;
            }
        }
    }
    catch { }
    return '';
}
// ─── 卡片构建（CardKit 2.0 schema）─────────────
function markdownBlock(text, size) {
    const block = { tag: 'markdown', content: text };
    if (size)
        block.text_size = size;
    return block;
}
function smallTextBlock(text) {
    return { tag: 'markdown', content: text, text_size: 'notation' };
}
function hrBlock() {
    return { tag: 'hr' };
}
/**
 * 将 Markdown 文本转为飞书卡片元素数组。
 * 飞书卡片 markdown 不支持 ### 标题，用 **加粗** + 加大字号模拟。
 */
function mdToCardElements(markdown) {
    const elements = [];
    const lines = markdown.split('\n');
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        // 空行
        if (!line.trim()) {
            i++;
            continue;
        }
        // 分隔线
        if (/^[-_]{3,}$/.test(line.trim())) {
            elements.push(hrBlock());
            i++;
            continue;
        }
        // 标题 ### → 加粗加大
        const hMatch = line.match(/^(#{1,6})\s+(.+)/);
        if (hMatch) {
            const level = hMatch[1].length;
            const title = hMatch[2].replace(/\*\*(.+?)\*\*/g, '$1'); // 去掉标题内的加粗
            // 用加粗 + 不同 size 模拟标题层级
            elements.push(markdownBlock(`**${title}**`));
            i++;
            continue;
        }
        // 引用块
        if (line.startsWith('> ')) {
            let quote = '';
            while (i < lines.length && lines[i].startsWith('> ')) {
                quote += lines[i].slice(2) + '\n';
                i++;
            }
            elements.push(markdownBlock(quote.trim()));
            continue;
        }
        // 普通段落（收集连续行）
        let para = '';
        while (i < lines.length && lines[i].trim() && !/^[-_]{3,}$/.test(lines[i].trim()) && !lines[i].startsWith('#')) {
            para += lines[i] + '\n';
            i++;
        }
        if (para.trim()) {
            elements.push(markdownBlock(para.trim()));
        }
    }
    return elements;
}
function buildCard_v2(markdownText) {
    const body_elements = mdToCardElements(markdownText);
    // 加页脚
    body_elements.push(hrBlock());
    body_elements.push(smallTextBlock('🤖 小当家Pi · powered by pi coding agent'));
    const card = {
        schema: '2.0',
        config: { wide_screen_mode: true },
        body: {
            elements: body_elements,
        },
    };
    return JSON.stringify(card);
}
async function sendCardReply(text) {
    try {
        const t = await getToken();
        const cardJson = buildCard_v2(text);
        const r = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
            method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ receive_id: CHAT_ID, msg_type: 'interactive', content: cardJson }),
        });
        const d = await r.json();
        if (d.code !== 0)
            console.error(`  ⚠️ 卡片发送失败: code=${d.code}`);
        else
            console.error('  ✅ 卡片已发送');
    }
    catch (e) {
        console.error('  send card fail:', e.message);
    }
}
/** 发送「思考中」卡片 */
async function sendThinkingCard() {
    try {
        const t = await getToken();
        const card = JSON.stringify({
            schema: '2.0',
            config: { wide_screen_mode: true },
            body: {
                elements: [
                    { tag: 'markdown', content: '💪 **正在思考中...**' },
                    { tag: 'markdown', content: '请稍等，小当家Pi 正在处理你的消息', text_size: 'notation' },
                ],
            },
        });
        await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
            method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ receive_id: CHAT_ID, msg_type: 'interactive', content: card }),
        });
    }
    catch { /* best effort */ }
}
// ─── 主逻辑 ─────────────────────────────────────
async function main() {
    console.log('初始化 pi agent...');
    const auth = AuthStorage.create();
    const reg = ModelRegistry.create(auth);
    const result = await createAgentSession({
        sessionManager: SessionManager.inMemory(), authStorage: auth, modelRegistry: reg,
        tools: ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'],
    });
    session = result.session;
    console.log(`✅ pi 就绪: ${session.model?.provider}/${session.model?.id}`);
    console.log(`监听 chat: ${CHAT_ID}`);
    lastMsgId = await getLatestUserMessageId();
    console.log(`初始化完成，lastMsgId=${lastMsgId.slice(-12)}`);
    console.log('开始轮询 (3s)...\n');
    setInterval(poll, 3000);
}
async function poll() {
    if (!session)
        return;
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
            console.error(`\n📩 ${text.slice(0, 80)}`);
            // 表情 💪（奋斗）
            await addReaction(m.message_id, 'MUSCLE');
            // 发送「思考中」卡片
            await sendThinkingCard();
            // pi 处理
            const buf = { t: '' };
            const unsub = session.subscribe((evt) => {
                if (evt.type === 'message_update' && evt.assistantMessageEvent.type === 'text_delta')
                    buf.t += evt.assistantMessageEvent.delta;
            });
            try {
                await session.prompt(`用户发来消息：${text}\n\n请用中文回复。`);
                const reply = buf.t.trim();
                if (reply) {
                    console.error(`  → 卡片 (${reply.length}ch)`);
                    await sendCardReply(reply);
                }
                else {
                    await sendCardReply('（处理完成，无返回内容）');
                }
            }
            finally {
                unsub();
            }
        }
    }
    catch (e) {
        console.error('poll err:', e.message);
    }
}
main().catch((e) => console.error('fatal:', e.message));
