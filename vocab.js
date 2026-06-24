/* ============================================================
   TaskFlow - 单词复习模块  v1.0 — 闪卡学习模式
   ============================================================ */
console.log('📖 Vocab module loaded');

let studyWords = [];
let studyIndex = 0;
let studyFlipped = false;    // false=正面 | true=背面(中文) | 'loading'=AI查询中 | 'ai'=AI详情
let studyKnown = 0;
let studyUnknown = 0;
let studyIsReview = false;  // 是否在复习模式
let studyModeDir = 'en2cn'; // en2cn=看英文想意思 | cn2en=看中文拼英文
let studyDifficulty = 'all'; // 'all' | 'cet4' | 'cet6'
let studyConfig = null;     // 保存出题配置，供"换主题"复用
let studyCetPool = [];      // 高频四六级词池（用于换主题重新抽取）
let studyOtherPool = [];    // 其他词池（用于换主题重新抽取）

// 单词详情缓存（避免重复调用 AI）
const wordDetailCache = {};

async function lookupWordDetail(word, vocabObj) {
    // 优先：从数据库已存储的 oxford_detail 读取（毫秒级）
    if (vocabObj && vocabObj.oxford_detail) {
        const d = vocabObj.oxford_detail;
        return { ok: true, word: d.word || vocabObj.word, pos: d.pos, definition: d.definition, examples: d.examples, collocations: d.collocations };
    }
    // 其次：内存缓存
    const key = word.toLowerCase().trim();
    if (wordDetailCache[key]) return wordDetailCache[key];
    // 最后：调 AI API（兜底）
    try {
        const resp = await fetch('/api/word-lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word }),
        });
        const data = await resp.json();
        if (data.ok) {
            wordDetailCache[key] = data;
            return data;
        }
        console.warn('Word lookup failed:', data.error);
        return null;
    } catch (e) {
        console.error('Word lookup error:', e);
        return null;
    }
}

async function startVocabStudy() {
    studyIsReview = vocabUnit === '__review__';
    studyModeDir = $('#vocabStudyMode')?.value || 'en2cn';
    studyDifficulty = $('#vocabDifficulty')?.value || 'all';

    const filtered = studyIsReview
        ? vocabs.filter(v => v.review === true)
        : vocabs.filter(v => v.unit === vocabUnit && v.part === vocabPart);
    if (!filtered.length) {
        showToast(studyIsReview ? '复习表已清空 🎉' : '当前单元没有单词，请先添加或导入', 'error');
        return;
    }

    const rawCount = parseInt($('#vocabStudyCount')?.value || '0');
    const count = rawCount > 0 ? Math.min(rawCount, filtered.length) : filtered.length;

    // 保存配置供"换主题"使用
    studyConfig = { isReview: studyIsReview, unit: vocabUnit, part: vocabPart,
                    difficulty: studyDifficulty, count, modeDir: studyModeDir };

    // 进入加载状态
    $('#vocabList').style.display = 'none';
    $('#vocabUnitRow').style.display = 'none';
    $('#vocabPartRow').style.display = 'none';
    document.querySelector('.vocab-actions').style.display = 'none';
    $('#vocabStudy').style.display = '';
    $('#vocabStudy').innerHTML = `<div class="vocab-study-loading">
        <div class="vocab-flashcard__ai-spinner"></div>
        <p>🤖 AI 正在分析单词难度...</p>
    </div>`;

    try {
        // 1. 检查哪些单词尚未分类
        const unclassified = filtered.filter(w => !w._cetLevel);
        if (unclassified.length > 0) {
            const toClassify = unclassified.map(w => ({ word: w.word, meaning: w.meaning || '' }));
            const resp = await fetch('/api/classify-vocab', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ words: toClassify }),
            });
            const data = await resp.json();
            if (data.ok && data.classified) {
                // 缓存分类结果到单词对象
                const classMap = {};
                data.classified.forEach(c => { classMap[c.word] = c.level; });
                unclassified.forEach(w => {
                    w._cetLevel = classMap[w.word] || 'other';
                });
            }
        }

        // 2. 根据难度筛选
        const diff = studyDifficulty;
        let cetPool, otherPool;
        if (diff === 'cet4') {
            cetPool = filtered.filter(w => w._cetLevel === 'cet4_high');
            otherPool = filtered.filter(w => w._cetLevel !== 'cet4_high');
        } else if (diff === 'cet6') {
            cetPool = filtered.filter(w => w._cetLevel === 'cet6_high');
            otherPool = filtered.filter(w => w._cetLevel !== 'cet6_high');
        } else {
            // 'all': 四六级高频 vs 其他
            cetPool = filtered.filter(w => w._cetLevel === 'cet4_high' || w._cetLevel === 'cet6_high');
            otherPool = filtered.filter(w => !w._cetLevel || w._cetLevel === 'other');
        }

        // 保存词池供"换主题"使用
        studyCetPool = [...cetPool];
        studyOtherPool = [...otherPool];

        // 3. 按 80/20 比例抽取
        const cetCount = Math.round(count * 0.8);
        let otherCount = count - cetCount;

        // 如果 CET 池不够，从 other 补
        const actualCet = Math.min(cetCount, cetPool.length);
        let actualOther = Math.min(otherCount, otherPool.length);
        const shortfall = count - actualCet - actualOther;
        if (shortfall > 0) {
            // CET 池有剩余空间 → 从 CET 补
            const cetRemaining = cetPool.length - actualCet;
            if (cetRemaining >= shortfall) {
                actualCet += shortfall;
            } else {
                actualCet += cetRemaining;
                actualOther += (shortfall - cetRemaining);
            }
        }

        const shuffledCet = [...cetPool].sort(() => Math.random() - 0.5);
        const shuffledOther = [...otherPool].sort(() => Math.random() - 0.5);
        studyWords = [...shuffledCet.slice(0, actualCet), ...shuffledOther.slice(0, actualOther)]
            .sort(() => Math.random() - 0.5);
        studyConfig._actualCount = studyWords.length;

    } catch (e) {
        console.error('AI 分类失败，回退到随机抽取:', e);
        // 回退：纯随机
        const shuffled = [...filtered].sort(() => Math.random() - 0.5);
        studyWords = shuffled.slice(0, count);
        studyCetPool = [];
        studyOtherPool = [];
        studyConfig._actualCount = studyWords.length;
    }

    studyIndex = 0;
    studyFlipped = false;
    studyKnown = 0;
    studyUnknown = 0;

    renderStudyCard();
}

