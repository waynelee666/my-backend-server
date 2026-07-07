/* ============================================================
   TaskFlow - 目标模块  v1.0 — 目标→子目标→行动 三级追踪
   ============================================================ */
console.log('🎯 Goals module loaded');

// ---- 当前视图状态 ----
let goalsViewMode = 'grid';  // 'grid' | 'detail'
let goalsDetailId = null;    // 当前查看的目标 ID
let goalsData = [];          // 内存中的完整数据

// ---- 预置数据：8个目标 ----
function getPresetGoals() {
  return [
    {
      id: 'aiming', name: '瞄准', icon: '🎯', color: '#ef4444',
      subgoals: [
        { id: 'aiming-1', name: '基础定位',
          actions: [
            { id:'a1', text:'固定靶定位练习 100次', done:false },
            { id:'a2', text:'移动靶跟枪训练 10分钟', done:false },
            { id:'a3', text:'远近距离切换射击 5组', done:false }
          ]},
        { id: 'aiming-2', name: '跟枪训练',
          actions: [
            { id:'a4', text:'水平跟枪 5分钟', done:false },
            { id:'a5', text:'垂直跟枪 5分钟', done:false },
            { id:'a6', text:'空中目标跟枪 5分钟', done:false }
          ]},
        { id: 'aiming-3', name: '实战模拟',
          actions: [
            { id:'a7', text:'自定义房间实战 3局', done:false },
            { id:'a8', text:'死亡竞赛热身 2局', done:false },
            { id:'a9', text:'回放复盘分析 1局', done:false }
          ]}
      ]
    },
    {
      id: 'typing', name: '打字', icon: '⌨️', color: '#3b82f6',
      subgoals: [
        { id: 'typing-1', name: '英文提速',
          actions: [
            { id:'t1', text:'字母键位强化 10分钟', done:false },
            { id:'t2', text:'常用单词输入 200词', done:false },
            { id:'t3', text:'英文文章录入 1篇', done:false }
          ]},
        { id: 'typing-2', name: '中文输入',
          actions: [
            { id:'t4', text:'拼音词组练习 100组', done:false },
            { id:'t5', text:'中文文章录入 1篇', done:false },
            { id:'t6', text:'听打速记练习 5分钟', done:false }
          ]},
        { id: 'typing-3', name: '速度冲刺',
          actions: [
            { id:'t7', text:'每日测速挑战 3次', done:false },
            { id:'t8', text:'准确率专项训练 10分钟', done:false },
            { id:'t9', text:'目标：稳定120WPM以上', done:false }
          ]}
      ]
    },
    {
      id: 'basketball', name: '练球', icon: '🏀', color: '#f97316',
      subgoals: [
        { id: 'bb-1', name: '运球',
          actions: [
            { id:'b1', text:'原地高低运球 各5分钟', done:false },
            { id:'b2', text:'行进间变向运球 10分钟', done:false },
            { id:'b3', text:'背后+胯下组合运球 10分钟', done:false }
          ]},
        { id: 'bb-2', name: '投篮',
          actions: [
            { id:'b4', text:'罚球线投篮 命中30个', done:false },
            { id:'b5', text:'三分球投篮 命中15个', done:false },
            { id:'b6', text:'急停跳投练习 20次', done:false }
          ]},
        { id: 'bb-3', name: '体能',
          actions: [
            { id:'b7', text:'折返跑 5组', done:false },
            { id:'b8', text:'深蹲 50个', done:false },
            { id:'b9', text:'拉伸放松 10分钟', done:false }
          ]}
      ]
    },
    {
      id: 'cet6', name: '六级', icon: '📖', color: '#8b5cf6',
      subgoals: [
        { id: 'cet-1', name: '词汇',
          actions: [
            { id:'c1', text:'每日背词 50个', done:false },
            { id:'c2', text:'核心词汇复习 100个', done:false },
            { id:'c3', text:'真题词汇整理 1套', done:false }
          ]},
        { id: 'cet-2', name: '听力',
          actions: [
            { id:'c4', text:'真题听力精听 1套', done:false },
            { id:'c5', text:'BBC新闻泛听 15分钟', done:false },
            { id:'c6', text:'听写训练 1篇', done:false }
          ]},
        { id: 'cet-3', name: '阅读',
          actions: [
            { id:'c7', text:'长篇阅读 1篇', done:false },
            { id:'c8', text:'仔细阅读 2篇', done:false },
            { id:'c9', text:'选词填空 1组', done:false }
          ]},
        { id: 'cet-4', name: '写作翻译',
          actions: [
            { id:'c10', text:'作文练习 1篇', done:false },
            { id:'c11', text:'翻译训练 1篇', done:false },
            { id:'c12', text:'范文模板整理 1套', done:false }
          ]}
      ]
    },
    {
      id: 'piano', name: '练琴', icon: '🎹', color: '#ec4899',
      subgoals: [
        { id: 'piano-1', name: '基本功',
          actions: [
            { id:'p1', text:'音阶练习 所有调 10分钟', done:false },
            { id:'p2', text:'琶音练习 10分钟', done:false },
            { id:'p3', text:'哈农指法 第1-10条', done:false }
          ]},
        { id: 'piano-2', name: '曲目练习',
          actions: [
            { id:'p4', text:'练习曲 完整3遍', done:false },
            { id:'p5', text:'乐曲分段精练 20分钟', done:false },
            { id:'p6', text:'视奏新谱 1首', done:false }
          ]},
        { id: 'piano-3', name: '乐理',
          actions: [
            { id:'p7', text:'音程听辨 10组', done:false },
            { id:'p8', text:'和弦进行练习 10分钟', done:false },
            { id:'p9', text:'节奏训练 5分钟', done:false }
          ]}
      ]
    },
    {
      id: 'strength', name: '臂力', icon: '💪', color: '#dc2626',
      subgoals: [
        { id: 'str-1', name: '引体向上',
          actions: [
            { id:'s1', text:'标准引体 3组×8次', done:false },
            { id:'s2', text:'宽距引体 3组×5次', done:false },
            { id:'s3', text:'悬垂保持 3组×30秒', done:false }
          ]},
        { id: 'str-2', name: '俯卧撑',
          actions: [
            { id:'s4', text:'标准俯卧撑 3组×20次', done:false },
            { id:'s5', text:'钻石俯卧撑 3组×10次', done:false },
            { id:'s6', text:'宽距俯卧撑 3组×15次', done:false }
          ]},
        { id: 'str-3', name: '哑铃训练',
          actions: [
            { id:'s7', text:'哑铃弯举 3组×12次', done:false },
            { id:'s8', text:'臂屈伸 3组×12次', done:false },
            { id:'s9', text:'肩推 3组×10次', done:false }
          ]}
      ]
    },
    {
      id: 'followers', name: '涨粉', icon: '📈', color: '#06b6d4',
      subgoals: [
        { id: 'fl-1', name: '内容创作',
          actions: [
            { id:'f1', text:'每日发布 1条', done:false },
            { id:'f2', text:'选题策划 下周3个选题', done:false },
            { id:'f3', text:'素材拍摄+剪辑 1条', done:false }
          ]},
        { id: 'fl-2', name: '互动运营',
          actions: [
            { id:'f4', text:'评论回复 30分钟', done:false },
            { id:'f5', text:'粉丝群互动维护', done:false },
            { id:'f6', text:'直播互动 1场', done:false }
          ]},
        { id: 'fl-3', name: '数据分析',
          actions: [
            { id:'f7', text:'每日数据复盘', done:false },
            { id:'f8', text:'竞品账号分析 3个', done:false },
            { id:'f9', text:'热点趋势追踪', done:false }
          ]}
      ]
    },
    {
      id: 'singing', name: '练歌', icon: '🎤', color: '#f59e0b',
      subgoals: [
        { id: 'sing-1', name: '发声训练',
          actions: [
            { id:'sg1', text:'腹式呼吸练习 10分钟', done:false },
            { id:'sg2', text:'哼鸣+共鸣练习 10分钟', done:false },
            { id:'sg3', text:'音准跟唱训练 5分钟', done:false }
          ]},
        { id: 'sing-2', name: '曲目练习',
          actions: [
            { id:'sg4', text:'新歌学唱 1首', done:false },
            { id:'sg5', text:'已学曲目复习 3首', done:false },
            { id:'sg6', text:'录音自评 找出不足', done:false }
          ]},
        { id: 'sing-3', name: '表演',
          actions: [
            { id:'sg7', text:'完整演绎练习 3遍', done:false },
            { id:'sg8', text:'台风+表情管理练习', done:false },
            { id:'sg9', text:'录制成品 1首', done:false }
          ]}
      ]
    }
  ];
}

