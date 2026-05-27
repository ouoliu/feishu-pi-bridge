#!/usr/bin/env node
/** 监听飞书 SDK 所有事件，看看实际收到什么 */
import { Domain, LoggerLevel, createLarkChannel } from '@larksuiteoapi/node-sdk';
import { readFileSync } from 'fs';
const cfg = JSON.parse(readFileSync(process.env.HOME + '/.feishu-pi-bridge/config.json', 'utf8'));
const channel = createLarkChannel({
    appId: cfg.appId,
    appSecret: cfg.appSecret,
    domain: cfg.tenant === 'lark' ? Domain.Lark : Domain.Feishu,
    source: 'feishu-pi-bridge-debug',
    loggerLevel: LoggerLevel.info,
    logger: {
        error: (...args) => process.stderr.write('[SDK-ERR] ' + args.map(String).join(' ') + '\n'),
        warn: (...args) => process.stderr.write('[SDK-WARN] ' + args.map(String).join(' ') + '\n'),
        info: (...args) => { },
        debug: () => { },
        trace: () => { },
    },
    policy: { dmMode: 'open', requireMention: false },
    safety: { chatQueue: { enabled: false } },
    wsConfig: { pingTimeout: 3 },
});
channel.on({
    message: async (msg) => {
        process.stderr.write(`[EVENT-MESSAGE] chat=${msg.chatId.slice(-8)} sender=${msg.senderId.slice(-8)} content="${msg.content.slice(0, 80)}"\n`);
    },
    reject: (evt) => {
        process.stderr.write(`[EVENT-REJECT] chat=${evt.chatId.slice(-8)} reason=${evt.reason}\n`);
    },
    error: (err) => {
        process.stderr.write(`[EVENT-ERROR] ${err?.message ?? String(err)}\n`);
    },
    reconnecting: () => process.stderr.write('[EVENT-RECONNECTING]\n'),
    reconnected: () => process.stderr.write('[EVENT-RECONNECTED]\n'),
});
channel.connect().then(() => {
    const id = channel.botIdentity;
    process.stderr.write(`✅ Bot: ${id?.name} (${id?.openId})\n`);
    process.stderr.write('监听中...\n');
}).catch(e => {
    process.stderr.write(`❌ ${e.message}\n`);
    process.exit(1);
});
// 保持进程运行
setInterval(() => { }, 60000);
