/* ============================================================
   TaskFlow - 计划模块 v2.0 — 学期 → 月 → 周 层层推进
   · 制定顺序：先学期计划 → 据此推进到本月 → 再推进到本周（⬇ 一键带入，记录来源 srcId）
   · 数据升级为「追加式」：历史多周 / 多月 / 多学期全部保留，不覆盖
     → 每张卡自带归档折叠：学期卡折叠「本学期各月」、月卡折叠「本月各周」，把 N 个周期并排看
   · 周期推进：新周/新月/新季开启时，上层（上一份周期）未完成目标自动带入，carriedTimes 计数
   · 条目编辑：✎ 改文字 / ✕ 删除 / 勾选完成
   数据：Supabase plan_data（单行 JSON）+ localStorage 兜底
   ============================================================ */
console.log('📅 Plans v2 module loaded');

// ---- 三级链路元信息（自顶向下：学期 → 月 → 周）----
const PLAN_LEVELS = [
  { type:'semester', step:'①', icon:'🎓', title:'学期计划', color:'#22c55e',
    placeholder:'先写下这学期的大目标…',
    empty:'先从学期开始：这学期最想达成什么？写下来，再推进到月。' },
  { type:'month', step:'②', icon:'🗓️', title:'月计划', color:'#f59e0b',
    placeholder:'这个月要推进的事（点上方学期条目 ⬇ 带入，或直接输入）…',
    empty:'根据学期计划点 ⬇ 带入本月，或直接添加。' },
  { type:'week', step:'③', icon:'📅', title:'周计划', color:'#4f46e5',
    placeholder:'这一周要推进的事（点上方本月条目 ⬇ 带入，或直接输入）…',
    empty:'根据月计划点 ⬇ 带入本周，或直接添加。' },
];
const CARRY_TO_LABEL = { semester:'本月', month:'本周' };   // 某层条目 ⬇ 会被带到的下一层
const SRC_LEVEL_LABEL = { semester:'学期', month:'本月', week:'本周' };

// 全局 esc（来自 script.js）若可用则复用，否则兜底
const plE = (typeof esc === 'function') ? esc
  : (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

// ---- 状态 ----
let P = null;            // { version:2, periods:{ week:[], month:[], semester:[] } }
let editingId = null;    // 正在行内编辑的条目 id

// ---- 日期 / 周期工具 ----
function plPad(n){ return String(n).padStart(2, '0'); }
function plYMD(d){ return `${d.getFullYear()}-${plPad(d.getMonth()+1)}-${plPad(d.getDate())}`; }
function plUid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function mondayOf(d){
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7;               // 0 = 周一
  x.setDate(x.getDate() - dow);
  return x;
}
const curWeekKey  = () => plYMD(mondayOf(new Date()));
const curMonthKey = () => plYMD(new Date()).slice(0, 7);
function semesterInfo(d){
  const y = d.getFullYear(), m = d.getMonth() + 1;
  if (m >= 9) return { key:`${y}-${y+1}-秋`, label:`${y}–${y+1} 秋季学期` };
  if (m <= 2) return { key:`${y-1}-${y}-秋`, label:`${y-1}–${y} 秋季学期` };
  return { key:`${y}-春`, label:`${y} 春季学期` };
}
const curSemesterKey = () => semesterInfo(new Date()).key;

// 展示标签
function monthShortLabel(key){ return `${+key.slice(5,7)}月`; }            // "2026-09" → 9月
function monthFullLabel(key){ return `${key.slice(0,4)}年${+key.slice(5,7)}月`; }
function weekShortLabel(key){                                                 // "2026-09-07" → 9月7日–9月13日
  const b = new Date(key + 'T00:00:00');
  const e = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 6);
  return `${b.getMonth()+1}月${b.getDate()}日–${e.getMonth()+1}月${e.getDate()}日`;
}
function curChipLabel(type){
  if (type === 'week')     return weekShortLabel(curWeekKey());
  if (type === 'month')    return monthFullLabel(curMonthKey());
  return semesterInfo(new Date()).label;
}
// 某月属于哪个学期（与 semesterInfo 互逆）
function monthToSemester(mk){
  const y = +mk.slice(0,4), mo = +mk.slice(5,7);
  if (mo >= 9) return `${y}-${y+1}-秋`;
  if (mo <= 2) return `${y-1}-${y}-秋`;
  return `${y}-春`;
}
// 某学期覆盖哪些月 key（秋：9-12月+次年1月；春：3-8月）
function monthKeysInSemester(semKey){
  const re = /^(\d{4})-(\d{4})-秋$/.exec(semKey);
  const out = [];
  if (re){
    const y1 = +re[1], y2 = +re[2];
    for (let mo = 9; mo <= 12; mo++) out.push(`${y1}-${plPad(mo)}`);
    out.push(`${y2}-01`);
  } else {
    const y = +semKey.slice(0, 4);
    for (let mo = 3; mo <= 8; mo++) out.push(`${y}-${plPad(mo)}`);
  }
  return out;
}

