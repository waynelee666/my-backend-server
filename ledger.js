/* ============================================================
   TaskFlow - 记账模块  v1.0 — 每日40额度 + 购物 + 储蓄
   规则（每月生活费 2000）：
     · 账单周期：每月 6 号 → 下月 5 号
     · 日常：每天 40 元，本期「应发 = 40 × 本期第几天」
     · 今天可用 = 应发 − 本月日常已花（没花完自动滚存到下一天）
     · 购物：每期 400 元
     · 储蓄：每期目标 400 元
   ============================================================ */
console.log('💰 Ledger module loaded');

// ---- 预算常量 ----
const LEDGER = {
  DAILY: 40,       // 每天日常额度（元）
  SHOPPING: 400,   // 每月购物额度（元）
  SAVING: 400,     // 每月储蓄目标（元）
};

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
function cycleInfo(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();      // 0-based
  const d = now.getDate();

  // 6 号及以后：本期从本月 6 号开始；1~5 号：本期从上月 6 号开始
  const start = new Date(y, d >= 6 ? m : m - 1, 6);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 5);  // 下月 5 号

  const todayStart = new Date(y, m, d);
  const dayInCycle = Math.round((todayStart - start) / 86400000) + 1;  // 今天第几天

  return {
    start: localDateStr(start),
    end: localDateStr(end),
    label: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
    dayInCycle,
  };
}

// ---- 额度计算 ----
function calcStats(entries) {
  const today = localDateStr();
  const cyc = cycleInfo();

  const inCycle = entries.filter(e => {
    const d = e.spent_date || '';
    return d >= cyc.start && d <= cyc.end;
  });

  // 日常：本期至今（<= 今天）的消费，用于「滚存」计算
  const dailySpent = inCycle
    .filter(e => e.category === 'daily' && e.spent_date <= today)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // 购物 / 储蓄：本期累计
  const sumBy = cat => inCycle
    .filter(e => e.category === cat)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const shoppingSpent = sumBy('shopping');
  const savingDone = sumBy('saving');

  return {
    today,
    cycleStart: cyc.start,
    cycleEnd: cyc.end,
    cycleLabel: cyc.label,
    dayInCycle: cyc.dayInCycle,
    dailyIssued: LEDGER.DAILY * cyc.dayInCycle,      // 本期累计应发
    dailySpent,
    todayAvailable: LEDGER.DAILY * cyc.dayInCycle - dailySpent,
    shoppingSpent,
    shoppingLeft: LEDGER.SHOPPING - shoppingSpent,
    savingDone,
    savingLeft: LEDGER.SAVING - savingDone,
  };
}

// ---- 渲染 ----
async function renderLedgerView() {
  const [entries, shopping] = await Promise.all([loadLedger(), loadShopping()]);
  ledgerEntries = entries;
  ledgerShopping = shopping;
  const s = calcStats(ledgerEntries);
  const el = document.getElementById('ledgerContent');
  if (!el) return;

  const monthItems = ledgerEntries.filter(e => {
    const d = e.spent_date || '';
    return d >= s.cycleStart && d <= s.cycleEnd;
  });
  const todayNeg = s.todayAvailable < 0 ? 'ledger-stat__num--neg' : '';

  el.innerHTML = `
    <div class="ledger-stats">
      <div class="ledger-stat ledger-stat--main">
        <span class="ledger-stat__label">🍚 今日可用（日常）</span>
        <span class="ledger-stat__num ${todayNeg}">${fmtMoney(s.todayAvailable)}</span>
        <span class="ledger-stat__sub">本期第 ${s.dayInCycle} 天 · 应发 ${fmtMoney(s.dailyIssued)} · 已花 ${fmtMoney(s.dailySpent)}</span>
        <span class="ledger-stat__hint">每月 6 号开始 · 没花完自动滚存</span>
      </div>
      <div class="ledger-stat">
        <span class="ledger-stat__label">🛒 本期购物</span>
        <span class="ledger-stat__num">${fmtMoney(s.shoppingLeft)}</span>
        <span class="ledger-stat__sub">剩余 / 预算 ${fmtMoney(LEDGER.SHOPPING)}</span>
      </div>
      <div class="ledger-stat">
        <span class="ledger-stat__label">💰 本期储蓄</span>
        <span class="ledger-stat__num">${fmtMoney(s.savingDone)}</span>
        <span class="ledger-stat__sub">已存 / 目标 ${fmtMoney(LEDGER.SAVING)}</span>
      </div>
    </div>

    <div class="ledger-shopping">
      <div class="ledger-shopping__header">
        <span class="ledger-shopping__title">🛒 购物清单</span>
        <button class="ledger-shopping__clear" id="shoppingClearDone">清空已买</button>
      </div>
      <div class="ledger-shopping__add">
        <input type="text" class="ledger-shopping__input" id="shoppingInput" placeholder="要买什么..." maxlength="100">
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
      <input type="date" class="ledger-date" id="ledgerDate" value="${s.today}">
      <input type="text" class="ledger-note" id="ledgerNote" placeholder="备注（可选）" maxlength="100">
      <button class="btn btn--primary ledger-add-btn" id="ledgerAddBtn">＋ 记一笔</button>
    </div>

    <div class="ledger-list">
      ${renderEntryList(monthItems)}
    </div>
  `;

  bindLedgerEvents();
}

function renderEntryList(items) {
  if (!items.length) return '<p class="empty-text">本月还没有记账，记第一笔吧 💰</p>';
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
        <button class="ledger-item__del" data-del="${e.id}" title="删除">✕</button>
      </div>`;
  }).join('');
}

// ---- 购物清单渲染 ----
function renderShoppingHTML() {
  const pending = ledgerShopping.filter(i => !i.done);
  const done = ledgerShopping.filter(i => i.done);

  const itemHTML = item => `
    <div class="shopping-item ${item.done ? 'shopping-item--done' : ''}" data-id="${item.id}">
      <label class="shopping-item__checkwrap">
        <input type="checkbox" ${item.done ? 'checked' : ''} class="shopping-item__cb" data-toggle="${item.id}">
        <span class="shopping-item__check"></span>
      </label>
      <span class="shopping-item__name">${esc(item.name)}</span>
      <button class="shopping-item__del" data-shopping-del="${item.id}" title="删除">✕</button>
    </div>`;

  if (!ledgerShopping.length) return '<p class="empty-text">清单还是空的，添加要买的东西吧 🛒</p>';

  let html = '';
  if (pending.length) html += '<div class="shopping-group__label">待买</div>' + pending.map(itemHTML).join('');
  if (done.length) html += '<div class="shopping-group__label">已买</div>' + done.map(itemHTML).join('');
  return html;
}

// ---- 事件 ----
function bindLedgerEvents() {
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
  const clearDone = document.getElementById('shoppingClearDone');
  if (clearDone) clearDone.addEventListener('click', clearDoneShopping);
}

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

// ---- 购物清单操作 ----
async function addShoppingItem() {
  const input = document.getElementById('shoppingInput');
  const name = (input.value || '').trim();
  if (!name) { input.focus(); return; }
  try {
    await DS.create('ledger_shopping_items', { name, done: false });
    input.value = '';
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

// 暴露入口（由 script.js 调用）
window.renderLedgerView = renderLedgerView;
