#!/usr/bin/env node
/** 使用底层 WSClient 直接调试事件 */
import { WSClient } from '@larksuiteoapi/node-sdk';
const cfg = JSON.parse(require('fs').readFileSync(process.env.HOME + '/.feishu-pi-bridge/config.json', 'utf8'));
const ws = new WSClient({
    appId: cfg.appId,
    appSecret: cfg.appSecret,
    source: 'feishu-pi-bridge-ws',
    autoReconnect: true,
    onReady: () => { process.stderr.write('[WS] onReady\n'); },
    onError: (err) => { process.stderr.write('[WS] onError: ' + (err?.message ?? String(err)) + '\n'); },
    onReconnecting: () => { process.stderr.write('[WS] reconnecting...\n'); },
    onReconnected: () => { process.stderr.write('[WS] reconnected\n'); },
});
// 监听所有收到的消息
process.stderr.write('[WS] connecting...\n');
ws.start().then(() => {
    process.stderr.write('[WS] connected!\n');
}).catch(e => {
    process.stderr.write('[WS] failed: ' + e.message + '\n');
});
// 保持进程运行并定期输出状态
let lastCheck = Date.now();
setInterval(() => {
    const status = ws.getConnectionStatus();
    process.stderr.write(`[WS] state=${status.state} connected=${status.connected} elapsed=${((Date.now() - lastCheck) / 1000).toFixed(0)}s\n`);
    lastCheck = Date.now();
}, 10000);
process.on('SIGINT', () => { ws.stop(); process.exit(0); });
