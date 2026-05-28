export interface WhitelistConfig {
    /** 允许对话的 chat_id 列表，为空表示不限制 */
    chatIds: string[];
    /** 允许对话的用户 open_id 列表，为空表示不限制 */
    userIds: string[];
}
export interface BridgeConfig {
    appId: string;
    appSecret: string;
    tenant: 'feishu' | 'lark';
    cwd: string;
    model?: string;
    reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    whitelist?: WhitelistConfig;
}
/**
 * Load config. If no config found, launch QR scan wizard.
 */
export declare function loadConfig(): Promise<BridgeConfig>;
