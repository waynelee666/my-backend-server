/* ============================================================
   TaskFlow - 记账模块  v1.1 — 每期总预算2000 + 购物 + 储蓄
   规则（每期生活费 2000）：
     · 账单周期：每月 6 号 → 下月 5 号
     · 每期总金额 2000 元，日常 / 购物 / 储蓄 都从 2000 里减
     · 日常：每天 40 元，本期「应发 = 40 × 本期第几天」
     · 今天可用 = 应发 − 本期日常已花（没花完自动滚存到下一天）
     · 购物：每期 400 元
     · 储蓄：每期目标 400 元
   新增（v1.1）：
     · 每期总金额 2000 + 剩余总览
     · 历史周期切换（上一期 / 下一期）
     · 编辑已记流水（金额/分类/日期/备注）
     · 编辑购物清单项（名称/预估金额）
   新增（v2.0 · 跨期继承）：
     · 起本期开始，结余跨期继承（之前的历史期数字不变）
     · 购物剩余：十位个位 → 下期购物；百位 → 下期存储基数
     · 日常剩余 / 存储剩余 → 下期存储基数
     · 下期存储目标 = 继承基数 + 400
     · 购物超支（剩余为负）→ 从下期购物额度扣
     · 滴药奖金：某周 7 格全勾 → 本期存储目标 −30、日常额度 +30
       （结算与归属逻辑见 med.js）
   ============================================================ */
console.log('💰 Ledger module loaded');

// ---- 预算常量 ----
const LEDGER = {
  TOTAL: 2000,     // 每期总金额（元）—— 启用继承后由 carryFor 动态算
  DAILY: 40,       // 每天日常额度（元）
  SHOPPING: 400,   // 每期购物额度基数（元）
  SAVING: 400,     // 每期储蓄目标基数（元）
};

// 跨期继承的启用起点（周期键 'YYYY-MM'，指该月 6 号开始那一期）。
// ⚠ 这是冻结的常量，不会随时间滑动 —— 前面的历史期不带继承，数字保持不变。
const CARRY_START = '2026-09';

// ---- 分类定义 ----
const LEDGER_CATS = {
  daily:    { label: '日常', icon: '🍚', color: '#4f46e5' },
  shopping: { label: '购物', icon: '🛒', color: '#f59e0b' },
  saving:   { label: '存钱', icon: '💰', color: '#22c55e' },
};

// ---- 内存状态 ----
let ledgerEntries = [];        // 全部流水
let ledgerShopping = [];       // 购物清单
let ledgerCategory = 'daily';  // 当前选中的记账分类
let ledgerCycleOffset = 0;     // 0=本期，-1=上期，-2=上上期...
let ledgerEditId = null;       // 正在编辑的流水 id
let ledgerEditCategory = 'daily'; // 编辑弹窗里选中的分类
let ledgerShoppingEditId = null;  // 正在编辑的购物项 id

// ---- 工具 ----
function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtMoney(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const body = Number.isInteger(abs) ? String(abs) : abs.toFixed(2);
  return (v < 0 ? '-¥' : '¥') + body;
}

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---- 数据读写 ----
async function loadLedger() {
  try {
    const sb = Auth.getClient();
    const { data, error } = await sb.from('ledger_entries')
      .select('*')
      .order('spent_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('[ledger] ledger_entries 表可能不存在:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn('[ledger] 加载失败:', e);
    return [];
  }
}

async function loadShopping() {
  try {
    const sb = Auth.getClient();
    const { data, error } = await sb.from('ledger_shopping_items')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('[ledger] ledger_shopping_items 表可能不存在:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn('[ledger] 购物清单加载失败:', e);
    return [];
  }
}

// ---- 账单周期：每月 6 号开始，到下月 5 号结束 ----
// offset: 0=本期，-1=上期，以此类推
function cycleInfo(offset = 0) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();      // 0-based
  const d = now.getDate();

  // 本期起点：6 号及以后从本月 6 号开始；1~5 号从上月 6 号开始
  const curStart = new Date(y, d >= 6 ? m : m - 1, 6);
  const start = new Date(curStart.getFullYear(), curStart.getMonth() + offset, 6);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 5);  // 下月 5 号

  const todayStart = new Date(y, m, d);
  const dayInCycle = Math.round((todayStart - start) / 86400000) + 1;  // 今天在本期第几天
  const fullDays = Math.round((end - start) / 86400000) + 1;           // 本期总天数

  return {
    start: localDateStr(start),
    end: localDateStr(end),
    label: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
    dayInCycle,
    fullDays,
    isCurrent: offset === 0,
  };
}