function renderStudyCard() {
    const container = $('#vocabStudy');
    if (studyIndex >= studyWords.length) {
        renderStudyEnd();
        return;
    }
    const word = studyWords[studyIndex];
    const progress = `${studyIndex + 1} / ${studyWords.length}`;
    const pct = studyWords.length > 0 ? Math.round(studyIndex / studyWords.length * 100) : 0;
    const isCn2en = studyModeDir === 'cn2en';
    const frontText = isCn2en ? esc(word.meaning) : esc(word.word);
    const backText = isCn2en ? esc(word.word) : esc(word.meaning);
    const showAiHint = studyFlipped === true; // 翻到背面后，提示可以再点击看 AI 详情
    const frontHint = isCn2en ? '拼写英文 ✏️' : (showAiHint ? '再次点击查看牛津释义 📖' : '点击翻转 👆');
    const frontClass = isCn2en ? 'vocab-flashcard__meaning' : 'vocab-flashcard__word';
    const backClass = isCn2en ? 'vocab-flashcard__word' : 'vocab-flashcard__meaning';

    // AI 详情
    const detail = word._aiDetail || null;
    const aiLoading = studyFlipped === 'loading';
    const aiReady = studyFlipped === 'ai' && detail;
    const showAiSection = aiLoading || aiReady;
    let aiHTML = '';
    if (aiLoading) {
        aiHTML = `<div class="vocab-flashcard__ai vocab-flashcard__ai--loading">
            <div class="vocab-flashcard__ai-spinner"></div>
            <span>AI 正在查询牛津词典...</span>
        </div>`;
    } else if (aiReady) {
        const examplesHTML = (detail.examples || []).map(e => `<li>${esc(e)}</li>`).join('');
        const collocHTML = (detail.collocations || []).length
            ? `<div class="vocab-flashcard__ai-colloc"><strong>搭配:</strong> ${detail.collocations.map(c => esc(c)).join(' · ')}</div>`
            : '';
        aiHTML = `<div class="vocab-flashcard__ai">
            <div class="vocab-flashcard__ai-pos">${esc(detail.pos || '')}</div>
            <div class="vocab-flashcard__ai-def">${esc(detail.definition || '')}</div>
            ${collocHTML}
            <div class="vocab-flashcard__ai-examples">
                <strong>例句:</strong>
                <ul>${examplesHTML}</ul>
            </div>
        </div>`;
    }

    container.innerHTML = `
        <div class="vocab-flashcard">
            <div class="vocab-flashcard__progress">${progress}</div>
            <div class="vocab-flashcard__bar">
                <div class="vocab-flashcard__fill" style="width:${pct}%"></div>
            </div>
            <div class="vocab-flashcard__theme-row">
                <span class="vocab-difficulty-tag">${studyDifficulty === 'cet4' ? '📗 四级高频' : studyDifficulty === 'cet6' ? '📘 六级高频' : '📊 全部难度'}</span>
                <button class="vocab-flashcard__theme-btn" id="vocabThemeBtn" title="保持范围不变，重新随机抽题">🔄 换主题</button>
            </div>
            <div class="vocab-flashcard__card ${studyFlipped ? 'vocab-flashcard__card--flipped' : ''}" id="vocabFlashCard">
                <div class="vocab-flashcard__front">
                    <div class="${frontClass}">${frontText}</div>
                    <div class="vocab-flashcard__hint">${frontHint}</div>
                </div>
                <div class="vocab-flashcard__back" style="${studyFlipped ? '' : 'display:none'}">
                    <div class="${backClass}">${backText}</div>
                </div>
            </div>
            ${showAiSection ? aiHTML : ''}
            <div class="vocab-flashcard__buttons" id="vocabFlashBtns" style="${studyFlipped ? '' : 'display:none'}">
                <button class="vocab-flashcard__btn vocab-flashcard__btn--no" id="vocabBtnNo">不认识 ❌</button>
                <button class="vocab-flashcard__btn vocab-flashcard__btn--yes" id="vocabBtnYes">认识 ✅</button>
            </div>
            <div class="vocab-flashcard__exit">
                <button class="btn btn--outline btn--sm" id="vocabStudyExitBtn">← 返回列表</button>
            </div>
        </div>
    `;

    const card = document.getElementById('vocabFlashCard');
    if (card) card.addEventListener('click', flipCard);
    if (studyFlipped) {
        const btnYes = document.getElementById('vocabBtnYes');
        const btnNo = document.getElementById('vocabBtnNo');
        if (btnYes) btnYes.addEventListener('click', () => answerCard(true));
        if (btnNo) btnNo.addEventListener('click', () => answerCard(false));
    }
    const exitBtn = document.getElementById('vocabStudyExitBtn');
    if (exitBtn) exitBtn.addEventListener('click', exitStudyMode);
    const themeBtn = document.getElementById('vocabThemeBtn');
    if (themeBtn) themeBtn.addEventListener('click', changeStudyTheme);
}

