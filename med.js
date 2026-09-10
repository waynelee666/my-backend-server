/* ============================================================
   TaskFlow - 滴药监督面板  v1.0
   规则：
     · 每周 周一~周日 共 7 格，每天滴完打勾
     · 补打：本周的勾必须在下周二 24:00 前补完（即周三 00:00 锁定）
     · 结算：自动。补打窗口关闭后判定该周是否达成（7 格全勾）
     · 奖励：达成 → 本期「存储目标」−30，本期「日常额度」+30
     · 归属：按结算日（下周三）落在哪个账单周期计
   数据：Supabase 表 med_ticks（建表见 med_setup.sql）
         表不可用时自动降级 localStorage
   ============================================================ */
console.log('💊 Med module loaded');

// ---- 常量 ----
const MED_REWARD = 30;                     // 每周达成奖励（元）
const MED_LOCAL_KEY = 'taskflow_med_ticks';
const MED_DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

// ---- 参数（由 ledger.js 传入当前期，用于显示「本期达成」）----
let medCycleKey = null;

// ---- 内存状态：已打勾的日期集合 'YYYY-MM-DD' ----
let medTicks = new Set();

// ---- 日期工具 ----
function medPad(n) { return String(n).padStart(2, '0'); }

function medYMD(d) {
  return `${d.getFullYear()}-${medPad(d.getMonth() + 1)}-${medPad(d.getDate())}`;
}

function medAddDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function medParse(dateStr) {
  return new Date(dateStr + 'T00:00:00');
}

// 该日所在周的周一（本地零点）
function weekStartOf(dateStr) {
  const d = medParse(dateStr);
  const dow = (d.getDay() + 6) % 7;        // 0 = 周一
  d.setDate(d.getDate() - dow);
  return d;
}

// 补打截止日 = 下周二（周一 + 8 天）
function tickDeadline(weekStart) { return medYMD(medAddDays(weekStart, 8)); }

// 结算日 = 下周三（周一 + 9 天）
function settleDay(weekStart) { return medYMD(medAddDays(weekStart, 9)); }

// 该周是否已锁定（下周三 00:00 起锁定）
function isWeekLocked(weekStart, today) {
  return (today || localDateStr()) >= settleDay(weekStart);
}

// 某一天此刻还能不能打勾
function canTick(dayStr, today) {
  const t = today || localDateStr();
  if (dayStr > t) return false;                       // 未来不能预勾
  return !isWeekLocked(weekStartOf(dayStr), t);       // 已锁定不能补
}

// 某周是否 7 格全勾
function isWeekComplete(weekStart, ticks) {
  const t = ticks || medTicks;
  for (let i = 0; i < 7; i++) {
    if (!t.has(medYMD(medAddDays(weekStart, i)))) return false;
  }
  return true;
}

// ---- 账单周期（与 ledger.js 的 cycleInfo 口径一致：6 号 → 下月 5 号）----
function medCycleKeyOf(dateStr) {
  const d = medParse(dateStr);
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  const base = day >= 6 ? new Date(y, m, 1) : new Date(y, m - 1, 1);
  return `${base.getFullYear()}-${medPad(base.getMonth() + 1)}`;
}

function medCycleRange(key) {
  const [y, m] = key.split('-').map(Number);
  const start = new Date(y, m - 1, 6);
  const end = new Date(y, m, 5);            // 下月 5 号
  return { start: medYMD(start), end: medYMD(end) };
}

// 落在该周期内、且已达成并已结算的周数
function weeksSettledIn(cycleKey, ticks, today) {
  if (!cycleKey) return 0;
  const t = ticks || medTicks;
  const now = today || localDateStr();
  const r = medCycleRange(cycleKey);

  let n = 0;
  let w = weekStartOf(r.start);             // 从覆盖周期起点的那个周一开始扫
  for (let i = 0; i < 10; i++) {            // 一期最多 6 周，10 次足够
    const sd = settleDay(w);
    if (sd > r.end) break;
    if (sd >= r.start && sd <= now && isWeekComplete(w, t)) n++;
    w = medAddDays(w, 7);
  }
  return n;
}

// ---- 数据层：Supabase 优先，失败降级 localStorage（照 plans.js 的模式）----
function loadMedLocal() {
  try {
    const raw = localStorage.getItem(MED_LOCAL_KEY);
    if (raw) { const d = JSON.parse(raw); if (Array.isArray(d)) return d; }
  } catch (e) {}
  return [];
}

function saveMedLocal() {
  try {
    localStorage.setItem(MED_LOCAL_KEY, JSON.stringify([...medTicks].sort()));
  } catch (e) {}
}

async function loadMedTicks() {
  let dates = null;
  try {
    const sb = Auth.getClient();
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      const { data, error } = await sb.from('med_ticks')
        .select('tick_date').eq('user_id', user.id);
      if (error) {
        console.warn('[med] med_ticks 表不可用，降级本地缓存:', error.message);
      } else if (data) {
        dates = data.map(r => r.tick_date);
      }
    }
  } catch (e) {
    console.warn('[med] 加载失败，降级本地缓存:', e);
  }
  if (dates == null) dates = loadMedLocal();
  medTicks = new Set(dates);
  return medTicks;
}

