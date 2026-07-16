/* ============================================================
   TaskFlow - 学业管理 脚本  v3.2 (checkbox)
   ============================================================ */
console.log('✅ TaskFlow v3.2');
const sb = Auth.getClient();
const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);

// ==================== 全局状态 ====================
let subjects = [], events = [], todos = [], thoughts = [], vocabs = [];
let currentTab = 'home';
let todoDate = new Date().toISOString().slice(0, 10);
let calYear = new Date().getFullYear(), calMonth = new Date().getMonth();
let selectedCalDate = null;
let vocabBook = '基础', vocabUnit = 'U1', vocabPart = 'P1', vocabEditId = null;
let vocabEditMode = false;  // 编辑模式：显示复选框和编辑/删除按钮
const VOCAB_BOOKS = [
    { key: '基础', label: '基础', emoji: '🟢' },
    { key: '四级', label: '四级', emoji: '📙' },
    { key: '六级', label: '六级', emoji: '📘' },
    { key: '大英四', label: '大英四', emoji: '📗' },
];
/** 查找相似科目名（"微积分" ≈ "微积分（甲）Ⅱ"） */
function findSimilarSubject(name) {
    if (!name) return null;
    const simplify = s => s.replace(/[（(][^)）]*[)）]/g,'').replace(/[ⅠⅡⅢⅣⅤV\d]+$/,'').replace(/\s+/g,'').trim();
    const a = simplify(name);
    if (!a) return null;
    // 精确匹配（简化后）
    let s = subjects.find(s=>simplify(s.name)===a);
    if (s) return s;
    // 包含关系
    s = subjects.find(s=>{ const sb=simplify(s.name); return sb.includes(a) || a.includes(sb); });
    if (s) return s;
    // 字符重叠率 ≥ 65%
    s = subjects.find(s=>{
        const sb = simplify(s.name);
        if (!sb || !a) return false;
        const overlap = [...a].filter(c=>sb.includes(c)).length;
        const ratio = overlap / Math.max(a.length, sb.length);
        return ratio >= 0.65;
    });
    return s || null;
}

// ==================== 数据层 ====================
const DS = {
    _userId: null,
    async getUserId() {
        if (this._userId) return this._userId;
        const u = await sb.auth.getUser();
        this._userId = u.data.user.id;
        return this._userId;
    },
    async loadSubjects() { try { const { data, error } = await sb.from('subjects').select('*').order('position',{ascending:true}).order('created_at'); if (error) console.warn('[DS.loadSubjects]', error); return data||[]; } catch(e) { console.warn('subjects:',e); const { data } = await sb.from('subjects').select('*').order('created_at'); return data||[]; } },
    async loadEvents() { const { data, error } = await sb.from('events').select('*').order('date').order('start_time'); if (error) console.warn('[DS.loadEvents]', error); return data||[]; },
    async loadTodos() { const { data, error } = await sb.from('todos').select('*').order('created_at',{ascending:false}); if (error) console.warn('[DS.loadTodos]', error); return data||[]; },
    async loadThoughts() { const { data, error } = await sb.from('thoughts').select('*').order('created_at',{ascending:false}); if (error) console.warn('[DS.loadThoughts]', error); return data||[]; },
    async loadVocab() { const { data, error } = await sb.from('vocabulary').select('*').order('unit').order('part').order('created_at'); if (error) console.warn('[DS.loadVocab]', error); return data||[]; },
    async create(table, row) { row.user_id = await this.getUserId();
        const { data, error } = await sb.from(table).insert(row).select().single(); if (error) throw error; return data; },
    async createMany(table, rows) {
        if (!rows.length) return [];
        const uid = await this.getUserId();
        const enriched = rows.map(r => ({ ...r, user_id: uid }));
        const { error } = await sb.from(table).insert(enriched);
        if (error) throw error;
        console.log(`[DS.createMany] ${table}: 写入 ${enriched.length} 条成功`);
        return enriched;  // insert 无 error 即视为成功，refreshAll 会自然验证
    },
    async update(table, id, fields) {
        const { data, error } = await sb.from(table).update(fields).eq('id', id).select().single(); if (error) throw error; return data; },
    async remove(table, id) { await sb.from(table).delete().eq('id', id); },
};

async function refreshAll() {
    const [s, e, t, th, v] = await Promise.all([
        DS.loadSubjects().catch(e=>(console.warn(e),[])),
        DS.loadEvents().catch(e=>(console.warn(e),[])),
        DS.loadTodos().catch(e=>(console.warn(e),[])),
        DS.loadThoughts().catch(e=>(console.warn(e),[])),
        DS.loadVocab().catch(e=>(console.warn(e),[]))
    ]);
    subjects = s; todos = t; thoughts = th; vocabs = v;
    // 事件默认按日期→时间排序（同一天内从早到晚）
    events = e.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.start_time || '99:99').localeCompare(b.start_time || '99:99');
    });
    renderCurrent();
}
function renderCurrent() { if (currentTab==='home') renderHome(); else if (currentTab==='todos') renderTodos(); else if (currentTab==='calendar') renderCalendar(); else if (currentTab==='subjects') renderSubjects(); else if (currentTab==='thoughts') renderThoughts(); else if (currentTab==='chat') renderChatView(); else if (currentTab==='vocab') renderVocabView(); else if (currentTab==='goals') renderGoalsView(); }

// ==================== Tab 切换 ====================
$$('.nav__tab').forEach(btn => btn.addEventListener('click', () => {
    currentTab = btn.dataset.tab;
    $$('.nav__tab').forEach(b => b.classList.remove('active')); btn.classList.add('active');
    $$('.view').forEach(v => v.classList.remove('active')); $(`#view-${currentTab}`).classList.add('active');
    if (currentTab === 'home') renderHome();
	    if (currentTab === 'calendar') renderCalendar();
    if (currentTab === 'subjects') renderSubjects();
    if (currentTab === 'todos') renderTodos();
    if (currentTab === 'thoughts') renderThoughts();

    if (currentTab === 'chat') renderChatView();
    if (currentTab === 'vocab') renderVocabView();
    if (currentTab === 'goals') renderGoalsView();
}));
$('.nav__logo').addEventListener('click', (e) => {
    if (window.innerWidth < 768) {
        e.preventDefault();
        document.querySelector('.nav__tabs').classList.toggle('nav__tabs--open');
        return;
    }
    currentTab='home'; $$('.nav__tab').forEach(b=>b.classList.remove('active')); $('[data-tab="home"]').classList.add('active'); $$('.view').forEach(v=>v.classList.remove('active')); $('#view-home').classList.add('active'); renderHome();
});
// 手机端：点 tab 按钮后自动收起
$$('.nav__tab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelector('.nav__tabs').classList.remove('nav__tabs--open');
}));
// 点页面其他位置收起
document.addEventListener('click', (e) => {
    if (window.innerWidth >= 768) return;
    if (!e.target.closest('.nav__tabs') && !e.target.closest('.nav__logo')) {
        document.querySelector('.nav__tabs').classList.remove('nav__tabs--open');
    }
});

// ==================== 通用模态框 ====================
function openModal(title, formHTML) { $('#modalTitle').textContent = title; $('#modalForm').innerHTML = formHTML; $('#modalOverlay').style.display = ''; }
function closeModal() { $('#modalOverlay').style.display = 'none'; editId = null; modalMode = null; }
$('#modalClose').addEventListener('click', closeModal);
$('#modalOverlay').addEventListener('click', e => { if (e.target===$('#modalOverlay')) closeModal(); });

function showSubjectSelect(selectedId) {
    return subjects.map(s => `<option value="${s.id}" ${s.id===selectedId?'selected':''}>${esc(s.name)}</option>`).join('');
}

