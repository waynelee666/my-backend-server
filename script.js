/* ============================================================
   TaskFlow - 学业管理 脚本
   ============================================================ */
const SUPABASE_URL = 'https://swouijpxhujlwlrsmwmo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3b3VpanB4aHVqbHdscnNtd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMjQxMzIsImV4cCI6MjA5NjcwMDEzMn0.VhL4p8yoILq-5nFe2K5TKafoC03vsDwa_MBb-uBp8PQ';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);

// ==================== 全局状态 ====================
let subjects = [], events = [], todos = [];
let currentTab = 'todos';
let todoDate = new Date().toISOString().slice(0, 10);
let calYear = new Date().getFullYear(), calMonth = new Date().getMonth();
let selectedCalDate = null;
let modalMode = null, editId = null; // 'subject'|'event'|'todo'

// ==================== 数据层 ====================
const DS = {
    async loadSubjects() { const { data } = await sb.from('subjects').select('*').order('created_at'); return data||[]; },
    async loadEvents() { const { data } = await sb.from('events').select('*').order('date'); return data||[]; },
    async loadTodos() { const { data } = await sb.from('todos').select('*').order('created_at',{ascending:false}); return data||[]; },
    async create(table, row) { const u = await sb.auth.getUser(); row.user_id = u.data.user.id;
        const { data, error } = await sb.from(table).insert(row).select().single(); if (error) throw error; return data; },
    async update(table, id, fields) { fields.updated_at = new Date().toISOString();
        const { data, error } = await sb.from(table).update(fields).eq('id', id).select().single(); if (error) throw error; return data; },
    async remove(table, id) { await sb.from(table).delete().eq('id', id); },
};

async function refreshAll() { subjects = await DS.loadSubjects(); events = await DS.loadEvents(); todos = await DS.loadTodos(); renderCurrent(); }
function renderCurrent() { if (currentTab==='todos') renderTodos(); else if (currentTab==='calendar') renderCalendar(); else renderSubjects(); }

// ==================== Tab 切换 ====================
$$('.nav__tab').forEach(btn => btn.addEventListener('click', () => {
    currentTab = btn.dataset.tab;
    $$('.nav__tab').forEach(b => b.classList.remove('active')); btn.classList.add('active');
    $$('.view').forEach(v => v.classList.remove('active')); $(`#view-${currentTab}`).classList.add('active');
    if (currentTab === 'calendar') renderCalendar();
}));
$('.nav__logo').addEventListener('click', () => { currentTab='todos'; $$('.nav__tab').forEach(b=>b.classList.remove('active')); $('[data-tab="todos"]').classList.add('active'); $$('.view').forEach(v=>v.classList.remove('active')); $('#view-todos').classList.add('active'); renderTodos(); });

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
$('#todoPrevDay').addEventListener('click', () => { const d=new Date(todoDate+'T00:00:00'); d.setDate(d.getDate()-1); todoDate=d.toISOString().slice(0,10); $('#todoDate').value=todoDate; renderTodos(); });
$('#todoNextDay').addEventListener('click', () => { const d=new Date(todoDate+'T00:00:00'); d.setDate(d.getDate()+1); todoDate=d.toISOString().slice(0,10); $('#todoDate').value=todoDate; renderTodos(); });
$('#todoToday').addEventListener('click', () => { todoDate=new Date().toISOString().slice(0,10); $('#todoDate').value=todoDate; renderTodos(); });

