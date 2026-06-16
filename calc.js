/* ============================================================
   微积分复习模块  v1.0
   ============================================================ */

// ==================== 复习章节 ====================
// 根据教材目录：微积分（甲）Ⅰ → 第1-7章，微积分（甲）Ⅱ → 第8-13章
const CALC_CHAPTERS = [
    // ── 微积分（甲）Ⅰ ──
    '函数与极限',
    '导数与微分',
    '微分中值定理与导数的应用',
    '不定积分',
    '定积分',
    '定积分的应用',
    '微分方程',
    // ── 微积分（甲）Ⅱ ──
    '向量代数与空间解析几何',      // Ch7: 行列式→矢量→平面直线→曲面曲线→二次曲面
    '多元函数微分学',               // Ch8: 极限连续+偏导数全微分+复合隐函数+方向导数梯度+极值+泰勒+几何应用
    '二重积分与三重积分',           // Ch9 §1-3: 直角坐标/极坐标/柱面坐标/球面坐标
    '曲线积分与曲面积分',           // Ch9 §4-5 + Ch10: 第一类+第二类+格林+高斯+斯托克斯
    '无穷级数',                     // Ch11: 数项级数+正项级数+交错级数+函数项级数+幂级数+傅里叶
    '含参量积分',                   // Ch12: 含参量常义积分+反常积分+Γ函数+B函数
];

// 从 localStorage 加载复习进度
function loadCalcProgress() {
    try {
        return JSON.parse(localStorage.getItem('calc_progress') || '{}');
    } catch (e) { return {}; }
}
function saveCalcProgress(prog) {
    localStorage.setItem('calc_progress', JSON.stringify(prog));
}

function renderCalcPlan() {
    const el = document.getElementById('calcPlan');
    if (!el) return;
    const progress = loadCalcProgress();

    el.innerHTML = CALC_CHAPTERS.map((ch, i) => {
        const p = progress[ch] || {};
        const date = p.date || '';
        const done = p.done || false;
        return `<div class="calc-chapter ${done ? 'calc-chapter--done' : ''}">
            <div class="calc-chapter__check" data-ch="${ch}" title="标记完成">${done ? '☑' : '☐'}</div>
            <div class="calc-chapter__name">${i + 1}. ${ch}</div>
            <input type="date" class="calc-chapter__date" data-ch="${ch}" value="${date}" title="计划复习日期">
        </div>`;
    }).join('');

    // 绑定事件
    el.querySelectorAll('.calc-chapter__check').forEach(btn => {
        btn.addEventListener('click', () => {
            const ch = btn.dataset.ch;
            const p = loadCalcProgress();
            p[ch] = p[ch] || {};
            p[ch].done = !p[ch].done;
            saveCalcProgress(p);
            renderCalcPlan();
        });
    });
    el.querySelectorAll('.calc-chapter__date').forEach(input => {
        input.addEventListener('change', () => {
            const ch = input.dataset.ch;
            const p = loadCalcProgress();
            p[ch] = p[ch] || {};
            p[ch].date = input.value;
            saveCalcProgress(p);
        });
    });
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
function renderCalcView() {
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
            localStorage.removeItem('calc_progress');
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
