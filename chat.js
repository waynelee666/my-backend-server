/* ============================================================
   TaskFlow - 小马问答  v1.2 — 新增微积小马（学习+复习）
   ============================================================ */
console.log('💬 Chat module loaded');

let chatHistory = [];  // [[q1,a1],[q2,a2],...]
let chatWaiting = false;
let chatMode = 'chat';       // 'chat' | 'qa' | 'modify' | 'calc-learn' | 'calc-review'
let calcSubMode = 'calc-learn'; // 微积小马子模式：'calc-learn' 学习 | 'calc-review' 复习 | 'calc-knowledge' 知识 | 'calc-think' 思考

/** 切换模式 */
function setChatMode(mode) {
    chatMode = mode;
    const input = document.getElementById('chatInput');
    const subGroup = document.getElementById('calcSubMode');

    // 清除主按钮 active
    document.querySelectorAll('#modeGroup .chat-mode-btn').forEach(b => b.classList.remove('active'));

    // 微积小马：激活主按钮 + 显示子模式
    if (mode === 'calc' || mode === 'calc-learn' || mode === 'calc-review' || mode === 'calc-knowledge' || mode === 'calc-think') {
        const calcBtn = document.querySelector('.chat-mode-btn[data-mode="calc"]');
        if (calcBtn) calcBtn.classList.add('active');
        if (subGroup) subGroup.style.display = '';
        // 设置子模式 active
        document.querySelectorAll('.calc-sub-btn').forEach(b => b.classList.remove('active'));
        const subBtn = document.querySelector(`.calc-sub-btn[data-calc-mode="${mode}"]`);
        if (subBtn) subBtn.classList.add('active');
        chatMode = mode;
    } else {
        // 非微积模式：隐藏子模式
        if (subGroup) subGroup.style.display = 'none';
        const btn = document.querySelector(`.chat-mode-btn[data-mode="${mode}"]`);
        if (btn) btn.classList.add('active');
    }

    const placeholders = {
        qa: '问小马学校规定、课程问题...',
        chat: '和小马随便聊聊...',
        modify: '让小马帮你改待办、加事件...',
        'calc-learn': '问微积小马概念、题目、证明...（导师模式）',
        'calc-review': '让微积小马帮你串联知识点...（串讲模式）',
        'calc-knowledge': '问任何微积分知识点，微积小马给你超详细讲解...（知识模式）',
        'calc-think': '让微积小马冷静理性地一步步推理...（思考模式）',
    };
    input.placeholder = placeholders[mode] || placeholders.chat;
}

/** 切换微积小马子模式 */
function setCalcSubMode(subMode) {
    chatMode = subMode;
    calcSubMode = subMode;
    document.querySelectorAll('.calc-sub-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.calc-sub-btn[data-calc-mode="${subMode}"]`);
    if (btn) btn.classList.add('active');

    const input = document.getElementById('chatInput');
    const placeholders = {
        'calc-learn': '问微积小马概念、题目、证明...（导师模式）',
        'calc-review': '让微积小马帮你串联知识点...（串讲模式）',
        'calc-knowledge': '问任何微积分知识点，微积小马给你超详细讲解...（知识模式）',
        'calc-think': '让微积小马冷静理性地一步步推理...（思考模式）',
    };
    input.placeholder = placeholders[subMode] || '';
}

document.addEventListener('DOMContentLoaded', () => {
    // 主模式按钮
    document.querySelectorAll('#modeGroup .chat-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            if (mode === 'calc') {
                // 点击微积小马 → 进入当前子模式
                setChatMode(calcSubMode);
            } else {
                setChatMode(mode);
            }
        });
    });

    // 微积子模式按钮
    document.querySelectorAll('.calc-sub-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setCalcSubMode(btn.dataset.calcMode);
        });
    });
});

