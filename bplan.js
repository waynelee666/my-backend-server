/* ============================================================
   TaskFlow - B计划面板  v1.0
   规则：
     · 一周 7 格（周一~周日），当天护肤流程（防晒 + 保湿）做到了就打勾
     · 只能勾「本周内、且不晚于今天」的格子；过了周日该周不再展示
     · W1 是残周：计划 2026-09-09（周三）启动，该周只有 周三~周日 5 格
     · 国庆 10/3–10/6 只考核防晒，面板上标注，但不影响打勾
     · 只实现第 1 个月（2026-09-09 ~ 2026-10-08）的周目标
   数据：Supabase 表 bplan_data 单行 JSON（建表见 bplan_setup.sql）
         表不可用时自动降级 localStorage
   注意：本面板不参与记账奖金，不与 ledger.js 的任何金额逻辑相连

   ⚠ 本文件所有顶层标识符一律带 bplan / BPLAN_ 前缀。
     经典 <script> 之间共享全局作用域，med.js 已有大量的裸名全局函数
     （weekStartOf / tickDeadline / settleDay / isWeekLocked / canTick /
     isWeekComplete）。这里只要重名就会静默覆盖滴药面板的逻辑。
   ============================================================ */
console.log('📋 B-Plan module loaded');

// ---- 常量 ----
const BPLAN_LOCAL_KEY = 'taskflow_bplan';
const BPLAN_DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const BPLAN_ANCHOR = '2026-09-09';   // 第 1 个月起点（周三）
const BPLAN_W1_MON = '2026-09-07';   // W1 所在周的周一 —— 周编号的锚点
const BPLAN_M1_END = '2026-10-08';   // 第 1 个月终点（D30，拍素颜对比照）
const BPLAN_MAX_WEEK = 5;            // W6+ 一律夹到 W5 的周目标
const BPLAN_HOLIDAY = ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'];

// 第 1 个月的周目标默认值（可被用户手改覆盖）
// W1 原文写「6 天」，但该周只有 5 天 → 按全勤 5 天处理
const BPLAN_DEFAULTS = {
  1: ['🧴 防晒 · 5 天（9/9 起，全勤）', '📵 关手机 · 12:30 前 · 5 天',
      '⏰ 起床 · 9:30 · 5 天', '🧋 奶茶饮料 · ≤4 次'],
  2: ['🧴 防晒 · 6 天', '📵 关手机 · 12:00 前 · 5 天',
      '⏰ 起床 · 9:00 前 · 5 天', '🧋 奶茶饮料 · ≤3 次'],
  3: ['🧴 防晒 · 6 天', '📵 关手机 · 12:00 前 · 5 天',
      '⏰ 起床 · 9:00 前 · 5 天', '🧋 奶茶饮料 · ≤3 次'],
  4: ['🧴 防晒 · 6 天', '📵 关手机 · 12:00 前 · 5 天',
      '⏰ 起床 · 9:00 前 · 5 天', '🧋 奶茶饮料 · ≤3 次'],
  5: ['🧴 防晒 · 6 天', '📵 关手机 · 12:00 前 · 5 天',
      '⏰ 起床 · 9:00 前 · 5 天', '🧋 奶茶饮料 · ≤2 次'],
};

// ---- 内存状态 ----
let bplanState = null;    // { ticks: ['YYYY-MM-DD', ...], tasks: { weekKey: [str, ...] } }
let bplanEditing = null;  // null | { weekKey, idx }

// ---- 工具 ----
function bplanPad(n) { return String(n).padStart(2, '0'); }

function bplanYMD(d) {
  return `${d.getFullYear()}-${bplanPad(d.getMonth() + 1)}-${bplanPad(d.getDate())}`;
}

function bplanParse(dateStr) { return new Date(dateStr + 'T00:00:00'); }

function bplanAddDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

