/**
 * PiAdapter — 实现 AgentAdapter 接口，使用 pi SDK
 *
 * 设计目标：
 * - 插入 feishu-claude-code-bridge 的完整基础设施
 * - 流式输出（pi 边生成边推送事件）
 * - 支持中断（/stop 命令）
 */
import type { AgentAdapter, AgentRun, AgentRunOptions } from '../agent/types.js';
export declare class PiAdapter implements AgentAdapter {
    readonly id = "pi";
    readonly displayName = "Pi Agent";
    isAvailable(): Promise<boolean>;
    run(opts: AgentRunOptions): AgentRun;
    private createEventStream;
}
