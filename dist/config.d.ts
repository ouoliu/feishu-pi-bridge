export interface BridgeConfig {
    /** Feishu/Lark App ID */
    appId: string;
    /** Feishu/Lark App Secret */
    appSecret: string;
    /** 'feishu' (Chinese) or 'lark' (International) */
    tenant: 'feishu' | 'lark';
    /** Directory for workspace (default: ~) */
    cwd: string;
    /** Optional: pin a specific model (e.g. 'claude-sonnet-4-20250514') */
    model?: string;
    /** Optional: reasoning effort */
    reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}
/**
 * Load config from multiple sources (priority: env > config file > defaults).
 */
export declare function loadConfig(): BridgeConfig;
