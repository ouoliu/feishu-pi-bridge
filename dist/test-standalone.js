#!/usr/bin/env node
/**
 * 最小化独立测试：单独验证 pi SDK 在 bridge 进程上下文中是否能正常工作。
 */
import { AuthStorage, ModelRegistry, SessionManager, createAgentSession, } from '@earendil-works/pi-coding-agent';
async function main() {
    const start = Date.now();
    const log = (msg) => console.error(`[${((Date.now() - start) / 1000).toFixed(1)}s] ${msg}`);
    log('AuthStorage...');
    const authStorage = AuthStorage.create();
    log('ModelRegistry...');
    const modelRegistry = ModelRegistry.create(authStorage);
    log('getAvailable...');
    const avail = await modelRegistry.getAvailable();
    log(`可用: ${avail.length}`);
    log('createAgentSession...');
    const { session } = await createAgentSession({
        sessionManager: SessionManager.inMemory(),
        authStorage,
        modelRegistry,
        cwd: '/Users/jet',
        tools: ['read', 'bash'],
    });
    log(`OK: ${session.sessionId}`);
    log('send prompt...');
    let output = '';
    const unsub = session.subscribe((evt) => {
        if (evt.type === 'message_update') {
            const ae = evt.assistantMessageEvent;
            if (ae.type === 'text_delta' && ae.delta)
                output += ae.delta;
        }
    });
    await session.prompt('回复一个字：好');
    log(`回复: ${output.length} 字符`);
    log(`内容: ${output.slice(0, 200)}`);
    unsub();
    session.dispose();
    log('完成');
}
main().catch((err) => {
    console.error('失败:', err.message);
    process.exit(1);
});
