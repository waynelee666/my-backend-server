/* ============================================================
   TaskFlow - 任务清单 + 日历 脚本
   封装 Supabase tasks 表 CRUD，渲染任务列表和日历
   ============================================================ */

// ---------- Supabase 客户端 ----------
const SUPABASE_URL = 'https://swouijpxhujlwlrsmwmo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3b3VpanB4aHVqbHdscnNtd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMjQxMzIsImV4cCI6MjA5NjcwMDEzMn0.VhL4p8yoILq-5nFe2K5TKafoC03vsDwa_MBb-uBp8PQ';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- 全局状态 ----------
let allTasks = [];
let currentFilter = 'all';
let selectedDate = null;       // 'YYYY-MM-DD' or null
const calYear = { value: new Date().getFullYear() };
const calMonth = { value: new Date().getMonth() };   // 0-based

// ---------- DOM 工具 ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const taskListEl = $('#taskList');
const calGridEl = $('#calGrid');
const calMonthLabel = $('#calMonthLabel');
const calDayTasksEl = $('#calDayTasks');
const modalOverlay = $('#modalOverlay');
const taskForm = $('#taskForm');
const addTaskBtn = $('#addTaskBtn');

// ---------- 数据层 ----------
const TaskStore = {
    /** 加载当前用户所有任务 */
    async load() {
        const { data, error } = await sb
            .from('tasks')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) { console.error('Load tasks error:', error); return []; }
        return data || [];
    },

    /** 新增任务 */
    async create(task) {
        const { data: { user } } = await sb.auth.getUser();
        const { data, error } = await sb.from('tasks').insert({
            user_id: user.id,
            title: task.title,
            description: task.description || '',
            priority: task.priority || '中',
            status: task.status || 'todo',
            due_date: task.due_date || null,
            due_time: task.due_time || null,
        }).select().single();
        if (error) throw error;
        return data;
    },

    /** 更新任务 */
    async update(id, fields) {
        fields.updated_at = new Date().toISOString();
        const { data, error } = await sb.from('tasks').update(fields).eq('id', id).select().single();
        if (error) throw error;
        return data;
    },

    /** 删除任务 */
    async remove(id) {
        const { error } = await sb.from('tasks').delete().eq('id', id);
        if (error) throw error;
    },
};

// ---------- 渲染 ----------
function getFilteredTasks() {
    if (currentFilter === 'all') return allTasks;
    return allTasks.filter(t => t.status === currentFilter);
}

function renderTaskList() {
    const tasks = getFilteredTasks();
    if (tasks.length === 0) {
        taskListEl.innerHTML = '<p class="task-list__empty">暂无任务，点击上方按钮添加</p>';
        return;
    }

    taskListEl.innerHTML = tasks.map(t => {
        const doneClass = t.status === 'done' ? 'task-card--done' : '';
        const cbClass = t.status === 'done' ? 'task-card__checkbox--done'
                      : t.status === 'doing' ? 'task-card__checkbox--doing' : '';
        const cbIcon = t.status === 'done' ? '✓' : t.status === 'doing' ? '▶' : '';
        const desc = t.description ? `<div class="task-card__desc">${escapeHtml(t.description)}</div>` : '';
        const dateStr = formatDate(t.due_date);
        const timeStr = t.due_time ? t.due_time.slice(0, 5) : '';
        const datetimeStr = [dateStr, timeStr].filter(Boolean).join(' ');
        const statusLabel = { todo: '待办', doing: '进行中', done: '已完成' }[t.status];

        return `
        <div class="task-card ${doneClass}" data-id="${t.id}">
            <div class="task-card__checkbox ${cbClass}" data-action="cycle" title="点击切换状态">${cbIcon}</div>
            <div class="task-card__body" data-action="edit">
                <div class="task-card__title">${escapeHtml(t.title)}</div>
                ${desc}
                <div class="task-card__meta">
                    <span class="status-badge status-badge--${t.status}">${statusLabel}</span>
                    <span><span class="priority-dot priority--${t.priority}"></span>${t.priority}</span>
                    ${datetimeStr ? `<span>📅 ${datetimeStr}</span>` : ''}
                </div>
            </div>
            <div class="task-card__actions">
                <button data-action="edit" title="编辑">✏️</button>
                <button class="btn-del" data-action="delete" title="删除">🗑️</button>
            </div>
        </div>`;
    }).join('');
}

function renderCalendar() {
    calMonthLabel.textContent = `${calYear.value}年 ${calMonth.value + 1}月`;

    const year = calYear.value;
    const month = calMonth.value;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    // 收集本月及跨月有任务的日期
    const taskDates = new Map();
    allTasks.forEach(t => {
        if (!t.due_date) return;
        taskDates.set(t.due_date, (taskDates.get(t.due_date) || 0) + 1);
    });

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    let html = '';

    // 上月填充
    for (let i = firstDay - 1; i >= 0; i--) {
        const d = prevMonthDays - i;
        const m = month === 0 ? 12 : month;
        const y = month === 0 ? year - 1 : year;
        const key = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        html += calCell(d, 'cal__cell--other-month', key, taskDates.get(key) || 0, false, false);
    }

    // 本月
    for (let d = 1; d <= daysInMonth; d++) {
        const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isToday = key === todayKey;
        const isSelected = key === selectedDate;
        html += calCell(d, '', key, taskDates.get(key) || 0, isToday, isSelected);
    }

    // 下月填充
    const remaining = 42 - (firstDay + daysInMonth);
    for (let d = 1; d <= remaining; d++) {
        const m = month === 11 ? 1 : month + 2;
        const y = month === 11 ? year + 1 : year;
        const key = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        html += calCell(d, 'cal__cell--other-month', key, taskDates.get(key) || 0, false, false);
    }

    calGridEl.innerHTML = html;
    renderCalDayTasks();
}

