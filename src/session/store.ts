/**
 * SessionStore — 持久化 chatId → pi sessionId 映射
 * 每个飞书聊天对应一个 pi 会话，支持延续对话
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

interface SessionEntry {
  /** pi session 文件路径，用于恢复对话记忆 */
  sessionFile: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
}

interface SessionData {
  [chatId: string]: SessionEntry;
}

export class SessionStore {
  private data: SessionData = {};
  private path: string;

  constructor(dataDir?: string) {
    const dir = dataDir ?? join(homedir(), '.feishu-pi-bridge');
    this.path = join(dir, 'sessions.json');
  }

  async load(): Promise<void> {
    try {
      if (existsSync(this.path)) {
        const raw = await readFile(this.path, 'utf-8');
        this.data = JSON.parse(raw);
      }
    } catch { this.data = {}; }
  }

  async save(): Promise<void> {
    try {
      await writeFile(this.path, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch { /* best effort */ }
  }

  get(chatId: string): SessionEntry | undefined {
    return this.data[chatId];
  }

  set(chatId: string, sessionFile: string, cwd: string): void {
    const now = Date.now();
    const existing = this.data[chatId];
    this.data[chatId] = {
      sessionFile,
      cwd,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  }

  delete(chatId: string): void {
    delete this.data[chatId];
  }

  getAll(): SessionData {
    return { ...this.data };
  }
}
