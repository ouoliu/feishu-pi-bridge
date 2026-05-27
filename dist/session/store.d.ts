interface SessionEntry {
    sessionId: string;
    cwd: string;
    createdAt: number;
    updatedAt: number;
}
interface SessionData {
    [chatId: string]: SessionEntry;
}
export declare class SessionStore {
    private data;
    private path;
    constructor(dataDir?: string);
    load(): Promise<void>;
    save(): Promise<void>;
    get(chatId: string): SessionEntry | undefined;
    set(chatId: string, sessionId: string, cwd: string): void;
    delete(chatId: string): void;
    getAll(): SessionData;
}
export {};