// esc() is provided by script.js (loaded before us)

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
            <div class="chat-msg__bubble">${esc(q)}</div>
        </div>
        <div class="chat-msg chat-msg--bot">
            <div class="chat-msg__bubble">${formatAnswer(a)}</div>
        </div>
    `).join('');

    // 滚动到底部
    el.scrollTop = el.scrollHeight;

    // 渲染 KaTeX 数学公式
    if (typeof renderMathInElement !== 'undefined') {
        try {
            renderMathInElement(el, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true },
                ],
                throwOnError: false,
            });
        } catch (e) {}
    }
}

/** 简单格式化回答：识别换行和引用标注 */
function formatAnswer(text) {
    let html = esc(text);
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
    const now = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} 星期${weekdays[now.getDay()]}`;
    const parts = [`今天是 ${todayStr}。`];

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

    // 待办（今天 + 昨天 + 未来 + 近期遗留）
    if (typeof todos !== 'undefined' && todos.length) {
        const active = todos.filter(t => t.status !== 'done');
        const today = new Date().toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

        const todayTodos = active.filter(t => t.date === today);
        const yesterdayTodos = active.filter(t => t.date === yesterday);
        const overdueTodos = active.filter(t => t.date >= weekAgo && t.date < yesterday)
            .sort((a, b) => a.date.localeCompare(b.date));
        const upcoming = active.filter(t => t.date > today)
            .sort((a, b) => a.date.localeCompare(b.date));

        if (todayTodos.length) {
            parts.push(`今天的待办：${todayTodos.map(t => `${t.title}(${t.priority})`).join('、')}`);
        }
        if (yesterdayTodos.length) {
            parts.push(`昨天的待办：${yesterdayTodos.map(t => `${t.title}(${t.priority})`).join('、')}`);
        }
        if (overdueTodos.length) {
            parts.push(`近7天遗留待办（还未完成）：${overdueTodos.map(t => `${t.date} ${t.title}(${t.priority})`).join('、')}`);
        }
        if (upcoming.length) {
            parts.push(`即将到来的待办：${upcoming.slice(0, 5).map(t => `${t.date} ${t.title}`).join('、')}`);
        }
    }

    // 事件（近一个月：过去7天 + 未来30天）
    if (typeof events !== 'undefined' && events.length) {
        const today = new Date().toISOString().slice(0, 10);
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        const monthLater = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        const near = events.filter(e => e.date >= weekAgo && e.date <= monthLater).sort((a, b) => a.date.localeCompare(b.date));
        if (near.length) {
            parts.push(`最近一个月的事件：${near.map(e => {
                const labels = { exam: '考试', class: '学习', holiday: '生活', deadline: 'DDL', other: '其他' };
                const timeStr = e.start_time ? ` ${e.start_time.slice(0, 5)}${e.end_time ? '-' + e.end_time.slice(0, 5) : ''}` : '';
                return `${e.date}${timeStr} ${e.title}(${labels[e.event_type] || e.event_type})`;
            }).join('、')}`);
        }
    }

    // 脚本
    if (typeof thoughts !== 'undefined' && thoughts.length) {
        const recentThoughts = thoughts.slice(0, 20);
        if (recentThoughts.length) {
            parts.push(`用户最近的视频脚本：${recentThoughts.map(t => {
                const statusLabels = { draft: '草稿', filming: '拍摄中', done: '已完成' };
                return `《${t.title || '未命名'}》[${statusLabels[t.status] || '草稿'}]：${t.content}`;
            }).join('；')}`);
        }
    }

    // 背单词
    if (typeof vocabs !== 'undefined' && vocabs.length) {
        const byBook = {};
        vocabs.forEach(v => {
            if (!byBook[v.book]) byBook[v.book] = { total: 0, mastered: 0, review: 0 };
            byBook[v.book].total++;
            if (v.mastered) byBook[v.book].mastered++;
            if (v.review) byBook[v.book].review++;
        });
        const bookLines = Object.entries(byBook).map(([book, s]) =>
            `${book}: ${s.total}词, 已掌握${s.mastered}, 复习中${s.review}`
        );
        parts.push(`背单词统计：${bookLines.join('；')}`);
        if (typeof vocabBook !== 'undefined' && vocabBook && typeof vocabUnit !== 'undefined') {
            const curInfo = [];
            if (vocabUnit === '__review__') curInfo.push('正在复习错词表');
            else if (vocabUnit === '__mastered__') curInfo.push('正在查看已掌握词');
            else curInfo.push(`正在学习 ${vocabBook} ${vocabUnit}${vocabPart ? ' ' + vocabPart : ''}`);
            const curWords = vocabs.filter(v => v.book === vocabBook && v.unit === vocabUnit && (vocabPart ? v.part === vocabPart : true));
            if (curWords.length) {
                const curMastered = curWords.filter(v => v.mastered).length;
                curInfo.push(`当前单元${curWords.length}词, 已掌握${curMastered}`);
            }
            parts.push(curInfo.join('，'));
        }
    }

    // 目标
    if (typeof goalsData !== 'undefined' && goalsData.length) {
        const goalLines = goalsData.map(g => {
            const total = g.subgoals.reduce((s, sg) => s + sg.actions.length, 0);
            const done = g.subgoals.reduce((s, sg) => s + sg.actions.filter(a => a.done).length, 0);
            const pct = total ? Math.round(done / total * 100) : 0;
            return `${g.icon || ''}${g.name}: ${done}/${total} (${pct}%)`;
        });
        parts.push(`目标进度：${goalLines.join('；')}`);
    }

    // 查重
    const dupTodos = findDuplicates(todos, t => `${t.title}|${t.date}`);
    const dupEvents = findDuplicates(events, e => `${e.title}|${e.date}|${e.event_type}`);
    if (dupTodos.length) {
        parts.push(`⚠️ 待办中有重复项：${dupTodos.map(d => `${d.title}(${d.date})出现${d.count}次`).join('、')}`);
    }
    if (dupEvents.length) {
        parts.push(`⚠️ 事件中有重复项：${dupEvents.map(d => `${d.title}(${d.date})出现${d.count}次`).join('、')}`);
    }

    return parts.join('\n');
}