async function flipCard() {
    if (!studyFlipped) {
        // 第一次点击：翻到背面（中文意思）
        studyFlipped = true;
        renderStudyCard();
        return;
    }
    if (studyFlipped === true) {
        // 第二次点击：查询 AI 英文释义（优先读 DB 的 oxford_detail）
        const word = studyWords[studyIndex];
        // 检查缓存或 DB 数据
        if (!word._aiDetail) {
            studyFlipped = 'loading';
            renderStudyCard();
            const detail = await lookupWordDetail(word.word, word);
            if (detail) {
                word._aiDetail = detail;
                studyFlipped = 'ai';
            } else {
                studyFlipped = true; // 失败回退
                showToast('查询失败，请稍后重试', 'error');
            }
        } else {
            studyFlipped = 'ai';
        }
        renderStudyCard();
        return;
    }
    // studyFlipped === 'loading' 或 'ai'：不做任何事
}

async function answerCard(known) {
    const word = studyWords[studyIndex];
    if (known) {
        studyKnown++;
        // 复习模式：认识了 → 移出复习表
        if (studyIsReview && word && word.id) {
            try {
                await DS.update('vocabulary', word.id, { review: false });
                // 同步本地数据
                const v = vocabs.find(x => x.id === word.id);
                if (v) v.review = false;
            } catch (e) { console.warn('更新复习状态失败:', e); }
        }
    } else {
        studyUnknown++;
        // 普通模式：不认识 → 加入复习表
        if (!studyIsReview && word && word.id) {
            try {
                await DS.update('vocabulary', word.id, { review: true });
                const v = vocabs.find(x => x.id === word.id);
                if (v) v.review = true;
            } catch (e) { console.warn('更新复习状态失败:', e); }
        }
    }
    studyFlipped = false;
    studyIndex++;
    renderStudyCard();
}

function renderStudyEnd() {
    const total = studyWords.length;
    const pct = total > 0 ? Math.round(studyKnown / total * 100) : 0;
    let emoji = '🎉', message = '太棒了！';
    if (pct < 60) { emoji = '💪'; message = '继续加油！'; }
    else if (pct < 80) { emoji = '👍'; message = '不错，继续努力！'; }

    const container = $('#vocabStudy');
    container.innerHTML = `
        <div class="vocab-study-end">
            <div class="vocab-study-end__emoji">${emoji}</div>
            <div class="vocab-study-end__message">${message}</div>
            <div class="vocab-study-end__score">
                <span class="vocab-study-end__big">${pct}%</span>
                <span>正确率</span>
            </div>
            <div class="vocab-study-end__stats">
                <div class="vocab-study-end__stat vocab-study-end__stat--yes">
                    <span>✅ 认识</span><strong>${studyKnown}</strong>
                </div>
                <div class="vocab-study-end__stat vocab-study-end__stat--no">
                    <span>❌ 不认识</span><strong>${studyUnknown}</strong>
                </div>
            </div>
            <div class="vocab-study-end__buttons">
                <button class="btn btn--primary" id="vocabStudyTheme">🔄 换主题</button>
                <button class="btn btn--outline" id="vocabStudyAgain">🔁 原题重做</button>
                <button class="btn btn--outline" id="vocabStudyBack">📋 返回列表</button>
            </div>
        </div>
    `;

    document.getElementById('vocabStudyTheme').addEventListener('click', () => {
        if (studyCetPool.length || studyOtherPool.length) {
            changeStudyTheme();
        } else {
            // 回退模式：无词池，直接重打乱
            studyIndex = 0;
            studyFlipped = false;
            studyKnown = 0;
            studyUnknown = 0;
            studyWords = studyWords.sort(() => Math.random() - 0.5);
            renderStudyCard();
        }
    });
    document.getElementById('vocabStudyAgain').addEventListener('click', () => {
        studyIndex = 0;
        studyFlipped = false;
        studyKnown = 0;
        studyUnknown = 0;
        studyWords = studyWords.sort(() => Math.random() - 0.5); // 重新打乱
        renderStudyCard();
    });
    document.getElementById('vocabStudyBack').addEventListener('click', exitStudyMode);
}

