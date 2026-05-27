import type { LarkChannel, NormalizedMessage } from '@larksuiteoapi/node-sdk';
import type { AgentSession, AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type { BridgeConfig } from './config.js';

/**
 * 从飞书消息构建 prompt 文本。
 */
function buildPrompt(msg: NormalizedMessage): string {
  const meta = [
    '<bridge_context>',
    `chat_id: ${msg.chatId}`,
    `chat_type: ${msg.chatType}`,
    `sender_id: ${msg.senderId}`,
    msg.senderName ? `sender_name: ${msg.senderName}` : null,
    '</bridge_context>',
  ].filter(Boolean).join('\n');

  return `${meta}\n\n${msg.content}`;
}

/**
 * 可变文本收集器 — 供闭包回调修改。
 */
class TextBuffer {
  text = '';
  append(s: string) { this.text += s; }
}

/**
 * 飞书 ↔ pi 桥接。
 * 一条消息一个 session prompt，回复收集后发回飞书。
 */
export class PiBridge {
  private session: AgentSession;
  private channel: LarkChannel;
  private msgQueue: NormalizedMessage[] = [];
  private processing = false;

  constructor(session: AgentSession, channel: LarkChannel) {
    this.session = session;
    this.channel = channel;
  }

  async enqueue(msg: NormalizedMessage): Promise<void> {
    this.msgQueue.push(msg);
    if (!this.processing) {
      this.processing = true;
      await this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    while (this.msgQueue.length > 0) {
      const msg = this.msgQueue.shift()!;
      await this.processOne(msg);
    }
    this.processing = false;
  }

  private async processOne(msg: NormalizedMessage): Promise<void> {
    const buffer = new TextBuffer();

    const unsub = this.session.subscribe((event) => {
      this.onEvent(event, buffer);
    });

    const startTime = Date.now();

    try {
      const prompt = buildPrompt(msg);
      console.error(`  [${msg.chatId.slice(-8)}] → pi (${prompt.length}ch)`);

      await this.session.prompt(prompt);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`  [${msg.chatId.slice(-8)}] pi 完成 (${elapsed}s)`);

      const reply = buffer.text.trim();
      if (reply) {
        console.error(`  [${msg.chatId.slice(-8)}] 回复飞书 (${reply.length}ch)`);
        try {
          const result = await this.channel.send(msg.chatId, {
            markdown: reply.slice(0, 2000),
          });
          console.error(`  [${msg.chatId.slice(-8)}] 回复已发送: msgId=${result.messageId.slice(-12)}`);
        } catch (sendErr) {
          console.error(`  [${msg.chatId.slice(-8)}] 发送失败:`, (sendErr as Error).message);
          console.error(`  [${msg.chatId.slice(-8)}] sendErr stack:`, (sendErr as Error).stack?.slice(0, 300));
        }
      }
    } catch (err) {
      console.error(`  [${msg.chatId.slice(-8)}] 错误:`, (err as Error).message);
    } finally {
      unsub();
    }
  }

  private onEvent(event: AgentSessionEvent, buffer: TextBuffer): void {
    switch (event.type) {
      case 'message_update': {
        const ae = event.assistantMessageEvent;
        if (ae.type === 'text_delta' && ae.delta) {
          buffer.append(ae.delta);
        }
        break;
      }
      case 'tool_execution_start':
        console.error(`  [工具] ${event.toolName}`);
        break;
      case 'tool_execution_end':
        console.error(`  [工具完成] ${event.toolName}${event.isError ? ' ❌' : ''}`);
        break;
    }
  }

  dispose(): void {
    this.msgQueue = [];
    this.processing = false;
  }
}