// ==================== 待办视图 ====================
$('#todoDate').value = todoDate;
$('#todoDate').addEventListener('change', () => { todoDate = $('#todoDate').value; renderTodos(); });
function shiftDate(days) {
    const [y,m,d] = todoDate.split('-').map(Number);
    const dt = new Date(y, m-1, d + days);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
$('#todoPrevDay').addEventListener('click', () => { todoDate = shiftDate(-1); $('#todoDate').value = todoDate; renderTodos(); });
$('#todoNextDay').addEventListener('click', () => { todoDate = shiftDate(1); $('#todoDate').value = todoDate; renderTodos(); });
$('#todoToday').addEventListener('click', () => { todoDate=new Date().toISOString().slice(0,10); $('#todoDate').value=todoDate; renderTodos(); });

function renderTodos() {
    const seen = new Set();
    const dayEvents = events.filter(e => {
        const k = e.title + '|' + e.event_type + '|' + e.date;
        if (seen.has(k)) return false;
        seen.add(k);
        return e.date === todoDate;
    });
    $('#dayEvents').innerHTML = dayEvents.length ? dayEvents.map(e => `
        <div class="day-event-item day-event-item--${e.event_type}">
            <span class="event-dot event-dot--${e.event_type}"></span>
            <span style="flex:1">${esc(e.title)}</span>
            <span style="font-size:.75rem;color:var(--color-text-light)">${eventTypeLabel(e.event_type)}</span>
        </div>`).join('') : '';

    const dayTodos = todos.filter(t => t.date === todoDate);
    const labels = {todo:'待办',doing:'进行中',done:'已完成'};
    $('#todoList').innerHTML = dayTodos.length ? dayTodos.map(t => {
        const sub = subjects.find(s=>s.id===t.subject_id);
        const dc = t.status==='done'?'todo-card--done':'';
        return `<div class="todo-card ${dc}" data-id="${t.id}">
            <div class="todo-card__check" data-action="toggle" title="点击打勾/取消">
                ${t.status==='done' ? '☑' : '☐'}
            </div>
            <div class="todo-card__body" data-action="edit">
                <div class="todo-card__title">${esc(t.title)}</div>
                ${t.description?`<div class="todo-card__desc">${esc(t.description)}</div>`:''}
                <div class="todo-card__meta">
                    <span class="status-badge status-badge--${t.status}">${labels[t.status]}</span>
                    <span><span class="priority-dot priority--${t.priority}"></span>${t.priority}</span>
                    ${sub?`<span>📚 ${esc(sub.name)}</span>`:''}
                </div>
            </div>
            <div class="todo-card__actions">
                <button data-action="edit" title="编辑">✏️</button>
                <button class="btn-del" data-action="delete" title="删除">🗑️</button>
            </div>
        </div>`;
    }).join('') : '<p class="empty-text">暂无任务</p>';
}

$('#addTodoBtn').addEventListener('click', () => {
    modalMode = 'todo'; editId = null;
    openModal('添加任务', `
        <div class="form-group"><label>标题*</label><input class="form-input" id="mfTitle" maxlength="100" required placeholder="任务标题"></div>
        <div class="form-group"><label>描述</label><textarea class="form-input" id="mfDesc" rows="2" placeholder="备注（可选）"></textarea></div>
        <div class="form-row">
            <div class="form-group"><label>优先级</label><select class="form-select" id="mfPriority"><option value="高">🔴 高</option><option value="中" selected>🟡 中</option><option value="低">🟢 低</option></select></div>
            <div class="form-group"><label>关联科目</label><select class="form-select" id="mfSubject"><option value="">无</option>${showSubjectSelect(null)}</select></div>
        </div>
        <div class="modal__footer">
            <button type="button" class="btn btn--outline" onclick="closeModal()">取消</button>
            <button type="submit" class="btn btn--primary">保存</button>
        </div>
    `);
    $('#modalForm').onsubmit = async e => { e.preventDefault(); await saveModal(); };
});

$('#todoList').addEventListener('click', async e => {
    const card = e.target.closest('.todo-card'); if (!card) return;
    const id = parseInt(card.dataset.id);
    const t = todos.find(x=>x.id===id); if (!t) return;
    const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;
    if (action === 'cycle') { const n = {todo:'doing',doing:'done',done:'todo'}; await DS.update('todos',id,{status:n[t.status]}); await refreshAll(); }
    else if (action === 'toggle') { const ns = t.status==='done'?'todo':'done'; await DS.update('todos',id,{status:ns}); await refreshAll(); }
    else if (action === 'edit') { editTodo(t); }
    else if (action === 'delete') { if (confirm(`确定删除「${t.title}」？`)) { await DS.remove('todos',id); await refreshAll(); } }
});

function editTodo(t) {
    modalMode = 'todo'; editId = t.id;
    openModal('编辑任务', `
        <div class="form-group"><label>标题*</label><input class="form-input" id="mfTitle" maxlength="100" required value="${esc(t.title)}"></div>
        <div class="form-group"><label>描述</label><textarea class="form-input" id="mfDesc" rows="2">${esc(t.description||'')}</textarea></div>
        <div class="form-row">
            <div class="form-group"><label>优先级</label><select class="form-select" id="mfPriority"><option value="高" ${t.priority==='高'?'selected':''}>🔴 高</option><option value="中" ${t.priority==='中'?'selected':''}>🟡 中</option><option value="低" ${t.priority==='低'?'selected':''}>🟢 低</option></select></div>
            <div class="form-group"><label>关联科目</label><select class="form-select" id="mfSubject"><option value="">无</option>${showSubjectSelect(t.subject_id)}</select></div>
        </div>
        <div class="modal__footer">
            <button type="button" class="btn btn--outline" onclick="closeModal()">取消</button>
            <button type="submit" class="btn btn--primary">保存</button>
        </div>
    `);
    $('#modalForm').onsubmit = async e => { e.preventDefault(); await saveModal(); };
}

// ==================== 日历视图 ====================
function eventTypeLabel(t) { return {exam:'考试',class:'学习',holiday:'生活',deadline:'DDL',other:'其他'}[t]||t; }

function renderCalendar() {
    $('#calMonthLabel').textContent = `${calYear}年 ${calMonth+1}月`;
    const f = new Date(calYear,calMonth,1).getDay(), dim = new Date(calYear,calMonth+1,0).getDate();
    const pd = new Date(calYear,calMonth,0).getDate();
    const today = new Date().toISOString().slice(0,10);
    let h = '';
    for (let i=f-1; i>=0; i--) { const d=pd-i, m=calMonth===0?12:calMonth, y=calMonth===0?calYear-1:calYear; h+=calCell(d,`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,true); }
    for (let d=1; d<=dim; d++) { h+=calCell(d,`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,false); }
    const rem = 42-(f+dim);
    for (let d=1; d<=rem; d++) { const m=calMonth===11?1:calMonth+2, y=calMonth===11?calYear+1:calYear; h+=calCell(d,`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,true); }
    $('#calGrid').innerHTML = h;
    if (selectedCalDate) renderDayCard();
}

function calCell(day, dateKey, other) {
    const today = new Date().toISOString().slice(0,10);
    let cls = 'cal__cell';
    if (other) cls += ' cal__cell--other';
    if (dateKey === today) cls += ' cal__cell--today';
    // 去重：同名+同类型只显示一个点
    const seen = new Set();
    const dots = events.filter(e=>{ const k=e.title+'|'+e.event_type; if (seen.has(k)) return false; seen.add(k); return e.date===dateKey; });
    const dotHTML = dots.length ? `<div class="cal__dots">${dots.map(d=>`<span class="cal__dot cal__dot--${d.event_type}"></span>`).join('')}</div>` : '';
    return `<div class="${cls}" data-date="${dateKey}">${day}${dotHTML}</div>`;
}

$('#calGrid').addEventListener('click', e => {
    const cell = e.target.closest('.cal__cell'); if (!cell) return;
    selectedCalDate = cell.dataset.date; renderCalendar();
});
$('#calPrev').addEventListener('click', () => { if (calMonth===0){calMonth=11;calYear--;}else calMonth--; selectedCalDate=null; renderCalendar(); });
$('#calNext').addEventListener('click', () => { if (calMonth===11){calMonth=0;calYear++;}else calMonth++; selectedCalDate=null; renderCalendar(); });

function renderDayCard() {
    if (!selectedCalDate) { $('#dayCard').style.display='none'; return; }
    $('#dayCard').style.display = '';
    $('#dayCardDate').textContent = selectedCalDate;
    const seen = new Set();
    const dayEvents = events
        .filter(e=>{ const k=e.title+'|'+e.event_type; if (seen.has(k)) return false; seen.add(k); return e.date===selectedCalDate; })
        .sort((a, b) => (a.start_time || '99:99').localeCompare(b.start_time || '99:99'));
    const dayTodos = todos.filter(t => t.date === selectedCalDate);
    const labels = {todo:'待办',doing:'进行中',done:'已完成'};
    let html = '';
    if (dayEvents.length) html += dayEvents.map(e => {
        const timeStr = e.start_time ? `${e.start_time.slice(0,5)}-${e.end_time?e.end_time.slice(0,5):''}` : '';
        return `<div class="day-card__event day-card__event--${e.event_type}">
            <span>${eventTypeLabel(e.event_type)==='考试'?'🔴':eventTypeLabel(e.event_type)==='学习'?'🔵':eventTypeLabel(e.event_type)==='生活'?'🟢':eventTypeLabel(e.event_type)==='DDL'?'🟡':'🟣'} ${esc(e.title)}${timeStr?` <small style="color:var(--color-text-light)">${timeStr}</small>`:''}</span>
            <button data-del-event="${e.id}" title="删除">✕</button>
        </div>`;
    }).join('');
    if (dayTodos.length) html += dayTodos.map(t => `
        <div class="day-card__event" style="background:#f8fafc;border-left:3px solid var(--color-primary);display:flex;align-items:center;gap:8px;justify-content:space-between;padding:8px 12px;margin-bottom:4px;border-radius:6px;font-size:.85rem">
            <span style="cursor:pointer;flex:1" data-toggle-todo="${t.id}">${t.status==='done'?'☑':'☐'} ${esc(t.title)}</span>
            <span class="status-badge status-badge--${t.status}">${labels[t.status]}</span>
            <button data-del-todo="${t.id}" style="border:none;background:none;cursor:pointer;font-size:.8rem;color:var(--color-text-light)" title="删除">🗑️</button>
        </div>`).join('');
    if (!html) html = '<p style="font-size:.85rem;color:var(--color-text-light)">当天无事件和任务</p>';
    $('#dayCardEvents').innerHTML = html;
}
$('#dayCardClose').addEventListener('click', () => { selectedCalDate=null; renderCalendar(); });
$('#dayCardEvents').addEventListener('click', async e => {
    if (e.target.dataset.delEvent) {
        if (confirm('删除此事件？')) { await DS.remove('events', parseInt(e.target.dataset.delEvent)); events = events.filter(x=>x.id!==parseInt(e.target.dataset.delEvent)); renderCalendar(); renderDayCard(); }
        return;
    }
    if (e.target.dataset.delTodo) {
        if (confirm('删除此任务？')) { await DS.remove('todos', parseInt(e.target.dataset.delTodo)); todos = todos.filter(x=>x.id!==parseInt(e.target.dataset.delTodo)); renderCalendar(); renderDayCard(); renderTodos(); }
        return;
    }
    if (e.target.dataset.toggleTodo || e.target.closest('[data-toggle-todo]')) {
        const id = parseInt(e.target.dataset.toggleTodo || e.target.closest('[data-toggle-todo]').dataset.toggleTodo);
        const t = todos.find(x=>x.id===id);
        if (t) { const ns = t.status==='done'?'todo':'done'; t.status = ns; await DS.update('todos', id, {status:ns}); renderDayCard(); renderTodos(); }
    }
});
$('#dayCardAddTodo').addEventListener('click', () => {
    todoDate = selectedCalDate; $('#todoDate').value = todoDate;
    currentTab = 'todos'; $$('.nav__tab').forEach(b=>b.classList.remove('active')); $('[data-tab="todos"]').classList.add('active');
    $$('.view').forEach(v=>v.classList.remove('active')); $('#view-todos').classList.add('active');
    renderTodos();
    // 自动弹出添加任务框
    $('#addTodoBtn').click();
});
$('#dayCardAddEvent').addEventListener('click', () => {
    modalMode = 'event'; editId = null;
    openModal(`添加事件 - ${selectedCalDate}`, `
        <div class="form-group"><label>标题*</label><input class="form-input" id="mfTitle" maxlength="100" required placeholder="事件名称"></div>
        <div class="form-group"><label>类型</label><select class="form-select" id="mfEventType"><option value="exam">🔴 考试</option><option value="class">🔵 学习</option><option value="holiday">🟢 生活</option><option value="deadline">🟡 DDL</option><option value="other">🟣 其他</option></select></div>
        <div class="form-row">
            <div class="form-group"><label>开始时间</label><input type="time" class="form-input" id="mfStartTime"></div>
            <div class="form-group"><label>结束时间</label><input type="time" class="form-input" id="mfEndTime"></div>
        </div>
        <div class="form-group"><label>关联科目</label><select class="form-select" id="mfSubject"><option value="">无</option>${showSubjectSelect(null)}</select></div>
        <div class="modal__footer">
            <button type="button" class="btn btn--outline" onclick="closeModal()">取消</button>
            <button type="submit" class="btn btn--primary">保存</button>
        </div>
    `);
    $('#modalForm').onsubmit = async e => { e.preventDefault(); await saveModal(); };
});

// ==================== 脚本视图 ====================

/** 计算脚本统计：场景数、字数、预估时长 */
function updateScriptStats() {
    const content = document.getElementById('thoughtInput')?.value || '';
    const scenes = content.split('\n---\n').filter(s => s.trim());
    const sceneCount = scenes.length;
    const charCount = content.replace(/\s/g, '').length;
    const secs = Math.round(charCount / 250 * 60);
    const duration = secs < 60 ? `${secs} 秒` : `${Math.floor(secs / 60)} 分 ${secs % 60} 秒`;
    const el = document.getElementById('scriptStats');
    if (el) el.innerHTML = `📊 ${sceneCount} 个场景 · ${charCount} 字 · 约 ${duration}`;
}

function renderThoughts() {
    const countEl = document.getElementById('thoughtCount');
    if (countEl) countEl.textContent = thoughts.length ? `共 ${thoughts.length} 条` : '';

    const listEl = document.getElementById('thoughtsList');
    if (!listEl) return;

    if (!thoughts.length) {
        listEl.innerHTML = '<p class="empty-text">暂无脚本，在上方开始写吧 🎬</p>';
        return;
    }

    listEl.innerHTML = thoughts.map(t => {
        const time = t.created_at ? new Date(t.created_at).toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
        const statusLabels = { draft: '草稿', filming: '🎥 拍摄中', done: '✅ 已完成' };
        const statusLabel = statusLabels[t.status] || '草稿';
        const title = t.title || '未命名脚本';
        const content = t.content || '';
        const scenes = content.split('\n---\n').filter(s => s.trim());
        const sceneCount = scenes.length;
        const charCount = content.replace(/\s/g, '').length;
        const secs = Math.round(charCount / 250 * 60);
        const duration = secs < 60 ? `${secs} 秒` : `${Math.floor(secs / 60)} 分 ${secs % 60} 秒`;
        // 内容预览：取前 3 行，每行最多 30 字
        const preview = scenes.slice(0, 3).map(s => s.split('\n')[0].slice(0, 30)).join('\n');

        return `<div class="thought-card" data-id="${t.id}" data-action="open">
            <div class="thought-card__header">
                <span class="thought-card__title">🎬 ${esc(title)}</span>
                <span class="thought-card__status thought-card__status--${t.status || 'draft'}">${statusLabel}</span>
            </div>
            <div class="thought-card__content">
                <div class="thought-card__preview">${esc(preview)}</div>
            </div>
            <div class="thought-card__footer">
                <span class="thought-card__meta">📊 ${sceneCount} 个场景 · ${charCount} 字 · 约 ${duration}</span>
                <span class="thought-card__time">${time}</span>
                <button class="thought-card__btn thought-card__del" data-action="delete" data-id="${t.id}" title="删除">🗑️</button>
            </div>
        </div>`;
    }).join('');
}

// 添加脚本
async function addThought() {
    const titleInput = document.getElementById('thoughtTitleInput');
    const contentInput = document.getElementById('thoughtInput');
    const statusSelect = document.getElementById('thoughtStatusSelect');
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    if (!content) return;
    titleInput.value = '';
    contentInput.value = '';
    titleInput.disabled = true;
    contentInput.disabled = true;
    document.getElementById('thoughtAddBtn').disabled = true;
    try {
        await DS.create('thoughts', { title: title || null, content, status: statusSelect.value });
        await refreshAll();
        statusSelect.value = 'draft';
        updateScriptStats();
    } catch (e) {
        console.error('添加脚本失败:', e);
        showToast('添加失败: ' + e.message, 'error');
    }
    titleInput.disabled = false;
    contentInput.disabled = false;
    document.getElementById('thoughtAddBtn').disabled = false;
    contentInput.focus();
}

// 删除脚本
async function deleteThought(id) {
    if (!confirm('确定删除这条脚本吗？')) return;
    try {
        await DS.remove('thoughts', id);
        thoughts = thoughts.filter(t => t.id !== id);
        renderThoughts();
    } catch (e) {
        console.error('删除脚本失败:', e);
    }
}

// ==================== 全屏脚本编辑器 ====================
let scriptEditorId = null;

function openScriptEditor(id) {
    const t = thoughts.find(x => x.id === id);
    if (!t) return;
    scriptEditorId = id;
    document.getElementById('scriptEditorTitle').value = t.title || '';
    document.getElementById('scriptEditorContent').value = t.content || '';
    document.getElementById('scriptEditorStatus').value = t.status || 'draft';
    document.getElementById('scriptEditorOverlay').classList.add('active');
    updateScriptEditorStats();
    const textarea = document.getElementById('scriptEditorContent');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

function closeScriptEditor() {
    document.getElementById('scriptEditorOverlay').classList.remove('active');
    scriptEditorId = null;
    renderThoughts();
}

function updateScriptEditorStats() {
    const content = document.getElementById('scriptEditorContent')?.value || '';
    const scenes = content.split('\n---\n').filter(s => s.trim());
    const sceneCount = scenes.length;
    const charCount = content.replace(/\s/g, '').length;
    const secs = Math.round(charCount / 250 * 60);
    const duration = secs < 60 ? `${secs} 秒` : `${Math.floor(secs / 60)} 分 ${secs % 60} 秒`;
    const el = document.getElementById('scriptEditorStats');
    if (el) el.textContent = `📊 ${sceneCount} 个场景 · ${charCount} 字 · 约 ${duration}`;
}

async function saveScriptEditor() {
    if (!scriptEditorId) return;
    const title = document.getElementById('scriptEditorTitle').value.trim() || null;
    const content = document.getElementById('scriptEditorContent').value.trim();
    const status = document.getElementById('scriptEditorStatus').value || 'draft';
    if (!content) return;
    try {
        await DS.update('thoughts', scriptEditorId, { title, content, status });
        const t = thoughts.find(x => x.id === scriptEditorId);
        if (t) { t.title = title; t.content = content; t.status = status; }
        showToast('已保存 ✅', 'success');
    } catch (e) {
        console.error('保存脚本失败:', e);
        showToast('保存失败: ' + e.message, 'error');
    }
}

async function deleteScriptFromEditor() {
    if (!scriptEditorId) return;
    if (!confirm('确定删除这条脚本吗？')) return;
    try {
        await DS.remove('thoughts', scriptEditorId);
        thoughts = thoughts.filter(t => t.id !== scriptEditorId);
        closeScriptEditor();
        showToast('已删除', 'info');
    } catch (e) {
        console.error('删除脚本失败:', e);
    }
}

// 旧版编辑模式（已废弃，转发到全屏编辑器）
function enterEditThought(id) { openScriptEditor(id); }
async function saveEditThought(id) { await saveScriptEditor(); }

// ==================== 单词视图 ====================
async function autoDedupVocab(unit, part) {
    // 仅在非复习模式下自动去重
    if (unit === '__review__' || unit === '__mastered__') return false;
    const target = vocabs.filter(v => v.book === vocabBook && v.unit === unit && v.part === part);
    if (target.length < 2) return false;
    const seen = new Map();
    const toDelete = [];
    for (const v of target) {
        const key = v.word.toLowerCase();
        if (seen.has(key)) {
            toDelete.push(v);
        } else {
            seen.set(key, v);
        }
    }
    if (!toDelete.length) return false;
    try {
        for (const v of toDelete) {
            await DS.remove('vocabulary', v.id);
        }
        vocabs = vocabs.filter(v => !toDelete.some(d => d.id === v.id));
        console.log(`[去重] ${unit} ${part}: 自动删除 ${toDelete.length} 个重复条目`);
        return true; // 有变更，需要重新渲染
    } catch (e) {
        console.warn('[去重] 自动去重失败:', e);
        return false;
    }
}

function renderVocabView() {
    const isReview = vocabUnit === '__review__';
    const isMastered = vocabUnit === '__mastered__';
    const isSpecial = isReview || isMastered;

    // 后台自动去重，不阻塞渲染
    if (!isSpecial) {
        autoDedupVocab(vocabUnit, vocabPart).then(changed => {
            if (changed) renderVocabView();
        }).catch(e => console.warn('[去重] 后台去重失败:', e));
    }

    // === 词书选择器 ===
    const bookHTML = VOCAB_BOOKS.map(b => {
        const cnt = vocabs.filter(v => v.book === b.key).length;
        const mastered = vocabs.filter(v => v.book === b.key && v.mastered === true).length;
        const cls = b.key === vocabBook ? ' vocab-book-btn--active' : '';
        return `<button class="vocab-book-btn${cls}" data-book="${b.key}">
            <span class="vocab-book-btn__icon">${b.emoji}</span>
            <span class="vocab-book-btn__label">${b.label}</span>
            <span class="vocab-book-btn__count">${cnt} 词 · 已背 ${mastered}</span>
        </button>`;
    }).join('');
    $('#vocabBookRow').innerHTML = bookHTML;

    // === 统计栏 ===
    const bookTotal = vocabs.filter(v => v.book === vocabBook).length;
    const bookMastered = vocabs.filter(v => v.book === vocabBook && v.mastered === true).length;
    $('#vocabStatsRow').innerHTML = `
        <span class="vocab-stat">📚 总词数 <strong>${bookTotal}</strong></span>
        <span class="vocab-stat">✅ 已背 <strong>${bookMastered}</strong></span>
    `;

    // === 过滤 ===
    let filtered;
    if (isReview) {
        filtered = vocabs.filter(v => v.book === vocabBook && v.review === true);
    } else if (isMastered) {
        filtered = vocabs.filter(v => v.book === vocabBook && v.mastered === true);
    } else {
        filtered = vocabs.filter(v => v.book === vocabBook && v.unit === vocabUnit && v.part === vocabPart && !v.mastered);
    }
    const countEl = $('#vocabCount');
    let label;
    if (isReview) label = '🔄 复习';
    else if (isMastered) label = '✅ 已背';
    else label = `${vocabUnit} ${vocabPart}`;
    if (countEl) countEl.textContent = filtered.length ? `${label} · ${filtered.length}词` : label;

    // === Unit 选择器 ===
    const reviewCount = vocabs.filter(v => v.book === vocabBook && v.review === true).length;
    const masteredCount = vocabs.filter(v => v.book === vocabBook && v.mastered === true).length;
    const reviewCls = isReview ? ' vocab-unit-btn--review vocab-unit-btn--active' : ' vocab-unit-btn--review';
    const masteredCls = isMastered ? ' vocab-unit-btn--mastered vocab-unit-btn--active' : ' vocab-unit-btn--mastered';
    let unitHTML = `<button class="vocab-unit-btn${reviewCls}" data-unit="__review__">🔄 复习<span class="vocab-unit-count">${reviewCount}</span></button>`;
    unitHTML += `<button class="vocab-unit-btn${masteredCls}" data-unit="__mastered__">✅ 已背<span class="vocab-unit-count">${masteredCount}</span></button>`;
    // 动态获取所有 unit（从 vocabs 数据中提取）
    const unitSet = new Set();
    vocabs.filter(v => v.book === vocabBook).forEach(v => { if (v.unit) unitSet.add(v.unit); });
    const units = [...unitSet].sort((a, b) => {
        // 智能排序：CET6-U1, CET6-U2, ... 或 U1, U2, ...
        const numA = parseInt(a.match(/(\d+)/)?.[1] || '0');
        const numB = parseInt(b.match(/(\d+)/)?.[1] || '0');
        const preA = a.replace(/\d+.*/, '');
        const preB = b.replace(/\d+.*/, '');
        if (preA === preB) return numA - numB;
        return preA.localeCompare(preB) || numA - numB;
    });
    unitHTML += units.map(u => {
        const cnt = vocabs.filter(v => v.book === vocabBook && v.unit === u && !v.mastered).length;
        const cls = u === vocabUnit ? ' vocab-unit-btn--active' : '';
        return `<button class="vocab-unit-btn${cls}" data-unit="${u}">${u}<span class="vocab-unit-count">${cnt}</span></button>`;
    }).join('');
    $('#vocabUnitRow').innerHTML = unitHTML;

    // === Part 选择器 ===
    if (isSpecial) {
        $('#vocabPartRow').style.display = 'none';
    } else {
        $('#vocabPartRow').style.display = '';
        // 动态获取当前 unit 的所有 part
        const partSet = new Set();
        vocabs.filter(v => v.book === vocabBook && v.unit === vocabUnit).forEach(v => { if (v.part) partSet.add(v.part); });
        const parts = partSet.size > 0 ? [...partSet].sort() : ['P1'];
        $('#vocabPartRow').innerHTML = parts.map(p => {
            const cls = p === vocabPart ? ' vocab-part-btn--active' : '';
            return `<button class="vocab-part-btn${cls}" data-part="${p}">${p}</button>`;
        }).join('');
    }

    // === 编辑工具栏 ===
    const editTools = $('#vocabEditTools');
    if (editTools) editTools.style.display = vocabEditMode && !isSpecial ? '' : 'none';
    const editBtn = $('#vocabEditBtn');
    if (editBtn) {
        if (isSpecial) { editBtn.style.display = 'none'; }
        else {
            editBtn.style.display = '';
            editBtn.textContent = vocabEditMode ? '✏️ 完成' : '✏️ 编辑';
            editBtn.classList.toggle('btn--active', vocabEditMode);
        }
    }

    // === 检测按钮 ===
    const checkBtn = $('#vocabCheckBtn');
    if (checkBtn) checkBtn.style.display = isSpecial ? 'none' : '';

    // === 列表 ===
    const listEl = $('#vocabList');
    if (!filtered.length) {
        if (isReview) {
            listEl.innerHTML = '<p class="empty-text">🎉 复习表已清空，没有需要复习的条目</p>';
        } else if (isMastered) {
            listEl.innerHTML = '<p class="empty-text">📭 还没有已背单词，去检测模式里通关吧 💪</p>';
        } else if (bookTotal === 0) {
            const quickImport = VOCAB_BOOKS.filter(b => ['基础','四级','六级'].includes(b.key));
            const hasQuickImport = quickImport.some(b => b.key === vocabBook);
            const qb = quickImport.find(b => b.key === vocabBook);
            listEl.innerHTML = `<div class="vocab-empty-book">
                <div class="vocab-empty-book__icon">${VOCAB_BOOKS.find(b => b.key === vocabBook)?.emoji || '📖'}</div>
                <h3>${vocabBook}词书还是空的</h3>
                <p>添加或导入单词开始学习吧</p>
                <div style="display:flex;gap:8px;margin-top:4px">
                    <button class="btn btn--primary btn--sm" id="vocabEmptyAddBtn">➕ 添加单词</button>
                    <button class="btn btn--outline btn--sm" id="vocabEmptyImportBtn">📥 批量导入</button>
                    ${hasQuickImport ? `<button class="btn btn--primary btn--sm" id="vocabEmptyQuickBtn" style="background:#f59e0b">🎯 导入${vocabBook}词库 (${qb.label})</button>` : ''}
                </div>
            </div>`;
            $('#vocabEmptyAddBtn')?.addEventListener('click', () => { vocabEditId = null; openVocabEditModal(null); });
            $('#vocabEmptyImportBtn')?.addEventListener('click', () => { $('#vocabImportBtn').click(); });
            if (hasQuickImport) {
                $('#vocabEmptyQuickBtn')?.addEventListener('click', () => {
                    const btnId = vocabBook === '基础' ? 'vocabBasicImportBtn' : vocabBook === '四级' ? 'vocabCET4ImportBtn' : 'vocabCET6ImportBtn';
                    $(`#${btnId}`)?.click();
                });
            }
        } else {
            listEl.innerHTML = '<p class="empty-text">本单元还没有单词，点击上方添加或导入 📖</p>';
        }
    } else {
        const showCheck = !isSpecial && vocabEditMode;
        listEl.innerHTML = filtered.map(v => `
            <div class="vocab-word-card" data-id="${v.id}">
                ${showCheck ? `<input type="checkbox" class="vocab-word-card__check" data-id="${v.id}" title="选中">` : ''}
                <div class="vocab-word-card__word">${esc(v.word)}</div>
                <div class="vocab-word-card__meaning">${esc(v.meaning)}</div>
                <div class="vocab-word-card__unit-label">${v.unit} ${v.part}</div>
                ${showCheck ? `
                <div class="vocab-word-card__actions" style="opacity:1">
                    <button data-action="edit-vocab" data-id="${v.id}" title="编辑">✏️</button>
                    <button class="btn-del" data-action="delete-vocab" data-id="${v.id}" title="删除">🗑️</button>
                </div>` : ''}
            </div>
        `).join('');
    }
}

