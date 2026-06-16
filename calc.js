/* ============================================================
   微积分复习模块  v2.0 — 章节可展开，逐节追踪
   ============================================================ */

// ==================== 复习章节（含小节） ====================
const CALC_CHAPTERS = [
    {
        name: '第7章 向量代数与空间解析几何',
        sections: [
            '§7.1 行列式及线性方程组',
            '§7.2 矢量概念及矢量的线性运算',
            '§7.3 空间直角坐标系与矢量的坐标表达式',
            '§7.4 两矢量的数量积与矢量积',
            '§7.5 矢量的线性组合与矢量的分解',
            '§7.6 平面与直线方程',
            '§7.7 曲面方程与空间曲线方程',
            '§7.8 二次曲面',
        ]
    },
    {
        name: '第8章 多元函数微分学',
        sections: [
            '§8.1 多元函数的极限与连续性',
            '§8.2 偏导数与全微分',
            '§8.3 复合函数微分法',
            '§8.4 隐函数的偏导数',
            '§8.5 场的方向导数与梯度',
            '§8.6 多元函数的极值及应用',
            '§8.7 偏导数在几何上的应用',
            '§8.8 多元函数的泰勒公式',
        ]
    },
    {
        name: '第9章 二重积分与三重积分',
        sections: [
            '§9.1 二重积分的概念与性质',
            '§9.2 二重积分的计算（直角坐标）',
            '§9.3 二重积分的计算（极坐标）',
            '§9.4 三重积分的概念',
            '§9.5 三重积分的计算（直角坐标）',
            '§9.6 三重积分的计算（柱面/球面坐标）',
        ]
    },
    {
        name: '第10章 曲线积分与曲面积分',
        sections: [
            '§10.1 第一类曲线积分',
            '§10.2 第一类曲面积分',
            '§10.3 第二类曲线积分',
            '§10.4 格林公式',
            '§10.5 平面曲线积分与路径无关性',
            '§10.6 第二类曲面积分',
            '§10.7 高斯公式与散度场',
            '§10.8 斯托克斯公式与旋度场',
        ]
    },
    {
        name: '第11章 无穷级数',
        sections: [
            '§11.1 数项级数的基本概念与性质',
            '§11.2 正项级数敛散性的判别法',
            '§11.3 交错级数与绝对收敛',
            '§11.4 函数项级数与一致收敛性',
            '§11.5 幂级数及其收敛半径',
            '§11.6 幂级数的性质与和函数',
            '§11.7 函数展成幂级数',
            '§11.8 幂级数的应用',
            '§11.9 函数的傅里叶展开',
        ]
    },
    {
        name: '第12章 含参量积分',
        sections: [
            '§12.1 含参量的常义积分',
            '§12.2 含参量的反常积分',
            '§12.3 Γ函数',
            '§12.4 B函数与Γ-B关系',
        ]
    },
];

// ==================== 进度管理（Supabase 持久化 + localStorage 兜底） ====================
const CALC_KEY = 'calc_progress';
let _progressCache = null;  // 内存缓存，避免反复 async

async function initProgress() {
    // 先读 localStorage（秒开）
    let local = {};
    try { local = JSON.parse(localStorage.getItem(CALC_KEY) || '{}'); } catch (e) {}
    _progressCache = local;

    // 异步从 Supabase 同步
    try {
        const { data } = await Auth.getClient().from('calc_progress').select('progress').single();
        if (data && data.progress) {
            _progressCache = data.progress;
            localStorage.setItem(CALC_KEY, JSON.stringify(data.progress));
        }
    } catch (e) { /* 表不存在或网络错误，用本地数据 */ }
}

function getProgress() {
    if (!_progressCache) {
        try { _progressCache = JSON.parse(localStorage.getItem(CALC_KEY) || '{}'); } catch (e) { _progressCache = {}; }
    }
    return _progressCache;
}

