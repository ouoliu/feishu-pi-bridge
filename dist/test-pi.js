#!/usr/bin/env tsx
/**
 * 测试 pi SDK 集成 — 不依赖飞书，仅验证 SDK 能否创建 session 并处理消息。
 */
import { AuthStorage, ModelRegistry, SessionManager, createAgentSession, } from '@earendil-works/pi-coding-agent';
async function main() {
    console.log('🧪 测试 pi SDK 集成');
    console.log('');
    // 1. 创建认证和模型注册表
    const authStorage = AuthStorage.create();
    const modelRegistry = ModelRegistry.create(authStorage);
    // 2. 获取可用模型信息
    const available = await modelRegistry.getAvailable();
    console.log(`可用模型: ${available.length}`);
    for (const m of available.slice(0, 5)) {
        console.log(`  - ${m.provider}/${m.id}`);
    }
    console.log('');
    // 3. 创建 agent session
    console.log('创建 pi agent session...');
    const { session } = await createAgentSession({
        sessionManager: SessionManager.inMemory(),
        authStorage,
        modelRegistry,
        cwd: '/Users/jet',
        tools: ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'],
    });
    console.log(`  Session ID: ${session.sessionId}`);
    console.log(`  Model: ${session.model?.provider}/${session.model?.id}`);
    console.log('');
    // 4. 订阅事件
    let textOutput = '';
    const unsub = session.subscribe((event) => {
        switch (event.type) {
            case 'message_update': {
                const ae = event.assistantMessageEvent;
                if (ae.type === 'text_delta' && ae.delta) {
                    textOutput += ae.delta;
                    process.stdout.write(ae.delta);
                }
                if (ae.type === 'thinking_delta' && ae.delta) {
                    // 思考过程 — 不输出到测试结果
                }
                break;
            }
            case 'tool_execution_start':
                console.log(`\n[工具] ${event.toolName}`);
                break;
            case 'tool_execution_end':
                console.log(`\n[工具完成] ${event.toolName}${event.isError ? ' (错误)' : ''}`);
                break;
            case 'agent_start':
                console.log('[Agent] 开始处理...');
                break;
            case 'agent_end':
                console.log('\n[Agent] 处理完成');
                break;
        }
    });
    // 5. 发送测试 prompt
    console.log('发送测试消息: "请用一句话告诉我今天的日期和时间"');
    console.log('--- 开始输出 ---');
    try {
        await session.prompt('请用一句话告诉我今天的日期和时间');
        console.log('\n--- 输出结束 ---');
        console.log(`\n✅ 成功! 收到 ${textOutput.length} 字符回复`);
    }
    catch (err) {
        console.error('\n❌ 失败:', err.message);
    }
    finally {
        unsub();
        session.dispose();
    }
}
main().catch((err) => {
    console.error('❌ 测试失败:', err);
    process.exit(1);
});