function openVocabEditModal(vocab) {
    const isEdit = !!vocab;
    vocabEditId = vocab ? vocab.id : null;
    $('#vocabEditTitle').textContent = isEdit ? '编辑单词/短语' : '添加单词/短语';
    const defaultUnit = vocabUnit === '__review__' ? 'U1' : vocabUnit;
    $('#vocabEditUnit').value = vocab ? vocab.unit : defaultUnit;
    $('#vocabEditPart').value = vocab ? vocab.part : vocabPart;
    $('#vocabEditWord').value = vocab ? vocab.word : '';
    $('#vocabEditMeaning').value = vocab ? vocab.meaning : '';

    const delSpan = $('#vocabEditDelete');
    if (isEdit && delSpan) {
        delSpan.style.display = '';
        delSpan.innerHTML = `<button class="btn btn--danger btn--sm" id="vocabEditDeleteBtn">🗑️ 删除</button>`;
        $('#vocabEditDeleteBtn').addEventListener('click', async () => {
            if (confirm(`确定删除「${vocab.word}」？`)) {
                await DS.remove('vocabulary', vocab.id);
                vocabs = vocabs.filter(x => x.id !== vocab.id);
                $('#vocabEditModal').style.display = 'none';
                renderVocabView();
            }
        });
    } else if (delSpan) {
        delSpan.style.display = 'none';
    }
    $('#vocabEditModal').style.display = '';
}