function saveProgress(prog) {
    _progressCache = prog;
    // 同步写 localStorage（离线可用）
    localStorage.setItem(CALC_KEY, JSON.stringify(prog));
    // 异步写 Supabase（不阻塞 UI）
    (async () => {
        try {
            const sb = Auth.getClient();
            const u = await sb.auth.getUser();
            const userId = u.data.user.id;
            const { data: existing } = await sb.from('calc_progress').select('id').eq('user_id', userId).maybeSingle();
            if (existing) {
                await sb.from('calc_progress').update({ progress: prog, updated_at: new Date().toISOString() }).eq('user_id', userId);
            } else {
                await sb.from('calc_progress').insert({ user_id: userId, progress: prog });
            }
        } catch (e) { /* 静默忽略 */ }
    })();
}

/** 章节进度统计 */
function chapterStats(ch) {
    const progress = getProgress();
    const chData = progress[ch.name] || {};
    const total = ch.sections.length;
    const done = ch.sections.filter(s => chData[s] && chData[s].done).length;
    return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
}

// ==================== 渲染复习计划 ====================
function renderCalcPlan() {
    const el = document.getElementById('calcPlan');
    if (!el) return;
    const progress = getProgress();

    el.innerHTML = CALC_CHAPTERS.map((ch, i) => {
        const stats = chapterStats(ch);
        const chData = progress[ch.name] || {};
        const expanded = chData._expanded !== false; // 默认展开
        const chDone = stats.done === stats.total && stats.total > 0;

        const sectionHTML = ch.sections.map(sec => {
            const sData = chData[sec] || {};
            const sDone = sData.done || false;
            const sDate = sData.date || '';
            return `<div class="calc-section ${sDone ? 'calc-section--done' : ''}">
                <div class="calc-section__check" data-ch="${escAttr(ch.name)}" data-sec="${escAttr(sec)}">${sDone ? '☑' : '☐'}</div>
                <span class="calc-section__name">${esc(sec)}</span>
                <input type="date" class="calc-section__date" data-ch="${escAttr(ch.name)}" data-sec="${escAttr(sec)}" value="${sDate}" title="计划日期">
            </div>`;
        }).join('');

        // 章节日期（用于整章规划）
        const chDate = chData._date || '';

        return `<div class="calc-chapter ${chDone ? 'calc-chapter--done' : ''}">
            <div class="calc-chapter__header" data-ch="${escAttr(ch.name)}">
                <div class="calc-chapter__arrow">${expanded ? '▼' : '▶'}</div>
                <div class="calc-chapter__check" data-ch="${escAttr(ch.name)}" data-action="toggle-chapter">${chDone ? '☑' : '☐'}</div>
                <div class="calc-chapter__info">
                    <div class="calc-chapter__name">${esc(ch.name)}</div>
                    <div class="calc-chapter__progress">
                        <div class="calc-chapter__bar"><div class="calc-chapter__fill" style="width:${stats.pct}%"></div></div>
                        <span class="calc-chapter__stat">${stats.done}/${stats.total}</span>
                    </div>
                </div>
                <input type="date" class="calc-chapter__date" data-ch="${escAttr(ch.name)}" value="${chDate}" title="整章计划日期" onclick="event.stopPropagation()">
            </div>
            <div class="calc-chapter__body" style="${expanded ? '' : 'display:none'}">
                ${sectionHTML}
            </div>
        </div>`;
    }).join('');

    bindCalcEvents();
}