// ---- 额度计算 ----
// carry: carryFor() 的结果（{shoppingBudget, savingTarget, dailyBonus, weeks}）；
//        传 null 则退回旧规则（固定 400/400/无奖金），用于启用继承之前的历史期。
function calcStats(entries, offset = 0, carry = null) {
  const today = localDateStr();
  const cyc = cycleInfo(offset);

  const shoppingBudget = carry ? carry.shoppingBudget : LEDGER.SHOPPING;
  const savingTarget   = carry ? carry.savingTarget   : LEDGER.SAVING;
  const dailyBonus     = carry ? carry.dailyBonus     : 0;

  const inCycle = entries.filter(e => {
    const d = e.spent_date || '';
    return d >= cyc.start && d <= cyc.end;
  });

  const sumBy = cat => inCycle
    .filter(e => e.category === cat)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const dailySpent = sumBy('daily');
  const shoppingSpent = sumBy('shopping');
  const savingDone = sumBy('saving');
  const totalUsed = dailySpent + shoppingSpent + savingDone;

  // 本期总额 = 日常整期额度(含奖金) + 购物额度 + 存储目标
  const dailyTotal = LEDGER.DAILY * cyc.fullDays + dailyBonus;
  const totalBudget = dailyTotal + shoppingBudget + savingTarget;

  const s = {
    today,
    cycleStart: cyc.start,
    cycleEnd: cyc.end,
    cycleLabel: cyc.label,
    dayInCycle: cyc.dayInCycle,
    fullDays: cyc.fullDays,
    isCurrent: cyc.isCurrent,
    dailySpent,
    shoppingSpent,
    shoppingBudget,
    shoppingLeft: shoppingBudget - shoppingSpent,
    savingDone,
    savingTarget,
    savingLeft: savingTarget - savingDone,
    dailyBonus,
    dailyTotal,
    weeksAchieved: carry ? carry.weeks : 0,
    isCarry: !!(carry && carry.isCarry),
    totalBudget,
    totalUsed,
    totalLeft: totalBudget - totalUsed,
  };

  if (cyc.isCurrent) {
    s.dailyIssued = LEDGER.DAILY * cyc.dayInCycle + dailyBonus;  // 本期累计应发
    s.todayAvailable = s.dailyIssued - dailySpent;               // 今日可用（滚存）
  } else {
    s.dailyIssued = dailyTotal;                                  // 往期按整期天数计应发
    s.todayAvailable = null;                                     // 往期无「今日可用」
  }
  return s;
}

// ---- 跨期继承：从 CARRY_START 逐期推演到目标期 ----
function nextCycleKey(key) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m, 1);                 // m 是 1-based，这里正好落到下月 1 号
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function cycleRangeOf(key) {
  const [y, m] = key.split('-').map(Number);
  const start = new Date(y, m - 1, 6);
  const end = new Date(y, m, 5);               // 下月 5 号
  return {
    start: localDateStr(start),
    end: localDateStr(end),
    fullDays: Math.round((end - start) / 86400000) + 1,
  };
}