function changeStudyTheme() {
    if (!studyConfig) return;
    const { count } = studyConfig;
    const cetPool = studyCetPool;
    const otherPool = studyOtherPool;

    // 从保存的词池中重新按 80/20 随机抽取
    const cetCount = Math.round(count * 0.8);
    let otherCount = count - cetCount;

    const actualCet = Math.min(cetCount, cetPool.length);
    let actualOther = Math.min(otherCount, otherPool.length);
    const shortfall = count - actualCet - actualOther;
    if (shortfall > 0) {
        const cetRemaining = cetPool.length - actualCet;
        if (cetRemaining >= shortfall) {
            actualCet += shortfall;
        } else {
            actualCet += cetRemaining;
            actualOther += (shortfall - cetRemaining);
        }
    }

    const shuffledCet = [...cetPool].sort(() => Math.random() - 0.5);
    const shuffledOther = [...otherPool].sort(() => Math.random() - 0.5);
    studyWords = [...shuffledCet.slice(0, actualCet), ...shuffledOther.slice(0, actualOther)]
        .sort(() => Math.random() - 0.5);

    studyIndex = 0;
    studyFlipped = false;
    studyKnown = 0;
    studyUnknown = 0;

    renderStudyCard();
    showToast('🔄 已换新主题，加油！', 'info');
}

async function exitStudyMode() {
    $('#vocabList').style.display = '';
    $('#vocabUnitRow').style.display = '';
    $('#vocabPartRow').style.display = '';
    document.querySelector('.vocab-actions').style.display = '';
    $('#vocabStudy').style.display = 'none';
    await refreshAll();
    renderVocabView();
}

// 键盘快捷键：Enter 翻转，左右箭头作答
document.addEventListener('keydown', e => {
    if ($('#vocabStudy').style.display === 'none') return;
    if (studyIndex >= studyWords.length) return;
    if (!studyFlipped && e.key === 'Enter') {
        e.preventDefault();
        flipCard();
    } else if (studyFlipped === true) {
        // 翻到背面后：Enter 查 AI，左右箭头作答
        if (e.key === 'Enter') {
            e.preventDefault();
            flipCard();
        } else if (e.key === 'ArrowLeft') { e.preventDefault(); answerCard(true); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); answerCard(false); }
    } else if (studyFlipped === 'ai') {
        // AI 详情已显示：左右箭头作答
        if (e.key === 'ArrowLeft') { e.preventDefault(); answerCard(true); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); answerCard(false); }
    }
});


/* ============================================================
   TaskFlow - 单词练习模式  v1.0 — AI 选词填空
   ============================================================ */

// 练习状态
let practiceState = 'config';  // config | loading | exam | result
let practiceBlanks = [];       // [{number, word, first_letter, meaning}]
let practicePassage = '';      // 文章文本（含 [n]_____ 标记）
let practiceTitle = '';        // 文章标题
let practiceResult = null;     // 批改结果
let selectedUnits = new Set(); // 选中的 Unit/Part 组合，如 "U1-P1"
let practiceCount = 10;        // 出题数
let practiceCustomCount = 10;  // 自定义出题数
let practiceShowMeaning = false; // 是否在空格后显示中文释义
let practiceDifficulty = 'all';  // 'all' | 'cet4' | 'cet6'
let practiceFullPool = [];       // 保存全量词池供"换主题"使用

// 初始化：收集所有可用的 Unit/Part 组合
function getAvailableUnits() {
    const combos = new Set();
    vocabs.forEach(v => {
        if (v.unit && v.part) combos.add(`${v.unit}-${v.part}`);
    });
    // 按 U1-P1, U1-P2, U2-P1, ... 排序
    return [...combos].sort((a, b) => {
        const [au, ap] = a.split('-');
        const [bu, bp] = b.split('-');
        if (au !== bu) return au.localeCompare(bu);
        return ap.localeCompare(bp);
    });
}

function enterPracticeMode() {
    $('#vocabList').style.display = 'none';
    $('#vocabUnitRow').style.display = 'none';
    $('#vocabPartRow').style.display = 'none';
    document.querySelector('.vocab-actions').style.display = 'none';
    $('#vocabStudy').style.display = 'none';
    $('#vocabPractice').style.display = '';
    practiceState = 'config';
    selectedUnits.clear();
    practiceCount = 10;
    practiceCustomCount = 10;
    practiceShowMeaning = false;
    practiceBlanks = [];
    practicePassage = '';
    practiceTitle = '';
    practiceResult = null;
    practiceFullPool = [];
    renderPracticeConfig();
}