// 不直接依赖 ledger.js 的 localDateStr，万一它没加载也能跑
function bplanToday() {
  if (typeof localDateStr === 'function') return localDateStr();
  const d = new Date();
  return `${d.getFullYear()}-${bplanPad(d.getMonth() + 1)}-${bplanPad(d.getDate())}`;
}

function bplanEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---- 周编号 ----
// 该日所在周的周一（本地零点）
function bplanWeekStartOf(dateStr) {
  const d = bplanParse(dateStr);
  const dow = (d.getDay() + 6) % 7;        // 0 = 周一
  d.setDate(d.getDate() - dow);
  return d;
}

function bplanWeekKeyOf(dateStr) { return bplanYMD(bplanWeekStartOf(dateStr)); }

function bplanCurrentWeekKey() { return bplanWeekKeyOf(bplanToday()); }

// 周编号：W1 = 1。先 round 归整再 floor，避免夏令时下天数差是 6.958 这类浮点
function bplanWeekNo(weekStartDate) {
  const d0 = bplanParse(BPLAN_W1_MON);
  const dd = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate());
  const diff = Math.round((dd - d0) / 86400000);
  return Math.floor(diff / 7) + 1;
}

// 该周的 7 个日期串（周一 → 周日）
function bplanWeekDays(weekKey) {
  const mon = bplanParse(weekKey);
  const out = [];
  for (let i = 0; i < 7; i++) out.push(bplanYMD(bplanAddDays(mon, i)));
  return out;
}

// 该周实际需要考核的日子：滤掉计划开始之前（W1 的 9/7、9/8）。
// 这是「格子可勾性」和「分母」的唯一真值源，两边都从这里取。
function bplanEligibleDays(weekKey) {
  return bplanWeekDays(weekKey).filter(d => d >= BPLAN_ANCHOR);
}

// 某天此刻能不能勾：本周内 + 不晚于今天 + 不早于计划起点
function bplanCanTick(dayStr, today) {
  const t = today || bplanToday();
  if (dayStr > t) return false;
  if (dayStr < BPLAN_ANCHOR) return false;
  return bplanWeekKeyOf(dayStr) === bplanCurrentWeekKey();
}

// ---- 周目标 ----
function bplanWeekNoOfKey(weekKey) {
  const n = bplanWeekNo(bplanParse(weekKey));
  return Math.min(Math.max(n, 1), BPLAN_MAX_WEEK);
}

// 该周可编辑的 4 行任务（用户改过就用用户的）
function bplanTasksOf(weekKey) {
  const override = bplanState && bplanState.tasks ? bplanState.tasks[weekKey] : null;
  if (Array.isArray(override) && override.length) return override.slice();
  return (BPLAN_DEFAULTS[bplanWeekNoOfKey(weekKey)] || []).slice();
}

// 该周落在国庆免考核区间的天数（只影响提示，不影响打勾）
function bplanHolidayCountIn(weekKey) {
  return bplanWeekDays(weekKey).filter(d => BPLAN_HOLIDAY.indexOf(d) >= 0).length;
}

// ---- 数据层：Supabase 优先，失败降级 localStorage（照 med.js / plans.js 的模式）----
function bplanNormalize(raw) {
  const s = { ticks: [], tasks: {} };
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.ticks)) {
      s.ticks = raw.ticks.filter(x => typeof x === 'string');
    }
    if (raw.tasks && typeof raw.tasks === 'object') {
      Object.keys(raw.tasks).forEach(k => {
        const v = raw.tasks[k];
        if (Array.isArray(v) && v.length && v.every(x => typeof x === 'string')) {
          s.tasks[k] = v;
        }
      });
    }
  }
  return s;
}