function closeVocabEditModal() {
    $('#vocabEditModal').style.display = 'none';
    vocabEditId = null;
}

// ==================== 单词详情弹窗（牛津释义） ====================
async function showVocabWordDetail(vocab) {
    const modal = $('#vocabDetailModal');
    const loading = $('#vocabDetailLoading');
    const content = $('#vocabDetailContent');
    const error = $('#vocabDetailError');

    // 优先用 DB 已存储的 oxford_detail
    let detail = null;
    if (vocab.oxford_detail) {
        const d = vocab.oxford_detail;
        detail = { ok: true, word: d.word || vocab.word, pos: d.pos, definition: d.definition, examples: d.examples, collocations: d.collocations };
    }

    if (!detail) {
        // 显示模态框，loading 状态
        modal.style.display = '';
        loading.style.display = '';
        content.style.display = 'none';
        if (error) error.style.display = 'none';
        $('#vocabDetailTitle').textContent = `📖 ${vocab.word}`;

        // 查缓存或调 API（兜底）
        if (typeof wordDetailCache !== 'undefined' && wordDetailCache[vocab.word.toLowerCase().trim()]) {
            detail = wordDetailCache[vocab.word.toLowerCase().trim()];
        } else if (typeof lookupWordDetail === 'function') {
            detail = await lookupWordDetail(vocab.word, vocab);
        }
        loading.style.display = 'none';
    } else {
        // 已有 DB 数据，直接显示，无需 loading
        modal.style.display = '';
        loading.style.display = 'none';
        content.style.display = '';
        if (error) error.style.display = 'none';
        $('#vocabDetailTitle').textContent = `📖 ${vocab.word}`;
    }

    if (detail) {
        $('#vocabDetailWord').textContent = detail.word || vocab.word;
        $('#vocabDetailPos').textContent = detail.pos || '';
        $('#vocabDetailDef').textContent = detail.definition || '';
        if (detail.collocations && detail.collocations.length) {
            $('#vocabDetailColloc').innerHTML = '<strong>搭配:</strong> ' + detail.collocations.map(c => esc(c)).join(' · ');
            $('#vocabDetailColloc').style.display = '';
        } else {
            $('#vocabDetailColloc').style.display = 'none';
        }
        if (detail.examples && detail.examples.length) {
            $('#vocabDetailExamples').innerHTML = '<strong>例句:</strong><ul>' + detail.examples.map(e => `<li>${esc(e)}</li>`).join('') + '</ul>';
            $('#vocabDetailExamples').style.display = '';
        } else {
            $('#vocabDetailExamples').style.display = 'none';
        }
        content.style.display = '';
    } else {
        if (error) error.style.display = '';
    }
}

function closeVocabDetailModal() {
    $('#vocabDetailModal').style.display = 'none';
}
$('#vocabDetailClose').addEventListener('click', closeVocabDetailModal);
$('#vocabDetailModal').addEventListener('click', e => {
    if (e.target === $('#vocabDetailModal')) closeVocabDetailModal();
});

// ==================== 单词事件绑定 ====================
$('#vocabBookRow').addEventListener('click', e => {
    const btn = e.target.closest('.vocab-book-btn');
    if (btn) {
        const book = btn.dataset.book;
        if (book && book !== vocabBook) {
            vocabBook = book;
            vocabUnit = 'U1';
            vocabPart = 'P1';
            vocabEditMode = false;
            vocabSelected.clear();
            renderVocabView();
        }
    }
});
$('#vocabUnitRow').addEventListener('click', e => {
    const btn = e.target.closest('.vocab-unit-btn');
    if (btn) { vocabUnit = btn.dataset.unit; vocabEditMode = false; vocabSelected.clear(); renderVocabView(); }
});
$('#vocabPartRow').addEventListener('click', e => {
    const btn = e.target.closest('.vocab-part-btn');
    if (btn) { vocabPart = btn.dataset.part; vocabEditMode = false; vocabSelected.clear(); renderVocabView(); }
});

// 编辑模式切换
$('#vocabEditBtn')?.addEventListener('click', () => {
    vocabEditMode = !vocabEditMode;
    if (!vocabEditMode) vocabSelected.clear();
    renderVocabView();
});
$('#vocabList').addEventListener('click', async e => {
    const editBtn = e.target.closest('[data-action="edit-vocab"]');
    if (editBtn) {
        const id = parseInt(editBtn.dataset.id);
        const v = vocabs.find(x => x.id === id);
        if (v) openVocabEditModal(v);
        return;
    }
    const delBtn = e.target.closest('[data-action="delete-vocab"]');
    if (delBtn) {
        const id = parseInt(delBtn.dataset.id);
        const v = vocabs.find(x => x.id === id);
        if (v && confirm(`确定删除「${v.word}」？`)) {
            await DS.remove('vocabulary', id);
            vocabs = vocabs.filter(x => x.id !== id);
            renderVocabView();
        }
        return;
    }
    // 点击单词卡片（非编辑模式），显示牛津释义
    if (!vocabEditMode) {
        const card = e.target.closest('.vocab-word-card');
        if (card) {
            const id = parseInt(card.dataset.id);
            const v = vocabs.find(x => x.id === id);
            if (v) showVocabWordDetail(v);
        }
    }
});
$('#vocabAddBtn').addEventListener('click', () => {
    vocabEditId = null;
    openVocabEditModal(null);
});
$('#vocabStudyBtn').addEventListener('click', () => {
    if (typeof startVocabStudy === 'function') startVocabStudy();
});

// 去重：删除当前 unit+part 中重复的单词，保留最早创建的
$('#vocabDedupBtn').addEventListener('click', async () => {
    const isReview = vocabUnit === '__review__' || vocabUnit === '__mastered__';
    if (isReview) { showToast('特殊列表不支持去重', 'info'); return; }
    const target = vocabs.filter(v => v.book === vocabBook && v.unit === vocabUnit && v.part === vocabPart);
    if (target.length < 2) { showToast(`${vocabUnit} ${vocabPart} 条目不足，无需去重`, 'info'); return; }
    const seen = new Map(); // word.lower() -> vocab item
    const toDelete = [];
    for (const v of target) {
        const key = v.word.toLowerCase();
        if (seen.has(key)) {
            toDelete.push(v); // 重复的，删除
        } else {
            seen.set(key, v); // 第一个，保留
        }
    }
    if (!toDelete.length) { showToast(`${vocabUnit} ${vocabPart} 没有重复条目 ✅`, 'success'); return; }
    if (!confirm(`${vocabUnit} ${vocabPart} 发现 ${toDelete.length} 个重复条目，确认删除？\n${toDelete.map(v => v.word).join('、')}`)) return;
    try {
        for (const v of toDelete) {
            await DS.remove('vocabulary', v.id);
        }
        vocabs = vocabs.filter(v => !toDelete.some(d => d.id === v.id));
        renderVocabView();
        showToast(`已删除 ${toDelete.length} 个重复条目 ✅`, 'success');
    } catch (e) {
        showToast('去重失败: ' + e.message, 'error');
    }
});

