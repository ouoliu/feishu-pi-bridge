import { AuthStorage, ModelRegistry, SessionManager, createAgentSession, } from '@earendil-works/pi-coding-agent';
class TextBuffer {
    text = '';
    append(s) { this.text += s; }
}
/**
 * 轮询式飞书桥接 — 不用 WebSocket，每 3 秒检查新消息
 */
export class PollingBridge {
    token = '';
    tokenExpiresAt = 0;
    session = null;
    lastMessageId = '';
    cfg;
    chatId = '';
    timer = null;
    constructor(cfg) {
        this.cfg = cfg;
    }
    async init() {
        console.log('初始化 pi agent...');
        const auth = AuthStorage.create();
        const reg = ModelRegistry.create(auth);
        const { session } = await createAgentSession({
            sessionManager: SessionManager.inMemory(),
            authStorage: auth,
            modelRegistry: reg,
            cwd: this.cfg.cwd,
            tools: ['read', 'bash'],
        });
        this.session = session;
        console.log(`  ✅ pi: ${session.model?.provider}/${session.model?.id}`);
    }
    async ensureToken() {
        if (this.token && Date.now() < this.tokenExpiresAt - 300000)
            return this.token;
        const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ app_id: this.cfg.appId, app_secret: this.cfg.appSecret }),
        });
        const data = await res.json();
        if (data.code !== 0)
            throw new Error(`token error: ${JSON.stringify(data)}`);
        this.token = data.tenant_access_token;
        this.tokenExpiresAt = Date.now() + data.expire * 1000;
        return this.token;
    }
    /** 设置要监听的 chat */
    setChat(chatId) {
        this.chatId = chatId;
    }
    async start() {
        console.log('开始轮询...');
        // 先查一次已有消息，记录最新的
        await this.pollOnce();
        this.timer = setInterval(() => this.pollOnce(), 3000);
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    async pollOnce() {
        if (!this.chatId)
            return;
        try {
            const token = await this.ensureToken();
            const res = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=${this.chatId}&page_size=5&sort_type=ByCreateTimeDesc`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            if (data.code !== 0)
                return;
            const items = data.data?.items ?? [];
            for (const msg of items.reverse()) {
                // 跳过自己发的消息
                if (msg.sender.sender_type === 'app')
                    continue;
                // 跳过已处理的消息
                if (msg.message_id === this.lastMessageId)
                    break;
                if (!this.lastMessageId) {
                    this.lastMessageId = msg.message_id;
                    continue;
                }
                console.error(`\n📩 新消息: ${msg.body?.content?.slice(0, 80) ?? ''}`);
                this.lastMessageId = msg.message_id;
                // 处理消息
                await this.processMessage(msg);
            }
        }
        catch (err) {
            console.error('轮询错误:', err.message);
        }
    }
    async processMessage(msg) {
        if (!this.session)
            return;
        const content = msg.body?.content ?? '';
        let text = content;
        try {
            const p = JSON.parse(content);
            text = p.text ?? content;
        }
        catch { }
        const prompt = `<bridge_context>\nchat_type: p2p\n</bridge_context>\n\n${text}`;
        console.error(`  → pi: "${text.slice(0, 50)}"`);
        const buf = new TextBuffer();
        const unsub = this.session.subscribe((evt) => {
            if (evt.type === 'message_update') {
                const ae = evt.assistantMessageEvent;
                if (ae.type === 'text_delta' && ae.delta)
                    buf.append(ae.delta);
            }
        });
        try {
            await this.session.prompt(prompt);
            const reply = buf.text.trim();
            if (reply) {
                console.error(`  → 回复: ${reply.slice(0, 50)}...`);
                await this.sendMessage(reply);
            }
        }
        finally {
            unsub();
        }
    }
    async sendMessage(text) {
        const token = await this.ensureToken();
        await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                receive_id: this.chatId,
                msg_type: 'text',
                content: JSON.stringify({ text: text.slice(0, 2000) }),
            }),
        });
    }
}
