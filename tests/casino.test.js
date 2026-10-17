/* 《谁先到 1 万？》逻辑测试
 * 运行：node tests/casino.test.js
 *
 * 从 casino.html 里抽出内联脚本，在 Node 里执行（document 不存在时脚本不会 boot），
 * 然后用 window.__casino 暴露的纯判定函数做概率与结算断言。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'casino.html'), 'utf8');

/* ---------------- 加载游客环境 ---------------- */
global.window = global;
const memoryStore = {};
global.localStorage = {
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
  },
  setItem(key, value) { memoryStore[key] = String(value); },
  removeItem(key) { delete memoryStore[key]; }
};

const m = html.match(/<script id="casino-app">([\s\S]*?)<\/script>/);
assert(m, 'casino.html 里找不到 <script id="casino-app">');

vm.runInThisContext(m[1], { filename: 'casino-app.js' });

const C = window.__casino;
assert(C, 'window.__casino 未导出');

let passed = 0;
function ok(cond, label) {
  assert.ok(cond, label);
  passed += 1;
}
function eq(a, b, label) {
  assert.strictEqual(a, b, label);
  passed += 1;
}
function near(a, b, tol, label) {
  assert.ok(Math.abs(a - b) <= tol, `${label}: got ${a}, want ${b} ± ${tol}`);
  passed += 1;
}

/* ================= 1. 常量与规则 ================= */
const R = C.RATES;

eq(R.labor.gain, 1, '干苦力每次 +1 元');
eq(R.labor.wipeChance, 0.001, '干苦力清零概率 0.1%');

eq(R.balls.red, 30, '红球 30');
eq(R.balls.black, 40, '黑球 40');
eq(R.balls.yellow, 30, '黄球 30');
eq(R.balls.red + R.balls.black + R.balls.yellow, 100, '球池共 100 个');
eq(R.balls.payout, 4, '押中总回报 4 倍');
eq(R.balls.maxBet, 500, '摸球单局上限 500');

eq(R.envelope.fee, 100, '两信封入场费 100');
eq(R.envelope.min, 50, '已开信封最小 50');
eq(R.envelope.max, 200, '已开信封最大 200');
eq(R.envelope.doubleChance, 0.5, '另一信封 2 倍 / 一半各 50%');

eq(R.doors.maxBet, 2000, '三门单局上限 2000');
eq(R.doors.payout, 2, '三门押中翻倍');
eq(R.doors.count, 3, '三门共 3 扇');

eq(R.petersburg.length, 3, '圣彼得堡三档');
eq(R.petersburg[0].fee, 100, '8ⁿ 档入场 100');
eq(R.petersburg[0].base, 8, '8ⁿ 档底数 8');
eq(R.petersburg[1].fee, 300, '9ⁿ 档入场 300');
eq(R.petersburg[1].base, 9, '9ⁿ 档底数 9');
eq(R.petersburg[2].fee, 500, '10ⁿ 档入场 500');
eq(R.petersburg[2].base, 10, '10ⁿ 档底数 10');

eq(R.gate.wipe, 0.1, '关卡 10% 清零');
eq(R.gate.stay, 0.8, '关卡 80% 不变');
eq(R.gate.bonus, 0.1, '关卡 10% 送钱');
eq(R.gate.bonusAmount, 4000, '关卡送 4000 元');
eq(R.gate.threshold, 1000, '关卡触发线 1000');
eq(R.target, 10000, '胜利线 10000');

/* ================= 2. 摸球概率 ================= */
(() => {
  C._setRand(Math.random);
  const N = 300000;
  const hit = { red: 0, black: 0, yellow: 0 };
  for (let i = 0; i < N; i++) hit[C.rollBall()] += 1;
  near(hit.red / N, 0.30, 0.005, '红球掉率 30%');
  near(hit.black / N, 0.40, 0.005, '黑球掉率 40%');
  near(hit.yellow / N, 0.30, 0.005, '黄球掉率 30%');
})();

