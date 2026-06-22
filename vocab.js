/* ============================================================
   TaskFlow - 单词复习模块  v1.0 — 闪卡学习模式
   ============================================================ */
console.log('📖 Vocab module loaded');

let studyWords = [];
let studyIndex = 0;
let studyFlipped = false;
let studyKnown = 0;
let studyUnknown = 0;
let studyIsReview = false;  // 是否在复习模式
let studyModeDir = 'en2cn'; // en2cn=看英文想意思 | cn2en=看中文拼英文

function startVocabStudy() {
    studyIsReview = vocabUnit === '__review__';
    studyModeDir = $('#vocabStudyMode')?.value || 'en2cn';
    const filtered = studyIsReview
        ? vocabs.filter(v => v.review === true)
        : vocabs.filter(v => v.unit === vocabUnit && v.part === vocabPart);
    if (!filtered.length) {
        showToast(studyIsReview ? '复习表已清空 🎉' : '当前单元没有单词，请先添加或导入', 'error');
        return;
    }
    // 取指定数量
    const count = parseInt($('#vocabStudyCount')?.value || '0');
    studyWords = count > 0 ? [...filtered].slice(0, count) : [...filtered];
    studyIndex = 0;
    studyFlipped = false;
    studyKnown = 0;
    studyUnknown = 0;

    $('#vocabList').style.display = 'none';
    $('#vocabUnitRow').style.display = 'none';
    $('#vocabPartRow').style.display = 'none';
    document.querySelector('.vocab-actions').style.display = 'none';
    $('#vocabStudy').style.display = '';

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
    const frontHint = isCn2en ? '拼写英文 ✏️' : '点击翻转 👆';
    const frontClass = isCn2en ? 'vocab-flashcard__meaning' : 'vocab-flashcard__word';
    const backClass = isCn2en ? 'vocab-flashcard__word' : 'vocab-flashcard__meaning';

    container.innerHTML = `
        <div class="vocab-flashcard">
            <div class="vocab-flashcard__progress">${progress}</div>
            <div class="vocab-flashcard__bar">
                <div class="vocab-flashcard__fill" style="width:${pct}%"></div>
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
            <div class="vocab-flashcard__buttons" id="vocabFlashBtns" style="${studyFlipped ? '' : 'display:none'}">
                <button class="vocab-flashcard__btn vocab-flashcard__btn--no" id="vocabBtnNo">不认识 ❌</button>
                <button class="vocab-flashcard__btn vocab-flashcard__btn--yes" id="vocabBtnYes">认识 ✅</button>
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
}

function flipCard() {
    studyFlipped = true;
    renderStudyCard();
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
                <button class="btn btn--primary" id="vocabStudyAgain">🔄 再来一次</button>
                <button class="btn btn--outline" id="vocabStudyBack">📋 返回列表</button>
            </div>
        </div>
    `;

    document.getElementById('vocabStudyAgain').addEventListener('click', () => {
        studyIndex = 0;
        studyFlipped = false;
        studyKnown = 0;
        studyUnknown = 0;
        renderStudyCard();
    });
    document.getElementById('vocabStudyBack').addEventListener('click', exitStudyMode);
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
    } else if (studyFlipped) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); answerCard(true); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); answerCard(false); }
    }
});
