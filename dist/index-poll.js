#!/usr/bin/env node
/** feishu-pi-bridge — 轮询模式（不用 WebSocket） */
import { loadConfig } from './config.js';
import { PollingBridge } from './bridge-poll.js';
async function main() {
    console.log('feishu-pi-bridge (轮询模式)');
    const cfg = loadConfig();
    console.log(`App ID: ${cfg.appId}`);
    const bridge = new PollingBridge(cfg);
    await bridge.init();
    // 用小当家Pi 给你发一条消息，同时获取 chat_id
    console.log('发送测试消息获取 chat_id...');
    const token = await getToken(cfg);
    const res = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=union_id', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            receive_id: 'on_10281e2cbc8d96ae99937e0af0729376',
            msg_type: 'text',
            content: JSON.stringify({ text: '轮询模式已启动 🤖 回复我即可' }),
        }),
    });
    const data = await res.json();
    if (data.code === 0 && data.data?.chat_id) {
        console.log(`✅ chat_id: ${data.data.chat_id.slice(-12)}`);
        bridge.setChat(data.data.chat_id);
        await bridge.start();
    }
    else {
        console.error('❌ 获取 chat_id 失败:', JSON.stringify(data));
        process.exit(1);
    }
    process.on('SIGINT', () => { bridge.stop(); process.exit(0); });
    process.on('SIGTERM', () => { bridge.stop(); process.exit(0); });
}
async function getToken(cfg) {
    const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
    });
    const d = await res.json();
    if (d.code !== 0)
        throw new Error(JSON.stringify(d));
    return d.tenant_access_token;
}
main().catch(e => { console.error('失败:', e.message); process.exit(1); });