function carryFor(targetKey) {
  // 目标期在启用起点之前 → 走旧规则，历史数字保持不变
  if (!targetKey || targetKey < CARRY_START) {
    return { shoppingBudget: LEDGER.SHOPPING, savingTarget: LEDGER.SAVING,
             dailyBonus: 0, weeks: 0, isCarry: false };
  }

  const carry = { shoppingAdd: 0, savingBase: 0 };   // 购物增量 + 存储继承基数
  let k = CARRY_START;

  for (let guard = 0; guard < 240; guard++) {
    const r = cycleRangeOf(k);
    const sumBy = cat => ledgerEntries
      .filter(e => {
        const d = e.spent_date || '';
        return d >= r.start && d <= r.end && e.category === cat;
      })
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const dailySpent = sumBy('daily');
    const shoppingSpent = sumBy('shopping');
    const savingDone = sumBy('saving');

    const weeks = (typeof weeksSettledIn === 'function')
      ? weeksSettledIn(k, medTicks, localDateStr()) : 0;

    const shoppingBudget = LEDGER.SHOPPING + carry.shoppingAdd;
    const savingTarget = carry.savingBase + LEDGER.SAVING - 30 * weeks;
    const dailyBonus = 30 * weeks;

    // 到达目标期就返回（目标期还没结束，不需要算它的结余）
    if (k === targetKey) {
      return { shoppingBudget, savingTarget, dailyBonus, weeks, isCarry: true };
    }

    // 用本期的结余推下一期
    const shopLeft = shoppingBudget - shoppingSpent;
    const dailyLeft = (LEDGER.DAILY * r.fullDays + dailyBonus) - dailySpent;
    const savingLeft = savingTarget - savingDone;

    if (shopLeft >= 0) {
      carry.shoppingAdd = shopLeft % 100;
      carry.savingBase = savingLeft + dailyLeft + Math.floor(shopLeft / 100) * 100;
    } else {
      // 超支：不继承，欠的钱从下期购物额度扣
      carry.shoppingAdd = shopLeft;
      carry.savingBase = savingLeft + dailyLeft;
    }

    const next = nextCycleKey(k);
    if (next <= k) break;                             // 防御：不可能发生
    k = next;
  }

  // 兜底：理论上到不了这里
  return { shoppingBudget: LEDGER.SHOPPING, savingTarget: LEDGER.SAVING,
           dailyBonus: 0, weeks: 0, isCarry: true };
}