function findDuplicates(arr, keyFn) {
    if (!arr || !arr.length) return [];
    const map = {};
    arr.forEach(item => {
        const k = keyFn(item);
        map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).filter(([, c]) => c > 1).map(([k, c]) => {
        const parts = k.split('|');
        return { title: parts[0], date: parts[1], count: c };
    });
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
    // 这里必须把「执行结果」回吐给用户：小马的正文是在执行之前写好的，
    // 它会先乐观地说「已经帮你改好啦」。后端匹配失败时如果只 console.warn，
    // 屏幕上就只剩那句谎话 —— 这就是「嘴上答应、实际没做」的来源。
    const fullAnswer = chatHistory[lastIdx][1];
    const parsed = parseActionBlock(fullAnswer);
    let note = '';
    let ranSomething = false;

    if (parsed.kind === 'ok') {
        chatHistory[lastIdx][1] = stripActionBlock(fullAnswer);
        const results = await executeActions(parsed.actions);
        note = formatActionReport(results);
        ranSomething = true;
    } else if (parsed.kind === 'broken') {
        chatHistory[lastIdx][1] = stripActionBlock(fullAnswer);
        note = `⚠️ 小马的指令格式坏了，**这次什么都没改**。换个说法再说一次试试。\n（${parsed.reason}）`;
    } else if (chatMode === 'modify' && looksLikeDoneClaim(fullAnswer)) {
        // 既没有指令块、口气又像已经做完了 —— 大概率就是那个 bug
        note = '⚠️ 小马这次**没有生成任何操作指令，实际什么都没改**。\n把要改的那条说全一点（名字照抄页面上的）再说一次。';
    }

    if (note) chatHistory[lastIdx][1] = (chatHistory[lastIdx][1] + '\n\n' + note).trim();

    chatWaiting = false;
    input.disabled = false;
    document.getElementById('chatSendBtn').disabled = false;
    input.focus();
    renderChat();
    // 刷新全局数据
    if (ranSomething && typeof refreshAll === 'function') refreshAll();
}

/** 从回复里抠出指令块。宽容处理：代码围栏、尾逗号、被截断（缺 __END_ACTIONS__） */
function parseActionBlock(text) {
    if (!text || text.indexOf('__ACTIONS__') < 0) return { kind: 'none' };

    const m = text.match(/__ACTIONS__([\s\S]*?)__END_ACTIONS__/);
    let body;
    if (m) {
        body = m[1];
    } else {
        // 没有结束标记：多半是 max_tokens 截断了，尽力取到最后一个 ]
        const rest = text.slice(text.indexOf('__ACTIONS__') + '__ACTIONS__'.length);
        const end = rest.lastIndexOf(']');
        if (end < 0) return { kind: 'broken', reason: '指令块没写完就被截断了' };
        body = rest.slice(0, end + 1);
    }

    const cleaned = body
        .replace(/^\s*```[a-zA-Z]*\s*/, '')     // 开头围栏
        .replace(/\s*```\s*$/, '')              // 结尾围栏
        .replace(/,\s*([\]}])/g, '$1')          // 尾逗号
        .trim();

    try {
        const actions = JSON.parse(cleaned);
        if (!Array.isArray(actions) || !actions.length) {
            return { kind: 'broken', reason: '指令块是空的' };
        }
        return { kind: 'ok', actions };
    } catch (e) {
        return { kind: 'broken', reason: e.message };
    }
}