// AI 重新翻译当前单元
$('#vocabRetranslateBtn').addEventListener('click', async () => {
    const isReview = vocabUnit === '__review__' || vocabUnit === '__mastered__';
    if (isReview) { showToast('特殊列表不支持重译', 'info'); return; }
    const target = vocabs.filter(v => v.book === vocabBook && v.unit === vocabUnit && v.part === vocabPart);
    if (!target.length) { showToast(`${vocabUnit} ${vocabPart} 没有条目`, 'info'); return; }
    if (!confirm(`${vocabUnit} ${vocabPart} 共 ${target.length} 个条目，将用 AI 重新翻译全部中文释义，确认？`)) return;

    const btn = $('#vocabRetranslateBtn');
    btn.disabled = true;
    const BATCH = 50;
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < target.length; i += BATCH) {
        const batch = target.slice(i, i + BATCH);
        const words = batch.map(v => v.word);
        const batchNum = Math.floor(i / BATCH) + 1;
        const totalBatches = Math.ceil(target.length / BATCH);
        btn.textContent = `⏳ ${batchNum}/${totalBatches}`;

        try {
            const resp = await fetch('/api/translate-words', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ words }),
            });
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error);

            const transMap = {};
            for (const t of data.translations) {
                if (t.word && t.meaning) {
                    transMap[t.word.toLowerCase().trim()] = t.meaning;
                }
            }

            for (const v of batch) {
                const key = v.word.toLowerCase().trim();
                if (transMap[key] && transMap[key] !== v.meaning) {
                    await DS.update('vocabulary', v.id, { meaning: transMap[key] });
                    v.meaning = transMap[key];
                    updated++;
                }
            }
        } catch (e) {
            failed += batch.length;
            console.warn('Batch failed:', e);
        }
    }

    await refreshAll();
    btn.disabled = false;
    btn.textContent = '🤖 重译';
    showToast(`重译完成：${updated} 条更新${failed ? `，${failed} 条失败` : ''}`, failed ? 'error' : 'success');
});

// 全选 / 取消全选
let vocabSelected = new Set();
$('#vocabSelectAllBtn').addEventListener('click', () => {
    const checks = document.querySelectorAll('.vocab-word-card__check');
    if (!checks.length) return;
    const allChecked = [...checks].every(c => c.checked);
    checks.forEach(c => { c.checked = !allChecked; });
    updateVocabSelection();
});

// 列表点击 → 更新选中状态
$('#vocabList').addEventListener('change', e => {
    if (e.target.classList.contains('vocab-word-card__check')) {
        updateVocabSelection();
    }
});

function updateVocabSelection() {
    vocabSelected = new Set();
    document.querySelectorAll('.vocab-word-card__check:checked').forEach(c => {
        vocabSelected.add(parseInt(c.dataset.id));
    });
    const btn = $('#vocabDeleteSelectedBtn');
    const selBtn = $('#vocabSelectAllBtn');
    if (vocabSelected.size > 0) {
        btn.style.display = '';
        btn.textContent = `🗑️ 删除选中 (${vocabSelected.size})`;
        selBtn.textContent = '☑ 取消全选';
    } else {
        btn.style.display = 'none';
        selBtn.textContent = '☐ 全选';
    }
}

// 删除选中
$('#vocabDeleteSelectedBtn').addEventListener('click', async () => {
    if (!vocabSelected.size) return;
    if (!confirm(`确认删除选中的 ${vocabSelected.size} 个单词？`)) return;
    const btn = $('#vocabDeleteSelectedBtn');
    btn.disabled = true;
    btn.textContent = '⏳ 删除中...';
    try {
        for (const id of vocabSelected) {
            await DS.remove('vocabulary', id);
        }
        vocabs = vocabs.filter(v => !vocabSelected.has(v.id));
        vocabSelected.clear();
        renderVocabView();
        showToast('删除完成', 'success');
    } catch (e) {
        showToast('删除失败: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        updateVocabSelection();
    }
});

// 清空当前词书
$('#vocabClearBookBtn').addEventListener('click', async () => {
    const wordsToDelete = vocabs.filter(v => v.book === vocabBook);
    if (!wordsToDelete.length) { showToast('当前词书已是空的', 'info'); return; }
    if (!confirm(`⚠️ 确认删除「${vocabBook}」词书的全部 ${wordsToDelete.length} 个单词？\n\n此操作不可撤销！`)) return;
    const btn = $('#vocabClearBookBtn');
    btn.disabled = true;
    btn.textContent = '⏳ 删除中...';
    try {
        for (const v of wordsToDelete) {
            await DS.remove('vocabulary', v.id);
        }
        vocabs = vocabs.filter(v => v.book !== vocabBook);
        renderVocabView();
        showToast(`「${vocabBook}」词书已清空，共删除 ${wordsToDelete.length} 词`, 'success');
    } catch (e) {
        showToast('清空失败: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '⚠️ 清空词书';
    }
});

// 添加/编辑保存
$('#vocabEditSave').addEventListener('click', async () => {
    const word = $('#vocabEditWord').value.trim();
    const meaning = $('#vocabEditMeaning').value.trim();
    if (!word || !meaning) { showToast('请填写英文和中文释义', 'error'); return; }
    const unit = $('#vocabEditUnit').value;
    const part = $('#vocabEditPart').value;
    try {
        if (vocabEditId) {
            await DS.update('vocabulary', vocabEditId, { book: vocabBook, unit, part, word, meaning });
        } else {
            await DS.create('vocabulary', { book: vocabBook, unit, part, word, meaning });
        }
        await refreshAll();
        closeVocabEditModal();
        showToast(vocabEditId ? '已更新' : '已添加', 'success');
    } catch (e) {
        showToast('保存失败: ' + e.message, 'error');
    }
});

$('#vocabEditClose').addEventListener('click', closeVocabEditModal);
$('#vocabEditCancel').addEventListener('click', closeVocabEditModal);
// AI 翻译按钮 - 单个单词
$('#vocabEditTranslate').addEventListener('click', async () => {
    const word = $('#vocabEditWord').value.trim();
    if (!word) { showToast('请先输入英文单词', 'error'); return; }
    const btn = $('#vocabEditTranslate');
    btn.disabled = true;
    btn.textContent = '⏳';
    try {
        const resp = await fetch('/api/translate-words', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ words: [word] }),
        });
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error || '翻译失败');
        const t = data.translations?.[0];
        if (t?.meaning) {
            $('#vocabEditMeaning').value = t.meaning;
        } else {
            showToast('AI 未能翻译该单词', 'error');
        }
    } catch (e) {
        showToast('翻译失败: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🤖 翻译';
    }
});
$('#vocabEditModal').addEventListener('click', e => {
    if (e.target === $('#vocabEditModal')) closeVocabEditModal();
});

// 批量导入
$('#vocabImportBtn').addEventListener('click', () => {
    $('#vocabImportUnit').value = vocabUnit === '__review__' ? 'U1' : vocabUnit;
    $('#vocabImportPart').value = vocabPart;
    $('#vocabImportText').value = '';
    $('#vocabImportFileName').textContent = '未选择文件';
    $('#vocabImportFile').value = '';
    $('#vocabImportModal').style.display = '';
});

// 文件选择按钮 → 触发隐藏的 file input
$('#vocabImportFileBtn').addEventListener('click', () => {
    $('#vocabImportFile').click();
});

// 文件选择后读取内容到文本框
$('#vocabImportFile').addEventListener('change', () => {
    const file = $('#vocabImportFile').files[0];
    if (!file) return;
    $('#vocabImportFileName').textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
        $('#vocabImportText').value = reader.result;
    };
    reader.readAsText(file);
});
$('#vocabImportCancel').addEventListener('click', () => {
    $('#vocabImportModal').style.display = 'none';
});
const vocabImportClose = document.querySelector('[data-close="vocabImportModal"]');
if (vocabImportClose) vocabImportClose.addEventListener('click', () => { $('#vocabImportModal').style.display = 'none'; });
$('#vocabImportModal').addEventListener('click', e => {
    if (e.target === $('#vocabImportModal')) $('#vocabImportModal').style.display = 'none';
});
$('#vocabImportConfirm').addEventListener('click', async () => {
    const text = $('#vocabImportText').value.trim();
    if (!text) { showToast('请粘贴内容', 'error'); return; }
    const unit = $('#vocabImportUnit').value;
    const part = $('#vocabImportPart').value;
    // 解析：按行分割，每行提取英文部分（去掉Tab/空格后的中文）
    const lines = text.split(/[\n,;，；]+/).map(l => l.trim()).filter(l => l);
    const seen = new Set();
    const entries = [];
    for (let line of lines) {
        // 去掉 Tab 及之后的内容（中文释义）
        const tabIdx = line.indexOf('\t');
        if (tabIdx > 0) line = line.substring(0, tabIdx).trim();
        // 去掉第一个中文字符及之后的内容
        const cnMatch = line.match(/[一-鿿（(]/);
        if (cnMatch && cnMatch.index > 0) {
            line = line.substring(0, cnMatch.index).trim();
        }
        // 清理尾部残留标点
        line = line.replace(/[.,;:!?\s]+$/, '');
        if (line.length < 2) continue;
        if (/^\d+$/.test(line)) continue;
        if (!/^[a-zA-Z]/.test(line)) continue;
        const lower = line.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        entries.push(line);
    }

    if (!entries.length) {
        showToast('未识别到有效英文内容，请检查输入', 'error');
        return;
    }
    if (entries.length > 200) {
        showToast(`一次最多导入 200 个条目，当前 ${entries.length} 个`, 'error');
        return;
    }

    // 去重：与已有数据比对（同书+同单元+同部分）
    const existingKeys = new Set(
        vocabs.filter(v => v.book === vocabBook && v.unit === unit && v.part === part)
            .map(v => v.word.toLowerCase())
    );
    const newEntries = entries.filter(entry => !existingKeys.has(entry.toLowerCase()));
    const dupCount = entries.length - newEntries.length;
    if (!newEntries.length) {
        showToast(`${entries.length} 个条目在 ${unit} ${part} 中已全部存在，无需导入`, 'info');
        return;
    }

    const btn = $('#vocabImportConfirm');
    btn.disabled = true;
    btn.textContent = '⏳ AI 翻译中...';

    try {
        btn.textContent = '⏳ AI 翻译中...';
        const resp = await fetch('/api/translate-words', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ words: newEntries }),
        });
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error || '翻译失败');
        const translations = data.translations;
        if (!translations || !translations.length) throw new Error('AI 未返回翻译结果');

        // 分离有效翻译和跳过项
        const validRows = [];
        const skipped = [];
        for (const t of translations) {
            if (t.word && t.meaning) {
                validRows.push({ book: vocabBook, unit, part, word: t.word, meaning: t.meaning });
            } else {
                skipped.push(t.word || '?');
            }
        }

        if (!validRows.length) {
            throw new Error(`AI 翻译结果全部无释义（${skipped.length} 个），请检查输入或重试`);
        }

        // 批量插入（一次 API 调用，避免逐条 auth/getUser）
        btn.textContent = `⏳ 正在导入 ${validRows.length} 词...`;
        const inserted = await DS.createMany('vocabulary', validRows);
        console.log(`[vocab-import] createMany 返回 ${inserted.length} 条，期望 ${validRows.length} 条`);

        await refreshAll();
        // 诊断：检查本地 vocabs 数量
        const localCount = vocabs.filter(v => v.book === vocabBook).length;
        console.log(`[vocab-import] refreshAll 后本地 ${vocabBook} 词书共 ${localCount} 条, vocabs 总数: ${vocabs.length}`);

        $('#vocabImportModal').style.display = 'none';

        if (localCount === 0 && validRows.length > 0) {
            // 插入未报错但 refreshAll 后本地仍为 0 — 大概率 RLS SELECT 被拒
            showToast(`⚠️ 写入异常：${validRows.length} 词已提交但刷新后查询不到，请 F12→Console 查看 [DS.loadVocab] 错误`, 'error');
        } else {
            let msg = `成功导入 ${inserted.length} 个条目 ✨`;
            if (dupCount) msg += `，${dupCount} 个已存在跳过`;
            if (skipped.length) msg += `，${skipped.length} 个未翻译`;
            showToast(msg, 'success');
        }
    } catch (e) {
        console.error('[vocab-import] 导入失败:', e);
        showToast('导入失败: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🤖 翻译并导入';
    }
});

