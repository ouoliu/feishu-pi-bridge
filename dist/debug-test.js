#!/usr/bin/env node
/**
 * 端到端快速调试：模拟飞书消息直通 pi 桥接逻辑（不经过飞书 WebSocket）。
 */
import { AuthStorage, ModelRegistry, SessionManager, createAgentSession, } from '@earendil-works/pi-coding-agent';
let startTime = Date.now();
function log(...args) {
    const ts = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[${ts}s]`, ...args);
}
async function main() {
    log('=== 端到端测试开始 ===');
    // 1. 模拟 bridge init
    log('创建 pi session...');
    const authStorage = AuthStorage.create();
    const modelRegistry = ModelRegistry.create(authStorage);
    const startCreate = Date.now();
    const { session } = await createAgentSession({
        sessionManager: SessionManager.inMemory(),
        authStorage,
        modelRegistry,
        cwd: '/Users/jet',
        tools: ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'],
    });
    log(`session 创建完成: ${((Date.now() - startCreate) / 1000).toFixed(1)}s`);
    // 2. 模拟消息处理
    const prompt = `<bridge_context>
chat_id: oc_test123
chat_type: p2p
sender_id: ou_test456
sender_name: 测试用户
</bridge_context>

请用中文回复一句话：你好，今天天气怎么样？`;
    log('发送 prompt...');
    let collectedText = '';
    const unsub = session.subscribe((event) => {
        if (event.type === 'message_update') {
            const ae = event.assistantMessageEvent;
            if (ae.type === 'text_delta' && ae.delta)
                collectedText += ae.delta;
        }
        if (event.type === 'tool_execution_start') {
            log(`工具开始: ${event.toolName}`);
        }
        if (event.type === 'tool_execution_end') {
            log(`工具结束: ${event.toolName}`);
        }
    });
    const startPrompt = Date.now();
    await session.prompt(prompt);
    log(`prompt 完成: ${((Date.now() - startPrompt) / 1000).toFixed(1)}s`);
    log(`回复长度: ${collectedText.length}`);
    log(`回复内容: ${collectedText.slice(0, 200)}`);
    unsub();
    session.dispose();
    log('=== 测试完成 ===');
}
main().catch((err) => {
    log('错误:', err.message);
    console.error(err.stack);
    process.exit(1);
});
