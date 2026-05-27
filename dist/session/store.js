/**
 * SessionStore — 持久化 chatId → pi sessionId 映射
 * 每个飞书聊天对应一个 pi 会话，支持延续对话
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
export class SessionStore {
    data = {};
    path;
    constructor(dataDir) {
        const dir = dataDir ?? join(homedir(), '.feishu-pi-bridge');
        this.path = join(dir, 'sessions.json');
    }
    async load() {
        try {
            if (existsSync(this.path)) {
                const raw = await readFile(this.path, 'utf-8');
                this.data = JSON.parse(raw);
            }
        }
        catch {
            this.data = {};
        }
    }
    async save() {
        try {
            await writeFile(this.path, JSON.stringify(this.data, null, 2), 'utf-8');
        }
        catch { /* best effort */ }
    }
    get(chatId) {
        return this.data[chatId];
    }
    set(chatId, sessionId, cwd) {
        const now = Date.now();
        const existing = this.data[chatId];
        this.data[chatId] = {
            sessionId,
            cwd,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
    }
    delete(chatId) {
        delete this.data[chatId];
    }
    getAll() {
        return { ...this.data };
    }
}