// ---- 渲染 ----
async function renderLedgerView() {
  const [entries, shopping] = await Promise.all([loadLedger(), loadShopping()]);
  ledgerEntries = entries;
  ledgerShopping = shopping;

  // 滴药记录要先就位 —— 跨期继承里的「达成周数」依赖它
  if (typeof loadMedTicks === 'function') await loadMedTicks();

  const cyc = cycleInfo(ledgerCycleOffset);
  const carry = carryFor(cyc.label);
  if (typeof setMedCycleKey === 'function') setMedCycleKey(cyc.label);

  const s = calcStats(ledgerEntries, ledgerCycleOffset, carry);
  const el = document.getElementById('ledgerContent');
  if (!el) return;

  const cycleItems = ledgerEntries.filter(e => {
    const d = e.spent_date || '';
    return d >= s.cycleStart && d <= s.cycleEnd;
  });
  const defaultDate = s.isCurrent ? s.today : s.cycleEnd;

  // 总览：每期总金额（含继承与奖金）+ 剩余
  const usedPct = Math.min(100, Math.max(0, Math.round(s.totalUsed / s.totalBudget * 100)));
  const leftNeg = s.totalLeft < 0 ? 'ledger-total__cell-num--neg' : '';
  const carryLine = s.isCarry
    ? `<div class="ledger-total__carry">本期含继承 · 购物预算 ${fmtMoney(s.shoppingBudget)} · 存储目标 ${fmtMoney(s.savingTarget)}${
        s.dailyBonus ? ` · 滴药奖金 +${fmtMoney(s.dailyBonus)}` : ''
      }</div>`
    : '';
  const totalHTML = `
    <div class="ledger-total">
      <div class="ledger-total__stats">
        <div class="ledger-total__cell">
          <span class="ledger-total__cell-label">每期总金额</span>
          <span class="ledger-total__cell-num">${fmtMoney(s.totalBudget)}</span>
        </div>
        <div class="ledger-total__cell ledger-total__cell--left">
          <span class="ledger-total__cell-label">剩余</span>
          <span class="ledger-total__cell-num ${leftNeg}">${fmtMoney(s.totalLeft)}</span>
        </div>
      </div>
      <div class="ledger-total__bar"><div class="ledger-total__fill" style="width:${usedPct}%"></div></div>
      <div class="ledger-total__meta">已用 ${fmtMoney(s.totalUsed)} = 日常 ${fmtMoney(s.dailySpent)} + 购物 ${fmtMoney(s.shoppingSpent)} + 储蓄 ${fmtMoney(s.savingDone)}</div>
      ${carryLine}
    </div>`;

  // 周期切换
  const cycleNavHTML = `
    <div class="ledger-cycle-nav">
      <button class="ledger-cycle-nav__btn" id="ledgerPrev">‹ 上一期</button>
      <span class="ledger-cycle-nav__label">${s.cycleLabel} 期${s.isCurrent ? ' · 本期' : ''}</span>
      <button class="ledger-cycle-nav__btn" id="ledgerNext" ${s.isCurrent ? 'disabled' : ''}>下一期 ›</button>
    </div>`;

  // 三张分类卡（主卡随本期/往期变化）
  const mainStat = s.isCurrent ? `
    <div class="ledger-stat ledger-stat--main">
      <span class="ledger-stat__label">🍚 今日可用（日常）</span>
      <span class="ledger-stat__num ${s.todayAvailable < 0 ? 'ledger-stat__num--neg' : ''}">${fmtMoney(s.todayAvailable)}</span>
      <span class="ledger-stat__sub">本期第 ${s.dayInCycle} 天 · 应发 ${fmtMoney(s.dailyIssued)} · 已花 ${fmtMoney(s.dailySpent)}</span>
      <span class="ledger-stat__hint">${s.dailyBonus
        ? `含滴药奖金 +${fmtMoney(s.dailyBonus)}（达成 ${s.weeksAchieved} 周）`
        : '每月 6 号开始 · 没花完自动滚存'}</span>
    </div>` : `
    <div class="ledger-stat ledger-stat--main">
      <span class="ledger-stat__label">🍚 日常已花（往期）</span>
      <span class="ledger-stat__num">${fmtMoney(s.dailySpent)}</span>
      <span class="ledger-stat__sub">本期共 ${s.fullDays} 天 · 应发 ${fmtMoney(s.dailyIssued)}</span>
      <span class="ledger-stat__hint">历史账单</span>
    </div>`;

  el.innerHTML = `
    ${totalHTML}
    ${cycleNavHTML}

    <div class="ledger-stats">
      ${mainStat}
      <div class="ledger-stat">
        <span class="ledger-stat__label">🛒 本期购物</span>
        <span class="ledger-stat__num">${fmtMoney(s.shoppingLeft)}</span>
        <span class="ledger-stat__sub">剩余 / 预算 ${fmtMoney(s.shoppingBudget)}</span>
      </div>
      <div class="ledger-stat">
        <span class="ledger-stat__label">💰 本期储蓄</span>
        <span class="ledger-stat__num">${fmtMoney(s.savingDone)}</span>
        <span class="ledger-stat__sub">已存 / 目标 ${fmtMoney(s.savingTarget)}</span>
      </div>
    </div>

    <div class="ledger-shopping">
      <div class="ledger-shopping__header">
        <span class="ledger-shopping__title">🛒 购物清单</span>
        <button class="ledger-shopping__clear" id="shoppingClearDone">清空已买</button>
      </div>
      <div class="ledger-shopping__add">
        <input type="text" class="ledger-shopping__input" id="shoppingInput" placeholder="要买什么..." maxlength="100">
        <input type="number" class="ledger-shopping__amount" id="shoppingAmount" placeholder="预估金额" min="0" step="0.01" inputmode="decimal">
        <button class="btn btn--primary btn--sm" id="shoppingAddBtn">＋ 添加</button>
      </div>
      <div class="ledger-shopping__list" id="shoppingList">
        ${renderShoppingHTML()}
      </div>
    </div>

    <div class="ledger-entry-form">
      <input type="number" class="ledger-amount" id="ledgerAmount" placeholder="金额" min="0" step="0.01" inputmode="decimal">
      <div class="ledger-cats" id="ledgerCats">
        ${Object.entries(LEDGER_CATS).map(([k, c]) => `
          <button class="ledger-cat ${k === ledgerCategory ? 'ledger-cat--active' : ''}" data-cat="${k}" style="--cat-color:${c.color}">
            ${c.icon} ${c.label}
          </button>`).join('')}
      </div>
      <input type="date" class="ledger-date" id="ledgerDate" value="${defaultDate}">
      <input type="text" class="ledger-note" id="ledgerNote" placeholder="备注（可选）" maxlength="100">
      <button class="btn btn--primary ledger-add-btn" id="ledgerAddBtn">＋ 记一笔</button>
    </div>

    <div class="ledger-list">
      ${renderEntryList(cycleItems)}
    </div>
  `;

  bindLedgerEvents();

  // 右侧滴药面板（med.js）
  if (typeof renderMedPanel === 'function') renderMedPanel();
}

