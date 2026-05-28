import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { registerApp } from '@larksuiteoapi/node-sdk';
import qrcode from 'qrcode-terminal';

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

const CONFIG_FILE = join(homedir(), '.feishu-pi-bridge', 'config.json');

/** 从环境变量解析白名单 */
function parseWhitelistEnv(): WhitelistConfig | undefined {
  const chatIds = process.env.FEISHU_WHITELIST_CHATS
    ? process.env.FEISHU_WHITELIST_CHATS.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const userIds = process.env.FEISHU_WHITELIST_USERS
    ? process.env.FEISHU_WHITELIST_USERS.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  if (chatIds.length > 0 || userIds.length > 0) {
    return { chatIds, userIds };
  }
  return undefined;
}

/** 合并白名单：env 为空时回退到文件配置 */
function mergeWhitelist(parsed: BridgeConfig): BridgeConfig {
  // 如果 env 已经提供了白名单，优先用 env
  if (parsed.whitelist) return parsed;
  // 否则保留文件里的 whitelist（如果有的话）
  return parsed;
}

/**
 * Load config. If no config found, launch QR scan wizard.
 */
export async function loadConfig(): Promise<BridgeConfig> {
  // 1. Environment variables first
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const tenant = (process.env.FEISHU_TENANT ?? 'feishu') as 'feishu' | 'lark';
  if (appId && appSecret) {
    return {
      appId, appSecret, tenant,
      cwd: process.env.PI_CWD ?? homedir(),
      model: process.env.PI_MODEL,
      reasoningEffort: process.env.PI_REASONING_EFFORT as BridgeConfig['reasoningEffort'],
      whitelist: parseWhitelistEnv(),
    };
  }

  // 2. Config file
  const configPaths = [
    process.env.FEISHU_PI_CONFIG,
    CONFIG_FILE,
    join(process.cwd(), 'feishu-pi-config.json'),
  ];
  for (const p of configPaths) {
    if (p && existsSync(p)) {
      try {
        const raw = readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.appId && parsed.appSecret) {
          return { ...parsed, cwd: parsed.cwd ?? homedir() };
        }
      } catch { /* try next */ }
    }
  }

  // 3. No config → QR scan wizard
  return runQRWizard();
}

/**
 * 扫码向导 — 与 feishu-claude-code-bridge 完全一致
 * 终端渲染二维码，用户用飞书扫，自动创建应用并保存凭据
 */
async function runQRWizard(): Promise<BridgeConfig> {
  console.log('\n📱 未检测到飞书应用配置，进入扫码创建向导。\n');

  // 先检查 qrcode-terminal 是否可用
  if (typeof qrcode?.generate !== 'function') {
    throw new Error('qrcode-terminal 未安装，无法显示二维码。请手动配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET。');
  }

  const result = await registerApp({
    source: 'feishu-pi-bridge',
    onQRCodeReady: (info) => {
      console.log('请用飞书 App 扫描以下二维码完成应用创建：\n');
      qrcode.generate(info.url, { small: true });
      const mins = Math.max(1, Math.round(info.expireIn / 60));
      console.log(`\n二维码有效期：约 ${mins} 分钟`);
      console.log(`也可以直接在浏览器打开：${info.url}\n`);
    },
    onStatusChange: (info) => {
      if (info.status === 'domain_switched') {
        console.log('识别到国际版租户，已切换到 larksuite.com 域名。');
      } else if (info.status === 'slow_down') {
        console.log('轮询速度过快，已自动降速。');
      }
    },
  });

  const tenant: 'feishu' | 'lark' = (result as { user_info?: { tenant_brand?: string } }).user_info?.tenant_brand === 'lark' ? 'lark' : 'feishu';
  const operatorOpenId = (result as { user_info?: { open_id?: string } }).user_info?.open_id;

  console.log('\n✓ 应用创建成功');
  console.log(`  App ID:  ${result.client_id}`);
  console.log(`  Tenant:  ${tenant}`);

  const cfg: BridgeConfig = {
    appId: result.client_id,
    appSecret: result.client_secret,
    tenant,
    cwd: homedir(),
  };

  // 保存到配置文件
  try {
    mkdirSync(dirname(CONFIG_FILE), { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
    console.log(`\n💾 凭据已保存到 ${CONFIG_FILE}`);
  } catch (err) {
    console.warn(`\n⚠️ 保存配置文件失败：${(err as Error).message}`);
    console.warn('  请手动记录上面的 App ID 和 App Secret。');
  }

  if (operatorOpenId) {
    console.log(`  👤 管理员：${operatorOpenId}（已自动设置）`);
  }

  console.log('');
  return cfg;
}