/* ================= 2b. 真·球池 ================= */
(() => {
  C._setRand(Math.random);
  const pool = C.makePool();
  eq(pool.length, 100, '球池正好 100 个球');
  const cnt = { red: 0, black: 0, yellow: 0 };
  let bad = 0;
  pool.forEach(function (c) {
    if (cnt[c] === undefined) bad += 1;
    else cnt[c] += 1;
  });
  eq(bad, 0, '球池里只有红/黑/黄');
  eq(cnt.red, 30, '球池红球 30');
  eq(cnt.black, 40, '球池黑球 40');
  eq(cnt.yellow, 30, '球池黄球 30');

  const first = C.makePool().join(',');
  let shuffled = false;
  for (let i = 0; i < 8; i += 1) {
    if (C.makePool().join(',') !== first) shuffled = true;
  }
  ok(shuffled, '球池每次都会重新洗牌');

  // 从洗好的球池里均匀抓一个球，颜色分布必须还是 30/40/30
  const N = 100000;
  let red = 0;
  let black = 0;
  for (let i = 0; i < N; i += 1) {
    const p = C.makePool();
    const c = p[Math.floor(Math.random() * p.length)];
    if (c === 'red') red += 1;
    else if (c === 'black') black += 1;
  }
  near(red / N, 0.30, 0.007, '从球池抓球：红 30%');
  near(black / N, 0.40, 0.007, '从球池抓球：黑 40%');
})();

/* ================= 3. 干苦力 ================= */
(() => {
  C._setRand(Math.random);
  const N = 300000;
  let wipes = 0;
  let totalGain = 0;
  let badWipeGain = 0;
  let badGain = 0;
  for (let i = 0; i < N; i++) {
    const r = C.rollLabor();
    if (r.wiped) { wipes += 1; if (r.gain !== 0) badWipeGain += 1; }
    else { totalGain += r.gain; if (r.gain !== 1) badGain += 1; }
  }
  eq(badWipeGain, 0, '清零那一下不给钱');
  eq(badGain, 0, '未清零时 +1');
  near(wipes / N, 0.001, 0.0002, '干苦力清零率 0.1%');
  eq(totalGain + wipes, N, '每次判定非清零即 +1（总数守恒）');
})();

/* ================= 4. 两信封 ================= */
(() => {
  C._setRand(Math.random);
  const N = 200000;
  let double = 0;
  let badOther = 0;
  for (let i = 0; i < N; i++) {
    const other = C.rollEnvelopeOther(100);
    if (other === 200) double += 1;
    else if (other !== 50) badOther += 1;
  }
  eq(badOther, 0, '另一信封只能是 2 倍或一半');
  near(double / N, 0.5, 0.005, '另一信封 2 倍概率 50%');

  // 边界：最小 / 最大已开金额
  C._setRand(() => 0.1);  // < 0.5 → 2 倍
  eq(C.rollEnvelopeOther(50), 100, '50 的 2 倍 = 100');
  eq(C.rollEnvelopeOther(200), 400, '200 的 2 倍 = 400');
  C._setRand(() => 0.9);  // >= 0.5 → 一半
  eq(C.rollEnvelopeOther(50), 25, '50 的一半 = 25');
  eq(C.rollEnvelopeOther(200), 100, '200 的一半 = 100');
  eq(C.rollEnvelopeOther(51), 25, '奇数的一半向下取整，不会出现 0.5 元');

  // 已开信封只出偶数，保证另一个信封永远是整数元
  C._setRand(() => 0);
  eq(C.rollEnvelopeShown(), 50, '已开信封最小值 50');
  C._setRand(() => 0.999999);
  eq(C.rollEnvelopeShown(), 200, '已开信封最大值 200');

  C._setRand(Math.random);
  let odd = 0;
  let out = 0;
  for (let i = 0; i < 100000; i += 1) {
    const v = C.rollEnvelopeShown();
    if (v % 2 !== 0) odd += 1;
    if (v < 50 || v > 200) out += 1;
  }
  eq(odd, 0, '已开信封永远是偶数');
  eq(out, 0, '已开信封始终在 50–200 之间');
})();