// ---- 数据模型 v2：{ version, periods:{ week:[], month:[], semester:[] } } ----
// periods 里每项 = { key, items:[{id,text,done,carriedTimes,srcId?,createdAt?}] }
// 每次只「追加」不覆盖：切周期时旧对象留在数组里，供归档/回顾。

function emptyV2(){
  return {
    version: 2,
    periods: { week: [], month: [], semester: [] },
  };
}

// v1 形状 { week:{key,items}, month:{...}, semester:{...} } → v2
function migrateV1(raw){
  const v = emptyV2();
  const toArr = o => (o && typeof o === 'object' && o.key) ? [o] : [];
  for (const type of ['week', 'month', 'semester']){
    v.periods[type] = toArr(raw[type]).map(p => ({
      key: p.key,
      items: (p.items || []).map(it => it.carried
        ? { id:it.id, text:it.text, done:!!it.done, carriedTimes:1, srcId:it.srcId || undefined }
        : { id:it.id, text:it.text, done:!!it.done, carriedTimes:it.carriedTimes || 0, srcId:it.srcId || undefined }),
    }));
  }
  return v;
}

function normalize(raw){
  if (raw && raw.version === 2 && raw.periods){
    for (const type of ['week','month','semester'])
      if (!Array.isArray(raw.periods[type])) raw.periods[type] = [];
    return raw;
  }
  if (raw && raw.week && typeof raw.week === 'object') return migrateV1(raw);
  return emptyV2();
}

// 查找某周期的对象
function findPeriod(type, key){
  const arr = P.periods[type] || (P.periods[type] = []);
  return arr.find(p => p.key === key) || null;
}
// 当前周期对象，没有就建一个（只建这一次，避免重复带入）
function curPeriod(type){
  const key = type === 'week' ? curWeekKey() : type === 'month' ? curMonthKey() : curSemesterKey();
  let p = findPeriod(type, key);
  if (p) return p;
  // 新周期开启：自动把上一份「未完成」带入（懒人友好），只发生一次
  const arr = P.periods[type];
  const prev = [...arr].reverse().find(x => x.items && x.items.length > 0);
  const carried = prev ? prev.items
    .filter(i => !i.done)
    .map(i => ({ id:plUid(), text:i.text, done:false,
                 carriedTimes:(i.carriedTimes || 0) + 1, srcId:i.srcId || undefined }))
    : [];
  p = { key, items: carried };
  arr.push(p);
  return p;
}

// ---- 数据读写 ----
async function loadPlans(){
  try {
    const sb = Auth.getClient();
    const { data: { user } } = await sb.auth.getUser();
    let raw = null;
    if (user){
      const { data, error } = await sb.from('plan_data')
        .select('data').eq('user_id', user.id).maybeSingle();
      if (error) console.warn('plan_data 表不可用，降级本地缓存:', error.message);
      if (data && data.data) raw = data.data;
    }
    P = normalize(raw == null ? loadPlansLocal() : raw);
    const created = touchCurrent();
    if (created) savePlansSilent(); else savePlansLocal(P);   // 新周期要落盘，避免每次重开重复种入
    return P;
  } catch (e) {
    console.error('loadPlans 异常，降级本地:', e);
    P = normalize(loadPlansLocal());
    touchCurrent();
    return P;
  }
}

