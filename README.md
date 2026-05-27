# feishu-pi-bridge 🚀

在飞书里和 **pi coding agent** 对话。发消息给 bot，pi 在本地处理，回复以卡片形式返回。

架构参考 [feishu-claude-code-bridge](https://github.com/zarazhangrui/feishu-claude-code-bridge)，
使用 [@earendil-works/pi-coding-agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) SDK 替代 Claude/Codex CLI。

## 快速开始

### 1. 安装

```bash
# 克隆项目
git clone https://github.com/<你的用户名>/feishu-pi-bridge.git
cd feishu-pi-bridge

# 安装依赖
npm install

# 编译
npm run build
```

### 2. 配置飞书应用

在 [飞书开放平台](https://open.feishu.cn/app) 创建一个自建应用：

1. **创建应用** → 获取 `App ID` 和 `App Secret`
2. **应用功能** → **机器人** → 启用
3. **权限管理** → 添加以下权限：
   - `im:message`、`im:message:send_as_bot`
   - `im:resource`、`im:chat`
   - `docs:document.content:read`、`docs:document:create`
   - `drive:drive:readonly`、`drive:file:download`
   - `wiki:node:read`、`wiki:space:read`
   - `contact:user.base:readonly`
4. **事件订阅** → 添加 `im.message.receive_v1` → 订阅方式选择**长连接**
5. **版本管理与发布** → 创建版本 → 申请发布 → 企业管理员审批

### 3. 配置 API Key

pi 需要 API key 来调用 AI 模型（如 DeepSeek、Claude、GPT 等）：

```bash
# 编辑 pi 配置文件
echo '{"deepseek":{"type":"api_key","key":"sk-xxxx"}}' > ~/.pi/agent/auth.json
```

### 4. 启动

```bash
export FEISHU_APP_ID=cli_xxxxxxxxxxxx
export FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxx

# 或创建配置文件
mkdir -p ~/.feishu-pi-bridge
cat > ~/.feishu-pi-bridge/config.json << 'EOF'
{
  "appId": "cli_xxxxxxxxxxxx",
  "appSecret": "xxxxxxxxxxxxxxxxx",
  "tenant": "feishu"
}
EOF

# 启动
npm start
```

### 5. 在飞书聊天

搜索你的 bot → 发消息 → 收到 💪 表情 + 卡片回复

## 功能

| 功能 | 状态 |
|------|------|
| 💬 飞书私聊回复 | ✅ |
| 💪 表情回复 | ✅ |
| 📇 卡片格式回复（Markdown） | ✅ |
| 🔄 单卡片持续更新 | ✅ |
| 🧠 思考过程可视化 | ✅ |
| 🧰 工具调用可视化 | ✅ |
| 📝 会话延续 | ✅ |
| `/new` 重置会话 | ✅ |
| `/status` 查看状态 | ✅ |
| `/help` 帮助 | ✅ |

## 架构

```
飞书聊天 ──→ 轮询 API (3s) ──→ PiAdapter ──→ pi SDK
                                        │
                                        ▼
                                  RunState FSM
                                        │
                                        ▼
                                  CardKit 2.0 卡片
                                        │
                                        ▼
                              PATCH 更新同一张卡片
                                        │
                                        ▼
                                  飞书聊天（更新）
```

## License

MIT
