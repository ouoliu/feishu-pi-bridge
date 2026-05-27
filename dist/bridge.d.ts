import type { LarkChannel, NormalizedMessage } from '@larksuiteoapi/node-sdk';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
/**
 * 飞书 ↔ pi 桥接。
 * 一条消息一个 session prompt，回复收集后发回飞书。
 */
export declare class PiBridge {
    private session;
    private channel;
    private msgQueue;
    private processing;
    constructor(session: AgentSession, channel: LarkChannel);
    enqueue(msg: NormalizedMessage): Promise<void>;
    private processQueue;
    private processOne;
    private onEvent;
    dispose(): void;
}
