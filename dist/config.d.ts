export interface BridgeConfig {
    appId: string;
    appSecret: string;
    tenant: 'feishu' | 'lark';
    cwd: string;
    model?: string;
    reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}
/**
 * Load config. If no config found, launch QR scan wizard.
 */
export declare function loadConfig(): Promise<BridgeConfig>;