// 勾 / 取消勾
async function toggleMedDay(dayStr) {
  if (!canTick(dayStr)) return;
  const wasOn = medTicks.has(dayStr);

  if (wasOn) medTicks.delete(dayStr); else medTicks.add(dayStr);
  saveMedLocal();
  renderMedPanel();                          // 立即反馈，不等网络

  try {
    const sb = Auth.getClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    if (wasOn) {
      await sb.from('med_ticks').delete().eq('user_id', user.id).eq('tick_date', dayStr);
    } else {
      await sb.from('med_ticks').insert({ user_id: user.id, tick_date: dayStr });
    }
  } catch (e) {
    console.warn('[med] 同步失败，已存本地:', e);
  }
}

// ---- 渲染 ----
function medWeekHTML(weekStart, opts) {
  const t = localDateStr();
  const cells = MED_DAY_LABELS.map((label, i) => {
    const day = medYMD(medAddDays(weekStart, i));
    const on = medTicks.has(day);
    const clickable = canTick(day, t);
    const isToday = day === t;
    const cls = ['med-day'];
    if (on) cls.push('med-day--on');
    if (clickable) cls.push('med-day--clickable');
    if (isToday) cls.push('med-day--today');
    const dayNum = Number(day.slice(8, 10));
    return `<button class="${cls.join(' ')}" ${clickable ? `data-med-day="${day}"` : 'disabled'}
              title="${day}${clickable ? '' : '（已锁定）'}">
              <span class="med-day__w">${label}</span>
              <span class="med-day__n">${dayNum}</span>
              <span class="med-day__mark">${on ? '✓' : ''}</span>
            </button>`;
  }).join('');

  const done = MED_DAY_LABELS.filter((_, i) =>
    medTicks.has(medYMD(medAddDays(weekStart, i)))).length;

  return `
    <div class="med-week ${opts && opts.muted ? 'med-week--muted' : ''}">
      <div class="med-week__label">${opts && opts.label || '本周'}
        <span>${done}/7</span>
      </div>
      <div class="med-days">${cells}</div>
      ${opts && opts.hint ? `<div class="med-week__hint">${opts.hint}</div>` : ''}
    </div>`;
}

function medNotesHTML() {
  const notes = [
    '漏服<b>不加量</b>，从最近耐受良好的剂量继续',
    '停服 2 周 → 减 3 级；停服 4 周 → 从最小剂量重来',
    '用药后 <b>15 分钟</b>内不喝水、不进食',
    '用药期间<b>禁止喝酒</b>，避免异常过度疲劳',
    '打疫苗：服药后隔半周，接种后隔两周再继续',
  ];
  return `
    <div class="med-notes">
      <div class="med-notes__title">📌 注意事项</div>
      <ul class="med-notes__list">${notes.map(n => `<li>${n}</li>`).join('')}</ul>
    </div>`;
}

function medPanelHTML() {
  const today = localDateStr();
  const thisMon = weekStartOf(today);
  const lastMon = medAddDays(thisMon, -7);

  // 上周若还没锁定（周一/周二），放出来让用户补打
  let lastWeekHTML = '';
  if (!isWeekLocked(lastMon, today)) {
    const missCount = MED_DAY_LABELS.filter((_, i) =>
      !medTicks.has(medYMD(medAddDays(lastMon, i)))).length;
    lastWeekHTML = medWeekHTML(lastMon, {
      muted: true,
      label: '上周',
      hint: missCount
        ? `还差 ${missCount} 天，${tickDeadline(lastMon)} 24:00 前可补`
        : '已满，等结算 ✓',
    });
  }

  const weeks = medCycleKey ? weeksSettledIn(medCycleKey, medTicks, today) : 0;
  const bonus = weeks * MED_REWARD;

  return `
    <div class="med-panel__title">💊 滴药</div>
    ${lastWeekHTML}
    ${medWeekHTML(thisMon, { label: '本周' })}
    <div class="med-summary">
      本期已达成 <b>${weeks}</b> 周 ·
      累计 <b class="med-summary__bonus">+${fmtMoney(bonus)}</b>
      <span class="med-summary__sub">存储目标 −${fmtMoney(bonus)} / 日常 +${fmtMoney(bonus)}</span>
    </div>
    ${medNotesHTML()}`;
}

function renderMedPanel() {
  const el = document.getElementById('medPanel');
  if (!el) return;
  el.innerHTML = medPanelHTML();
  el.querySelectorAll('[data-med-day]').forEach(btn => {
    btn.addEventListener('click', () => toggleMedDay(btn.dataset.medDay));
  });
}

// 暴露入口（由 ledger.js 调用）
window.renderMedPanel = renderMedPanel;
window.loadMedTicks = loadMedTicks;
window.weeksSettledIn = weeksSettledIn;
window.setMedCycleKey = (k) => { medCycleKey = k; };