function renderEntryList(items) {
  if (!items.length) return '<p class="empty-text">本期还没有记账，记第一笔吧 💰</p>';
  return items.map(e => {
    const c = LEDGER_CATS[e.category] || { icon: '💵', label: e.category || '其他' };
    const isSaving = e.category === 'saving';
    const sign = isSaving ? '+' : '−';
    const amount = (Number(e.amount) || 0).toFixed(2);
    return `
      <div class="ledger-item" data-id="${e.id}">
        <span class="ledger-item__icon">${c.icon}</span>
        <div class="ledger-item__info">
          <span class="ledger-item__cat">${c.label}</span>
          ${e.note ? `<span class="ledger-item__note">${esc(e.note)}</span>` : ''}
          <span class="ledger-item__date">${e.spent_date || ''}</span>
        </div>
        <span class="ledger-item__amount ${isSaving ? 'ledger-item__amount--saving' : ''}">${sign}${amount}</span>
        <button class="ledger-item__edit" data-edit="${e.id}" title="编辑">✎</button>
        <button class="ledger-item__del" data-del="${e.id}" title="删除">✕</button>
      </div>`;
  }).join('');
}

// ---- 购物清单渲染 ----
function renderShoppingHTML() {
  const pending = ledgerShopping.filter(i => !i.done);
  const done = ledgerShopping.filter(i => i.done);
  const pendingTotal = pending.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const itemHTML = item => {
    if (ledgerShoppingEditId === item.id) {
      return `
        <div class="shopping-item shopping-item--editing" data-id="${item.id}">
          <input type="text" class="shopping-item__editname" id="shoppingEditName" value="${escAttr(item.name)}" maxlength="100" placeholder="名称">
          <input type="number" class="shopping-item__editamount" id="shoppingEditAmount" value="${item.amount || ''}" min="0" step="0.01" inputmode="decimal" placeholder="金额">
          <button class="shopping-item__save" data-shopping-save="${item.id}" title="保存">✓</button>
          <button class="shopping-item__cancel" data-shopping-cancel="${item.id}" title="取消">✕</button>
        </div>`;
    }
    return `
      <div class="shopping-item ${item.done ? 'shopping-item--done' : ''}" data-id="${item.id}">
        <label class="shopping-item__checkwrap">
          <input type="checkbox" ${item.done ? 'checked' : ''} class="shopping-item__cb" data-toggle="${item.id}">
          <span class="shopping-item__check"></span>
        </label>
        <span class="shopping-item__name">${esc(item.name)}</span>
        ${item.amount ? `<span class="shopping-item__amount">${fmtMoney(item.amount)}</span>` : ''}
        <button class="shopping-item__edit" data-shopping-edit="${item.id}" title="编辑">✎</button>
        <button class="shopping-item__del" data-shopping-del="${item.id}" title="删除">✕</button>
      </div>`;
  };

  if (!ledgerShopping.length) return '<p class="empty-text">清单还是空的，添加要买的东西吧 🛒</p>';

  let html = '';
  if (pending.length) html += `<div class="shopping-group__label">待买${pendingTotal > 0 ? ` · 预估合计 ${fmtMoney(pendingTotal)}` : ''}</div>` + pending.map(itemHTML).join('');
  if (done.length) html += '<div class="shopping-group__label">已买</div>' + done.map(itemHTML).join('');
  return html;
}