/** 把指令块从展示正文里抹掉（含只有开头、没有结尾的残缺块） */
function stripActionBlock(text) {
    return text
        .replace(/__ACTIONS__[\s\S]*?__END_ACTIONS__/, '')
        .replace(/__ACTIONS__[\s\S]*$/, '')
        .trim();
}

/** 修改模式下没吐出任何指令时，要不要提示用户一句
 *  判定尽量保守：明显是在反问/征询意见的就不打扰。
 *  这条提示说的是「没有生成任何操作指令」——永远是真话，不会冤枉小马。*/
function looksLikeDoneClaim(text) {
    const t = (text || '').trim();
    if (!t) return false;
    if (/[？?]\s*$/.test(t)) return false;              // 结尾在反问 → 它是在问，不是在做
    if (/^(你想|你是想|要不要|需要我|确定|请问|建议)/.test(t)) return false;
    // 已经明说做不到 / 找不到的，就别再叠一句「什么都没改」了，那是废话
    if (/没找到|找不到|没有找到|没办法|没法|无法|不存在|没这门|记混了|确认一下/.test(t)) return false;
    return true;
}

/** 逐条执行操作指令，单条失败不拖累其余，返回每条的结果 */
async function executeActions(actions) {
    const results = [];
    for (const act of actions) {
        const label = describeAction(act);
        try {
            await execOneAction(act);
            results.push({ ok: true, label });
        } catch (e) {
            console.warn('[小马] 指令执行失败:', label, e.message);
            results.push({ ok: false, label, reason: e.message });
        }
    }
    return results;
}

/** 给用户看的动作描述，例如「修改待办「交物理实验报告」」 */
function describeAction(act) {
    const d = (act && act.data) || {};
    const verb = {
        add: '新增', update: '修改', delete: '删除', set_components: '重设',
        toggle_action: '切换完成状态', add_subgoal: '新增子目标',
        add_action: '新增行动', delete_action: '删除行动', run: '执行',
    }[act.action] || act.action || '操作';
    const ent = {
        todo: '待办', event: '事件', subject: '科目', component: '绩点项',
        thought: '脚本', goal: '目标', dedup: '去重',
    }[act.entity] || act.entity || '';
    const name = d.title || d.name || d.subject_name || d.goal_name || d.action_text || '';
    return name ? `${verb}${ent}「${name}」` : `${verb}${ent}`;
}