// 智能抽词：AI 分类 + 难度筛选 + 80/20 拆分
async function pickWordsForPractice(pool, difficulty, count) {
    practiceDifficulty = difficulty;
    // 保存全量词池供"换主题"使用
    practiceFullPool = [...pool];

    // 1. 分类未分类的单词
    const unclassified = pool.filter(w => !w._cetLevel);
    if (unclassified.length > 0) {
        const toClassify = unclassified.map(w => ({ word: w.word, meaning: w.meaning || '' }));
        try {
            const resp = await fetch('/api/classify-vocab', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ words: toClassify }),
            });
            const data = await resp.json();
            if (data.ok && data.classified) {
                const classMap = {};
                data.classified.forEach(c => { classMap[c.word] = c.level; });
                unclassified.forEach(w => {
                    w._cetLevel = classMap[w.word] || 'other';
                });
            }
        } catch (e) {
            console.warn('AI 分类失败，所有单词视为 other:', e);
            unclassified.forEach(w => { w._cetLevel = 'other'; });
        }
    }

    // 2. 根据难度拆分 CET 池 vs Other 池
    let cetPool, otherPool;
    if (difficulty === 'cet4') {
        cetPool = pool.filter(w => w._cetLevel === 'cet4_high');
        otherPool = pool.filter(w => w._cetLevel !== 'cet4_high');
    } else if (difficulty === 'cet6') {
        cetPool = pool.filter(w => w._cetLevel === 'cet6_high');
        otherPool = pool.filter(w => w._cetLevel !== 'cet6_high');
    } else {
        cetPool = pool.filter(w => w._cetLevel === 'cet4_high' || w._cetLevel === 'cet6_high');
        otherPool = pool.filter(w => !w._cetLevel || w._cetLevel === 'other');
    }

    // 3. 按 80/20 比例从两池抽取
    const cetCount = Math.round(count * 0.8);
    const otherCount = count - cetCount;

    let actualCet = Math.min(cetCount, cetPool.length);
    let actualOther = Math.min(otherCount, otherPool.length);
    let shortfall = count - actualCet - actualOther;
    // 不够的从另一池补
    while (shortfall > 0) {
        const cetRemaining = cetPool.length - actualCet;
        const otherRemaining = otherPool.length - actualOther;
        if (cetRemaining >= shortfall) { actualCet += shortfall; break; }
        if (otherRemaining >= shortfall) { actualOther += shortfall; break; }
        actualCet += cetRemaining;
        shortfall -= cetRemaining;
        if (shortfall > 0) { actualOther += Math.min(shortfall, otherRemaining); break; }
    }

    const shuffledCet = [...cetPool].sort(() => Math.random() - 0.5);
    const shuffledOther = [...otherPool].sort(() => Math.random() - 0.5);
    return [...shuffledCet.slice(0, actualCet), ...shuffledOther.slice(0, actualOther)]
        .sort(() => Math.random() - 0.5);
}

// 换主题：保持范围/难度/题数，重新抽词出题
async function changePracticeTheme() {
    if (!practiceFullPool.length || practiceState !== 'exam') return;

    let count = practiceCount;
    if (document.querySelector('.practice-count-btn[data-count="custom"].active')) {
        count = practiceCustomCount;
    }
    count = Math.min(count, practiceFullPool.length);

    practiceState = 'loading';
    $('#practiceExam').style.display = 'none';
    $('#practiceLoading').style.display = '';
    const loadingText = document.querySelector('.practice-loading__text');
    const loadingSub = document.querySelector('.practice-loading__sub');
    if (loadingText) loadingText.innerHTML = '换主题中<span id="practiceLoadingDots">.</span>';
    if (loadingSub) loadingSub.textContent = 'AI 正在重新挑选单词并创作文章 🤔';
    const dotsEl = $('#practiceLoadingDots');
    let dotTimer = setInterval(() => {
        if (dotsEl) { const d = dotsEl.textContent; dotsEl.textContent = d.length >= 3 ? '.' : d + '.'; }
    }, 500);

    try {
        const selected = await pickWordsForPractice(practiceFullPool, practiceDifficulty, count);
        const words = selected.map(v => ({ word: v.word, meaning: v.meaning }));
        const resp = await fetch('/api/generate-practice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ words, count }),
        });
        const data = await resp.json();
        clearInterval(dotTimer);

        if (!data.ok) {
            showToast(data.error || '换主题失败', 'error');
            renderPracticeExam();
            return;
        }

        practiceBlanks = data.blanks || [];
        practicePassage = data.passage || '';
        practiceTitle = data.title || '选词填空练习';
        practiceState = 'exam';
        practiceResult = null;
        renderPracticeExam();
        showToast('🔄 已换新主题，加油！', 'info');

    } catch (e) {
        clearInterval(dotTimer);
        console.error('换主题失败:', e);
        showToast('换主题失败，请检查网络连接', 'error');
        renderPracticeExam();
    }
}

function renderPracticeConfig() {
    // 显示配置，隐藏其他阶段
    $('#practiceConfig').style.display = '';
    $('#practiceLoading').style.display = 'none';
    $('#practiceExam').style.display = 'none';
    $('#practiceResult').style.display = 'none';

    // 渲染 Unit/Part 复选框
    const units = getAvailableUnits();
    if (!units.length) {
        $('#practiceUnits').innerHTML = '<p class="empty-text">还没有单词，请先添加或导入 📖</p>';
        $('#practiceStartBtn').disabled = true;
    } else {
        $('#practiceUnits').innerHTML = units.map(u => {
            const checked = selectedUnits.has(u) ? 'checked' : '';
            const cnt = vocabs.filter(v => `${v.unit}-${v.part}` === u).length;
            return `<label class="practice-unit-check">
                <input type="checkbox" value="${u}" ${checked} class="practice-unit-cb">
                <span>${u} <small>(${cnt}词)</small></span>
            </label>`;
        }).join('');
        $('#practiceStartBtn').disabled = selectedUnits.size === 0;
    }

    // 渲染出题数按钮
    const countBtns = document.querySelectorAll('.practice-count-btn');
    countBtns.forEach(b => {
        const isActive = (b.dataset.count === 'custom' && practiceCount === practiceCustomCount)
            || parseInt(b.dataset.count) === practiceCount;
        b.classList.toggle('active', isActive);
    });
    const customInput = $('#practiceCustomCount');
    if (practiceCount !== 10 && practiceCount !== 15 && practiceCount !== 20) {
        customInput.style.display = '';
        customInput.value = practiceCount;
    } else {
        customInput.style.display = 'none';
    }

    // 同步「显示释义」复选框
    const meaningCB = $('#practiceShowMeaning');
    if (meaningCB) meaningCB.checked = practiceShowMeaning;
}

