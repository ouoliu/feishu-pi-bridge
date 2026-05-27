#!/usr/bin/env tsx
import { AuthStorage, ModelRegistry, SessionManager, createAgentSession, } from '@earendil-works/pi-coding-agent';
const start = Date.now();
function log(msg) {
    console.error(`[${((Date.now() - start) / 1000).toFixed(1)}s] ${msg}`);
}
async function main() {
    log('开始测试 createAgentSession...');
    const authStorage = AuthStorage.create();
    log('AuthStorage 创建完成');
    const modelRegistry = ModelRegistry.create(authStorage);
    log('ModelRegistry 创建完成');
    log('获取可用模型...');
    const available = await modelRegistry.getAvailable();
    log(`可用模型: ${available.length}`);
    for (const m of available) {
        log(`  ${m.provider}/${m.id}`);
    }
    log('创建 session...');
    try {
        const result = await createAgentSession({
            sessionManager: SessionManager.inMemory(),
            authStorage,
            modelRegistry,
            cwd: '/Users/jet',
            tools: ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'],
        });
        log(`Session 创建成功: ${result.session.sessionId}`);
        log(`Model: ${result.session.model?.provider}/${result.session.model?.id}`);
        log('发送 prompt...');
        let textOutput = '';
        const unsub = result.session.subscribe((event) => {
            if (event.type === 'message_update') {
                const ae = event.assistantMessageEvent;
                if (ae.type === 'text_delta' && ae.delta) {
                    textOutput += ae.delta;
                    process.stdout.write(ae.delta);
                }
            }
            if (event.type === 'tool_execution_start') {
                log(`工具: ${event.toolName}`);
            }
        });
        await result.session.prompt('用一句话回复：今天几号？');
        log(`\n\n完成，收到 ${textOutput.length} 字符`);
        unsub();
        result.session.dispose();
    }
    catch (err) {
        log(`错误: ${err.message}`);
        if (err.stack)
            log(`Stack: ${err.stack.slice(0, 500)}`);
    }
}
main().catch((err) => log(`Fatal: ${err.message}`));
