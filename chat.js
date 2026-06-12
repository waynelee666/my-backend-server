/* ============================================================
   TaskFlow - 小马问答  v1.1
   ============================================================ */
console.log('💬 Chat module loaded');

let chatHistory = [];  // [[q1,a1],[q2,a2],...]
let chatWaiting = false;

// Escaped HTML (reuse from script.js if available, otherwise define)
function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

/** 渲染聊天消息 */
function renderChat() {
    const el = document.getElementById('chatMessages');
    if (!el) return;

    if (!chatHistory.length) {
        el.innerHTML = `<div style="text-align:center;color:var(--color-text-light);padding:60px 20px">
            <div style="font-size:3rem;margin-bottom:12px">🐴</div>
            <p style="font-size:1.1rem;font-weight:600;margin-bottom:6px">你好，我是小马！</p>
            <p style="font-size:.9rem;margin-bottom:20px">有什么我可以帮你的吗？</p>
            <div style="margin-top:20px;display:flex;flex-wrap:wrap;gap:8px;justify-content:center" id="chatHints">
                <button class="chat-hint">四年制本科生体育课程需要修读多少学分？</button>
                <button class="chat-hint">大一体育课选课有什么要求？</button>
                <button class="chat-hint">大三秋学期有什么必修课？</button>
                <button class="chat-hint">电子信息工程辅修要修哪些课？</button>
            </div>
        </div>`;
        el.querySelectorAll('.chat-hint').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('chatInput').value = btn.textContent;
                sendChat();
            });
        });
        return;
    }

    el.innerHTML = chatHistory.map(([q, a], i) => `
        <div class="chat-msg chat-msg--user">
            <div class="chat-msg__bubble">${escHtml(q)}</div>
        </div>
        <div class="chat-msg chat-msg--bot">
            <div class="chat-msg__bubble">${formatAnswer(a)}</div>
        </div>
    `).join('');

    // 滚动到底部
    el.scrollTop = el.scrollHeight;
}

/** 简单格式化回答：识别换行和引用标注 */
function formatAnswer(text) {
    let html = escHtml(text);
    // 引用标注高亮: 参考资料：第x条,第y条
    html = html.replace(/参考资料：(第\d+条(?:,第\d+条)*)/, '<span class="chat-cite">📎 $1</span>');
    // 信息不足高亮
    if (html.includes('信息不足') || html.includes('暂无相关信息')) {
        html = '<span class="chat-uncertain">' + html + '</span>';
    }
    return html;
}

/** 发送消息（流式） */
async function sendChat() {
    if (chatWaiting) return;
    const input = document.getElementById('chatInput');
    const question = input.value.trim();
    if (!question) return;

    chatWaiting = true;
    input.value = '';
    // 空占位，逐字填充
    chatHistory.push([question, '']);
    renderChat();
    input.disabled = true;
    document.getElementById('chatSendBtn').disabled = true;

    const lastIdx = chatHistory.length - 1;

    try {
        const resp = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, history: chatHistory.slice(0, -1), stream: true }),
        });

        if (!resp.ok) throw new Error('HTTP ' + resp.status);

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const data = JSON.parse(line.slice(6));
                    if (data.token) {
                        chatHistory[lastIdx][1] += data.token;
                    } else if (data.error) {
                        chatHistory[lastIdx][1] = '❌ ' + data.error;
                    }
                } catch (e) { /* 忽略解析错误 */ }
            }
            renderChat();
        }
        // 处理 buffer 中残留的数据
        if (buffer.startsWith('data: ')) {
            try {
                const data = JSON.parse(buffer.slice(6));
                if (data.token) chatHistory[lastIdx][1] += data.token;
            } catch (e) {}
        }
    } catch (e) {
        if (!chatHistory[lastIdx][1]) {
            chatHistory[lastIdx][1] = '❌ 网络错误，请稍后重试';
        }
        console.error('Chat error:', e);
    }

    chatWaiting = false;
    input.disabled = false;
    document.getElementById('chatSendBtn').disabled = false;
    input.focus();
    renderChat();
}

/** 清空对话 */
function clearChat() {
    chatHistory = [];
    renderChat();
    document.getElementById('chatInput').value = '';
}

/** 渲染入口（tab 切换时调用） */
function renderChatView() {
    renderChat();
    document.getElementById('chatInput')?.focus();
}

/** 绑定回车发送 */
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('chatInput');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChat();
            }
        });
    }
});