// 确保三个「当前周期」对象都在内存（必要时创建/带入）。返回是否发生过新建
function touchCurrent(){
  const types = PLAN_LEVELS.map(l => l.type);
  let created = false;
  for (const t of types){ const before = P.periods[t].length; curPeriod(t); if (P.periods[t].length > before) created = true; }
  return created;
}

function loadPlansLocal(){
  try {
    const raw = localStorage.getItem('taskflow_plans');
    if (raw){ const d = JSON.parse(raw); if (d && (d.version === 2 ? d.periods : d.week)) return d; }
  } catch (e) {}
  return null;
}
function savePlansLocal(){ try { localStorage.setItem('taskflow_plans', JSON.stringify(P)); } catch (e) {} }

async function savePlans(){
  savePlansLocal();
  try {
    const sb = Auth.getClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    await sb.from('plan_data').upsert({
      user_id: user.id, data: P, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch (e) { console.error('Supabase 保存失败，已存本地:', e); }
}
function savePlansSilent(){ void savePlans(); }

// ---- 查找与来源 ----
function findItemGlobal(id){
  for (const l of PLAN_LEVELS){
    const arr = P.periods[l.type] || [];
    for (const per of arr){
      const it = (per.items || []).find(x => x.id === id);
      if (it) return { level:l.type, period:per, item:it };
    }
  }
  return null;
}
function srcOf(srcId){
  const f = srcId && findItemGlobal(srcId);
  if (!f) return null;
  return { levelLabel: SRC_LEVEL_LABEL[f.level] || '上层', text: f.item.text };
}

// ---- 渲染：三张链路卡 自上而下 学期 → 本月 → 本周 ----
function statOf(items){
  const done = items.filter(i => i.done).length;
  return { total: items.length, done, pct: items.length ? Math.round(done / items.length * 100) : 0 };
}

async function renderPlansView(){
  const el = document.getElementById('plansContent');
  if (!el) return;
  if (!P) { P = await loadPlans(); }
  renderUI(el);
}

// 交互后重绘（计划页不在前台时静默跳过）
function repaint(){
  const el = document.getElementById('plansContent');
  if (el) renderUI(el);
}

function renderUI(el){
  el.innerHTML =
      '<p class="plan-chain-hint">制定顺序：先定学期计划 → 推进到本月 → 再推进到本周。目标右侧 <b>⬇</b> 一键带进下一层。</p>'
    + PLAN_LEVELS.map(l => cardHTML(l)).join('');
  bindPlanEvents(el);
}

function cardHTML(meta){
  const type = meta.type;
  const period = curPeriod(type);
  const items = period.items || (period.items = []);
  const { total, done, pct } = statOf(items);
  const isBottom = type === 'week';
  const rows = items.map(it => itemRowHTML(type, it)).join('');
  const empty = items.length ? '' : `<p class="plan-empty">${meta.empty}</p>`;
  const archive = type === 'semester' ? archiveHTML('month')
                 : type === 'month'   ? archiveHTML('week') : '';

  return `
    <section class="plan-section" style="--plan-color:${meta.color}">
      <div class="plan-section__head">
        <span class="plan-section__title">
          <span class="plan-section__step">${meta.step}</span>
          <span class="plan-section__icon">${meta.icon}</span>${meta.title}
        </span>
        <span class="plan-section__period">${curChipLabel(type)}</span>
      </div>
      <div class="plan-section__progress">
        <div class="plan-section__bar"><div class="plan-section__fill" style="width:${pct}%"></div></div>
        <span class="plan-section__stat">${done}/${total}${total && done === total ? ' · 🎉 全完成' : ''}</span>
      </div>
      <div class="plan-list">${rows}${empty}</div>
      <div class="plan-add">
        <input type="text" class="plan-add__input" data-add="${type}" placeholder="${meta.placeholder}" maxlength="200">
        <button class="btn btn--primary btn--sm plan-add__btn" data-addbtn="${type}">＋ 添加</button>
      </div>
      ${archive}
    </section>`;
}

// 单条条目行（可交互）
function itemRowHTML(type, item){
  const canCarryDown = type !== 'week' && !item.done;
  const carryTo = type !== 'week' ? CARRY_TO_LABEL[type] : '';
  const bodyText = editingId === item.id
    ? `<input class="plan-item__edit" data-editinput="${item.id}" value="${plE(item.text)}" maxlength="200">`
    : `<span class="plan-item__text">${plE(item.text)}</span>`;

  return `
    <div class="plan-item ${item.done ? 'plan-item--done' : ''}" id="pitem-${item.id}">
      <label class="plan-item__checkwrap">
        <input type="checkbox" class="plan-item__cb" data-toggle="${item.id}" ${item.done ? 'checked' : ''}>
        <span class="plan-item__check"></span>
      </label>
      <div class="plan-item__body">
        ${bodyText}
        ${metaChips(item)}
      </div>
      <div class="plan-item__acts">
        ${canCarryDown ? `<button class="plan-item__act plan-item__act--down" data-down="${item.id}" title="带到${carryTo}">⬇</button>` : ''}
        <button class="plan-item__act plan-item__act--edit" data-edit="${item.id}" title="编辑文字">✎</button>
        <button class="plan-item__act plan-item__act--del" data-del="${item.id}" title="删除">✕</button>
      </div>
    </div>`;
}

// 行内小标签：带入次数 / 来源
function metaChips(item){
  let h = '';
  if (item.carriedTimes) h += `<span class="plan-chip plan-chip--carried">↩ 带入 ${item.carriedTimes} 次</span>`;
  const src = srcOf(item.srcId);
  if (src){
    const shown = src.text.length > 9 ? src.text.slice(0, 9) + '…' : src.text;
    h += `<span class="plan-chip plan-chip--src" title="${plE(src.text)}">↗ ${src.levelLabel}：${plE(shown)}</span>`;
  }
  return h ? `<span class="plan-item__meta">${h}</span>` : '';
}

// ---- 聚合归档：学期卡下放本学期各月 / 月卡下放本月各周（只读并排）----
function archiveHTML(childType){
  const isMonthArchive = childType === 'month';
  const semKey = curSemesterKey();
  const curMonth = curMonthKey();
  const curWeek = curWeekKey();
  const periods = [];
  const wanted = isMonthArchive ? monthKeysInSemester(semKey) : null;

  for (const per of P.periods[childType] || []){
    if (!per.items || !per.items.length) continue;
    if (isMonthArchive){
      if (per.key === curMonth) continue;            // 本月就是主卡
      if (!wanted.includes(per.key)) continue;       // 只归组当前学期内的月
      periods.push(per);
    } else {
      if (per.key === curWeek) continue;             // 本周就是主卡
      if (!per.key.startsWith(curMonth)) continue;   // 只归组本月内的周
      periods.push(per);
    }
  }

  const title = isMonthArchive
    ? `🗂 本学期 · 各月归档 (${periods.length})`
    : `🗂 本月 · 各周归档 (${periods.length})`;
  const emptyMsg = isMonthArchive
    ? '还没有更早月份的记录——往后每开一个月，就会自动归档到这里。'
    : '这个月还没有更早周的计划——往后每开一周，就会自动归档到这里。';

  const inner = periods.length
    ? periods.map(per => archivePeriodCard(childType, per)).join('')
    : `<p class="plan-empty">${emptyMsg}</p>`;

  return `
    <details class="plan-archive" ${periods.length ? '' : 'open'}>
      <summary>${title}</summary>
      <div class="plan-archive__body">${inner}</div>
    </details>`;
}

function archivePeriodCard(type, per){
  const { total, done, pct } = statOf(per.items);
  const label = type === 'month' ? monthFullLabel(per.key) : weekShortLabel(per.key);
  const color = PLAN_LEVELS.find(l => l.type === type).color;
  const rows = per.items.map(it => archiveItemHTML(it)).join('');
  return `
    <div class="plan-arch-card" style="--plan-color:${color}">
      <div class="plan-arch-card__head">
        <span class="plan-arch-card__label">${type === 'month' ? '🗓️' : '📅'} ${label}</span>
        <span class="plan-arch-card__stat">${done}/${total}</span>
      </div>
      <div class="plan-section__bar plan-arch-card__bar"><div class="plan-section__fill" style="width:${pct}%"></div></div>
      <div class="plan-list">${rows}</div>
    </div>`;
}

// 归档里的只读条目（禁用勾选）
function archiveItemHTML(item){
  return `
    <div class="plan-item plan-item--ro ${item.done ? 'plan-item--done' : ''}">
      <label class="plan-item__checkwrap">
        <input type="checkbox" class="plan-item__cb" disabled ${item.done ? 'checked' : ''}>
        <span class="plan-item__check"></span>
      </label>
      <div class="plan-item__body">
        <span class="plan-item__text">${plE(item.text)}</span>
        ${metaChips(item)}
      </div>
    </div>`;
}

// ---- 事件绑定 ----
function bindPlanEvents(el){
  el.querySelectorAll('.plan-add__input').forEach(inp => {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') addPlan(inp.dataset.add); });
  });
  el.querySelectorAll('.plan-add__btn').forEach(btn => {
    btn.addEventListener('click', () => addPlan(btn.dataset.addbtn));
  });
  el.querySelectorAll('.plan-item__cb:not(:disabled)').forEach(cb => {
    cb.addEventListener('change', () => togglePlan(cb.dataset.toggle, cb.checked));
  });
  el.querySelectorAll('.plan-item__act--down').forEach(b =>
    b.addEventListener('click', () => carryDown(b.dataset.down)));
  el.querySelectorAll('.plan-item__act--edit').forEach(b =>
    b.addEventListener('click', () => { editingId = b.dataset.edit; renderUI(el); }));
  el.querySelectorAll('.plan-item__act--del').forEach(b =>
    b.addEventListener('click', () => deletePlan(b.dataset.del)));
  el.querySelectorAll('.plan-item__edit').forEach(inp => {
    inp.focus();
    const id = inp.dataset.editinput;
    let done = false;
    const commit = () => { if (done) return; done = true; saveEdit(id, inp.value); };
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter'){ done = true; saveEdit(id, inp.value); }
      else if (e.key === 'Escape'){ done = true; editingId = null; renderUI(el); }
    });
    inp.addEventListener('blur', commit);
  });
}

function notify(msg){
  let t = document.getElementById('planToast');
  if (!t){
    t = document.createElement('div');
    t.id = 'planToast';
    t.className = 'plan-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ---- 增删改 & 推进 ----
function addPlan(type){
  const inp = document.querySelector(`.plan-add__input[data-add="${type}"]`);
  const text = (inp && inp.value || '').trim();
  if (!text){ inp && inp.focus(); return; }
  const period = curPeriod(type);
  period.items.push({ id:plUid(), text, done:false, carriedTimes:0 });
  inp.value = '';
  savePlansSilent();
  repaint();
}

function togglePlan(id, done){
  const f = findItemGlobal(id);
  if (!f) return;
  f.item.done = done;
  savePlansSilent();
  repaint();
}

function deletePlan(id){
  const f = findItemGlobal(id);
  if (!f) return;
  f.period.items = f.period.items.filter(x => x.id !== id);
  savePlansSilent();
  repaint();
}

function saveEdit(id, value){
  const text = String(value == null ? '' : value).trim();
  const f = findItemGlobal(id);
  editingId = null;
  if (f && text){ f.item.text = text; savePlansSilent(); }
  repaint();
}

// 把某条目标 ⬇ 带到下一层（学期→本月→本周），记录 srcId 来源
function carryDown(srcId){
  const f = srcId && findItemGlobal(srcId);
  if (!f || f.item.done) return;
  const targetType = f.level === 'semester' ? 'month' : f.level === 'month' ? 'week' : null;
  if (!targetType) return;
  const target = curPeriod(targetType);
  // 目标层已有同文字未完成项 → 跳过防重复
  const dup = target.items.some(x => !x.done && x.text === f.item.text);
  if (dup){ notify('「' + f.item.text + '」已经在 ' + (targetType === 'month' ? '本月' : '本周') + ' 里了'); return; }
  target.items.push({ id:plUid(), text:f.item.text, done:false, carriedTimes:0, srcId });
  savePlansSilent();
  notify('已带到' + CARRY_TO_LABEL[f.level] + ' ✓');
  repaint();
}

// 暴露入口（由 script.js 调用）
window.renderPlansView = renderPlansView;