// 一键导入词库（基础/四级/六级）
async function quickImportVocab(book) {
    const cfg = { '基础': { label: '基础词汇', file: 'basic_import.json' }, '四级': { label: '四级词汇', file: 'cet4_import.json' }, '六级': { label: '六级词汇', file: 'cet6_import.json' } };
    const c = cfg[book];
    if (!c) return;

    const btn = $(`#vocab${book === '基础' ? 'Basic' : book === '四级' ? 'CET4' : 'CET6'}ImportBtn`);
    if (!confirm(`即将导入${c.label}词库。\n\n已存在的单词将自动跳过。确定继续？`)) return;

    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ 加载词库数据...';

    try {
        const resp = await fetch(`/api/vocab-import-data?book=${encodeURIComponent(book)}`);
        const data = await resp.json();
        if (!data.ok || !data.words) throw new Error(data.error || '获取词库数据失败');

        const words = data.words;
        btn.textContent = `⏳ 正在导入 ${words.length} 词...`;

        const existingSet = new Set();
        for (const v of vocabs) {
            if (v.book === book) {
                existingSet.add(`${v.unit}|${v.part}|${v.word.toLowerCase().trim()}`);
            }
        }

        // 去重并收集新行
        let skipped = 0;
        const newRows = [];
        for (const w of words) {
            const key = `${w.unit}|${w.part}|${w.word.toLowerCase().trim()}`;
            if (existingSet.has(key)) { skipped++; continue; }
            newRows.push({ book: w.book, unit: w.unit, part: w.part, word: w.word, meaning: w.meaning });
            existingSet.add(key);
        }

        if (!newRows.length) {
            btn.disabled = false; btn.textContent = origText;
            showToast(`${c.label}已全部导入，无需重复操作 ✅`, 'info');
            return;
        }

        // 批量插入（每批最多 100 条，避免 Supabase 请求过大）
        let imported = 0, failed = 0;
        const BATCH_SIZE = 100;
        for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
            const batch = newRows.slice(i, i + BATCH_SIZE);
            try {
                const result = await DS.createMany('vocabulary', batch);
                imported += result.length;
            } catch (e) {
                console.error(`[quick-import] 批次 ${Math.floor(i/BATCH_SIZE)+1} 失败:`, e);
                // 降级：逐条重试
                for (const row of batch) {
                    try { await DS.create('vocabulary', row); imported++; }
                    catch (e2) { failed++; console.warn('导入失败:', row.word, e2); }
                }
            }
            const pct = Math.round(Math.min(i + BATCH_SIZE, newRows.length) / newRows.length * 100);
            btn.textContent = `⏳ ${pct}% (${imported} 导入 / ${skipped} 跳过 / ${failed} 失败)`;
        }

        vocabBook = book;  // 自动切换到刚导入的词书
        await refreshAll();
        // refreshAll 后再取第一个 unit，避免取到 fallback
        vocabUnit = vocabs.find(v => v.book === book)?.unit || 'U1';
        vocabPart = 'P1';
        btn.disabled = false;
        btn.textContent = origText;
        showToast(`${c.label}导入完成 ✨ ${imported} 新词导入，${skipped} 已跳过${failed ? `，${failed} 失败` : ''}`, 'success');
    } catch (e) {
        showToast(`导入${c.label}失败: ` + e.message, 'error');
        btn.disabled = false;
        btn.textContent = origText;
    }
}

$('#vocabBasicImportBtn')?.addEventListener('click', () => quickImportVocab('基础'));
$('#vocabCET4ImportBtn')?.addEventListener('click', () => quickImportVocab('四级'));
$('#vocabCET6ImportBtn')?.addEventListener('click', () => quickImportVocab('六级'));

// 事件绑定
document.addEventListener('DOMContentLoaded', () => {
    const titleInput = document.getElementById('thoughtTitleInput');
    const thoughtInput = document.getElementById('thoughtInput');
    const thoughtAddBtn = document.getElementById('thoughtAddBtn');

    if (thoughtAddBtn) thoughtAddBtn.addEventListener('click', addThought);
    if (titleInput) {
        titleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); thoughtInput?.focus(); }
        });
    }
    if (thoughtInput) {
        thoughtInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); addThought(); }
        });
        thoughtInput.addEventListener('input', updateScriptStats);
    }

    const thoughtsList = document.getElementById('thoughtsList');
    if (thoughtsList) {
        thoughtsList.addEventListener('click', (e) => {
            const delBtn = e.target.closest('[data-action="delete"]');
            if (delBtn) {
                e.stopPropagation();
                const id = parseInt(delBtn.dataset.id);
                if (id) deleteThought(id);
                return;
            }
            const openCard = e.target.closest('[data-action="open"]');
            if (openCard) {
                const id = parseInt(openCard.dataset.id);
                if (id) openScriptEditor(id);
            }
        });
    }

    // 全屏脚本编辑器事件
    const editorOverlay = document.getElementById('scriptEditorOverlay');
    if (editorOverlay) {
        document.getElementById('scriptEditorBack').addEventListener('click', closeScriptEditor);
        document.getElementById('scriptEditorSave').addEventListener('click', saveScriptEditor);
        document.getElementById('scriptEditorDelete').addEventListener('click', deleteScriptFromEditor);
        const editorContent = document.getElementById('scriptEditorContent');
        editorContent.addEventListener('input', updateScriptEditorStats);
        editorContent.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); saveScriptEditor(); }
            else if (e.key === 'Escape') { closeScriptEditor(); }
        });
        // 点击遮罩关闭
        editorOverlay.addEventListener('click', (e) => {
            if (e.target === editorOverlay) closeScriptEditor();
        });
    }
});

// ==================== 科目视图 ====================
function renderSubjects() {
    if (!subjects.length) { $('#subjectGrid').innerHTML = '<p class="empty-text">暂无科目，点击上方按钮添加</p>'; return; }

    // 计算总 GPA
    let totalWeight = 0, totalPoints = 0;
    const subjectGPAs = subjects.map(s => {
        const { gpa } = calcSubjectGPA(s.components || []);
        if (gpa != null && s.credits) { totalWeight += s.credits; totalPoints += s.credits * gpa; }
        return { ...s, gpa };
    });
    const overallGPA = totalWeight > 0 ? Math.round(totalPoints / totalWeight * 100) / 100 : null;

    let html = '';
    if (overallGPA != null) {
        html += `<div class="gpa-summary">
            📊 加权平均绩点：<strong>${overallGPA}</strong>
            <span style="font-size:.8rem;color:var(--color-text-light)">（${subjectGPAs.filter(s=>s.gpa!=null).length}/${subjects.length} 科已评分）</span>
        </div>`;
    }

    html += subjectGPAs.map((s, idx) => {
        const { gpa } = s;
        const comps = s.components || [];
        const total = comps.reduce((a,c)=>a+(c.percentage||0),0);
        const isFirst = idx===0, isLast = idx===subjectGPAs.length-1;
        return `<div class="subject-card" data-id="${s.id}" data-action="detail">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div style="flex:1">
                    <div class="subject-card__name">📘 ${esc(s.name)}</div>
                    <div class="subject-card__info">
                        <span>学分 ${s.credits||'-'}</span>
                        ${gpa!=null ? `<span style="color:var(--color-primary);font-weight:600">绩点 ${gpa}</span>` : ''}
                        ${s.target_gpa ? `<span>目标 ${s.target_gpa}</span>` : ''}
                    </div>
                </div>
                <div class="subject-card__move">
                    <button data-action="up" data-id="${s.id}" ${isFirst?'disabled':''} title="上移">▲</button>
                    <button data-action="down" data-id="${s.id}" ${isLast?'disabled':''} title="下移">▼</button>
                </div>
            </div>
            ${comps.length ? `<div class="subject-card__progress"><div class="subject-card__bar" style="width:${total}%"></div></div><div style="font-size:.75rem;color:var(--color-text-light);margin-top:4px">已配置 ${total}%</div>` : ''}
        </div>`;
    }).join('');
    $('#subjectGrid').innerHTML = html;
}

$('#subjectGrid').addEventListener('click', async e => {
    // 移动按钮
    const moveBtn = e.target.closest('button[data-action="up"], button[data-action="down"]');
    if (moveBtn && !moveBtn.disabled) {
        e.stopPropagation();
        const id = parseInt(moveBtn.dataset.id);
        if (moveBtn.dataset.action === 'up') await moveSubject(id, -1);
        else await moveSubject(id, 1);
        return;
    }
    // 科目卡片（打开详情）
    const card = e.target.closest('.subject-card');
    if (card && !e.target.closest('button')) {
        const id = parseInt(card.dataset.id);
        if (id) openSubjectDetail(id);
    }
});

async function moveSubject(id, direction) {
    const idx = subjects.findIndex(s=>s.id===id); if (idx<0) return;
    const newIdx = idx + direction;
    if (newIdx<0 || newIdx>=subjects.length) return;
    // 交换数组位置
    const a = subjects[idx], b = subjects[newIdx];
    const ap = a.position!=null ? a.position : idx;
    const bp = b.position!=null ? b.position : newIdx;
    subjects[newIdx] = {...a, position: bp};
    subjects[idx] = {...b, position: ap};
    renderSubjects();
    // 持久化
    try { await DS.update('subjects', a.id, { position: bp }); } catch(e) {}
    try { await DS.update('subjects', b.id, { position: ap }); } catch(e) {}
}
$('#addSubjectBtn').addEventListener('click', () => {
    modalMode = 'subject'; editId = null;
    openModal('添加科目', `
        <div class="form-group"><label>科目名称*</label><input class="form-input" id="mfName" maxlength="50" required placeholder="如：微积分（甲）Ⅱ"></div>
        <div class="form-row">
            <div class="form-group"><label>学分</label><input class="form-input" id="mfCredits" type="number" step="0.5" min="0" placeholder="如 5.0"></div>
            <div class="form-group"><label>目标绩点</label><input class="form-input" id="mfGPA" type="number" step="0.1" min="0" max="5" placeholder="如 5.0"></div>
        </div>
        <div class="modal__footer">
            <button type="button" class="btn btn--outline" onclick="closeModal()">取消</button>
            <button type="submit" class="btn btn--primary">创建</button>
        </div>
    `);
    $('#modalForm').onsubmit = async e => { e.preventDefault(); await saveModal(); };
});

