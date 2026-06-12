/* ============================================================
   TaskFlow - 小马问答  v1.1
   ============================================================ */
console.log('💬 Chat module loaded');

let chatHistory = [];  // [[q1,a1],[q2,a2],...]
let chatWaiting = false;
let chatMode = 'chat';  // 'chat'=纯聊天, 'qa'=问答(知识库+聊天), 'modify'=修改模式(聊天+修改权限)

/** 切换模式 */
function setChatMode(mode) {
    chatMode = mode;
    const input = document.getElementById('chatInput');
    document.querySelectorAll('.chat-mode-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.chat-mode-btn[data-mode="${mode}"]`);
    if (btn) btn.classList.add('active');

    const placeholders = {
        qa: '问小马学校规定、课程问题...',
        chat: '和小马随便聊聊...',
        modify: '让小马帮你改待办、加事件...',
    };
    input.placeholder = placeholders[mode] || placeholders.qa;
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.chat-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => setChatMode(btn.dataset.mode));
    });
});

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

/** 收集用户的科目、待办、事件，作为小马的背景知识 */
function buildUserContext() {
    const parts = [];

    // 科目
    if (typeof subjects !== 'undefined' && subjects.length) {
        const summary = subjects.map(s => {
            const comps = s.components || [];
            const total = comps.reduce((a, c) => a + (c.percentage || 0), 0);
            let gpaStr = '';
            if (comps.length && total === 100) {
                let score = 0;
                for (const c of comps) {
                    if (c.score != null && c.percentage) score += c.score * (c.percentage / 100);
                }
                gpaStr = `，预估总分${Math.round(score)}分`;
            } else if (total > 0) {
                gpaStr = `（已配${total}%）`;
            }
            return `${s.name}(${s.credits || '?'}学分${gpaStr})`;
        }).join('、');
        parts.push(`你正在修读的课程：${summary}`);
    }

    // 待办（最近的和未完成的）
    if (typeof todos !== 'undefined' && todos.length) {
        const active = todos.filter(t => t.status !== 'done');
        const today = new Date().toISOString().slice(0, 10);
        const todayTodos = active.filter(t => t.date === today);
        const upcoming = active.filter(t => t.date > today).sort((a, b) => a.date.localeCompare(b.date));

        if (todayTodos.length) {
            parts.push(`今天的待办：${todayTodos.map(t => `${t.title}(${t.priority})`).join('、')}`);
        }
        if (upcoming.length) {
            parts.push(`即将到来的待办：${upcoming.slice(0, 5).map(t => `${t.date} ${t.title}`).join('、')}`);
        }
    }

    // 事件（最近几天）
    if (typeof events !== 'undefined' && events.length) {
        const today = new Date().toISOString().slice(0, 10);
        const weekLater = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
        const near = events.filter(e => e.date >= today && e.date <= weekLater).sort((a, b) => a.date.localeCompare(b.date));
        if (near.length) {
            parts.push(`最近一周的事件：${near.map(e => {
                const labels = { exam: '考试', class: '学习', holiday: '生活', deadline: 'DDL', other: '其他' };
                return `${e.date} ${e.title}(${labels[e.event_type] || e.event_type})`;
            }).join('、')}`);
        }
    }

    return parts.join('\n');
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

    // 收集用户数据（科目、待办、事件），作为小马的背景知识
    const userContext = buildUserContext();

    try {
        const resp = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, history: chatHistory.slice(0, -1), stream: true, userContext, mode: chatMode }),
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

    // 解析并执行操作指令
    const fullAnswer = chatHistory[lastIdx][1];
    const actionMatch = fullAnswer.match(/__ACTIONS__\s*([\s\S]*?)\s*__END_ACTIONS__/);
    if (actionMatch) {
        try {
            const actions = JSON.parse(actionMatch[1]);
            await executeActions(actions);
            // 从显示中移除操作指令块
            chatHistory[lastIdx][1] = fullAnswer.replace(/__ACTIONS__[\s\S]*?__END_ACTIONS__/, '').trim();
        } catch (e) {
            console.error('执行操作失败:', e);
            chatHistory[lastIdx][1] = fullAnswer.replace(/__ACTIONS__[\s\S]*?__END_ACTIONS__/, '') + '\n\n⚠️ 操作执行失败：' + e.message;
        }
    }

    chatWaiting = false;
    input.disabled = false;
    document.getElementById('chatSendBtn').disabled = false;
    input.focus();
    renderChat();
    // 刷新全局数据
    if (actionMatch && typeof refreshAll === 'function') refreshAll();
}