function bindCalcEvents() {
    const el = document.getElementById('calcPlan');
    if (!el) return;

    // 展开/折叠章节
    el.querySelectorAll('.calc-chapter__header').forEach(header => {
        header.addEventListener('click', (e) => {
            // 不拦截 checkbox 和 date input 的点击
            if (e.target.closest('.calc-chapter__check') || e.target.closest('.calc-chapter__date')) return;

            const chName = header.dataset.ch;
            const body = header.nextElementSibling;
            const arrow = header.querySelector('.calc-chapter__arrow');
            const progress = getProgress();
            const chData = progress[chName] || {};
            const expanded = body.style.display !== 'none';

            if (expanded) {
                body.style.display = 'none';
                arrow.textContent = '▶';
                chData._expanded = false;
            } else {
                body.style.display = '';
                arrow.textContent = '▼';
                chData._expanded = true;
            }
            progress[chName] = chData;
            saveProgress(progress);
        });
    });

    // 整章勾选
    el.querySelectorAll('.calc-chapter__check[data-action="toggle-chapter"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const chName = btn.dataset.ch;
            const ch = CALC_CHAPTERS.find(c => c.name === chName);
            if (!ch) return;
            const progress = getProgress();
            const chData = progress[chName] || {};
            const stats = chapterStats(ch);
            const allDone = stats.done === stats.total;

            // 全部完成 → 全部取消；否则 → 全部完成
            const newVal = !allDone;
            ch.sections.forEach(sec => {
                if (!chData[sec]) chData[sec] = {};
                chData[sec].done = newVal;
            });
            progress[chName] = chData;
            saveProgress(progress);
            renderCalcPlan();
        });
    });

    // 小节勾选
    el.querySelectorAll('.calc-section__check').forEach(btn => {
        btn.addEventListener('click', () => {
            const chName = btn.dataset.ch;
            const secName = btn.dataset.sec;
            const progress = getProgress();
            const chData = progress[chName] || {};
            if (!chData[secName]) chData[secName] = {};
            chData[secName].done = !chData[secName].done;
            progress[chName] = chData;
            saveProgress(progress);
            renderCalcPlan();
        });
    });

    // 小节日期
    el.querySelectorAll('.calc-section__date').forEach(input => {
        input.addEventListener('change', (e) => {
            e.stopPropagation();
            const chName = input.dataset.ch;
            const secName = input.dataset.sec;
            const progress = getProgress();
            const chData = progress[chName] || {};
            if (!chData[secName]) chData[secName] = {};
            chData[secName].date = input.value;
            progress[chName] = chData;
            saveProgress(progress);
        });
    });

    // 整章日期
    el.querySelectorAll('.calc-chapter__date').forEach(input => {
        input.addEventListener('change', (e) => {
            e.stopPropagation();
            const chName = input.dataset.ch;
            const progress = getProgress();
            const chData = progress[chName] || {};
            chData._date = input.value;
            progress[chName] = chData;
            saveProgress(progress);
        });
    });
}

function escAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ==================== 多项式求导 ====================
function parsePolynomial(expr) {
    expr = expr.replace(/\s/g, '').replace(/\^/g, '^');
    const terms = [];
    // 匹配形如 系数x^指数 或 系数x 或 系数 的项
    const regex = /([+-]?\d*\.?\d*)x(?:\^(\d+))?|([+-]?\d*\.?\d+)(?![x\d])|([+-]?\d*\.?\d*)x(?!\^)/g;
    let match;
    while ((match = regex.exec(expr)) !== null) {
        let coef = 1, power = 0;
        if (match[3] !== undefined) {
            // 常数项 如 +5, -3
            coef = parseFloat(match[3]);
            power = 0;
        } else {
            // x 项
            const c = match[1];
            if (c === '' || c === '+' || c === undefined) coef = 1;
            else if (c === '-') coef = -1;
            else coef = parseFloat(c);
            power = match[2] ? parseInt(match[2]) : 1;
        }
        if (coef !== 0 || power !== 0) terms.push({ coef, power });
    }
    // 处理单独的 x（不带系数和幂）
    if (terms.length === 0) {
        const simple = expr.match(/^([+-]?\d*\.?\d*)x$/);
        if (simple) {
            const c = simple[1];
            let coef = 1;
            if (c === '-' || c === undefined || c === '') coef = c === '-' ? -1 : 1;
            else coef = parseFloat(c);
            terms.push({ coef, power: 1 });
        }
    }
    return terms;
}

function derivative(expr) {
    let terms = parsePolynomial(expr);
    if (terms.length === 0) return '无法解析，请使用格式如 3x^2+2x+1';
    const result = terms.map(t => {
        if (t.power === 0) return null; // 常数项导数为0
        const newCoef = t.coef * t.power;
        const newPower = t.power - 1;
        if (newPower === 0) return formatNum(newCoef);
        if (newPower === 1) return `${formatNum(newCoef)}x`;
        return `${formatNum(newCoef)}x^${newPower}`;
    }).filter(Boolean);
    if (result.length === 0) return '0';
    return result.join(' + ').replace(/\+ -/g, '- ');
}