// ==================== 科目详情模态框 ====================
/** 浙大绩点换算（百分制→5.0） */
function scoreToGPA(score) {
    if (score >= 95) return 5.0; if (score >= 92) return 4.8;
    if (score >= 89) return 4.5; if (score >= 86) return 4.2;
    if (score >= 83) return 3.9; if (score >= 80) return 3.6;
    if (score >= 77) return 3.3; if (score >= 74) return 3.0;
    if (score >= 71) return 2.7; if (score >= 68) return 2.4;
    if (score >= 65) return 2.1; if (score >= 62) return 1.8;
    if (score >= 60) return 1.5; return 0;
}
/** 计算单科加权总分和绩点 */
function calcSubjectGPA(comps) {
    if (!comps?.length) return { score: null, gpa: null };
    let totalScore = 0, totalPct = 0;
    for (const c of comps) {
        if (c.score != null && c.percentage) {
            totalScore += (c.score || 0) * (c.percentage / 100);
            totalPct += c.percentage;
        }
    }
    if (totalPct === 0) return { score: null, gpa: null };
    const finalScore = Math.round(totalScore * 10) / 10;
    return { score: finalScore, gpa: scoreToGPA(finalScore) };
}

function openSubjectDetail(id) {
    const s = subjects.find(x=>x.id===id); if (!s) return;
    $('#subjectDetailTitle').textContent = '📘 ' + s.name;
    $('#sdCredits').innerHTML = `<input type="number" id="sdCreditsInput" value="${s.credits||''}" step="0.5" min="0" max="20" placeholder="学分" style="width:80px">`;
    $('#sdGPA').innerHTML = `<input type="number" id="sdGPAInput" value="${s.target_gpa||''}" step="0.1" min="1.5" max="5.0" placeholder="目标绩点" style="width:80px">`;
    renderComponents(s);
    $('#subjectDetailModal').style.display = '';
}
function renderComponents(s) {
    const comps = s.components || [];
    const total = comps.reduce((a,c)=>a+(c.percentage||0),0);
    const { score, gpa } = calcSubjectGPA(comps);
    $('#componentList').innerHTML = comps.map((c,i) => `
        <div class="component-item">
            <input value="${esc(c.name)}" data-comp-idx="${i}" data-comp-field="name" placeholder="项目名称">
            <input type="number" value="${c.percentage||0}" data-comp-idx="${i}" data-comp-field="percentage" placeholder="%" min="0" max="100" style="width:60px"> %
            <input type="number" value="${c.score!=null?c.score:''}" data-comp-idx="${i}" data-comp-field="score" placeholder="分数" min="0" max="100" style="width:70px"> 分
            <button data-comp-del="${i}">✕</button>
        </div>`).join('');
    const cls = total===100?'total-bar--ok':'total-bar--bad';
    const scoreHTML = score!=null ? `<div style="margin-top:8px;font-size:.9rem"><strong>预估总分：${score} 分 → 绩点 ${gpa}</strong></div>` : '';
    $('#totalBar').innerHTML = `合计：${total}% ${total===100?'✅':'⚠️ 不为100%'}` + scoreHTML;
    $('#totalBar').className = `total-bar ${cls}`;
}
$('#componentList').addEventListener('input', () => { updateCalcDisplay(); });
$('#componentList').addEventListener('click', e => {
    if (e.target.dataset.compDel) { e.target.closest('.component-item').remove(); updateComponentsFromDOM(); }
});
$('#addComponentBtn').addEventListener('click', () => {
    const s = subjects.find(x=>x.id===currentSubjectId());
    if (!s) return;
    const comps = [...(s.components||[]), {name:'',percentage:0}];
    s.components = comps; renderComponents(s);
});
$('#saveSubjectBtn').addEventListener('click', async () => {
    const s = subjects.find(x=>x.id===currentSubjectId()); if (!s) return;
    updateComponentsFromDOM();
    const cr = parseFloat($('#sdCreditsInput').value)||0;
    const tg = parseFloat($('#sdGPAInput').value)||null;
    await DS.update('subjects', s.id, { components: s.components, credits: cr, target_gpa: tg });
    await refreshAll(); $('#subjectDetailModal').style.display = 'none';
});
$('#deleteSubjectBtn').addEventListener('click', async () => {
    const s = subjects.find(x=>x.id===currentSubjectId()); if (!s) return;
    if (!confirm(`确定删除科目「${s.name}」吗？相关的待办不会删除，但关联会断开。`)) return;
    await DS.remove('subjects', s.id);
    await refreshAll(); $('#subjectDetailModal').style.display = 'none';
});
$('[data-close="subjectDetailModal"]').addEventListener('click', () => { $('#subjectDetailModal').style.display='none'; });
$('#subjectDetailModal').addEventListener('click', e => { if (e.target===$('#subjectDetailModal')) $('#subjectDetailModal').style.display='none'; });

function currentSubjectId() {
    const m = $('#subjectDetailTitle').textContent.replace('📘 ','');
    return subjects.find(s=>s.name===m)?.id;
}
/** 仅更新计算显示，不重建 DOM（避免输入框焦点丢失） */
function updateCalcDisplay() {
    const items = $$('#componentList .component-item');
    let totalPct = 0, totalWeighted = 0, totalWeight = 0;
    [...items].forEach(item => {
        const pct = parseFloat(item.querySelector('[data-comp-field="percentage"]').value)||0;
        const score = parseFloat(item.querySelector('[data-comp-field="score"]').value);
        totalPct += pct;
        if (!isNaN(score)) { totalWeighted += score * (pct/100); totalWeight += pct; }
    });
    const cls = totalPct===100?'total-bar--ok':'total-bar--bad';
    let html = `合计：${totalPct}% ${totalPct===100?'✅':'⚠️ 不为100%'}`;
    if (totalWeight > 0) {
        const finalScore = Math.round(totalWeighted * 10) / 10;
        const gpa = scoreToGPA(finalScore);
        html += `<div style="margin-top:8px;font-size:.9rem"><strong>预估总分：${finalScore} 分 → 绩点 ${gpa}</strong></div>`;
    }
    $('#totalBar').innerHTML = html;
    $('#totalBar').className = `total-bar ${cls}`;
}

function updateComponentsFromDOM() {
    const s = subjects.find(x=>x.id===currentSubjectId()); if (!s) return;
    const items = $$('#componentList .component-item');
    s.components = [...items].map(item => ({
        name: item.querySelector('[data-comp-field="name"]').value.trim(),
        percentage: parseFloat(item.querySelector('[data-comp-field="percentage"]').value)||0,
        score: parseFloat(item.querySelector('[data-comp-field="score"]').value) || null,
    }));
    renderComponents(s);
}

// ==================== 保存（通用） ====================
async function saveModal() {
    if (modalMode === 'subject') {
        const name = $('#mfName').value.trim(); if (!name) return;
        const row = { name, credits: parseFloat($('#mfCredits').value)||0, target_gpa: parseFloat($('#mfGPA').value)||null, components:[], position: subjects.length };
        await DS.create('subjects', row); closeModal(); await refreshAll();
    } else if (modalMode === 'event') {
        const title = $('#mfTitle').value.trim(); if (!title) return;
        const event_type = $('#mfEventType').value;
        const start_time = $('#mfStartTime').value || null;
        const end_time = $('#mfEndTime').value || null;
        const subject_id = $('#mfSubject').value ? parseInt($('#mfSubject').value) : null;
        await DS.create('events', { date: selectedCalDate, title, event_type, start_time, end_time, subject_id });
        closeModal(); await refreshAll(); renderCalendar();
    } else if (modalMode === 'todo') {
        const title = $('#mfTitle').value.trim(); if (!title) return;
        const row = { date: todoDate, title, description: $('#mfDesc').value.trim(), priority: $('#mfPriority').value,
            status: 'todo', subject_id: $('#mfSubject').value ? parseInt($('#mfSubject').value) : null };
        if (editId) { await DS.update('todos', editId, { title: row.title, description: row.description, priority: row.priority, subject_id: row.subject_id }); }
        else { await DS.create('todos', row); }
        closeModal(); await refreshAll();
    }
}

function esc(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

// ==================== 文件导入 ====================
$('#importBtn').addEventListener('click', () => $('#importFile').click());
async function doRefresh() {
    const btn = $('#refreshBtn');
    if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
    await refreshAll();
    if (btn) { btn.textContent = '🔄'; btn.disabled = false; }
    showToast('已刷新', 'success');
}
$('#refreshBtn').addEventListener('click', doRefresh);
$('#navDropdownRefresh').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('navDropdown').style.display = 'none';
    doRefresh();
});
$('#importFile').addEventListener('change', async () => {
    try {
    const file = $('#importFile').files[0];
    if (!file) return;

    showToast('读取文件中...', 'info');
    let text;
    if (file.name.endsWith('.docx')) {
        // 按需加载 mammoth
        await new Promise((resolve, reject) => {
            if (window.mammoth) return resolve();
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js';
            s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
        });
        try {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            text = result.value;
        } catch (e) {
            showToast('无法读取 docx 文件: ' + e.message, 'error');
            $('#importFile').value = ''; return;
        }
    } else {
        text = await file.text();
    }

    if (!text.trim()) { showToast('文件内容为空', 'error'); $('#importFile').value = ''; return; }

    showToast('AI 解析中...', 'info');
    let results = await aiParse(text);
    if (!results) {
        showToast('AI 不可用，使用本地解析', 'info');
        results = parseTXT(text);
    }

    if (!results.length) { showToast('未识别到有效数据', 'error'); $('#importFile').value = ''; return; }
    await applyImport(results);
    $('#importFile').value = '';
    } catch(e) { showToast('导入出错: ' + e.message, 'error'); console.error(e); }
});