/** 把执行结果拼成聊天气泡里的一行回执 */
function formatActionReport(results) {
    if (!results || !results.length) return '';
    const ok = results.filter(r => r.ok);
    const bad = results.filter(r => !r.ok);
    const lines = [];
    if (ok.length) lines.push(`✅ 已执行：${ok.map(r => r.label).join('；')}`);
    if (bad.length) {
        lines.push(`⚠️ **有 ${bad.length} 项没做成，实际没有改动**：`);
        bad.forEach(r => lines.push(`　· ${r.label} — ${r.reason}`));
        if (ok.length) lines.push(`（其余 ${ok.length} 项已完成，列表已刷新）`);
    }
    return lines.join('\n');
}

/** 执行单条指令。失败一律 throw —— 静默跳过等于骗用户 */
async function execOneAction(act) {
    const sb = Auth.getClient();
    {
        const { entity, action, data } = act;

        // 一键去重
        if (entity === 'dedup') {
            const target = data?.target || 'all';
            if (target === 'todos' || target === 'all') {
                const dupKeys = {};
                for (const t of (todos || [])) {
                    const k = `${t.title}|${t.date}`;
                    if (dupKeys[k]) {
                        await DS.remove('todos', t.id);
                    } else {
                        dupKeys[k] = true;
                    }
                }
            }
            if (target === 'events' || target === 'all') {
                const dupKeys = {};
                for (const e of (events || [])) {
                    const k = `${e.title}|${e.date}|${e.event_type}`;
                    if (dupKeys[k]) {
                        await DS.remove('events', e.id);
                    } else {
                        dupKeys[k] = true;
                    }
                }
            }
            return;
        }

        if (entity === 'todo') {
            if (action === 'add') {
                assertDate(data.date, '待办日期');
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
                if (!t) throw new Error(notFoundNote(data.title, todos, x => x.title, '待办'));
                const u = data.updates || {};
                assertDate(u.date, '待办的新日期');
                const fields = {};
                if (u.date) fields.date = u.date;
                if (u.priority) fields.priority = u.priority;
                if (u.status) fields.status = u.status;
                if (u.description !== undefined) fields.description = u.description;
                if (u.new_title) fields.title = u.new_title;
                await DS.update('todos', t.id, fields);
            } else if (action === 'delete') {
                const t = findTodo(data.title);
                if (!t) throw new Error(notFoundNote(data.title, todos, x => x.title, '待办'));
                await DS.remove('todos', t.id);
            }
        } else if (entity === 'event') {
            if (action === 'add') {
                assertDate(data.date, '事件日期');
                assertTime(data.start_time, '开始时间');
                assertTime(data.end_time, '结束时间');
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
                if (!e) throw new Error(notFoundNote(data.title, events, x => x.title, '事件'));
                const u = data.updates || {};
                assertDate(u.date, '事件的新日期');
                assertTime(u.start_time, '开始时间');
                assertTime(u.end_time, '结束时间');
                const fields = {};
                if (u.new_title) fields.title = u.new_title;
                if (u.date) fields.date = u.date;
                if (u.event_type) fields.event_type = u.event_type;
                if (u.start_time !== undefined) fields.start_time = u.start_time;
                if (u.end_time !== undefined) fields.end_time = u.end_time;
                await DS.update('events', e.id, fields);
            } else if (action === 'delete') {
                const e = findEvent(data.title, data.date);
                if (!e) throw new Error(notFoundNote(data.title, events, x => x.title, '事件'));
                await DS.remove('events', e.id);
            }
        } else if (entity === 'subject') {
            if (action === 'add') {
                const row = {
                    name: data.name,
                    credits: data.credits || 0,
                    target_gpa: data.target_gpa || null,
                    components: [],
                    position: (typeof subjects !== 'undefined'
                        ? subjects.filter(s => termOf(s) === viewTerm()).length : 0),
                };
                // 走 createSubject 才会带上当前学期（term）
                if (typeof createSubject === 'function') await createSubject(row);
                else await DS.create('subjects', row);
            } else if (action === 'update') {
                const s = findSubject(data.name);
                if (!s) throw new Error(notFoundNote(data.name, subjects, x => x.name, '科目'));
                const u = data.updates || {};
                const fields = {};
                if (u.new_name) fields.name = u.new_name;
                if (u.credits !== undefined) fields.credits = u.credits;
                if (u.target_gpa !== undefined) fields.target_gpa = u.target_gpa;
                await DS.update('subjects', s.id, fields);
            } else if (action === 'delete') {
                const s = findSubject(data.name);
                if (!s) throw new Error(notFoundNote(data.name, subjects, x => x.name, '科目'));
                await DS.remove('subjects', s.id);
            }
        } else if (entity === 'component') {
            if (action === 'set_components') {
                // 整体替换绩点分布
                const s = findSubject(data.subject_name);
                if (!s) throw new Error(notFoundNote(data.subject_name, subjects, x => x.name, '科目'));
                const comps = (data.components || []).map(c => ({
                    name: c.name,
                    percentage: c.percentage || 0,
                    score: c.score ?? null,
                }));
                await DS.update('subjects', s.id, { components: comps });
            } else if (action === 'add') {
                const s = findSubject(data.subject_name);
                if (!s) throw new Error(notFoundNote(data.subject_name, subjects, x => x.name, '科目'));
                const comps = [...(s.components || []), {
                    name: data.name,
                    percentage: data.percentage || 0,
                    score: data.score ?? null,
                }];
                await DS.update('subjects', s.id, { components: comps });
            } else if (action === 'update') {
                const s = findSubject(data.subject_name);
                if (!s) throw new Error(notFoundNote(data.subject_name, subjects, x => x.name, '科目'));
                const comps = [...(s.components || [])];
                const idx = comps.findIndex(c => c.name === data.component_name);
                if (idx < 0) throw new Error(notFoundNote(data.component_name, comps, x => x.name, '绩点项'));
                const u = data.updates || {};
                if (u.name) comps[idx].name = u.name;
                if (u.percentage !== undefined) comps[idx].percentage = u.percentage;
                if (u.score !== undefined) comps[idx].score = u.score;
                await DS.update('subjects', s.id, { components: comps });
            } else if (action === 'delete') {
                const s = findSubject(data.subject_name);
                if (!s) throw new Error(notFoundNote(data.subject_name, subjects, x => x.name, '科目'));
                const comps = (s.components || []).filter(c => c.name !== data.component_name);
                await DS.update('subjects', s.id, { components: comps });
            }
        } else if (entity === 'thought') {
            if (action === 'add') {
                await DS.create('thoughts', { title: data.title || null, content: data.content, status: data.status || 'draft' });
            } else if (action === 'update') {
                // 支持按 id 或按旧内容匹配修改
                let match;
                if (data.id) {
                    match = (thoughts || []).find(t => t.id === data.id);
                } else if (data.old_content) {
                    match = (thoughts || []).find(t => t.content.includes(data.old_content) || data.old_content.includes(t.content));
                }
                if (!match) throw new Error(notFoundNote(data.title || data.old_content, thoughts, x => x.title || x.content, '脚本'));
                const fields = { content: data.new_content };
                if (data.title) fields.title = data.title;
                if (data.status) fields.status = data.status;
                await DS.update('thoughts', match.id, fields);
            } else if (action === 'delete') {
                if (data.id) {
                    // 表里没有这条也照样「成功」了，所以先在本地说清楚
                    if (thoughts && thoughts.length && !thoughts.some(t => t.id === data.id)) {
                        throw new Error(`没找到 id 为 ${data.id} 的脚本（可能已经删过了）`);
                    }
                    await DS.remove('thoughts', data.id);
                } else if (data.content) {
                    const match = (thoughts || []).find(t => t.content.includes(data.content) || data.content.includes(t.content));
                    if (!match) throw new Error(notFoundNote(data.content, thoughts, x => x.title || x.content, '脚本'));
                    await DS.remove('thoughts', match.id);
                } else {
                    throw new Error('没给 id 也没给内容，不知道该删哪条脚本');
                }
            }
        } else if (entity === 'goal') {
            // 确保目标数据已加载
            if (typeof goalsData === 'undefined' || !goalsData.length) {
                if (typeof loadGoals === 'function') {
                    goalsData = await loadGoals();
                }
            }

            if (action === 'toggle_action') {
                const { goal, sub } = resolveGoalPath(data);
                const found = resolveGoalAction(goal, sub, data.action_text);
                found.act.done = !found.act.done;
                await saveGoalsRaw(goalsData);

            } else if (action === 'add') {
                if (!data.name) throw new Error('小马没说要加的目标叫什么');
                goalsData.push({
                    id: 'goal_' + Date.now(),
                    name: data.name,
                    icon: data.icon || '🎯',
                    color: data.color || '#3b82f6',
                    subgoals: [],
                });
                await saveGoalsRaw(goalsData);

            } else if (action === 'delete') {
                const { goal } = resolveGoalPath(data);
                if (!goal) throw new Error('小马没说是要删哪个目标');
                goalsData.splice(goalsData.indexOf(goal), 1);
                await saveGoalsRaw(goalsData);

            } else if (action === 'add_subgoal') {
                if (!data.subgoal_name) throw new Error('小马没说要加的子目标叫什么');
                const { goal } = resolveGoalPath(data);
                if (!goal) throw new Error('小马没说是加到哪个目标下');
                goal.subgoals.push({ id: goal.id + '-' + Date.now(), name: data.subgoal_name, actions: [] });
                await saveGoalsRaw(goalsData);

            } else if (action === 'add_action') {
                if (!data.action_text) throw new Error('小马没说要加的行动内容');
                const { sub } = resolveGoalPath(data);
                if (!sub) throw new Error('加行动得说清楚加到哪个子目标下（子目标名没给）');
                sub.actions.push({ id: 'a' + Date.now(), text: data.action_text, done: false });
                await saveGoalsRaw(goalsData);

            } else if (action === 'delete_action') {
                const { goal, sub } = resolveGoalPath(data);
                const found = resolveGoalAction(goal, sub, data.action_text);
                found.sub.actions.splice(found.sub.actions.indexOf(found.act), 1);
                await saveGoalsRaw(goalsData);
            }
        }
    }
}