/** 执行小马返回的操作指令 */
async function executeActions(actions) {
    const sb = Auth.getClient();
    for (const act of actions) {
        const { entity, action, data } = act;
        if (entity === 'todo') {
            if (action === 'add') {
                const row = {
                    title: data.title,
                    date: data.date || new Date().toISOString().slice(0, 10),
                    priority: data.priority || '中',
                    status: 'todo',
                    description: data.description || '',
                    subject_id: findSubjectId(data.subject_name),
                };
                await DS.create('todos', row);
            } else if (action === 'update') {
                const t = findTodo(data.title);
                if (!t) throw new Error(`未找到待办"${data.title}"`);
                const u = data.updates || {};
                const fields = {};
                if (u.date) fields.date = u.date;
                if (u.priority) fields.priority = u.priority;
                if (u.status) fields.status = u.status;
                if (u.description !== undefined) fields.description = u.description;
                if (u.new_title) fields.title = u.new_title;
                await DS.update('todos', t.id, fields);
            } else if (action === 'delete') {
                const t = findTodo(data.title);
                if (t) await DS.remove('todos', t.id);
            }
        } else if (entity === 'event') {
            if (action === 'add') {
                const row = {
                    title: data.title,
                    date: data.date || new Date().toISOString().slice(0, 10),
                    event_type: data.event_type || 'other',
                    start_time: data.start_time || null,
                    end_time: data.end_time || null,
                    subject_id: findSubjectId(data.subject_name),
                };
                await DS.create('events', row);
            } else if (action === 'update') {
                const e = findEvent(data.title, data.date);
                if (!e) throw new Error(`未找到事件"${data.title}"`);
                const u = data.updates || {};
                const fields = {};
                if (u.new_title) fields.title = u.new_title;
                if (u.date) fields.date = u.date;
                if (u.event_type) fields.event_type = u.event_type;
                if (u.start_time !== undefined) fields.start_time = u.start_time;
                if (u.end_time !== undefined) fields.end_time = u.end_time;
                await DS.update('events', e.id, fields);
            } else if (action === 'delete') {
                const e = findEvent(data.title, data.date);
                if (e) await DS.remove('events', e.id);
            }
        } else if (entity === 'subject') {
            if (action === 'add') {
                const row = {
                    name: data.name,
                    credits: data.credits || 0,
                    target_gpa: data.target_gpa || null,
                    components: [],
                    position: (typeof subjects !== 'undefined' ? subjects.length : 0),
                };
                await DS.create('subjects', row);
            } else if (action === 'update') {
                const s = findSubject(data.name);
                if (!s) throw new Error(`未找到科目"${data.name}"`);
                const u = data.updates || {};
                const fields = {};
                if (u.new_name) fields.name = u.new_name;
                if (u.credits !== undefined) fields.credits = u.credits;
                if (u.target_gpa !== undefined) fields.target_gpa = u.target_gpa;
                await DS.update('subjects', s.id, fields);
            } else if (action === 'delete') {
                const s = findSubject(data.name);
                if (s) await DS.remove('subjects', s.id);
            }
        } else if (entity === 'component') {
            if (action === 'set_components') {
                // 整体替换绩点分布
                const s = findSubject(data.subject_name);
                if (!s) throw new Error(`未找到科目"${data.subject_name}"`);
                const comps = (data.components || []).map(c => ({
                    name: c.name,
                    percentage: c.percentage || 0,
                    score: c.score ?? null,
                }));
                await DS.update('subjects', s.id, { components: comps });
            } else if (action === 'add') {
                const s = findSubject(data.subject_name);
                if (!s) throw new Error(`未找到科目"${data.subject_name}"`);
                const comps = [...(s.components || []), {
                    name: data.name,
                    percentage: data.percentage || 0,
                    score: data.score ?? null,
                }];
                await DS.update('subjects', s.id, { components: comps });
            } else if (action === 'update') {
                const s = findSubject(data.subject_name);
                if (!s) throw new Error(`未找到科目"${data.subject_name}"`);
                const comps = [...(s.components || [])];
                const idx = comps.findIndex(c => c.name === data.component_name);
                if (idx < 0) throw new Error(`未找到绩点项"${data.component_name}"`);
                const u = data.updates || {};
                if (u.name) comps[idx].name = u.name;
                if (u.percentage !== undefined) comps[idx].percentage = u.percentage;
                if (u.score !== undefined) comps[idx].score = u.score;
                await DS.update('subjects', s.id, { components: comps });
            } else if (action === 'delete') {
                const s = findSubject(data.subject_name);
                if (!s) throw new Error(`未找到科目"${data.subject_name}"`);
                const comps = (s.components || []).filter(c => c.name !== data.component_name);
                await DS.update('subjects', s.id, { components: comps });
            }
        }
    }
}

function findTodo(title) {
    if (typeof todos === 'undefined') return null;
    const t = title.toLowerCase();
    return todos.find(x => x.title.toLowerCase().includes(t) || t.includes(x.title.toLowerCase()));
}
function findEvent(title, date) {
    if (typeof events === 'undefined') return null;
    const t = title.toLowerCase();
    if (date) return events.find(x => x.title.toLowerCase().includes(t) && x.date === date);
    return events.find(x => x.title.toLowerCase().includes(t) || t.includes(x.title.toLowerCase()));
}
function findSubject(name) {
    if (typeof subjects === 'undefined') return null;
    const n = name.toLowerCase();
    return subjects.find(x => x.name.toLowerCase().includes(n) || n.includes(x.name.toLowerCase()));
}
function findSubjectId(name) {
    if (!name) return null;
    const s = findSubject(name);
    return s ? s.id : null;
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