// 监听「显示释义」复选框变化
$('#practiceShowMeaning')?.addEventListener('change', () => {
    practiceShowMeaning = $('#practiceShowMeaning')?.checked || false;
});

// 出题数按钮点击
document.addEventListener('click', e => {
    const countBtn = e.target.closest('.practice-count-btn');
    if (!countBtn) return;
    e.preventDefault();
    document.querySelectorAll('.practice-count-btn').forEach(b => b.classList.remove('active'));
    countBtn.classList.add('active');
    const val = countBtn.dataset.count;
    const customInput = $('#practiceCustomCount');
    if (val === 'custom') {
        customInput.style.display = '';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
        practiceCount = parseInt(val);
    }
});

// 自定义题数输入
document.addEventListener('input', e => {
    if (e.target.id === 'practiceCustomCount') {
        const v = parseInt(e.target.value) || 10;
        practiceCustomCount = Math.max(1, Math.min(30, v));
    }
});

// 复选框变化
$('#practiceUnits')?.addEventListener('change', e => {
    if (e.target.classList.contains('practice-unit-cb')) {
        if (e.target.checked) selectedUnits.add(e.target.value);
        else selectedUnits.delete(e.target.value);
        // 实时更新开始按钮状态
        const startBtn = $('#practiceStartBtn');
        if (startBtn) startBtn.disabled = selectedUnits.size === 0;
    }
});

// 开始出题
$('#practiceStartBtn')?.addEventListener('click', async () => {
    // 收集选中范围的单词
    if (selectedUnits.size === 0) {
        showToast('请至少选择一个单元范围', 'error');
        return;
    }
    practiceDifficulty = $('#practiceDifficulty')?.value || 'all';
    const pool = vocabs.filter(v => selectedUnits.has(`${v.unit}-${v.part}`));
    if (!pool.length) {
        showToast('选中范围内没有单词', 'error');
        return;
    }

    // 确定题数
    let count = practiceCount;
    if (document.querySelector('.practice-count-btn[data-count="custom"].active')) {
        count = practiceCustomCount;
    }
    if (count > pool.length) {
        count = pool.length;
        showToast(`选中范围仅 ${pool.length} 个单词，已自动调整题数`, 'info');
    }
    if (count < 1) {
        showToast('出题数至少为 1', 'error');
        return;
    }

    // 进入 loading 状态
    practiceState = 'loading';
    practiceCount = count;
    $('#practiceConfig').style.display = 'none';
    $('#practiceLoading').style.display = '';
    $('#practiceExam').style.display = 'none';
    $('#practiceResult').style.display = 'none';

    // loading 动画 — 点点点
    const dotsEl = $('#practiceLoadingDots');
    let dotTimer = setInterval(() => {
        if (dotsEl) {
            const d = dotsEl.textContent;
            dotsEl.textContent = d.length >= 3 ? '.' : d + '.';
        }
    }, 500);

    try {
        // 智能抽词：AI 分类 → 难度筛选 → 80/20 拆分
        const selected = await pickWordsForPractice(pool, practiceDifficulty, count);
        const words = selected.map(v => ({ word: v.word, meaning: v.meaning }));
        const resp = await fetch('/api/generate-practice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ words, count }),
        });
        const data = await resp.json();
        clearInterval(dotTimer);

        if (!data.ok) {
            showToast(data.error || '出题失败', 'error');
            renderPracticeConfig();
            return;
        }

        practiceBlanks = data.blanks || [];
        practicePassage = data.passage || '';
        practiceTitle = data.title || '选词填空练习';
        practiceState = 'exam';
        renderPracticeExam();

    } catch (e) {
        clearInterval(dotTimer);
        console.error('出题失败:', e);
        showToast('出题失败，请检查网络连接', 'error');
        renderPracticeConfig();
    }
});

// 返回列表
$('#practiceBackBtn')?.addEventListener('click', exitPracticeMode);
$('#practiceCancelBtn')?.addEventListener('click', () => {
    if (practiceState === 'result') {
        exitPracticeMode();
    } else {
        exitPracticeMode();
    }
});
$('#practiceThemeBtn')?.addEventListener('click', changePracticeTheme);

