/* ============================================================
   TaskFlow - 单词复习模块  v1.0 — 闪卡学习模式
   ============================================================ */
console.log('📖 Vocab module loaded');

let studyWords = [];
let studyIndex = 0;
let studyFlipped = false;
let studyKnown = 0;
let studyUnknown = 0;

function startVocabStudy() {
    const filtered = vocabs.filter(v => v.unit === vocabUnit && v.part === vocabPart);
    if (!filtered.length) {
        showToast('当前单元没有单词，请先添加或导入', 'error');
        return;
    }
    studyWords = [...filtered];
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

    container.innerHTML = `
        <div class="vocab-flashcard">
            <div class="vocab-flashcard__progress">${progress}</div>
            <div class="vocab-flashcard__bar">
                <div class="vocab-flashcard__fill" style="width:${pct}%"></div>
            </div>
            <div class="vocab-flashcard__card ${studyFlipped ? 'vocab-flashcard__card--flipped' : ''}" id="vocabFlashCard">
                <div class="vocab-flashcard__front">
                    <div class="vocab-flashcard__word">${esc(word.word)}</div>
                    <div class="vocab-flashcard__hint">点击翻转 👆</div>
                </div>
                <div class="vocab-flashcard__back" style="${studyFlipped ? '' : 'display:none'}">
                    <div class="vocab-flashcard__meaning">${esc(word.meaning)}</div>
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

function answerCard(known) {
    if (known) studyKnown++;
    else studyUnknown++;
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

function exitStudyMode() {
    $('#vocabList').style.display = '';
    $('#vocabUnitRow').style.display = '';
    $('#vocabPartRow').style.display = '';
    document.querySelector('.vocab-actions').style.display = '';
    $('#vocabStudy').style.display = 'none';
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