function bplanLoadLocal() {
  try {
    const raw = localStorage.getItem(BPLAN_LOCAL_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

function bplanSaveLocal() {
  try {
    localStorage.setItem(BPLAN_LOCAL_KEY, JSON.stringify(bplanState));
  } catch (e) {}
}

async function loadBplan() {
  let data = null;
  try {
    const sb = Auth.getClient();
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      const { data: row, error } = await sb.from('bplan_data')
        .select('data').eq('user_id', user.id).maybeSingle();
      if (error) {
        console.warn('[bplan] bplan_data 表不可用，降级本地缓存:', error.message);
      } else if (row) {
        data = row.data;
      }
    }
  } catch (e) {
    console.warn('[bplan] 加载失败，降级本地缓存:', e);
  }
  if (data == null) data = bplanLoadLocal();
  bplanState = bplanNormalize(data);
  return bplanState;
}

// 先落本地再推远端 —— 断网也不丢
async function saveBplan() {
  bplanSaveLocal();
  try {
    const sb = Auth.getClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { error } = await sb.from('bplan_data').upsert(
      { user_id: user.id, data: bplanState, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (error) console.warn('[bplan] 同步失败，已存本地:', error.message);
  } catch (e) {
    console.warn('[bplan] 同步失败，已存本地:', e);
  }
}

// ---- 打卡 ----
async function toggleBplanDay(dayStr) {
  if (!bplanCanTick(dayStr)) return;
  const i = bplanState.ticks.indexOf(dayStr);
  if (i >= 0) bplanState.ticks.splice(i, 1); else bplanState.ticks.push(dayStr);
  // 正在改任务行时别重绘，否则会把用户没提交的输入冲掉
  if (!bplanEditing) renderBplanPanel();
  await saveBplan();
}

// ---- 渲染 ----
function bplanCellHTML(dayStr, today) {
  const on = bplanState.ticks.indexOf(dayStr) >= 0;
  const isPre = dayStr < BPLAN_ANCHOR;
  const clickable = bplanCanTick(dayStr, today);
  const isToday = dayStr === today;
  const cls = ['med-day'];
  if (on) cls.push('med-day--on');
  if (clickable) cls.push('med-day--clickable');
  if (isToday) cls.push('med-day--today');
  if (isPre) cls.push('bplan-day--pre');
  const dow = (bplanParse(dayStr).getDay() + 6) % 7;
  const tip = isPre ? '（计划开始前）' : (clickable ? '' : '（不可勾选）');
  return `<button class="${cls.join(' ')}" ${clickable ? `data-bplan-day="${dayStr}"` : 'disabled'}
            title="${dayStr}${tip}">
            <span class="med-day__w">${BPLAN_DAY_LABELS[dow]}</span>
            <span class="med-day__n">${Number(dayStr.slice(8, 10))}</span>
            <span class="med-day__mark">${on ? '✓' : ''}</span>
          </button>`;
}

function bplanWeekHTML(weekKey, opts) {
  const today = bplanToday();
  const eligible = bplanEligibleDays(weekKey);
  const done = eligible.filter(d => bplanState.ticks.indexOf(d) >= 0).length;
  const cells = bplanWeekDays(weekKey).map(d => bplanCellHTML(d, today)).join('');
  return `
    <div class="med-week">
      <div class="med-week__label">${(opts && opts.label) || '本周'}
        <span>${done}/${eligible.length}</span>
      </div>
      <div class="med-days">${cells}</div>
    </div>`;
}

function bplanSummaryHTML(weekKey) {
  const no = bplanWeekNo(bplanParse(weekKey));
  const left = Math.round((bplanParse(BPLAN_M1_END) - bplanParse(bplanToday())) / 86400000);
  let mid;
  if (no < 1) mid = '未开始';
  else if (left < 0) mid = '第 1 个月已结束';
  else mid = `第 1 个月 · 第 ${Math.min(no, 6)} 周` + (no > 6 ? '+' : '');

  let sub;
  if (left > 0) sub = `距 10/8 拍素颜对比照还有 ${left} 天`;
  else if (left === 0) sub = '今天就是 D30，记得拍素颜对比照';
  else sub = '第 2–4 个月的目标还没配置';

  return `
    <div class="med-summary">
      <span>${mid}</span>
      <span class="med-summary__sub">${sub}</span>
    </div>`;
}

function bplanTasksHTML(weekKey) {
  const tasks = bplanTasksOf(weekKey);
  const rows = tasks.map((t, i) => {
    if (bplanEditing && bplanEditing.weekKey === weekKey && bplanEditing.idx === i) {
      return `<li class="bplan-task bplan-task--editing">
          <input class="bplan-task__input" id="bplanTaskInput" type="text"
                 value="${bplanEsc(t)}" maxlength="80">
          <button class="bplan-task__save" data-bplan-save="1" title="保存">✓</button>
          <button class="bplan-task__cancel" data-bplan-cancel="1" title="取消">✕</button>
        </li>`;
    }
    return `<li class="bplan-task">
        <span class="bplan-task__text">${bplanEsc(t)}</span>
        <button class="bplan-task__edit" data-bplan-edit="${i}" title="改这一行">✎</button>
      </li>`;
  }).join('');

  const hol = bplanHolidayCountIn(weekKey);
  const note = hol
    ? `<div class="med-week__hint">🎑 本周有 ${hol} 天是国庆，只考核防晒，睡眠和奶茶不作要求</div>`
    : '';

  return `
    <div class="bplan-tasks">
      <div class="bplan-tasks__title">📋 本周任务</div>
      <ul class="bplan-tasks__list">${rows}</ul>
      ${note}
    </div>`;
}

function bplanPanelHTML() {
  const weekKey = bplanCurrentWeekKey();
  return `
    <div class="bplan-panel__title">📋 B计划</div>
    ${bplanWeekHTML(weekKey, { label: '本周' })}
    ${bplanSummaryHTML(weekKey)}
    ${bplanTasksHTML(weekKey)}`;
}

function renderBplanPanel() {
  const el = document.getElementById('bplanPanel');
  if (!el || !bplanState) return;
  const weekKey = bplanCurrentWeekKey();
  el.innerHTML = bplanPanelHTML();

  el.querySelectorAll('[data-bplan-day]').forEach(btn => {
    btn.addEventListener('click', () => toggleBplanDay(btn.dataset.bplanDay));
  });
  el.querySelectorAll('[data-bplan-edit]').forEach(btn => {
    btn.addEventListener('click', () => startBplanEdit(weekKey, Number(btn.dataset.bplanEdit)));
  });
  // 用 mousedown + preventDefault：否则点按钮会先触发输入框 blur，
  // 把「取消」变成「保存」、把「保存」提交两次
  el.querySelectorAll('[data-bplan-save]').forEach(btn => {
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); commitBplanEdit(); });
  });
  el.querySelectorAll('[data-bplan-cancel]').forEach(btn => {
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); cancelBplanEdit(); });
  });

  const input = el.querySelector('#bplanTaskInput');
  if (input) {
    let settled = false;
    const commit = () => { if (settled) return; settled = true; commitBplanEdit(); };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); settled = true; cancelBplanEdit(); }
    });
    input.addEventListener('blur', commit);
    input.focus();
    input.select();
  }
}

// ---- 行内编辑 ----
function startBplanEdit(weekKey, idx) {
  bplanEditing = { weekKey, idx };
  renderBplanPanel();
}

function commitBplanEdit() {
  if (!bplanEditing) return;
  const el = document.getElementById('bplanTaskInput');
  const { weekKey, idx } = bplanEditing;
  const val = el ? el.value.trim() : '';
  if (val) {
    const tasks = bplanTasksOf(weekKey);
    tasks[idx] = val;
    if (!bplanState.tasks) bplanState.tasks = {};
    bplanState.tasks[weekKey] = tasks;
  }
  const changed = !!val;
  bplanEditing = null;
  renderBplanPanel();
  if (changed) saveBplan();
}

function cancelBplanEdit() {
  if (!bplanEditing) return;
  bplanEditing = null;
  renderBplanPanel();
}

// ---- 暴露入口（由 ledger.js 的 renderLedgerView 调用）----
window.loadBplan = loadBplan;
window.renderBplanPanel = renderBplanPanel;