function renderPracticeExam() {
    practiceState = 'exam';
    $('#practiceConfig').style.display = 'none';
    $('#practiceLoading').style.display = 'none';
    $('#practiceExam').style.display = '';
    $('#practiceResult').style.display = 'none';

    // 标题和信息
    $('#practiceExamTitle').textContent = practiceTitle;
    $('#practiceExamInfo').textContent = `${practiceBlanks.length} 个空 · 注意首字母提示`;

    // 渲染文章：将 [n]_____ 替换为高亮标记
    let html = esc(practicePassage);
    // 按题号从大到小替换避免序号冲突（如 [11] 包含 [1]）
    const sorted = [...practiceBlanks].sort((a, b) => b.number - a.number);
    sorted.forEach(b => {
        const marker = `[${b.number}]_____`;
        const escapeMarker = esc(marker);
        const replacement = `<mark class="practice-blank" data-n="${b.number}" title="题号 ${b.number} · 首字母: ${b.first_letter}">[${b.number}] <em>${esc(b.first_letter)}...</em></mark>`;
        html = html.split(escapeMarker).join(replacement);
    });
    $('#practiceExamPassage').innerHTML = html;

    // 渲染答题区
    let answerHTML = '';
    sorted.sort((a, b) => a.number - b.number).forEach(b => {
        const meaningTag = practiceShowMeaning
            ? (b.meaning ? `<span class="practice-answer-meaning">${esc(b.meaning)}</span>` : '')
            : (b.meaning ? `<button class="practice-answer-hint-btn" data-n="${b.number}" data-meaning="${esc(b.meaning)}" title="点击查看释义">💡</button>` : '');
        answerHTML += `
            <div class="practice-answer-item">
                <span class="practice-answer-num">${b.number}.</span>
                <span class="practice-answer-hint">${esc(b.first_letter)}</span>
                <input class="practice-answer-input" id="practiceAnswer${b.number}"
                       data-n="${b.number}" maxlength="50"
                       placeholder="${esc(b.first_letter)}..." autocomplete="off" spellcheck="false">
                ${meaningTag}
            </div>
        `;
    });
    $('#practiceAnswerGrid').innerHTML = answerHTML;

    // 聚焦第一个输入框
    setTimeout(() => {
        const first = $('#practiceAnswer1');
        if (first) first.focus();
    }, 100);
}

// 交卷
$('#practiceSubmitBtn')?.addEventListener('click', async () => {
    if (practiceState !== 'exam') return;

    // 收集答案
    const answers = {};
    let allFilled = true;
    practiceBlanks.forEach(b => {
        const input = $(`#practiceAnswer${b.number}`);
        const val = input ? input.value.trim() : '';
        answers[b.number] = val;
        if (!val) allFilled = false;
    });

    if (!allFilled) {
        const unfilled = practiceBlanks.filter(b => !answers[b.number]).map(b => b.number).join(', ');
        if (!confirm(`题号 ${unfilled} 未填写，确定交卷吗？`)) return;
    }

    // 进入 loading
    practiceState = 'loading';
    $('#practiceExam').style.display = 'none';
    $('#practiceLoading').style.display = '';
    const loadingText = document.querySelector('.practice-loading__text');
    const loadingSub = document.querySelector('.practice-loading__sub');
    if (loadingText) loadingText.textContent = '批改中...';
    if (loadingSub) loadingSub.textContent = 'AI 正在仔细批改你的答案 🔍';
    const dotsEl = $('#practiceLoadingDots');
    let dotTimer = setInterval(() => {
        if (dotsEl) {
            const d = dotsEl.textContent;
            dotsEl.textContent = d.length >= 3 ? '.' : d + '.';
        }
    }, 500);

    try {
        const blanksForAPI = practiceBlanks.map(b => ({
            number: b.number,
            word: b.word,
            first_letter: b.first_letter,
            meaning: b.meaning || '',
        }));
        const resp = await fetch('/api/grade-practice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blanks: blanksForAPI, answers, passage: practicePassage }),
        });
        const data = await resp.json();
        clearInterval(dotTimer);

        if (!data.ok) {
            showToast(data.error || '批改失败', 'error');
            renderPracticeExam();
            return;
        }

        practiceResult = data;
        practiceState = 'result';
        // 保存答案到 blanks 以便结果展示
        practiceBlanks.forEach(b => {
            b.user_answer = answers[b.number] || '';
        });
        renderPracticeResult();

    } catch (e) {
        clearInterval(dotTimer);
        console.error('批改失败:', e);
        showToast('批改失败，请检查网络连接', 'error');
        renderPracticeExam();
    }
});

