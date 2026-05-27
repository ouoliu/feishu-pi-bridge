/**
 * RunState — 有限状态机，管理 agent 运行状态
 * 与 feishu-claude-code-bridge 相同设计
 */
import type { AgentEvent } from '../agent/types.js';
export type ToolStatus = 'running' | 'done' | 'error';
export interface ToolEntry {
    id: string;
    name: string;
    input: unknown;
    status: ToolStatus;
    output?: string;
}
export type Block = {
    kind: 'text';
    content: string;
    streaming: boolean;
} | {
    kind: 'tool';
    tool: ToolEntry;
};
export type FooterStatus = 'thinking' | 'tool_running' | 'streaming' | null;
export type Terminal = 'running' | 'done' | 'interrupted' | 'error' | 'idle_timeout';
export interface RunState {
    blocks: Block[];
    reasoning: {
        content: string;
        active: boolean;
    };
    footer: FooterStatus;
    terminal: Terminal;
    errorMsg?: string;
    idleTimeoutMinutes?: number;
}
export declare const initialState: RunState;
export declare function reduce(state: RunState, evt: AgentEvent): RunState;
export declare function markInterrupted(state: RunState): RunState;
export declare function markIdleTimeout(state: RunState, minutes: number): RunState;
export declare function finalizeIfRunning(state: RunState): RunState;
