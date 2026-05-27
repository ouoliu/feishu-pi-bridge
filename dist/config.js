import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
/**
 * Load config from multiple sources (priority: env > config file > defaults).
 */
export function loadConfig() {
    // 1. Try environment variables first
    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;
    const tenant = (process.env.FEISHU_TENANT ?? 'feishu');
    if (appId && appSecret) {
        return {
            appId,
            appSecret,
            tenant,
            cwd: process.env.PI_CWD ?? homedir(),
            model: process.env.PI_MODEL,
            reasoningEffort: process.env.PI_REASONING_EFFORT,
        };
    }
    // 2. Try config file
    const configPaths = [
        process.env.FEISHU_PI_CONFIG,
        join(homedir(), '.feishu-pi-bridge', 'config.json'),
        join(process.cwd(), 'feishu-pi-config.json'),
    ];
    for (const p of configPaths) {
        if (p && existsSync(p)) {
            try {
                const raw = readFileSync(p, 'utf-8');
                const parsed = JSON.parse(raw);
                if (parsed.appId && parsed.appSecret) {
                    return parsed;
                }
            }
            catch {
                // continue to next
            }
        }
    }
    throw new Error('请设置 FEISHU_APP_ID 和 FEISHU_APP_SECRET 环境变量，或创建配置文件。\n' +
        '在 Feishu 开放平台 (https://open.feishu.cn/app) 找到你的应用，\n' +
        '在「凭证与基础信息」页面可以获取 App ID 和 App Secret。');
}
