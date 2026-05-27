/**
 * PiAdapter — 实现 AgentAdapter 接口，使用 pi SDK
 *
 * 设计目标：
 * - 插入 feishu-claude-code-bridge 的完整基础设施
 * - 流式输出（pi 边生成边推送事件）
 * - 支持中断（/stop 命令）
 */
import { AuthStorage, ModelRegistry, SessionManager, createAgentSession, } from '@earendil-works/pi-coding-agent';
/**
 * 异步队列 — push 和 shift 可以跨 async 上下文工作
 */
class AsyncQueue {
    items = [];
    pendingResolve = null;
    closed = false;
    push(item) {
        if (this.closed)
            return;
        if (this.pendingResolve) {
            const r = this.pendingResolve;
            this.pendingResolve = null;
            r({ value: item, done: false });
        }
        else {
            this.items.push(item);
        }
    }
    close() {
        this.closed = true;
        if (this.pendingResolve) {
            this.pendingResolve({ value: undefined, done: true });
            this.pendingResolve = null;
        }
    }
    [Symbol.asyncIterator]() {
        return {
            next: () => {
                if (this.items.length > 0) {
                    return Promise.resolve({ value: this.items.shift(), done: false });
                }
                if (this.closed) {
                    return Promise.resolve({ value: undefined, done: true });
                }
                return new Promise((resolve) => {
                    this.pendingResolve = resolve;
                });
            },
        };
    }
}
export class PiAdapter {
    id = 'pi';
    displayName = 'Pi Agent';
    async isAvailable() {
        try {
            const auth = AuthStorage.create();
            const reg = ModelRegistry.create(auth);
            const avail = await reg.getAvailable();
            return avail.length > 0;
        }
        catch {
            return false;
        }
    }
    run(opts) {
        let session = null;
        let abortRequested = false;
        const abortHandlers = [];
        const requestAbort = () => {
            abortRequested = true;
            for (const h of abortHandlers)
                h();
            if (session) {
                session.abort().catch(() => { });
            }
        };
        const events = this.createEventStream(opts, {
            onAbort: (handler) => abortHandlers.push(handler),
            getSession: () => session,
            setSession: (s) => { session = s; },
            isAborted: () => abortRequested,
        });
        return {
            events,
            async stop() {
                requestAbort();
            },
            async waitForExit(_timeoutMs) {
                return true;
            },
        };
    }
    async *createEventStream(opts, ctx) {
        let capturedSessionId;
        try {
            // 1. 初始化 pi session
            const auth = AuthStorage.create();
            const reg = ModelRegistry.create(auth);
            const result = await createAgentSession({
                sessionManager: SessionManager.inMemory(),
                authStorage: auth,
                modelRegistry: reg,
                cwd: opts.cwd,
                tools: ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'],
            });
            const session = result.session;
            ctx.setSession(session);
            capturedSessionId = session.sessionId;
            // 发出 system 事件（bridge 用它记录 sessionId）
            yield { type: 'system', sessionId: session.sessionId };
            // 2. 创建事件队列，订阅 pi 事件
            const queue = new AsyncQueue();
            const unsub = session.subscribe((evt) => {
                if (ctx.isAborted())
                    return;
                switch (evt.type) {
                    case 'message_update': {
                        const ae = evt.assistantMessageEvent;
                        // 文本增量
                        if (ae.type === 'text_delta' && ae.delta) {
                            queue.push({ type: 'text', delta: ae.delta });
                        }
                        // 思考过程增量
                        if (ae.type === 'thinking_delta' && ae.delta) {
                            queue.push({ type: 'thinking', delta: ae.delta });
                        }
                        break;
                    }
                    case 'tool_execution_start': {
                        // 工具调用开始
                        queue.push({
                            type: 'tool_use',
                            id: evt.toolCallId,
                            name: evt.toolName,
                            input: evt.args,
                        });
                        break;
                    }
                    case 'tool_execution_end': {
                        // 工具调用结束
                        const output = evt.isError
                            ? `Error: ${JSON.stringify(evt.result)}`
                            : typeof evt.result === 'string'
                                ? evt.result
                                : JSON.stringify(evt.result);
                        queue.push({
                            type: 'tool_result',
                            id: evt.toolCallId,
                            output,
                            isError: evt.isError ?? false,
                        });
                        break;
                    }
                }
            });
            // 3. 同时开始 prompt 和消费队列
            const promptPromise = session.prompt(opts.prompt).catch((err) => {
                if (!ctx.isAborted()) {
                    queue.push({ type: 'error', message: err.message });
                }
            });
            // 4. 从队列 yield 事件（流式输出）
            for await (const event of queue) {
                yield event;
            }
            // 5. 等待 prompt 完成
            await promptPromise;
            // 6. 完成
            if (!ctx.isAborted()) {
                yield { type: 'done', sessionId: capturedSessionId };
            }
            unsub();
        }
        catch (err) {
            if (!ctx.isAborted()) {
                yield { type: 'error', message: err.message };
            }
        }
    }
}