function renderPracticeResult() {
    practiceState = 'result';
    $('#practiceConfig').style.display = 'none';
    $('#practiceLoading').style.display = 'none';
    $('#practiceExam').style.display = 'none';
    $('#practiceResult').style.display = '';

    const r = practiceResult;
    const pct = r.total > 0 ? Math.round(r.score / r.total * 100) : 0;
    let emoji = '🎉', grade = 'A+';
    if (pct < 60) { emoji = '💪'; grade = 'C'; }
    else if (pct < 80) { emoji = '👍'; grade = 'B'; }
    else if (pct < 100) { emoji = '🌟'; grade = 'A'; }

    const colorClass = pct >= 80 ? 'practice-score--good' : pct >= 60 ? 'practice-score--ok' : 'practice-score--low';

    // 逐题结果
    const detailsHTML = (r.results || []).map(item => {
        const correct = item.correct;
        const icon = correct ? '✅' : '❌';
        const cls = correct ? 'practice-result-item--correct' : 'practice-result-item--wrong';
        const blank = practiceBlanks.find(b => b.number === item.number);
        const meaning = item.meaning || (blank ? blank.meaning : '');
        return `<div class="practice-result-item ${cls}">
            <span class="practice-result-item__num">${icon} ${item.number}.</span>
            <div class="practice-result-item__content">
                <div class="practice-result-item__word">
                    <span class="practice-result-item__expected">${esc(item.expected)}</span>
                    ${meaning ? `<span class="practice-result-item__meaning">${esc(meaning)}</span>` : ''}
                </div>
                ${!correct ? `<div class="practice-result-item__user">你的答案：<strong>${esc(item.user || '(空)')}</strong></div>` : ''}
                ${item.feedback ? `<div class="practice-result-item__feedback">💡 ${esc(item.feedback)}</div>` : ''}
            </div>
        </div>`;
    }).join('');

    $('#practiceResult').innerHTML = `
        <div class="practice-result__score">
            <div class="practice-score-circle ${colorClass}">
                <span class="practice-score-circle__num">${r.score}</span>
                <span class="practice-score-circle__divider">/</span>
                <span class="practice-score-circle__total">${r.total}</span>
            </div>
            <div class="practice-score-label">${emoji} ${grade}</div>
        </div>
        <div class="practice-result__comment">${esc(r.comment || '')}</div>
        <h4 class="practice-result__details-title">📋 逐题详情</h4>
        <div class="practice-result__details">${detailsHTML}</div>
        <div class="practice-result__actions">
            <button class="btn btn--outline" id="practiceRetryBtn">🔄 再来一题</button>
            <button class="btn btn--primary" id="practiceReviewBtn">🔍 回顾文章</button>
            <button class="btn btn--outline" id="practiceExitBtn">📋 返回列表</button>
        </div>
    `;

    // 绑定按钮
    $('#practiceRetryBtn')?.addEventListener('click', () => {
        practiceState = 'config';
        practiceBlanks = [];
        practicePassage = '';
        practiceTitle = '';
        practiceResult = null;
        renderPracticeConfig();
    });
    $('#practiceReviewBtn')?.addEventListener('click', () => {
        // 回到文章查看（保持答题区，但显示正确答案）
        renderPracticeExam();
        // 填入正确答案供复习
        practiceBlanks.forEach(b => {
            const input = $(`#practiceAnswer${b.number}`);
            if (input) {
                const resultItem = (practiceResult.results || []).find(r => r.number === b.number);
                if (resultItem && !resultItem.correct) {
                    input.value = resultItem.expected;
                    input.style.color = 'var(--color-success)';
                    input.style.fontWeight = '600';
                }
            }
        });
        // 隐藏交卷按钮，显示返回结果
        $('#practiceSubmitBtn').style.display = 'none';
        const reviewBackBtn = document.createElement('button');
        reviewBackBtn.className = 'btn btn--outline';
        reviewBackBtn.id = 'practiceReviewBackBtn';
        reviewBackBtn.textContent = '← 返回结果';
        reviewBackBtn.addEventListener('click', renderPracticeResult);
        const actionsDiv = document.querySelector('#practiceExam .practice-actions');
        if (actionsDiv) actionsDiv.appendChild(reviewBackBtn);
    });
    $('#practiceExitBtn')?.addEventListener('click', exitPracticeMode);
}

function exitPracticeMode() {
    practiceState = 'config';
    practiceBlanks = [];
    practicePassage = '';
    practiceTitle = '';
    practiceResult = null;
    practiceFullPool = [];
    practiceDifficulty = 'all';
    selectedUnits.clear();
    $('#vocabPractice').style.display = 'none';
    $('#vocabList').style.display = '';
    $('#vocabUnitRow').style.display = '';
    $('#vocabPartRow').style.display = '';
    document.querySelector('.vocab-actions').style.display = '';
    // 重置 loading 文字
    const loadingText = document.querySelector('.practice-loading__text');
    const loadingSub = document.querySelector('.practice-loading__sub');
    if (loadingText) loadingText.innerHTML = '出题中<span id="practiceLoadingDots">...</span>';
    if (loadingSub) loadingSub.textContent = 'AI 正在为你创作一篇精彩的文章 🤔';
    // 恢复交卷按钮
    const submitBtn = $('#practiceSubmitBtn');
    if (submitBtn) submitBtn.style.display = '';
    // 清理回顾按钮
    const reviewBackBtn = $('#practiceReviewBackBtn');
    if (reviewBackBtn) reviewBackBtn.remove();
    // 恢复输入框样式
    document.querySelectorAll('.practice-answer-input').forEach(inp => {
        inp.style.color = '';
        inp.style.fontWeight = '';
    });
    renderVocabView();
}

// 练习模式按钮
$('#vocabPracticeBtn')?.addEventListener('click', enterPracticeMode);

// 答题区：点击 💡 显示单个空格的中文释义
document.addEventListener('click', e => {
    const hintBtn = e.target.closest('.practice-answer-hint-btn');
    if (!hintBtn) return;
    e.preventDefault();
    const meaning = hintBtn.dataset.meaning;
    const span = document.createElement('span');
    span.className = 'practice-answer-meaning practice-answer-meaning--revealed';
    span.textContent = meaning;
    hintBtn.replaceWith(span);
});

// 答题区键盘导航：Enter 跳到下一题
document.addEventListener('keydown', e => {
    if (practiceState !== 'exam') return;
    if (e.target.classList.contains('practice-answer-input') && e.key === 'Enter') {
        e.preventDefault();
        const n = parseInt(e.target.dataset.n);
        const next = $(`#practiceAnswer${n + 1}`);
        if (next) next.focus();
        else $('#practiceSubmitBtn')?.focus();
    }
});