/** 名字对不上时，找一条最像的，塞进报错里让用户一眼看出差在哪 */
function closestName(target, list, getter) {
    if (!target || !list || !list.length) return '';
    const t = String(target).toLowerCase();
    let best = '', bestScore = 0;
    for (const it of list) {
        const n = String(getter(it) || '').toLowerCase();
        if (!n) continue;
        const chars = new Set(n);
        let hit = 0;
        for (const ch of new Set(t)) if (chars.has(ch)) hit++;
        const score = hit / Math.max(chars.size, 1);
        if (score > bestScore) { bestScore = score; best = getter(it); }
    }
    // 0.4 以下基本是瞎猜，不如不说
    return bestScore >= 0.4 && best !== target ? best : '';
}

function notFoundNote(target, list, getter, label) {
    const near = closestName(target, list, getter);
    if (!target) return `小马没说要改哪个${label}（缺少名字）`;
    return near
        ? `没找到${label}「${target}」，最接近的是「${near}」`
        : `没找到${label}「${target}」，${label}列表里没有能对上的名字`;
}

/** 小马偶尔会把「周日」这种字面日期直接塞进字段，写进去就是脏数据。
 *  宁可报错让用户看见，也不能落库。 */
function assertDate(val, what) {
    if (val == null || val === '') return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(val))) {
        throw new Error(`${what}「${val}」不是 YYYY-MM-DD 格式，没敢写进去`);
    }
}