/* ================= 5. 摸球结算 ================= */
eq(C.settleBalls(100, 'red', 'red'), 400, '摸球押红中红拿回 400');
eq(C.settleBalls(100, 'black', 'black'), 400, '摸球押黑中黑拿回 400');
eq(C.settleBalls(100, 'red', 'black'), 0, '押红中黑归零');
eq(C.settleBalls(100, 'black', 'red'), 0, '押黑中红归零');
eq(C.settleBalls(100, 'red', 'yellow'), 0, '黄球通杀（押红）');
eq(C.settleBalls(100, 'black', 'yellow'), 0, '黄球通杀（押黑）');
eq(C.settleBalls(500, 'red', 'red'), 2000, '押 500 中红拿回 2000');

/* ================= 6. 圣彼得堡 ================= */
(() => {
  // 确定性：第 1 抛就正面 → n=1
  let seq = [0.1];
  C._setRand(() => seq.shift());
  let r = C.rollPetersburg(8);
  eq(r.n, 1, '第一抛正面 n=1');
  eq(r.prize, 8, '8^1 = 8');
  eq(r.seq.join(''), 'H', '序列只有正');

  // 两反一正 → n=3
  seq = [0.9, 0.9, 0.1];
  C._setRand(() => seq.shift());
  r = C.rollPetersburg(10);
  eq(r.n, 3, '两反一正 n=3');
  eq(r.prize, 1000, '10^3 = 1000');
  eq(r.seq.join(''), 'TTH', '序列 TTH');

  // 一直反面也不会死循环（上限保护）
  C._setRand(() => 0.9);
  r = C.rollPetersburg(8);
  eq(r.n, 60, '极端情况封顶 60 抛');
  eq(r.seq.length, 60, '序列长度与 n 一致');
  ok(Number.isFinite(r.prize), '封顶奖金仍是有限数');

  // 分布：P(n=1)=1/2, P(n=2)=1/4, P(n=3)=1/8
  C._setRand(Math.random);
  const N = 200000;
  const cnt = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let badPrize = 0;
  for (let i = 0; i < N; i++) {
    const x = C.rollPetersburg(8);
    if (x.n <= 4) cnt[x.n] += 1;
    if (x.prize !== Math.pow(8, x.n)) badPrize += 1;
  }
  eq(badPrize, 0, '奖金恒等于 8^n');
  near(cnt[1] / N, 0.5, 0.008, 'n=1 概率 50%');
  near(cnt[2] / N, 0.25, 0.008, 'n=2 概率 25%');
  near(cnt[3] / N, 0.125, 0.008, 'n=3 概率 12.5%');
  near(cnt[4] / N, 0.0625, 0.008, 'n=4 概率 6.25%');
})();

/* ================= 6b. 手动抛硬币（按一次抛一次） ================= */
(() => {
  C._setRand(() => 0);
  eq(C.flipCoin(), 'H', '随机数 0 → 正面');
  C._setRand(() => 0.499999);
  eq(C.flipCoin(), 'H', '0.499999 → 正面');
  C._setRand(() => 0.5);
  eq(C.flipCoin(), 'T', '0.5 → 反面');
  C._setRand(() => 0.999999);
  eq(C.flipCoin(), 'T', '0.999999 → 反面');

  C._setRand(Math.random);
  const N = 200000;
  let heads = 0;
  for (let i = 0; i < N; i += 1) if (C.flipCoin() === 'H') heads += 1;
  near(heads / N, 0.5, 0.005, '手动抛硬币正面率 50%');
})();

