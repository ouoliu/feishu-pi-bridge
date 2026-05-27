# feishu-pi-bridge 🚀

把飞书消息和本地 [pi coding agent](https://pi.dev) 打通的轻量 bot。在飞书里和 AI 编程助手对话，让它读代码、改文件、查文档。

## 能干什么

- **在飞书私聊** 把消息转给本地的 `pi` agent，pi 在你指定的工作目录里工作
- **流式卡片**：pi 的思考过程和工具调用实时出现在同一张卡片上，不用傻等
- **会话延续**：对话能接着上次说，不会丢失上下文
- **表情回复**：收到消息立即回 💪 表情，让你知道 bot 在干活
- **工具调用可视化**：pi 在读文件、跑命令时，卡片上会显示进度

## 前置条件

- Node.js **≥ 20**
- `pi` coding agent 已安装并可运行（`~/.pi/agent/auth.json` 中有 API key）
- 一个飞书自建应用（参见下方配置步骤）

## 安装

```bash
# 克隆项目
git clone https://github.com/ouoliu/feishu-pi-bridge.git
cd feishu-pi-bridge

# 安装依赖
npm install

# 编译
npm run build
```

## 配置飞书应用

### 1. 创建应用

在 [飞书开放平台](https://open.feishu.cn/app) 创建一个**企业自建应用**。

### 2. 开启机器人

左侧菜单 → **应用功能** → **机器人** → 启用

### 3. 配置权限

左侧菜单 → **权限管理** → 添加以下权限：

```
💬 消息
  im:message                   收发消息
  im:message:send_as_bot       以 bot 身份发消息
  im:message:readonly          读取消息内容
  im:resource                  下载消息附件

📄 文档
  docs:document.content:read   读取文档内容
  docs:document:create         创建文档

📁 云盘
  drive:drive:readonly         云盘文件读取
  drive:file:download          下载文件

📚 知识库
  wiki:node:read               知识库读取
  wiki:space:read              知识空间读取
```

### 4. 配置事件订阅

左侧菜单 → **事件订阅**：

1. 点击 **添加事件**
2. 搜索 `im.message.receive_v1` → 选中 → 确认
3. 订阅方式选择 **长连接（WebSocket）**
4. 保存

### 5. 发布上线

左侧菜单 → **版本管理与发布**：

1. **创建版本**（如 `1.0.0`）
2. **申请发布**
3. 找企业管理员审批

## 配置 API Key

pi 需要 API key 来调用 AI 模型。编辑 `~/.pi/agent/auth.json`：

```json
{
  "deepseek": {
    "type": "api_key",
    "key": "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  }
}
```

支持的模型提供方：DeepSeek、Anthropic Claude、OpenAI GPT、Google Gemini 等。详见 [pi 文档](https://pi.dev)。

## 启动

### 方式一：环境变量

```bash
export FEISHU_APP_ID=cli_xxxxxxxxxxxx
export FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

cd feishu-pi-bridge && npm start
```

### 方式二：配置文件

```bash
mkdir -p ~/.feishu-pi-bridge
```

创建 `~/.feishu-pi-bridge/config.json`：

```json
{
  "appId": "cli_xxxxxxxxxxxx",
  "appSecret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "tenant": "feishu"
}
```

然后启动：

```bash
cd feishu-pi-bridge && npm start
```

### 首次启动效果

```
╔══════════════════════════════════════╗
║   feishu-pi-bridge                   ║
╚══════════════════════════════════════╝

✅ pi adapter: Pi Agent
📝 session: 无（首次运行）
📩 监听 chat: xxxxxxxx

```

## 在飞书里使用

搜索你的 bot 名称 → 私聊发送消息 → 立即收到 💪 表情 + 卡片回复。

### 支持的命令

| 命令 | 作用 |
|---|---|
| 直接发消息 | pi agent 自动处理并回复 |
| `/new` `/reset` | 清空当前会话历史 |
| `/status` | 查看当前状态（session、工作目录） |
| `/help` | 查看帮助 |

## 架构

```
飞书聊天
    │
    ▼ 轮询 (3s)
┌─────────────────────┐
│  API 轮询最新消息    │
└─────────┬───────────┘
          │ 新消息到达
          ▼
┌─────────────────────┐
│  ① 💪 表情回复      │
│  ② 发送初始卡片      │
│  ③ PiAdapter 处理    │
│     ┌───────────┐   │
│     │ pi SDK    │   │
│     │ agent     │   │
│     │ session   │   │
│     └─────┬─────┘   │
│           │ 事件流   │
│           ▼         │
│     RunState FSM    │
│     (状态机)        │
│           │         │
│           ▼         │
│   CardKit 2.0 卡片  │
│           │         │
│           ▼         │
│   PATCH 更新同一张   │
│   卡片（持续更新）   │
└─────────┬───────────┘
          │
          ▼
   飞书聊天（卡片刷新）
```

## 数据目录

| 路径 | 内容 |
|---|---|
| `~/.feishu-pi-bridge/config.json` | 应用凭据 |
| `~/.feishu-pi-bridge/sessions.json` | 每个 chat 的 session id |

## 常见问题

**Bot 没反应**
1. 确认 API key 配置正确：`cat ~/.pi/agent/auth.json`
2. 确认应用已发布上线
3. 查看启动日志是否有错误信息

**卡片发送失败**
1. 确认 App Secret 正确
2. 确认权限 `im:message:send_as_bot` 已开通

**pi 回复慢**
取决于你使用的模型。DeepSeek 通常 2-5 秒，Claude 3-8 秒。

## License

[MIT](./LICENSE)
