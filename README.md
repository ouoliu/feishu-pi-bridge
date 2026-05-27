# feishu-pi-bridge 🚀

把飞书 / Lark 消息和本地 [pi coding agent](https://pi.dev) 打通的轻量 bot。
一条命令起服务，扫码绑应用，在飞书里和 AI 编程助手对话。

## 能干什么

- **在飞书私聊** 把消息转给本地的 `pi` agent，pi 在你指定的工作目录里工作
- **流式卡片**：pi 的文本和工具调用实时出现在同一张卡片上，不用傻等
- **表情回复**：收到消息立即回 💪 表情
- **会话延续**：每个 chat 独立 session，对话能接着上次说
- **工具调用可视化**：在读文件、跑命令时，卡片上会显示进度

## 前置条件

- Node.js **≥ 20**
- pi coding agent 已安装，`~/.pi/agent/auth.json` 中有可用的 API key（DeepSeek / Claude / GPT 等）

## 安装

```bash
npm install -g github:ouoliu/feishu-pi-bridge
```

## 首次启动

```bash
feishu-pi-bridge
```

第一次跑会检测到没配置应用，**自动进入扫码向导**：

1. 终端渲染一个二维码
2. 用飞书 App 扫码
3. 选择 / 创建 PersonalAgent 应用
4. 成功后凭据自动写入 `~/.feishu-pi-bridge/config.json`

看到以下输出表示启动成功：

```
╔══════════════════════════════════════╗
║   feishu-pi-bridge                  ║
╚══════════════════════════════════════╝

✅ App: cli_xxxxxxxxxxxx (feishu)
✅ Adapter: Pi Agent
📩 监听 chat: xxxxxxxx
```

然后在飞书里搜索你的 bot → 私聊发消息即可。

## 在飞书里用的命令

| 命令 | 作用 |
|---|---|
| 发消息 | pi agent 自动处理并回复 |
| `/new` `/reset` | 清空当前 chat 的会话 |
| `/status` | 查看当前 session / 工作目录 |
| `/help` | 帮助卡片 |

## 启动选项

```bash
# 指定聊天 ID（私聊或群聊）
FEISHU_CHAT_ID=oc_xxxxxxxxxxxx feishu-pi-bridge

# 手动指定凭据（跳过扫码）
FEISHU_APP_ID=cli_xxx FEISHU_APP_SECRET=xxx feishu-pi-bridge
```

## 数据目录

| 路径 | 内容 |
|---|---|
| `~/.feishu-pi-bridge/config.json` | 应用凭据 |
| `~/.feishu-pi-bridge/sessions.json` | 每个 chat 的 session id |
| `~/.pi/agent/auth.json` | API key 配置 |

## 架构

```
飞书聊天
    │
    ▼ 轮询 (3s)
┌─────────────────────┐
│  API 轮询新消息      │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  ① 💪 表情回复      │
│  ② 发送初始卡片      │
│  ③ PiAdapter         │
│     ┌───────────┐   │
│     │ pi SDK    │   │
│     └─────┬─────┘   │
│           ▼         │
│     RunState FSM    │
│           │         │
│           ▼         │
│   CardKit 2.0 卡片  │
│           │         │
│           ▼         │
│   PATCH 更新同一张   │
└─────────┬───────────┘
          │
          ▼
   飞书聊天（卡片刷新）
```

## 常见问题

**Bot 没反应**
1. 确认 API key 配置：`cat ~/.pi/agent/auth.json`
2. 确认应用已在飞书开放平台发布上线
3. 看启动日志是否有报错

**扫码向导无法使用**
手动设置环境变量 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 跳过向导。

## License

[MIT](./LICENSE)