function calCell(day, extraClass, dateKey, taskCount, isToday, isSelected) {
    let cls = `cal__cell ${extraClass}`;
    if (isToday) cls += ' cal__cell--today';
    if (isSelected) cls += ' cal__cell--selected';
    const dot = taskCount > 0 ? '<span class="cal__dot"></span>' : '';
    return `<div class="${cls}" data-date="${dateKey}">${day}${dot}</div>`;
}

function renderCalDayTasks() {
    if (!selectedDate) {
        calDayTasksEl.innerHTML = '<p class="task-list__empty cal__day-empty">点击日期查看当天任务</p>';
        return;
    }
    const dayTasks = allTasks.filter(t => t.due_date === selectedDate);
    if (dayTasks.length === 0) {
        calDayTasksEl.innerHTML = `<p class="task-list__empty cal__day-empty">${selectedDate} 暂无任务</p>`;
        return;
    }
    const labels = { todo: '待办', doing: '进行中', done: '已完成' };
    calDayTasksEl.innerHTML = `
        <div class="cal__day-label">📌 ${selectedDate}</div>
        ${dayTasks.map(t => `
            <div class="cal__day-task">
                <span class="priority-dot priority--${t.priority}"></span>
                <span style="flex:1">${escapeHtml(t.title)}</span>
                ${t.due_time ? `<span>${t.due_time.slice(0,5)}</span>` : ''}
                <span class="status-badge status-badge--${t.status}">${labels[t.status]}</span>
            </div>
        `).join('')}
    `;
}

// ---------- 模态框 ----------
function openModal(task = null) {
    editingTaskId = task ? task.id : null;
    $('#modalTitle').textContent = task ? '编辑任务' : '添加任务';
    $('#taskId').value = task ? task.id : '';
    $('#taskTitle').value = task ? task.title : '';
    $('#taskDesc').value = task ? (task.description || '') : '';
    $('#taskPriority').value = task ? task.priority : '中';
    $('#taskStatus').value = task ? task.status : 'todo';
    $('#taskDate').value = task ? (task.due_date || '') : '';
    $('#taskTime').value = task ? (task.due_time ? task.due_time.slice(0,5) : '') : '';
    modalOverlay.style.display = '';
}
let editingTaskId = null;

function closeModal() {
    modalOverlay.style.display = 'none';
    editingTaskId = null;
    taskForm.reset();
}

async function saveTask(e) {
    e.preventDefault();
    const taskData = {
        title: $('#taskTitle').value.trim(),
        description: $('#taskDesc').value.trim(),
        priority: $('#taskPriority').value,
        status: $('#taskStatus').value,
        due_date: $('#taskDate').value || null,
        due_time: $('#taskTime').value || null,
    };
    if (!taskData.title) return;

    const saveBtn = $('#modalSave');
    saveBtn.textContent = '保存中...';
    saveBtn.disabled = true;

    try {
        if (editingTaskId) {
            await TaskStore.update(editingTaskId, taskData);
        } else {
            await TaskStore.create(taskData);
        }
        closeModal();
        await refresh();
    } catch (err) {
        alert('保存失败: ' + err.message);
    } finally {
        saveBtn.textContent = '保存';
        saveBtn.disabled = false;
    }
}

// ---------- 事件处理 ----------
async function handleTaskClick(e) {
    const card = e.target.closest('.task-card');
    if (!card) return;
    const id = parseInt(card.dataset.id);
    const task = allTasks.find(t => t.id === id);
    if (!task) return;

    const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;

    if (action === 'cycle') {
        const next = { todo: 'doing', doing: 'done', done: 'todo' };
        await TaskStore.update(id, { status: next[task.status] });
        await refresh();
    } else if (action === 'edit') {
        openModal(task);
    } else if (action === 'delete') {
        if (confirm(`确定删除「${task.title}」吗？`)) {
            await TaskStore.remove(id);
            await refresh();
        }
    }
}

async function handleCalClick(e) {
    const cell = e.target.closest('.cal__cell');
    if (!cell) return;
    selectedDate = cell.dataset.date;
    renderCalendar();
}

// ---------- 工具函数 ----------
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === now.toISOString().slice(0, 10)) return '今天';
    if (dateStr === tomorrow.toISOString().slice(0, 10)) return '明天';
    if (dateStr === yesterday.toISOString().slice(0, 10)) return '昨天';

    return `${d.getMonth() + 1}月${d.getDate()}日`;
}

async function refresh() {
    allTasks = await TaskStore.load();
    renderTaskList();
    renderCalendar();
}

// ---------- 初始化 ----------
document.addEventListener('DOMContentLoaded', async () => {
    if (!(await Auth.isLoggedIn())) return;
    await refresh();

    // 筛选按钮
    $$('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderTaskList();
        });
    });

    // 日历导航
    $('#calPrev').addEventListener('click', () => {
        if (calMonth.value === 0) { calMonth.value = 11; calYear.value--; }
        else calMonth.value--;
        selectedDate = null;
        renderCalendar();
    });
    $('#calNext').addEventListener('click', () => {
        if (calMonth.value === 11) { calMonth.value = 0; calYear.value++; }
        else calMonth.value++;
        selectedDate = null;
        renderCalendar();
    });

    // 模态框
    addTaskBtn.addEventListener('click', () => openModal());
    $('#modalClose').addEventListener('click', closeModal);
    $('#modalCancel').addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    taskForm.addEventListener('submit', saveTask);

    // 事件委托
    taskListEl.addEventListener('click', handleTaskClick);
    calGridEl.addEventListener('click', handleCalClick);
});
