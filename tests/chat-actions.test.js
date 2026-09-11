/* 临时诊断脚本：把 chat.js 加载进假环境，验证新的解析/执行/回报逻辑。用完即删。 */
const fs = require('fs');
const vm = require('vm');

const calls = [];
const store = {
  todos: [
    { id: 1, title: '写数分作业', date: '2026-09-11', status: 'todo', priority: '高' },
    { id: 2, title: '交物理实验', date: '2026-09-12', status: 'todo', priority: '高' },
  ],
  events: [
    { id: 11, title: '高数课', date: '2026-09-12', start_time: '08:00', end_time: '09:35' },
    { id: 12, title: '数据结构课', date: '2026-09-15', start_time: '10:00' },
    { id: 13, title: '高数课', date: '2026-09-19', start_time: '08:00' },
  ],
  subjects: [{ id: 21, name: '微积分', credits: 5, components: [] }],
  thoughts: [{ id: 31, title: '开箱视频', content: '场景一：开箱', status: 'draft' }],
  goalsData: [
    { id: 'g1', name: '学习', subgoals: [
      { id: 'g1-s1', name: '英语', actions: [
        { id: 'a1', text: '背单词', done: false },
        { id: 'a4', text: '复习单词', done: false },
      ] },
      { id: 'g1-s2', name: '数学分析', actions: [{ id: 'a2', text: '写数分作业', done: false }] },
    ] },
    { id: 'g2', name: '健身', subgoals: [{ id: 'g2-s1', name: '有氧', actions: [{ id: 'a3', text: '跑步', done: false }] }] },
  ],
};

const ctx = {
  console,
  document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] },
  window: {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  todos: store.todos, events: store.events, subjects: store.subjects, thoughts: store.thoughts,
  Auth: { getClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) }, from: () => ({}) }) },
  DS: {
    create: async (t, r) => { calls.push(['create', t, r]); },
    update: async (t, id, f) => { calls.push(['update', t, id, f]); },
    remove: async (t, id) => { calls.push(['remove', t, id]); },
  },
  refreshAll() {},
  goalsData: store.goalsData,
  loadGoals: async () => store.goalsData,
  saveGoalsRaw: async (g) => { calls.push(['saveGoals', g]); },
  calls,
  store,
  process,
};
ctx.globalThis = ctx;
vm.createContext(ctx);

// 相对本文件定位，这样从哪个目录跑都能找到 chat.js
const src = fs.readFileSync(require('path').join(__dirname, '..', 'chat.js'), 'utf8');