function renderTodos() {
    const dayEvents = events.filter(e => e.date === todoDate);
    $('#dayEvents').innerHTML = dayEvents.length ? dayEvents.map(e => `
        <div class="day-event-item day-event-item--${e.event_type}">
            <span class="event-dot event-dot--${e.event_type}"></span>
            <span style="flex:1">${esc(e.title)}</span>
            <span style="font-size:.75rem;color:var(--color-text-light)">${eventTypeLabel(e.event_type)}</span>
        </div>`).join('') : '';

    const dayTodos = todos.filter(t => t.date === todoDate);
    if (!dayTodos.length) { $('#todoList').innerHTML = '<p class="empty-text">暂无任务</p>'; return; }
    const labels = {todo:'待办',doing:'进行中',done:'已完成'};
    $('#todoList').innerHTML = dayTodos.map(t => {
        const sub = subjects.find(s=>s.id===t.subject_id);
        const dc = t.status==='done'?'todo-card--done':'';
        const cc = t.status==='done'?'todo-card__checkbox--done':t.status==='doing'?'todo-card__checkbox--doing':'';
        const ci = t.status==='done'?'✓':t.status==='doing'?'▶':'';
        return `<div class="todo-card ${dc}" data-id="${t.id}">
            <div class="todo-card__checkbox ${cc}" data-action="cycle" title="切换状态">${ci}</div>
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
    }).join('');
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
function eventTypeLabel(t) { return {exam:'考试',class:'上课',holiday:'假期',deadline:'DDL',other:'其他'}[t]||t; }

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
    const dots = events.filter(e=>e.date===dateKey);
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
    const dayEvents = events.filter(e=>e.date===selectedCalDate);
    $('#dayCardEvents').innerHTML = dayEvents.length ? dayEvents.map(e => `
        <div class="day-card__event day-card__event--${e.event_type}">
            <span>${eventTypeLabel(e.event_type)==='考试'?'🔴':eventTypeLabel(e.event_type)==='上课'?'🔵':eventTypeLabel(e.event_type)==='假期'?'🟢':eventTypeLabel(e.event_type)==='DDL'?'🟡':'🟣'} ${esc(e.title)}</span>
            <button data-del-event="${e.id}" title="删除">✕</button>
        </div>`).join('') : '<p style="font-size:.85rem;color:var(--color-text-light)">当天无事件</p>';
}
$('#dayCardClose').addEventListener('click', () => { selectedCalDate=null; renderCalendar(); });
$('#dayCardEvents').addEventListener('click', async e => {
    const del = e.target.dataset.delEvent; if (!del) return;
    if (confirm('删除此事件？')) { await DS.remove('events', parseInt(del)); await refreshAll(); selectedCalDate=null; renderCalendar(); }
});
$('#dayCardGoTodos').addEventListener('click', () => {
    todoDate = selectedCalDate; $('#todoDate').value = todoDate;
    currentTab = 'todos'; $$('.nav__tab').forEach(b=>b.classList.remove('active')); $('[data-tab="todos"]').classList.add('active');
    $$('.view').forEach(v=>v.classList.remove('active')); $('#view-todos').classList.add('active');
    renderTodos();
});
$('#dayCardAddEvent').addEventListener('click', () => {
    modalMode = 'event'; editId = null;
    openModal(`添加事件 - ${selectedCalDate}`, `
        <div class="form-group"><label>标题*</label><input class="form-input" id="mfTitle" maxlength="100" required placeholder="事件名称"></div>
        <div class="form-group"><label>类型</label><select class="form-select" id="mfEventType"><option value="exam">🔴 考试</option><option value="class">🔵 上课</option><option value="holiday">🟢 假期</option><option value="deadline">🟡 DDL</option><option value="other">🟣 其他</option></select></div>
        <div class="form-group"><label>关联科目</label><select class="form-select" id="mfSubject"><option value="">无</option>${showSubjectSelect(null)}</select></div>
        <div class="modal__footer">
            <button type="button" class="btn btn--outline" onclick="closeModal()">取消</button>
            <button type="submit" class="btn btn--primary">保存</button>
        </div>
    `);
    $('#modalForm').onsubmit = async e => { e.preventDefault(); await saveModal(); };
});

// ==================== 科目视图 ====================
function renderSubjects() {
    if (!subjects.length) { $('#subjectGrid').innerHTML = '<p class="empty-text">暂无科目，点击上方按钮添加</p>'; return; }
    $('#subjectGrid').innerHTML = subjects.map(s => {
        const comps = s.components || [];
        const total = comps.reduce((a,c)=>a+(c.percentage||0),0);
        return `<div class="subject-card" data-id="${s.id}" data-action="detail">
            <div class="subject-card__name">📘 ${esc(s.name)}</div>
            <div class="subject-card__info">
                <span>学分 ${s.credits||'-'}</span>
                <span>目标绩点 ${s.target_gpa||'-'}</span>
            </div>
            ${comps.length ? `<div class="subject-card__progress"><div class="subject-card__bar" style="width:${total}%"></div></div><div style="font-size:.75rem;color:var(--color-text-light);margin-top:4px">已配置 ${total}%</div>` : ''}
        </div>`;
    }).join('');
}

$('#subjectGrid').addEventListener('click', e => {
    const card = e.target.closest('.subject-card'); if (!card) return;
    const id = parseInt(card.dataset.id); openSubjectDetail(id);
});
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
function openSubjectDetail(id) {
    const s = subjects.find(x=>x.id===id); if (!s) return;
    $('#subjectDetailTitle').textContent = '📘 ' + s.name;
    $('#sdCredits').textContent = s.credits || '未设置';
    $('#sdGPA').textContent = s.target_gpa || '未设置';
    renderComponents(s);
    $('#subjectDetailModal').style.display = '';
}
function renderComponents(s) {
    const comps = s.components || [];
    const total = comps.reduce((a,c)=>a+(c.percentage||0),0);
    $('#componentList').innerHTML = comps.map((c,i) => `
        <div class="component-item">
            <input value="${esc(c.name)}" data-comp-idx="${i}" data-comp-field="name" placeholder="项目名称（如：期末考试）">
            <input type="number" value="${c.percentage||0}" data-comp-idx="${i}" data-comp-field="percentage" placeholder="%" min="0" max="100"> %
            <button data-comp-del="${i}">✕</button>
        </div>`).join('');
    const cls = total===100?'total-bar--ok':'total-bar--bad';
    $('#totalBar').textContent = `合计：${total}% ${total===100?'✅':'⚠️ 不为100%'}`;
    $('#totalBar').className = `total-bar ${cls}`;
}
$('#componentList').addEventListener('input', () => { updateComponentsFromDOM(); });
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
    await DS.update('subjects', s.id, { components: s.components, credits: s.credits, target_gpa: s.target_gpa });
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
function updateComponentsFromDOM() {
    const s = subjects.find(x=>x.id===currentSubjectId()); if (!s) return;
    const items = $$('#componentList .component-item');
    s.components = [...items].map(item => ({
        name: item.querySelector('[data-comp-field="name"]').value.trim(),
        percentage: parseFloat(item.querySelector('[data-comp-field="percentage"]').value)||0
    }));
    renderComponents(s);
}

// ==================== 保存（通用） ====================
async function saveModal() {
    if (modalMode === 'subject') {
        const name = $('#mfName').value.trim(); if (!name) return;
        const row = { name, credits: parseFloat($('#mfCredits').value)||0, target_gpa: parseFloat($('#mfGPA').value)||null, components:[] };
        await DS.create('subjects', row); closeModal(); await refreshAll();
    } else if (modalMode === 'event') {
        const title = $('#mfTitle').value.trim(); if (!title) return;
        const event_type = $('#mfEventType').value;
        const subject_id = $('#mfSubject').value ? parseInt($('#mfSubject').value) : null;
        await DS.create('events', { date: selectedCalDate, title, event_type, subject_id });
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

// ==================== 启动 ====================
document.addEventListener('DOMContentLoaded', async () => {
    if (!(await Auth.isLoggedIn())) return;
    await refreshAll();
    renderTodos();
    renderCalendar();
});