function integral(expr) {
    let terms = parsePolynomial(expr);
    if (terms.length === 0) return '无法解析，请使用格式如 3x^2+2x+1';
    const result = terms.map(t => {
        const newPower = t.power + 1;
        const newCoef = t.coef / newPower;
        if (newPower === 1) return `${formatNum(newCoef)}x`;
        return `${formatNum(newCoef)}x^${newPower}`;
    });
    return result.join(' + ').replace(/\+ -/g, '- ') + ' + C';
}

function formatNum(n) {
    if (n === 1) return '';
    if (n === -1) return '-';
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(2).replace(/\.?0+$/, '');
}

// ==================== 公式速查 ====================
const FORMULAS = {
    derivative: [
        '(x^n)\' = n·x^(n-1)',
        '(sin x)\' = cos x',
        '(cos x)\' = -sin x',
        '(tan x)\' = sec² x',
        '(e^x)\' = e^x',
        '(ln x)\' = 1/x',
        '(a^x)\' = a^x·ln a',
        '(arcsin x)\' = 1/√(1-x²)',
        '(arctan x)\' = 1/(1+x²)',
        '(u±v)\' = u\' ± v\'',
        '(uv)\' = u\'v + uv\'',
        '(u/v)\' = (u\'v - uv\')/v²',
    ],
    integral: [
        '∫ x^n dx = x^(n+1)/(n+1) + C  (n≠-1)',
        '∫ 1/x dx = ln|x| + C',
        '∫ sin x dx = -cos x + C',
        '∫ cos x dx = sin x + C',
        '∫ e^x dx = e^x + C',
        '∫ a^x dx = a^x/ln a + C',
        '∫ 1/(1+x²) dx = arctan x + C',
        '∫ 1/√(1-x²) dx = arcsin x + C',
        '∫ tan x dx = -ln|cos x| + C',
        '∫ sec² x dx = tan x + C',
        '∫ ln x dx = x·ln x - x + C',
    ],
    trig: [
        'sin²x + cos²x = 1',
        '1 + tan²x = sec²x',
        'sin(2x) = 2sin x·cos x',
        'cos(2x) = cos²x - sin²x = 2cos²x - 1',
        'sin(x±y) = sin x·cos y ± cos x·sin y',
        'cos(x±y) = cos x·cos y ∓ sin x·sin y',
        'sin²x = (1 - cos(2x))/2',
        'cos²x = (1 + cos(2x))/2',
        '积化和差: sinα·cosβ = ½[sin(α+β) + sin(α-β)]',
        '积化和差: cosα·sinβ = ½[sin(α+β) - sin(α-β)]',
    ],
    taylor: [
        'e^x = 1 + x + x²/2! + x³/3! + ...',
        'sin x = x - x³/3! + x⁵/5! - ...',
        'cos x = 1 - x²/2! + x⁴/4! - ...',
        'ln(1+x) = x - x²/2 + x³/3 - ...  (|x|<1)',
        '1/(1-x) = 1 + x + x² + x³ + ...  (|x|<1)',
        '(1+x)^α = 1 + αx + α(α-1)x²/2! + ...  (|x|<1)',
        'arctan x = x - x³/3 + x⁵/5 - ...  (|x|≤1)',
        'arcsin x = x + x³/6 + 3x⁵/40 + ...  (|x|<1)',
    ],
    vector: [
        'a·b = |a||b|cosθ = a₁b₁+a₂b₂+a₃b₃',
        '|a×b| = |a||b|sinθ，方向右手定则',
        'a×b = (a₂b₃-a₃b₂, a₃b₁-a₁b₃, a₁b₂-a₂b₁)',
        '混合积: (a×b)·c = 行列式|a₁ a₂ a₃; b₁ b₂ b₃; c₁ c₂ c₃|',
        '平面方程: A(x-x₀)+B(y-y₀)+C(z-z₀)=0',
        '直线方程: (x-x₀)/m = (y-y₀)/n = (z-z₀)/p',
    ],
    multi: [
        '方向导数: ∂f/∂l = f_x·cosα + f_y·cosβ + f_z·cosγ',
        '梯度: grad f = (f_x, f_y, f_z)',
        '全微分: dz = (∂z/∂x)dx + (∂z/∂y)dy',
        '极坐标二重积分: ∬f dxdy = ∬f(r,θ)·r drdθ',
        '柱面坐标三重: ∭f dxdydz = ∭f(r,θ,z)·r drdθdz',
        '球面坐标三重: ∭f dxdydz = ∭f(r,θ,φ)·r²sinφ drdθdφ',
    ],
    green_gauss_stokes: [
        '格林公式: ∮_L Pdx+Qdy = ∬_D (∂Q/∂x - ∂P/∂y) dxdy',
        '高斯公式: ∯_S Pdydz+Qdzdx+Rdxdy = ∭_V (∂P/∂x+∂Q/∂y+∂R/∂z) dV',
        '斯托克斯: ∮_L Pdx+Qdy+Rdz = ∬_S (∂R/∂y-∂Q/∂z)dydz + ...',
        '散度: div F = ∂P/∂x + ∂Q/∂y + ∂R/∂z',
        '旋度: rot F = (∂R/∂y-∂Q/∂z, ∂P/∂z-∂R/∂x, ∂Q/∂x-∂P/∂y)',
    ],
    fourier: [
        'f(x) ~ a₀/2 + Σ(a_n·cos(nx) + b_n·sin(nx))',
        'a_n = (1/π)∫₋π^π f(x)cos(nx)dx  (n=0,1,2,...)',
        'b_n = (1/π)∫₋π^π f(x)sin(nx)dx  (n=1,2,...)',
        '奇函数: f(x) ~ Σ b_n·sin(nx)  (正弦级数)',
        '偶函数: f(x) ~ a₀/2 + Σ a_n·cos(nx)  (余弦级数)',
        '复数形式: f(x) ~ Σ c_n·e^(inx), c_n = (1/2π)∫₋π^π f(x)e^(-inx)dx',
    ],
    gamma_beta: [
        'Γ(s) = ∫₀^∞ x^(s-1)·e^(-x) dx  (s>0)',
        'Γ(n+1) = n!  (n∈ℕ)',
        'Γ(1/2) = √π',
        'B(p,q) = ∫₀¹ x^(p-1)·(1-x)^(q-1) dx',
        'B(p,q) = Γ(p)Γ(q) / Γ(p+q)',
    ],
};

