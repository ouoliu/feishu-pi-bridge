import type { LarkChannel, NormalizedMessage } from '@larksuiteoapi/node-sdk';
import type { BridgeConfig } from './config.js';
export type MessageHandler = (msg: NormalizedMessage) => Promise<void>;
export interface BotHandle {
    channel: LarkChannel;
    disconnect(): Promise<void>;
}
/**
 * 创建飞书/Lark Bot 连接（WebSocket 长连接）
 */
export declare function createBot(cfg: BridgeConfig, onMessage: MessageHandler): BotHandle;