function assertTime(val, what) {
    if (val == null || val === '') return;
    if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(String(val))) {
        throw new Error(`${what}「${val}」不是 HH:MM 格式，没敢写进去`);
    }
}

/** 目标 / 子目标的名称匹配。
 *  名称留空时**绝不能**用 includes('') 去撞 —— 空串恒为真，会静默改到第一个目标/子目标上。*/
function resolveGoalPath(data) {
    const goalName = String((data && data.goal_name) || '').toLowerCase();
    // 没说目标名不是错误 —— 小马经常只给行动名。交给 resolveGoalAction 全库找，
    // 命中唯一就认，不唯一才报错。这里绝不能退化成「撞第一个目标」。
    if (!goalName) return { goal: null, sub: null };
    const goal = goalsData.find(g => g.name.toLowerCase().includes(goalName) || goalName.includes(g.name.toLowerCase()));
    if (!goal) throw new Error(notFoundNote(data.goal_name, goalsData, x => x.name, '目标'));

    const subName = String((data && data.subgoal_name) || '').toLowerCase();
    if (!subName) return { goal, sub: null };
    const sub = goal.subgoals.find(s => s.name.toLowerCase().includes(subName) || subName.includes(s.name.toLowerCase()));
    if (!sub) throw new Error(notFoundNote(data.subgoal_name, goal.subgoals, x => x.name, '子目标'));
    return { goal, sub };
}