// ---- 事件 ----
function bindLedgerEvents() {
  // 周期切换
  const prevBtn = document.getElementById('ledgerPrev');
  const nextBtn = document.getElementById('ledgerNext');
  if (prevBtn) prevBtn.addEventListener('click', () => {
    ledgerCycleOffset -= 1;
    renderLedgerView();
  });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    if (!nextBtn.disabled) {
      ledgerCycleOffset += 1;
      renderLedgerView();
    }
  });

  document.querySelectorAll('.ledger-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      ledgerCategory = btn.dataset.cat;
      document.querySelectorAll('.ledger-cat').forEach(b => b.classList.remove('ledger-cat--active'));
      btn.classList.add('ledger-cat--active');
    });
  });

  const addBtn = document.getElementById('ledgerAddBtn');
  if (addBtn) addBtn.addEventListener('click', addLedgerEntry);

  const amountInput = document.getElementById('ledgerAmount');
  if (amountInput) amountInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') addLedgerEntry();
  });

  // 编辑 / 删除流水
  document.querySelectorAll('.ledger-item__edit').forEach(btn => {
    btn.addEventListener('click', () => openLedgerEdit(btn.dataset.edit));
  });
  document.querySelectorAll('.ledger-item__del').forEach(btn => {
    btn.addEventListener('click', () => deleteLedgerEntry(btn.dataset.del));
  });

  // 购物清单
  const shopAdd = document.getElementById('shoppingAddBtn');
  const shopInput = document.getElementById('shoppingInput');
  if (shopAdd) shopAdd.addEventListener('click', addShoppingItem);
  if (shopInput) shopInput.addEventListener('keydown', e => { if (e.key === 'Enter') addShoppingItem(); });

  document.querySelectorAll('.shopping-item__cb').forEach(cb => {
    cb.addEventListener('change', () => toggleShoppingItem(cb.dataset.toggle, cb.checked));
  });
  document.querySelectorAll('.shopping-item__del').forEach(btn => {
    btn.addEventListener('click', () => deleteShoppingItem(btn.dataset.shoppingDel));
  });
  document.querySelectorAll('.shopping-item__edit').forEach(btn => {
    btn.addEventListener('click', () => editShoppingItem(btn.dataset.shoppingEdit));
  });
  document.querySelectorAll('.shopping-item__save').forEach(btn => {
    btn.addEventListener('click', () => saveShoppingItem(btn.dataset.shoppingSave));
  });
  document.querySelectorAll('.shopping-item__cancel').forEach(btn => {
    btn.addEventListener('click', cancelShoppingItem);
  });
  const clearDone = document.getElementById('shoppingClearDone');
  if (clearDone) clearDone.addEventListener('click', clearDoneShopping);
}

// ---- 流水操作 ----
async function addLedgerEntry() {
  const amountInput = document.getElementById('ledgerAmount');
  const dateInput = document.getElementById('ledgerDate');
  const noteInput = document.getElementById('ledgerNote');

  const amount = parseFloat(amountInput.value);
  if (!amount || amount <= 0) {
    showToast('请输入正确的金额', 'error');
    amountInput.focus();
    return;
  }

  const row = {
    amount,
    category: ledgerCategory,
    note: (noteInput.value || '').trim(),
    spent_date: dateInput.value || localDateStr(),
  };

  try {
    await DS.create('ledger_entries', row);
    showToast(`已记 ${LEDGER_CATS[ledgerCategory].label} ${fmtMoney(amount)}`, 'success');
    await renderLedgerView();
  } catch (e) {
    console.error('[ledger] 保存失败:', e);
    showToast('保存失败，请确认已在 Supabase 建表', 'error');
  }
}

async function deleteLedgerEntry(id) {
  try {
    await DS.remove('ledger_entries', id);
    showToast('已删除', 'success');
    await renderLedgerView();
  } catch (e) {
    console.error('[ledger] 删除失败:', e);
    showToast('删除失败', 'error');
  }
}

// ---- 编辑流水（弹窗）----
function openLedgerEdit(id) {
  const e = ledgerEntries.find(x => x.id === id);
  if (!e) return;
  ledgerEditId = id;
  ledgerEditCategory = e.category || 'daily';

  document.getElementById('ledgerEditAmount').value = (Number(e.amount) || 0).toFixed(2);
  document.getElementById('ledgerEditNote').value = e.note || '';
  document.getElementById('ledgerEditDate').value = e.spent_date || localDateStr();
  renderLedgerEditCats();
  document.getElementById('ledgerEditModal').style.display = '';
  document.getElementById('ledgerEditAmount').focus();
}

function renderLedgerEditCats() {
  const box = document.getElementById('ledgerEditCats');
  if (!box) return;
  box.innerHTML = Object.entries(LEDGER_CATS).map(([k, c]) => `
    <button type="button" class="ledger-cat ${k === ledgerEditCategory ? 'ledger-cat--active' : ''}" data-editcat="${k}" style="--cat-color:${c.color}">
      ${c.icon} ${c.label}
    </button>`).join('');
  box.querySelectorAll('.ledger-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      ledgerEditCategory = btn.dataset.editcat;
      renderLedgerEditCats();
    });
  });
}

