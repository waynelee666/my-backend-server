/* ============================================================
   TaskFlow - 计划模块 v1.0 — 每周 / 每月 / 每学期 三级目标
   设计原则：懒人友好
     · 自动识别当前 周/月/学期，无需手动选周期
     · 周期切换时，未完成的目标自动带入新周期（不勾掉的继续追）
     · 打字 + 回车即添加，勾选即完成，每条可删
   数据：Supabase plan_data（单行 JSON，跟 goal_data 同套路）+ localStorage 兜底
   ============================================================ */
console.log('📅 Plans module loaded');

// ---- 内存状态 ----
let plansData = null;   // { week:{key,items[]}, month:{...}, semester:{...} }

// ---- 三个周期区块的元信息 ----
const PLAN_TYPES = [
    { type: 'week',     icon: '📅', title: '本周计划',  color: '#4f46e5' },
    { type: 'month',    icon: '🗓️', title: '本月计划',  color: '#f59e0b' },
    { type: 'semester', icon: '🎓', title: '本学期计划', color: '#22c55e' },
];

// ---- 日期 / 周期工具 ----
function pad2(n) { return String(n).padStart(2, '0'); }
function fmtYMD(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

function mondayOf(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = (x.getDay() + 6) % 7;  // 0=周一
    x.setDate(x.getDate() - dow);
    return x;
}
function weekKey(d) { return fmtYMD(mondayOf(d)); }
function weekLabel(d) {
    const m = mondayOf(d);
    const sun = new Date(m.getFullYear(), m.getMonth(), m.getDate() + 6);
    return `${fmtYMD(m)} ~ ${fmtYMD(sun)}`;
}
function monthKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
function monthLabel(d) { return `${d.getFullYear()}年${d.getMonth() + 1}月`; }
function semesterInfo(d) {
    const y = d.getFullYear(), m = d.getMonth() + 1;
    if (m >= 9) return { key: `${y}-${y + 1}-秋`, label: `${y}–${y + 1} 秋季学期` };
    if (m <= 2) return { key: `${y - 1}-${y}-秋`, label: `${y - 1}–${y} 秋季学期` };
    return { key: `${y}-春`, label: `${y} 春季学期` };
}
function currentPeriodInfo(type, d = new Date()) {
    if (type === 'week')     return { key: weekKey(d), label: weekLabel(d) };
    if (type === 'month')    return { key: monthKey(d), label: monthLabel(d) };
    const s = semesterInfo(d);
    return { key: s.key, label: s.label };
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function emptyPlans(d = new Date()) {
    return {
        week:     { key: weekKey(d), items: [] },
        month:    { key: monthKey(d), items: [] },
        semester: { key: semesterInfo(d).key, items: [] },
    };
}

// 周期切换：未完成的目标自动带入新周期（不勾掉=还要继续做）
function ensureCurrentPeriods(data) {
    const now = new Date();
    for (const { type } of PLAN_TYPES) {
        const info = currentPeriodInfo(type, now);
        const cur = data[type];
        if (!cur || !cur.key) {
            data[type] = { key: info.key, items: [] };
        } else if (cur.key !== info.key) {
            const carry = (cur.items || []).filter(i => !i.done);
            data[type] = { key: info.key, items: carry.map(i => ({ ...i, carried: true })) };
        }
    }
    return data;
}

// ==================== 数据读写 ====================
async function loadPlans() {
    try {
        const sb = Auth.getClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return ensureCurrentPeriods(loadPlansLocal());

        const { data, error } = await sb.from('plan_data')
            .select('data').eq('user_id', user.id).maybeSingle();
        if (error) {
            console.warn('plan_data 表可能不存在，使用本地缓存:', error.message);
            return ensureCurrentPeriods(loadPlansLocal());
        }
        let d = (data && data.data && typeof data.data === 'object') ? data.data : emptyPlans();
        d = ensureCurrentPeriods(d);
        savePlansLocal(d);
        return d;
    } catch (e) {
        console.error('loadPlans 异常，降级本地:', e);
        return ensureCurrentPeriods(loadPlansLocal());
    }
}

function loadPlansLocal() {
    try {
        const raw = localStorage.getItem('taskflow_plans');
        if (raw) { const d = JSON.parse(raw); if (d && d.week && d.month && d.semester) return d; }
    } catch (e) {}
    return emptyPlans();
}
function savePlansLocal(d) { try { localStorage.setItem('taskflow_plans', JSON.stringify(d)); } catch (e) {} }

async function savePlans() {
    savePlansLocal(plansData);
    try {
        const sb = Auth.getClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        const { error } = await sb.from('plan_data').upsert({
            user_id: user.id,
            data: plansData,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (error) console.warn('Supabase 保存失败，已存本地:', error.message);
    } catch (e) {
        console.error('保存计划失败，已存本地:', e);
    }
}

// ==================== 渲染 ====================
async function renderPlansView() {
    if (!plansData) plansData = await loadPlans();
    const el = document.getElementById('plansContent');
    if (!el) return;
    el.innerHTML = PLAN_TYPES.map(t => renderPlanSection(t)).join('');
    bindPlanEvents();
}

function renderPlanSection(t) {
    const section = plansData[t.type];
    const items = (section && section.items) || [];
    const done = items.filter(i => i.done).length;
    const total = items.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const info = currentPeriodInfo(t.type);
    const allDone = total > 0 && done === total;

    const itemHTML = items.map(i => `
        <div class="plan-item ${i.done ? 'plan-item--done' : ''}" data-id="${i.id}">
            <label class="plan-item__checkwrap">
                <input type="checkbox" class="plan-item__cb" data-toggle="${i.id}" ${i.done ? 'checked' : ''}>
                <span class="plan-item__check"></span>
            </label>
            <span class="plan-item__text">${esc(i.text)}${(i.carried && !i.done) ? '<em class="plan-item__carried">↩ 从上期带入</em>' : ''}</span>
            <button class="plan-item__del" data-del="${i.id}" title="删除">✕</button>
        </div>`).join('');

    const placeholder = t.type === 'semester' ? '本学期想达成什么…'
        : t.type === 'month' ? '这个月想完成什么…'
        : '这周想做点什么…';

    return `
        <div class="plan-section" data-type="${t.type}" style="--plan-color:${t.color}">
            <div class="plan-section__head">
                <span class="plan-section__title"><span class="plan-section__icon">${t.icon}</span>${t.title}</span>
                <span class="plan-section__period">${info.label}</span>
            </div>
            <div class="plan-section__progress">
                <div class="plan-section__bar"><div class="plan-section__fill" style="width:${pct}%"></div></div>
                <span class="plan-section__stat">${done}/${total}${allDone ? ' · 🎉 全部完成' : ''}</span>
            </div>
            <div class="plan-list">
                ${items.length ? itemHTML : '<p class="plan-empty">还没有目标，在下面添加一个吧</p>'}
            </div>
            <div class="plan-add">
                <input type="text" class="plan-add__input" data-add="${t.type}" placeholder="${placeholder}" maxlength="200">
                <button class="btn btn--primary btn--sm plan-add__btn" data-addbtn="${t.type}">＋ 添加</button>
            </div>
        </div>`;
}

// ==================== 事件 ====================
function bindPlanEvents() {
    document.querySelectorAll('.plan-add__input').forEach(inp => {
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') addPlanItem(inp.dataset.add); });
    });
    document.querySelectorAll('.plan-add__btn').forEach(btn => {
        btn.addEventListener('click', () => addPlanItem(btn.dataset.addbtn));
    });
    document.querySelectorAll('.plan-item__cb').forEach(cb => {
        cb.addEventListener('change', () => togglePlanItem(cb.dataset.toggle, cb.checked));
    });
    document.querySelectorAll('.plan-item__del').forEach(btn => {
        btn.addEventListener('click', () => deletePlanItem(btn.dataset.del));
    });
}

function findPlanItem(id) {
    for (const t of PLAN_TYPES) {
        const items = (plansData[t.type] && plansData[t.type].items) || [];
        const it = items.find(x => x.id === id);
        if (it) return { type: t.type, item: it, items };
    }
    return null;
}

async function addPlanItem(type) {
    const inp = document.querySelector(`.plan-add__input[data-add="${type}"]`);
    const text = (inp.value || '').trim();
    if (!text) { inp.focus(); return; }
    plansData[type].items = plansData[type].items || [];
    plansData[type].items.push({ id: uid(), text, done: false });
    inp.value = '';
    await savePlans();
    await renderPlansView();
}

async function togglePlanItem(id, done) {
    const found = findPlanItem(id);
    if (!found) return;
    found.item.done = done;
    await savePlans();
    await renderPlansView();
}

async function deletePlanItem(id) {
    const found = findPlanItem(id);
    if (!found) return;
    found.items.splice(found.items.indexOf(found.item), 1);
    await savePlans();
    await renderPlansView();
}

// 暴露入口（由 script.js 调用）
window.renderPlansView = renderPlansView;