// ==================== 渲染入口 ====================
async function renderCalcView() {
    await initProgress();
    renderCalcPlan();
}

// ==================== 事件绑定 ====================
document.addEventListener('DOMContentLoaded', () => {
    // 导数计算
    document.getElementById('calcDerivativeBtn')?.addEventListener('click', () => {
        const input = document.getElementById('calcDerivativeInput').value.trim();
        const result = document.getElementById('calcDerivativeResult');
        if (!input) { result.textContent = '请输入函数'; return; }
        result.innerHTML = `<span style="color:var(--color-primary)">${esc(derivative(input))}</span>`;
    });

    // 积分计算
    document.getElementById('calcIntegralBtn')?.addEventListener('click', () => {
        const input = document.getElementById('calcIntegralInput').value.trim();
        const result = document.getElementById('calcIntegralResult');
        if (!input) { result.textContent = '请输入函数'; return; }
        result.innerHTML = `<span style="color:var(--color-primary)">${esc(integral(input))}</span>`;
    });

    // 公式速查
    document.getElementById('calcFormulaSelect')?.addEventListener('change', (e) => {
        const key = e.target.value;
        const display = document.getElementById('calcFormulaDisplay');
        if (!key || !FORMULAS[key]) { display.innerHTML = ''; return; }
        display.innerHTML = FORMULAS[key].map(f => `<div>${esc(f)}</div>`).join('');
    });

    // 重置进度
    document.getElementById('calcResetBtn')?.addEventListener('click', () => {
        if (confirm('确定重置所有复习进度？')) {
            saveProgress({});
            renderCalcPlan();
        }
    });

    // 回车触发求导/积分
    document.getElementById('calcDerivativeInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('calcDerivativeBtn')?.click();
    });
    document.getElementById('calcIntegralInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('calcIntegralBtn')?.click();
    });
});

// esc() is provided by script.js (loaded before us)