/* ================= 7. 1000 元关卡 ================= */
(() => {
  C._setRand(Math.random);
  const N = 200000;
  const cnt = { wipe: 0, stay: 0, bonus: 0 };
  for (let i = 0; i < N; i++) cnt[C.rollGate()] += 1;
  near(cnt.wipe / N, 0.10, 0.005, '关卡清零 10%');
  near(cnt.stay / N, 0.80, 0.005, '关卡不变 80%');
  near(cnt.bonus / N, 0.10, 0.005, '关卡送钱 10%');

  C._setRand(() => 0.05);
  eq(C.rollGate(), 'wipe', '0.05 → 清零');
  C._setRand(() => 0.5);
  eq(C.rollGate(), 'stay', '0.5 → 不变');
  C._setRand(() => 0.95);
  eq(C.rollGate(), 'bonus', '0.95 → 送钱');
})();

/* ================= 8. 确定性边界 ================= */
(() => {
  C._setRand(() => 0);
  eq(C.rollBall(), 'red', '随机数 0 → 红');
  eq(C.rollLabor().wiped, true, '随机数 0 → 干苦力被清零');

  C._setRand(() => 0.299999);
  eq(C.rollBall(), 'red', '0.299999 → 红');
  C._setRand(() => 0.30);
  eq(C.rollBall(), 'black', '0.30 → 黑');
  C._setRand(() => 0.699999);
  eq(C.rollBall(), 'black', '0.699999 → 黑');
  C._setRand(() => 0.70);
  eq(C.rollBall(), 'yellow', '0.70 → 黄');
  C._setRand(() => 0.999999);
  eq(C.rollBall(), 'yellow', '0.999999 → 黄');

  C._setRand(() => 0.000999);
  eq(C.rollLabor().wiped, true, '0.000999 → 清零');
  C._setRand(() => 0.001);
  eq(C.rollLabor().wiped, false, '0.001 → 不清零');
})();

/* ================= 8b. 赌博次数 ================= */
(() => {
  const s0 = C.getState();
  eq(s0.gambles, 0, '新档本次赌博次数为 0');
  eq(s0.winGambles, null, '新档还没有到达 1 万的纪录');

  C.recordGamble();
  eq(C.getState().gambles, 1, 'recordGamble 让次数 +1');

  // 到达 1 万时保留历史最少次数
  C._devSet({ winGambles: 5 });
  eq(C.noteWin(7), false, '7 次没有打破 5 次纪录');
  eq(C.getState().winGambles, 5, '没破纪录时保持 5 次');
  eq(C.noteWin(3), true, '3 次刷新最少纪录');
  eq(C.getState().winGambles, 3, '纪录更新为 3 次');
  eq(C.noteWin(3), false, '同样 3 次不算刷新');
  C._devSet({ winGambles: null });
  eq(C.noteWin(9), true, '第一次到达 1 万必定记纪录');
  eq(C.getState().winGambles, 9, '首次纪录为 9 次');
  C._devSet({ winGambles: null });
  eq(C.noteWin(0), true, '0 次也当有效数字保存，不和「没到过」混淆');
  eq(C.getState().winGambles, 0, '0 次纪录能保存');

  // 干苦力 + 五个赌桌入口都要记一次
  ['pressLabor', 'playBalls', 'envelopeDecide', 'doorDecide', 'playPetersburg', 'resolveGate'].forEach(function (name) {
    const re = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}');
    const mm = m[1].match(re);
    ok(mm && mm[0].includes('recordGamble()'), name + ' 会记一次赌博');
  });
})();