// ==================== 数据读写 ====================

async function loadGoals() {
  try {
    const sb = Auth.getClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return getPresetGoals();

    const { data, error } = await sb.from('goal_data')
      .select('data')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      // 表可能还不存在，降级到 localStorage
      console.warn('goal_data 表可能不存在，使用本地缓存:', error.message);
      return loadFromLocal();
    }

    if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
      // 同步到 local 作为快速缓存
      saveToLocal(data.data);
      return data.data;
    }
    // 首次使用：写入预置数据
    const preset = getPresetGoals();
    await saveGoalsRaw(preset);
    saveToLocal(preset);
    return preset;
  } catch (e) {
    console.error('loadGoals 异常，降级本地:', e);
    return loadFromLocal();
  }
}

function loadFromLocal() {
  try {
    const raw = localStorage.getItem('taskflow_goals');
    if (raw) { const d = JSON.parse(raw); if (Array.isArray(d) && d.length) return d; }
  } catch (e) {}
  return getPresetGoals();
}

function saveToLocal(arr) {
  try { localStorage.setItem('taskflow_goals', JSON.stringify(arr)); } catch (e) {}
}

async function saveGoalsRaw(goalsArray) {
  try {
    const sb = Auth.getClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { saveToLocal(goalsArray); return; }

    const { error } = await sb.from('goal_data').upsert({
      user_id: user.id,
      data: goalsArray,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    if (error) {
      console.warn('Supabase 保存失败，使用本地缓存:', error.message);
    }
    // 同时写本地缓存
    saveToLocal(goalsArray);
  } catch (e) {
    console.error('保存目标失败，降级本地:', e);
    saveToLocal(goalsArray);
  }
}

async function saveGoals() {
  await saveGoalsRaw(goalsData);
}

// ==================== 进度计算 ====================

function getGoalProgress(goal) {
  let total = 0, done = 0;
  if (!goal || !goal.subgoals) return { done: 0, total: 0, pct: 0 };
  for (const sub of goal.subgoals) {
    if (!sub.actions) continue;
    for (const act of sub.actions) {
      total++;
      if (act.done) done++;
    }
  }
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

// ==================== 渲染 ====================

async function renderGoalsView() {
  if (goalsData.length === 0) {
    goalsData = await loadGoals();
  }
  if (goalsViewMode === 'detail' && goalsDetailId) {
    renderGoalDetail(goalsDetailId);
  } else {
    renderGoalGrid();
  }
}

function renderGoalGrid() {
  goalsViewMode = 'grid';
  goalsDetailId = null;
  const container = document.getElementById('goalsContent');
  if (!container) return;

  if (!goalsData.length) {
    container.innerHTML = '<p class="empty-text">暂无目标 🎯</p>';
    return;
  }

  let html = '<div class="goals-grid">';
  for (const goal of goalsData) {
    const { done, total, pct } = getGoalProgress(goal);
    html += `
      <div class="goal-card" data-goal="${goal.id}" style="--goal-color:${goal.color}">
        <span class="goal-card__icon">${goal.icon}</span>
        <div class="goal-card__info">
          <span class="goal-card__name">${esc(goal.name)}</span>
          <span class="goal-card__stat">${done}/${total} 完成</span>
          <div class="goal-card__bar">
            <div class="goal-card__bar-fill" style="width:${pct}%;background:${goal.color}"></div>
          </div>
        </div>
        <span class="goal-card__arrow">›</span>
      </div>`;
  }
  html += '</div>';
  container.innerHTML = html;

  // 绑定点击事件
  container.querySelectorAll('.goal-card').forEach(card => {
    card.addEventListener('click', () => {
      const goalId = card.dataset.goal;
      goalsViewMode = 'detail';
      goalsDetailId = goalId;
      renderGoalDetail(goalId);
    });
  });
}

function renderGoalDetail(goalId) {
  goalsViewMode = 'detail';
  goalsDetailId = goalId;
  const container = document.getElementById('goalsContent');
  if (!container) return;

  const goal = goalsData.find(g => g.id === goalId);
  if (!goal) { renderGoalGrid(); return; }

  const { done, total, pct } = getGoalProgress(goal);

  let html = `
    <div class="goal-detail">
      <div class="goal-breadcrumb" data-action="back-to-grid">
        <span class="goal-breadcrumb__back">← 全部目标</span>
        <span class="goal-breadcrumb__sep">/</span>
        <span class="goal-breadcrumb__current">${goal.icon} ${esc(goal.name)}</span>
      </div>
      <div class="goal-detail__header">
        <span class="goal-detail__icon">${goal.icon}</span>
        <div class="goal-detail__meta">
          <h2 class="goal-detail__title">${esc(goal.name)}</h2>
          <span class="goal-detail__progress">${done}/${total} 已完成 · ${pct}%</span>
          <div class="goal-card__bar goal-detail__bar">
            <div class="goal-card__bar-fill" style="width:${pct}%;background:${goal.color}"></div>
          </div>
        </div>
      </div>
      <div class="subgoal-list">`;

  for (const sub of goal.subgoals) {
    let subDone = 0, subTotal = 0;
    if (sub.actions) { subTotal = sub.actions.length; subDone = sub.actions.filter(a => a.done).length; }
    const subPct = subTotal > 0 ? Math.round((subDone / subTotal) * 100) : 0;

    html += `
      <div class="subgoal-item" data-subgoal="${sub.id}">
        <div class="subgoal-header">
          <span class="subgoal-header__arrow">▸</span>
          <span class="subgoal-header__name">${esc(sub.name)}</span>
          <span class="subgoal-header__stat">${subDone}/${subTotal}</span>
        </div>
        <div class="subgoal-body" style="display:none;">
          <div class="action-list">`;

    if (sub.actions) {
      for (const act of sub.actions) {
        const checked = act.done ? 'checked' : '';
        html += `
            <label class="action-item ${act.done ? 'action-item--done' : ''}" data-action="${act.id}" data-goal="${goalId}" data-sub="${sub.id}">
              <input type="checkbox" ${checked} class="action-item__cb">
              <span class="action-item__check"></span>
              <span class="action-item__text">${esc(act.text)}</span>
            </label>`;
      }
    }

    html += `
          </div>
        </div>
      </div>`;
  }

  html += `
      </div>
    </div>`;

  container.innerHTML = html;

  // 绑定事件
  bindGoalDetailEvents(container, goal);
}

function bindGoalDetailEvents(container, goal) {
  // 面包屑返回
  const bc = container.querySelector('[data-action="back-to-grid"]');
  if (bc) {
    bc.addEventListener('click', () => {
      goalsViewMode = 'grid';
      goalsDetailId = null;
      renderGoalGrid();
    });
  }

  // 手风琴展开/折叠
  container.querySelectorAll('.subgoal-header').forEach(header => {
    header.addEventListener('click', () => {
      const item = header.closest('.subgoal-item');
      const body = item.querySelector('.subgoal-body');
      const arrow = header.querySelector('.subgoal-header__arrow');
      if (!body || !arrow) return;
      if (body.style.display === 'none') {
        body.style.display = '';
        arrow.textContent = '▾';
        item.classList.add('subgoal-item--open');
      } else {
        body.style.display = 'none';
        arrow.textContent = '▸';
        item.classList.remove('subgoal-item--open');
      }
    });
  });

  // 行动复选框
  container.querySelectorAll('.action-item').forEach(label => {
    const cb = label.querySelector('.action-item__cb');
    if (!cb) return;
    cb.addEventListener('change', async () => {
      const actionId = label.dataset.action;
      const goalId = label.dataset.goal;
      const subId = label.dataset.sub;

      // 更新内存数据
      const g = goalsData.find(x => x.id === goalId);
      if (!g) return;
      const sub = g.subgoals.find(s => s.id === subId);
      if (!sub || !sub.actions) return;
      const act = sub.actions.find(a => a.id === actionId);
      if (!act) return;
      act.done = cb.checked;
      if (cb.checked) {
        label.classList.add('action-item--done');
      } else {
        label.classList.remove('action-item--done');
      }

      // 更新子目标统计
      const subItem = label.closest('.subgoal-item');
      if (subItem) {
        const stat = subItem.querySelector('.subgoal-header__stat');
        if (stat) {
          let sd = 0, st = sub.actions.length;
          sub.actions.forEach(a => { if (a.done) sd++; });
          stat.textContent = `${sd}/${st}`;
        }
      }

      // 更新全局进度
      await saveGoals();
      updateGoalDetailProgress(container, goal);
    });
  });
}

function updateGoalDetailProgress(container, goal) {
  const { done, total, pct } = getGoalProgress(goal);
  const progEl = container.querySelector('.goal-detail__progress');
  const fillEl = container.querySelector('.goal-detail__bar .goal-card__bar-fill');
  if (progEl) progEl.textContent = `${done}/${total} 已完成 · ${pct}%`;
  if (fillEl) fillEl.style.width = `${pct}%`;
}

// 暴露入口函数（由 script.js 调用）
window.renderGoalsView = renderGoalsView;