const TEST = `
(function () {
  let pass = 0, fail = 0;
  const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log((ok ? '  ✅ ' : '  ❌ ') + name + (ok ? '' : '\\n       got:  ' + JSON.stringify(got) + '\\n       want: ' + JSON.stringify(want)));
    ok ? pass++ : fail++;
  };

  console.log('\\n【1】parseActionBlock —— 各种脏格式');
  eq('正常块', parseActionBlock('好的 __ACTIONS__ [{"entity":"todo","action":"delete","data":{"title":"x"}}] __END_ACTIONS__').kind, 'ok');
  eq('代码围栏包裹', parseActionBlock('__ACTIONS__ \\u0060\\u0060\\u0060json\\n[{"entity":"todo","action":"delete","data":{"title":"x"}}]\\n\\u0060\\u0060\\u0060 __END_ACTIONS__').kind, 'ok');
  eq('尾逗号', parseActionBlock('__ACTIONS__ [{"entity":"todo","action":"delete","data":{"title":"x"}},] __END_ACTIONS__').kind, 'ok');
  eq('被截断（缺 END）', parseActionBlock('__ACTIONS__ [{"entity":"todo","action":"delete","data":{"title":"x"}}]').kind, 'ok');
  eq('块是空的', parseActionBlock('__ACTIONS__ [] __END_ACTIONS__').kind, 'broken');
  eq('JSON 烂了', parseActionBlock('__ACTIONS__ [{oh no}] __END_ACTIONS__').kind, 'broken');
  eq('截断到没写完', parseActionBlock('__ACTIONS__ [{"entity":"todo","acti').kind, 'broken');
  eq('压根没有标记', parseActionBlock('好的我知道啦').kind, 'none');

  console.log('\\n【2】looksLikeDoneClaim —— 无指令时该不该提示');
  eq('报喜句（实测抓到的原文）', looksLikeDoneClaim('好嘞～已经把「写数分作业」的优先级调成高啦，今天就先干它 ✅'), true);
  eq('报喜句2', looksLikeDoneClaim('帮你把这条待办删掉～'), true);
  eq('反问句不打扰', looksLikeDoneClaim('你想改成什么时候呢？'), false);
  eq('征询句不打扰', looksLikeDoneClaim('要不要我顺手把优先级也调高？'), false);
  eq('空回复不提示', looksLikeDoneClaim(''), false);
  eq('已明说找不到 → 不叠废话', looksLikeDoneClaim('我翻了一下，没找到「量子力学」这门课诶 😅 是不是记混了？确认一下名字我马上帮你处理！'), false);

  console.log('\\n【3】notFoundNote —— 名字对不上时给出线索');
  console.log('  → ' + notFoundNote('交物理实验报告', todos, x => x.title, '待办'));
  eq('能挑出最像的那条', closestName('交物理实验报告', todos, x => x.title), '交物理实验');
  eq('差太远就不瞎猜', closestName('zzz', todos, x => x.title), '');

  console.log('\\n【4】findEvent —— 日期算错一位不该整条放弃');
  eq('日期对得上', findEvent('高数课', '2026-09-12').id, 11);
  eq('日期错了但标题唯一 → 兜底命中', findEvent('数据结构课', '2026-09-16').id, 12);
  try { findEvent('高数课', '2026-09-13'); eq('标题撞车要报错', 'no throw', 'throw'); }
  catch (e) { eq('标题撞车要报错', /2 条都叫/.test(e.message), true); }

  console.log('\\n【5】executeActions —— 单条失败不能拖累其余，且必须如实回报');
  calls.length = 0;
  return executeActions([
    { entity: 'todo', action: 'update', data: { title: '写数分作业', updates: { priority: '中' } } },
    { entity: 'todo', action: 'delete', data: { title: '不存在的待办' } },
    { entity: 'event', action: 'update', data: { title: '数据结构课', date: '2026-09-16', updates: { start_time: '14:00' } } },
  ]).then(function (results) {
    eq('第 1 条成功', results[0].ok, true);
    eq('第 2 条失败', results[1].ok, false);
    eq('第 3 条没被第 2 条拖累（这才是关键）', results[2].ok, true);
    eq('成功的动作真的落库了', calls.filter(c => c[0] === 'update').length, 2);
    eq('失败的那条没有误删任何东西', calls.filter(c => c[0] === 'remove').length, 0);
    console.log('\\n  回执长这样:\\n' + formatActionReport(results).split('\\n').map(s => '    ' + s).join('\\n'));

    console.log('\\n【6】静默 no-op 是否已消灭');
    calls.length = 0;
    return executeActions([
      { entity: 'todo', action: 'delete', data: { title: '查无此条' } },
      { entity: 'thought', action: 'update', data: { old_content: '查无此脚本', new_content: 'x' } },
      { entity: 'subject', action: 'delete', data: { name: '查无此科目' } },
    ]);
  }).then(function (r) {
    eq('待办删除：不再静默跳过', r[0].ok, false);
    eq('脚本修改：不再静默跳过', r[1].ok, false);
    eq('科目删除：不再静默跳过', r[2].ok, false);
    eq('三条都没产生任何写操作', calls.length, 0);
    return null;
  }).then(function () {
    console.log('\\n【7】日期校验 —— 「周日」这种字面日期绝不能落库');
    calls.length = 0;
    return executeActions([
      { entity: 'todo', action: 'update', data: { title: '写数分作业', updates: { date: '周日' } } },
    ]).then(function (r) {
      eq('脏日期被拦下', r[0].ok, false);
      eq('拦下后没有写入', calls.filter(c => c[0] === 'update').length, 0);
      console.log('  → ' + r[0].reason);
      calls.length = 0;
      return executeActions([
        { entity: 'todo', action: 'add', data: { title: '新待办', date: '周日' } },
      ]);
    }).then(function (r) {
      eq('新增待办的脏日期也被拦下', r[0].ok, false);
      calls.length = 0;
      return executeActions([
        { entity: 'todo', action: 'add', data: { title: '新待办', date: '2026-09-13' } },
      ]);
    }).then(function (r) {
      eq('正常日期照常放行', r[0].ok, true);
      eq('正常日期确实写入了', calls.filter(c => c[0] === 'create').length, 1);
    });
  }).then(function () {
    console.log('\\n【8】目标/子目标匹配 —— 空名字不能再撞到第一个');
    const g = () => store.goalsData;
    const reset = () => { g()[0].subgoals[1].actions[0].done = false; };
    reset();
    calls.length = 0;
    return executeActions([
      // 子目标名留空 + 行动全库唯一 → 应能找到（这是模型实测给出的形态）
      { entity: 'goal', action: 'toggle_action', data: { goal_name: '学习', subgoal_name: '', action_text: '写数分作业' } },
    ]).then(function (r) {
      eq('空子目标名：行动唯一时能找到', r[0].ok, true);
      eq('翻转的是对的那条（写数分作业）', g()[0].subgoals[1].actions[0].done, true);
      eq('没碰错的那条（背单词）', g()[0].subgoals[0].actions[0].done, false);
      reset();
      calls.length = 0;
      // 模型实测给的就是这种「目标名也留空」的形态
      return executeActions([
        { entity: 'goal', action: 'toggle_action', data: { goal_name: '', subgoal_name: '', action_text: '写数分作业' } },
      ]);
    }).then(function (r) {
      eq('目标名+子目标名都留空 → 仍能靠唯一命中找到', r[0].ok, true);
      eq('翻转的依然是对的那条', g()[0].subgoals[1].actions[0].done, true);
      reset();
      calls.length = 0;
      return executeActions([
        { entity: 'goal', action: 'toggle_action', data: { goal_name: '查无此目标', subgoal_name: '', action_text: '写数分作业' } },
      ]);
    }).then(function (r) {
      eq('目标名对不上 → 报错不撞第一个', r[0].ok, false);
      eq('报错时没有改动任何目标', calls.length, 0);
      console.log('  → ' + r[0].reason);
      calls.length = 0;
      return executeActions([
        { entity: 'goal', action: 'toggle_action', data: { goal_name: '学习', subgoal_name: '英语', action_text: '写数分作业' } },
      ]);
    }).then(function (r) {
      eq('指定子目标里确实没有 → 报错', r[0].ok, false);
      console.log('  → ' + r[0].reason);
      reset();
      calls.length = 0;
      return executeActions([
        { entity: 'goal', action: 'toggle_action', data: { goal_name: '学习', subgoal_name: '', action_text: '单词' } },
      ]);
    }).then(function (r) {
      eq('多条都能对上 → 报错不瞎改', r[0].ok, false);
      console.log('  （「单词」同时命中「背单词」和「复习单词」→ 故意造出的歧义）');
      console.log('  → ' + r[0].reason);
      calls.length = 0;
      const before = g().length;
      // 最危险的一条：空目标名 + 删目标。旧代码 indexOf(null)=-1 → splice(-1,1) 会删掉最后一个目标
      return executeActions([
        { entity: 'goal', action: 'delete', data: { goal_name: '', subgoal_name: '', action_text: '' } },
      ]).then(function (r2) {
        eq('删目标时目标名留空 → 报错', r2[0].ok, false);
        eq('没有误删任何一个目标（尤其是最后一个）', g().length, before);
      });
    }).then(function () {
      console.log('\\n' + (fail ? '❌ ' + fail + ' 项失败，' : '✅ 全过，') + pass + ' 项通过');
      process.exitCode = fail ? 1 : 0;
    });
  });
})();
`;

vm.runInContext(src + '\n' + TEST, ctx);