/* ================= 8c. 每日重开机会 ================= */
(() => {
  eq(C.restartLimit, 5, '每人每天 5 次重开机会');
  eq(C.restartsLeft(), 5, '一开始剩 5 次');
  eq(C.consumeRestart(), 4, '用掉一次剩 4 次');
  eq(C.restartsLeft(), 4, '剩余次数会持久化');
  C.consumeRestart();
  C.consumeRestart();
  C.consumeRestart();
  eq(C.restartsLeft(), 1, '用掉 4 次后剩 1 次');
  eq(C.consumeRestart(), 0, '用掉第 5 次后剩 0');
  eq(C.restartsLeft(), 0, '用完后读到的仍是 0');
  eq(C.consumeRestart(), 0, '用完后不会变成负数');

  // 换一天自动恢复 5 次
  localStorage.setItem('tf_casino_restarts_v1:guest',
    JSON.stringify({ day: '2000-01-01', used: 5 }));
  eq(C.restartsLeft(), 5, '到了新的一天自动恢复 5 次');

  // 创始人账号：waynelee / 2810303976@qq.com 无限次
  eq(C.unlimitedRestarts, -2, '服务端用 -2 表示创始人无限次');
  ok(C.isFounderIdent('waynelee'), '用户名 waynelee 是创始人');
  ok(C.isFounderIdent('WayneLee'), '创始人用户名大小写不敏感');
  ok(C.isFounderIdent('2810303976@qq.com'), '创始人邮箱也算');
  ok(!C.isFounderIdent('waynelee666'), 'GitHub 名 waynelee666 不是用户名，别误判');
  ok(!C.isFounderIdent('guest'), '游客不是创始人');
  ok(!C.isFounderIdent(''), '空账号不是创始人');
})();

/* ================= 9. 静态接线检查 ================= */
(() => {
  // JS 里用到的所有 id 必须在 HTML 里存在
  const ids = new Set();
  for (const mm of m[1].matchAll(/\$\('#([\w-]+)'\)/g)) ids.add(mm[1]);
  for (const mm of m[1].matchAll(/getElementById\('([\w-]+)'\)/g)) ids.add(mm[1]);
  for (const id of ids) {
    ok(html.includes('id="' + id + '"'), 'HTML 中存在 id=' + id);
  }

  // 五个游戏入口 + 排行榜 + 弹窗
  ['labor', 'balls', 'envelope', 'doors', 'petersburg'].forEach(function (g) {
    ok(html.includes('data-game="' + g + '"'), '大厅有 ' + g + ' 入口');
  });
  ok(html.includes('id="overlay"'), '有弹窗容器');
  ok(html.includes('src="supabase.min.js"'), '引用了 supabase.min.js');
  ok(html.includes('src="auth.js?v=3.2"'), '引用了 auth.js');

  // 主页接入 + SW 预缓存
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(index.includes('data-tab="casino"'), 'index.html 有娱乐入口卡');
  ok(index.includes('id="view-casino"'), 'index.html 有 casino 视图');
  ok(index.includes('src="casino.html"'), 'casino 视图 iframe 指向 casino.html');

  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  ok(sw.includes('"/casino.html"'), 'sw.js 预缓存 casino.html');
  ok(/taskflow-v(5[1-9]|[6-9]\d)/.test(sw), 'sw.js 缓存版本已提升');

  // 服务端每日重开限制
  ok(m[1].includes("rpc('game_restart_status')"), '客户端读取服务端剩余重开次数');
  ok(m[1].includes("rpc('game_restart_consume')"), '客户端在服务端原子扣次数');
  const restartSql = fs.readFileSync(path.join(ROOT, 'game_restarts_setup.sql'), 'utf8');
  ok(restartSql.includes('function public.game_restart_consume'), 'SQL 里有扣次数函数');
  ok(restartSql.includes('function public.game_is_founder'), 'SQL 里有创始人判断函数');
  ok(restartSql.includes('2810303976@qq.com'), 'SQL 按登录邮箱识别创始人');
  ok(restartSql.includes('return -2'), 'SQL 对创始人返回无限次标记 -2');
  ok(restartSql.includes("Asia/Shanghai"), 'SQL 按中国时区计算每天');
  ok(restartSql.includes('security definer'), 'SQL 函数用 security definer 保护表');
  ok(m[1].includes('UNLIMITED_RESTARTS'), '客户端识别无限次标记');
  ok(m[1].includes('function restartStatus'), '客户端统一读取重开状态');
  ok(m[1].includes('创始人账号'), '客户端有创始人提示文案');
})();

C._setRand(Math.random);
console.log('All ' + passed + ' assertions passed.');
