import type { BridgeConfig } from './config.js';
/**
 * 轮询式飞书桥接 — 不用 WebSocket，每 3 秒检查新消息
 */
export declare class PollingBridge {
    private token;
    private tokenExpiresAt;
    private session;
    private lastMessageId;
    private cfg;
    private chatId;
    private timer;
    constructor(cfg: BridgeConfig);
    init(): Promise<void>;
    private ensureToken;
    /** 设置要监听的 chat */
    setChat(chatId: string): void;
    start(): Promise<void>;
    stop(): void;
    private pollOnce;
    private processMessage;
    private sendMessage;
}