/** 调用服务器 DeepSeek API 智能解析 */
async function aiParse(text) {
    try {
        const resp = await fetch('/api/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        const data = await resp.json();
        if (data.ok && data.results?.length) return data.results;
        console.warn('AI parse returned no results');
        return null;
    } catch (e) {
        console.warn('AI parse failed:', e);
        return null;
    }
}

/**
 * 解析 TXT 文件，自动识别内容类型
 * 支持：考试安排 / 绩点规则
 */
function parseTXT(text) {
    const lines = text.split('\n').map(l=>l.trim()).filter(l=>l);

    // 检测类型
    const hasExam = lines.some(l=>l.includes('期末考试时间'));
    const hasGrade = lines.some(l=>l.includes('总评构成'));

    if (hasExam) return parseExamSchedule(lines);
    if (hasGrade) return parseGradeRules(text);
    return [];
}

/** 解析考试安排：提取日期、时间、地点 */
function parseExamSchedule(lines) {
    const results = [];
    for (const line of lines) {
        const m = line.match(/^(.+?)，学分\s*([\d.]+)\s*，学期\S+期末考试时间：(\d{4})\s*年\s*(\d{2})\s*月\s*(\d{2})\s*日\s*\((\d{2}:\d{2})-(\d{2}:\d{2})\)期末考试地点：(.+?)期末考试座位号：(\d+)/);
        if (m) {
            const [, name, credit, y, mo, d, t1, t2, loc, seat] = m;
            results.push({
                type: 'exam_event',
                subjectName: name.trim(),
                credits: parseFloat(credit),
                date: `${y}-${mo}-${d}`,
                timeRange: `${t1}-${t2}`,
                location: loc.trim(),
                seat: seat,
                title: `${name.trim()} 考试`,
            });
        }
    }
    return results;
}

/** 解析绩点规则：按 "N. 科目名\n总评构成" 分段 */
function parseGradeRules(text) {
    const results = [];
    // 按 "N. 科目名" 分段（N 为数字）
    const sections = text.split(/\n(?=\d+\.\s*\S)/);
    for (const sec of sections) {
        const headerMatch = sec.match(/^(\d+)\.\s*(.+)/m);
        if (!headerMatch) continue;
        const subjectName = headerMatch[2].trim();

        // 提取百分比
        const percentPattern = /([一-鿿\w()（）]+?)[：:]\s*([\d.]+)%/g;
        const components = [];
        let m;
        while ((m = percentPattern.exec(sec)) !== null) {
            const name = m[1].trim();
            const pct = parseFloat(m[2]);
            // 过滤明显不是成绩构成的关键词
            const skipWords = ['学分','合计','折算后','满分','多选','材料分析','论述','卷面','第','平时成绩计算公式','总评计算','题型','注：','空'];
            if (!skipWords.some(w=>name.includes(w)) && name.length<30 && pct>0 && pct<=100) {
                components.push({ name, percentage: pct });
            }
        }
        // 去重 + 去接近重复（如"平时成绩"和"平时成绩（占期末总评）"）
        const seen = new Set();
        const unique = components.filter(c => {
            const k = c.name.replace(/（[^）]*）/g,'').replace(/\([^)]*\)/g,'');
            if (seen.has(k)) return false; seen.add(k); return true;
        });

        if (unique.length > 0) {
            results.push({ type: 'subject_grade', subjectName, components: unique });
        }
    }
    return results;
}

/** 将解析结果写入数据库 */
async function applyImport(results) {
    let examCount = 0, subjectCount = 0;
    const createdSubjects = {}; // name → id mapping

    for (const r of results) {
        const rtype = r.type;
        const subjectName = r.subjectName || r.subject || r.name;
        const credits = r.credits || r.credit || null;
        const eventType = (rtype === 'exam_event' || rtype === 'exam') ? 'exam_event' : rtype;

        if (eventType === 'subject_grade' || rtype === 'subject') {
            let subId = createdSubjects[subjectName];
            if (!subId) {
                const existing = findSimilarSubject(subjectName);
                if (existing) {
                    subId = existing.id;
                    // 合并绩点分配（新旧合并，同名覆盖，新项追加）
                    const merged = [...(existing.components||[])];
                    for (const c of (r.components||[])) {
                        const idx = merged.findIndex(m=>m.name===c.name);
                        if (idx>=0) merged[idx]=c; else merged.push(c);
                    }
                    await DS.update('subjects', subId, {
                        components: merged,
                        ...(credits && !existing.credits ? { credits } : {}),
                    });
                } else {
                    const created = await DS.create('subjects', {
                        name: subjectName,
                        position: subjects.length,
                        credits: credits || 0,
                        components: r.components || [],
                    });
                    subId = created.id;
                }
                createdSubjects[subjectName] = subId;
                subjectCount++;
            }
        } else if (eventType === 'exam_event') {
            if (!r.date) { console.warn('Skipping exam without date:', r); continue; }
            let subId = createdSubjects[subjectName];
            if (!subId) {
                const existing = findSimilarSubject(subjectName);
                if (existing) {
                    subId = existing.id;
                    if (!existing.credits && credits) {
                        await DS.update('subjects', subId, { credits });
                    }
                } else {
                    const created = await DS.create('subjects', {
                        name: subjectName,
                        position: subjects.length,
                        credits: credits || 0,
                    });
                    subId = created.id;
                    createdSubjects[subjectName] = subId;
                    subjectCount++;
                }
            }
            const title = r.title || (subjectName + ' 考试');
            // 检查是否已有相同日期+标题的考试，防止重复
            const alreadyExists = events.some(e => e.date === r.date && (e.title === title || e.title.includes(subjectName)));
            if (alreadyExists) { console.warn('Skipping duplicate event:', title, r.date); continue; }

            // 兼容 DeepSeek 返回的多种时间字段: start/end, time, timeRange
            let st = (r.start || (r.time||'').split('-')[0] || (r.timeRange||'').split('-')[0] || '').trim();
            let et = (r.end || (r.time||'').split('-')[1] || (r.timeRange||'').split('-')[1] || '').trim();
            if (st && !st.includes(':')) st += ':00';
            if (et && !et.includes(':')) et += ':00';
            await DS.create('events', {
                date: r.date, title,
                event_type: 'exam', subject_id: subId,
                start_time: st || null, end_time: et || null,
            });
            examCount++;
        }
    }

    await refreshAll();
    let msg = [];
    if (examCount) msg.push(`${examCount} 场考试已导入日历`);
    if (subjectCount) msg.push(`${subjectCount} 门科目已导入并配置绩点`);
    showToast(msg.join('，') || '未识别到有效数据', msg.length?'success':'error');
}

/** 简易 Toast */
function showToast(message, type) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.className = 'toast toast--'+type;
    t.textContent = message;
    Object.assign(t.style, {
        position:'fixed', bottom:'32px', right:'32px', padding:'14px 24px', borderRadius:'10px',
        color:'#fff', fontWeight:600, fontSize:'.9rem', zIndex:9999, opacity:0,
        transform:'translateY(20px)', transition:'all .35s ease',
        background: type==='success'?'linear-gradient(135deg,#10b981,#059669)'
                  : type==='error'?'linear-gradient(135deg,#ef4444,#dc2626)'
                  : 'linear-gradient(135deg,#3b82f6,#2563eb)',
        boxShadow:'0 6px 20px rgba(0,0,0,.15)'
    });
    document.body.appendChild(t);
    requestAnimationFrame(()=>{ t.style.opacity='1'; t.style.transform='translateY(0)'; });
    setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateY(20px)';
        t.addEventListener('transitionend',()=>t.remove()); },3500);
}

// ==================== 时钟 ====================
function updateClock() {
    const el = document.getElementById('navDatetime');
    if (!el) return;
    const now = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const w = weekdays[now.getDay()];
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    el.textContent = `${y}-${m}-${d} 星期${w} ${h}:${min}:${s}`;
}
setInterval(updateClock, 1000);
updateClock();

// ==================== 首页倒计时 ====================
let countdownTimer = null;

function renderHome() {
    // 问候语
    const h = new Date().getHours();
    let greet = '🌙 晚上好';
    if (h < 6) greet = '🌙 夜深了';
    else if (h < 12) greet = '☀️ 早上好';
    else if (h < 14) greet = '🌤 中午好';
    else if (h < 18) greet = '🌤 下午好';
    $('#homeGreeting').textContent = greet;

    // 日期
    const now = new Date();
    const weekdays = ['日','一','二','三','四','五','六'];
    $('#homeDate').textContent =
        `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 星期${weekdays[now.getDay()]}`;

    // 倒计时卡片
    renderCountdowns();

    // 每30秒刷新
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(renderCountdowns, 30000);
}

function renderCountdowns() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const weekLater = new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10);

    // 取未来14天内的事件（不含已过 + 今天还没开始的）
    const upcoming = events
        .filter(e => (e.date > today || (e.date === today && e.start_time && e.start_time > now.toTimeString().slice(0, 5))))
        .sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return (a.start_time || '').localeCompare(b.start_time || '');
        })
        .slice(0, 8);

    const el = document.getElementById('homeCountdowns');
    if (!upcoming.length) {
        el.innerHTML = '<div class="home-countdown-empty">📭 近期没有即将到来的事件<br><small>在日历中添加考试、DDL 等事件吧</small></div>';
        return;
    }

    el.innerHTML = upcoming.map(e => {
        const labels = { exam: '考试', class: '学习', holiday: '生活', deadline: 'DDL', other: '其他' };
        const icons = { exam: '📝', class: '📖', holiday: '🎉', deadline: '⏰', other: '📌' };
        const eventDate = new Date(e.date);
        if (e.start_time) {
            const [h, m] = e.start_time.split(':');
            eventDate.setHours(parseInt(h), parseInt(m), 0, 0);
        }
        const diffMs = eventDate - now;
        const diffTotalMin = Math.floor(diffMs / 60000);
        const days = Math.floor(diffTotalMin / 1440);
        const hours = Math.floor((diffTotalMin % 1440) / 60);
        const minutes = diffTotalMin % 60;

        let countdownStr;
        if (days > 0) countdownStr = `${days}天 ${hours}小时`;
        else if (hours > 0) countdownStr = `${hours}小时 ${minutes}分钟`;
        else if (minutes > 0) countdownStr = `${minutes}分钟`;
        else countdownStr = '现在';

        const isSoon = days === 0 && hours < 24;
        const soonClass = isSoon ? ' home-countdown-card--soon' : '';

        return `<div class="home-countdown-card${soonClass}">
            <div class="home-countdown-card__icon">${icons[e.event_type] || '📌'}</div>
            <div class="home-countdown-card__info">
                <div class="home-countdown-card__title">${esc(e.title)}</div>
                <div class="home-countdown-card__meta">
                    ${e.date} ${e.start_time ? e.start_time.slice(0,5) : '全天'}
                    · ${labels[e.event_type] || e.event_type}
                </div>
            </div>
            <div class="home-countdown-card__countdown">${countdownStr}</div>
        </div>`;
    }).join('');
}

// ==================== 返回按钮 ====================
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.back;
            if (target === 'home') switchToTab('home');
        });
    });
    // 首页导航卡片
    document.querySelectorAll('.home-nav-card').forEach(card => {
        card.addEventListener('click', () => {
            switchToTab(card.dataset.tab);
        });
    });
});

function switchToTab(tab) {
    currentTab = tab;
    $$('.nav__tab').forEach(b => b.classList.remove('active'));
    const tabBtn = document.querySelector(`.nav__tab[data-tab="${tab}"]`);
    if (tabBtn) tabBtn.classList.add('active');
    $$('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(`view-${tab}`);
    if (view) view.classList.add('active');
    if (tab === 'home') renderHome();
    if (tab === 'todos') renderTodos();
    if (tab === 'calendar') renderCalendar();
    if (tab === 'subjects') renderSubjects();
    if (tab === 'thoughts') renderThoughts();

    if (tab === 'chat') renderChatView();
    if (tab === 'vocab') renderVocabView();
    if (tab === 'goals') renderGoalsView();
    // 手机端收起 tabs
    document.querySelector('.nav__tabs').classList.remove('nav__tabs--open');
}

// ==================== 启动 ====================
document.addEventListener('DOMContentLoaded', async () => {
    if (!(await Auth.isLoggedIn())) return;
    await refreshAll();
    renderHome();
    renderCalendar();
});