async function saveLedgerEdit() {
  const amount = parseFloat(document.getElementById('ledgerEditAmount').value);
  if (!amount || amount <= 0) {
    showToast('请输入正确的金额', 'error');
    return;
  }
  try {
    await DS.update('ledger_entries', ledgerEditId, {
      amount,
      category: ledgerEditCategory,
      note: (document.getElementById('ledgerEditNote').value || '').trim(),
      spent_date: document.getElementById('ledgerEditDate').value || localDateStr(),
    });
    closeLedgerEdit();
    showToast('已更新', 'success');
    await renderLedgerView();
  } catch (e) {
    console.error('[ledger] 更新失败:', e);
    showToast('更新失败', 'error');
  }
}

function closeLedgerEdit() {
  const modal = document.getElementById('ledgerEditModal');
  if (modal) modal.style.display = 'none';
  ledgerEditId = null;
}

// ---- 购物清单操作 ----
async function addShoppingItem() {
  const input = document.getElementById('shoppingInput');
  const amountInput = document.getElementById('shoppingAmount');
  const name = (input.value || '').trim();
  if (!name) { input.focus(); return; }
  const amountVal = parseFloat(amountInput.value);
  const amount = amountVal > 0 ? amountVal : null;  // 预估金额可填可不填
  try {
    await DS.create('ledger_shopping_items', { name, amount, done: false });
    input.value = '';
    amountInput.value = '';
    await renderLedgerView();
  } catch (e) {
    console.error('[ledger] 添加清单失败:', e);
    showToast('添加失败，请确认已建 ledger_shopping_items 表', 'error');
  }
}

async function toggleShoppingItem(id, done) {
  try {
    await DS.update('ledger_shopping_items', id, { done });
    await renderLedgerView();
  } catch (e) {
    console.error('[ledger] 更新清单失败:', e);
    showToast('更新失败', 'error');
  }
}

function editShoppingItem(id) {
  ledgerShoppingEditId = id;
  renderLedgerView();
}

function cancelShoppingItem() {
  ledgerShoppingEditId = null;
  renderLedgerView();
}

async function saveShoppingItem(id) {
  const name = (document.getElementById('shoppingEditName').value || '').trim();
  if (!name) { showToast('名称不能为空', 'error'); return; }
  const amt = parseFloat(document.getElementById('shoppingEditAmount').value);
  try {
    await DS.update('ledger_shopping_items', id, { name, amount: amt > 0 ? amt : null });
    ledgerShoppingEditId = null;
    showToast('已更新', 'success');
    await renderLedgerView();
  } catch (e) {
    console.error('[ledger] 更新购物项失败:', e);
    showToast('更新失败', 'error');
  }
}

async function deleteShoppingItem(id) {
  try {
    await DS.remove('ledger_shopping_items', id);
    await renderLedgerView();
  } catch (e) {
    console.error('[ledger] 删除清单失败:', e);
    showToast('删除失败', 'error');
  }
}

async function clearDoneShopping() {
  const doneIds = ledgerShopping.filter(i => i.done).map(i => i.id);
  if (!doneIds.length) { showToast('没有已买的项', 'info'); return; }
  try {
    for (const id of doneIds) await DS.remove('ledger_shopping_items', id);
    showToast('已清空已买', 'success');
    await renderLedgerView();
  } catch (e) {
    console.error('[ledger] 清空失败:', e);
    showToast('清空失败', 'error');
  }
}

// ---- 编辑弹窗的静态事件（只绑定一次）----
(function bindLedgerModal() {
  const modal = document.getElementById('ledgerEditModal');
  if (!modal) return;
  const closeBtn = document.querySelector('[data-close="ledgerEditModal"]');
  if (closeBtn) closeBtn.addEventListener('click', closeLedgerEdit);
  modal.addEventListener('click', e => { if (e.target === modal) closeLedgerEdit(); });

  const saveBtn = document.getElementById('ledgerEditSave');
  if (saveBtn) saveBtn.addEventListener('click', saveLedgerEdit);
  const cancelBtn = document.getElementById('ledgerEditCancel');
  if (cancelBtn) cancelBtn.addEventListener('click', closeLedgerEdit);
  const delBtn = document.getElementById('ledgerEditDelete');
  if (delBtn) delBtn.addEventListener('click', () => {
    if (ledgerEditId) { const id = ledgerEditId; closeLedgerEdit(); deleteLedgerEntry(id); }
  });
})();

// 暴露入口（由 script.js 调用）
window.renderLedgerView = renderLedgerView;