/** 在（指定的 / 某个目标下的 / 全部）行动里找。命中必须唯一，否则宁可报错也不改错东西。*/
function resolveGoalAction(goal, sub, text) {
    const t = String(text || '').toLowerCase();
    if (!t) throw new Error('小马没说是哪个行动');

    let pairs = [];
    if (sub) {
        pairs = sub.actions.map(a => ({ sub, act: a }));
    } else if (goal) {
        for (const s of goal.subgoals) for (const a of s.actions) pairs.push({ sub: s, act: a });
    } else {
        for (const g of goalsData) for (const s of g.subgoals) for (const a of s.actions) pairs.push({ sub: s, act: a });
    }

    const hits = pairs.filter(p => {
        const at = p.act.text.toLowerCase();
        return at.includes(t) || t.includes(at);
    });
    if (!hits.length) throw new Error(notFoundNote(text, pairs.map(p => p.act), x => x.text, '行动'));
    if (hits.length > 1) {
        throw new Error(`有 ${hits.length} 个行动都能跟「${text}」对上，说清楚是哪个目标下的`);
    }
    return hits[0];
}

function findTodo(title) {
    if (typeof todos === 'undefined' || !title) return null;
    const t = String(title).toLowerCase();
    return todos.find(x => x.title.toLowerCase().includes(t) || t.includes(x.title.toLowerCase()));
}
function findEvent(title, date) {
    if (typeof events === 'undefined' || !title) return null;
    const t = String(title).toLowerCase();
    const hit = x => x.title.toLowerCase().includes(t) || t.includes(x.title.toLowerCase());
    if (date) {
        const exact = events.find(x => hit(x) && x.date === date);
        if (exact) return exact;
        // 小马经常把日期算错一位，别因为日期对不上就整条放弃按标题找；
        // 但标题撞车的有多条时宁可报错，也不能改错人
        const byTitle = events.filter(hit);
        if (byTitle.length === 1) return byTitle[0];
        if (byTitle.length > 1) {
            throw new Error(`有 ${byTitle.length} 条都叫「${title}」，请说清楚是哪一天的`);
        }
        return null;
    }
    return events.find(hit) || null;
}
function findSubject(name) {
    if (typeof subjects === 'undefined' || !name) return null;
    const n = String(name).toLowerCase();
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

/** 绑定回车发送 + 按钮点击 */
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatSendBtn');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChat();
            }
        });
    }
    if (sendBtn) {
        sendBtn.addEventListener('click', sendChat);
    }
});
