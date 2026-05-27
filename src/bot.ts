import { Domain, LoggerLevel, createLarkChannel } from '@larksuiteoapi/node-sdk';
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
export function createBot(
  cfg: BridgeConfig,
  onMessage: MessageHandler,
): BotHandle {
  const channel = createLarkChannel({
    appId: cfg.appId,
    appSecret: cfg.appSecret,
    domain: cfg.tenant === 'lark' ? Domain.Lark : Domain.Feishu,
    source: 'feishu-pi-bridge',
    loggerLevel: LoggerLevel.info,
    logger: buildLogger(),
    policy: {
      dmMode: 'open',
      requireMention: false,
    },
    safety: {
      chatQueue: { enabled: false },
    },
    includeRawEvent: true,
    wsConfig: {
      pingTimeout: 3,
    },
    handshakeTimeoutMs: 8_000,
  });

  let consecutiveReconnects = 0;

  channel.on({
    message: async (msg) => {
      console.error(
        `[消息] chat=${msg.chatId.slice(-8)} type=${msg.chatType} ` +
        `sender=${msg.senderId.slice(-8)} content=${msg.content.slice(0, 60)}`
      );
      console.error(`[消息] msgId=${msg.messageId} chatId=${msg.chatId}`);
      await onMessage(msg).catch((err) => {
        console.error(`[错误] 处理消息失败:`, err.message);
      });
    },
    cardAction: async (evt) => {
      console.error('[卡片动作]', evt.chatId);
    },
    comment: async (evt) => {
      console.error('[评论]', evt.commentId);
    },
    reject: (evt) => {
      console.log(`[拒绝] chat=${evt.chatId.slice(-8)} reason=${evt.reason}`);
    },
    reconnecting: () => {
      consecutiveReconnects++;
      console.warn(`[WS] 重连中… (第 ${consecutiveReconnects} 次)`);
    },
    reconnected: () => {
      consecutiveReconnects = 0;
      console.log('[WS] 已重新连接');
    },
    error: (err) => {
      console.error('[WS] 错误:', err?.message ?? String(err));
    },
  });

  channel.connect().then(() => {
    const identity = channel.botIdentity;
    console.log(`\n✅ Bot 已连接!`);
    console.log(`   Bot 名称: ${identity?.name ?? 'unknown'}`);
    console.log(`   监听中… 在飞书私聊 bot 发消息即可\n`);
  }).catch((err) => {
    console.error('❌ Bot 连接失败:', err);
    process.exit(1);
  });

  return {
    channel,
    disconnect: async () => {
      await channel.disconnect();
    },
  };
}

function buildLogger() {
  return {
    error: (...args: unknown[]) => {
      const msg = args.map(a => String(a)).join(' ');
      // Suppress common expected errors
      if (msg.includes('131005') || msg.includes('1069307') || msg.includes('1069302')) return;
      console.error('[SDK]', msg);
    },
    warn: (...args: unknown[]) => console.warn('[SDK]', ...args),
    info: (...args: unknown[]) => {},
    debug: () => {},
    trace: () => {},
  };
}
