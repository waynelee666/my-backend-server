/* ============================================================
   复习模块  v1.0 — 章节可展开，逐节追踪
   ============================================================ */

// ==================== 复习章节（含小节） ====================
const REVIEW_CHAPTERS = [
    // TODO: 待填充具体复习内容
];

// ==================== 进度管理（Supabase 持久化 + localStorage 兜底） ====================
const REVIEW_KEY = 'review_progress';
let _reviewProgressCache = null;

async function initReviewProgress() {
    let local = {};
    try { local = JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}'); } catch (e) {}
    _reviewProgressCache = local;

    try {
        const { data } = await Auth.getClient().from('review_progress').select('progress').single();
        if (data && data.progress) {
            _reviewProgressCache = data.progress;
            localStorage.setItem(REVIEW_KEY, JSON.stringify(data.progress));
        }
    } catch (e) { /* 表不存在或网络错误，用本地数据 */ }
}

function getReviewProgress() {
    if (!_reviewProgressCache) {
        try { _reviewProgressCache = JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}'); } catch (e) { _reviewProgressCache = {}; }
    }
    return _reviewProgressCache;
}

function saveReviewProgress(prog) {
    _reviewProgressCache = prog;
    localStorage.setItem(REVIEW_KEY, JSON.stringify(prog));
    (async () => {
        try {
            const sb = Auth.getClient();
            const u = await sb.auth.getUser();
            const userId = u.data.user.id;
            const { data: existing } = await sb.from('review_progress').select('id').eq('user_id', userId).maybeSingle();
            if (existing) {
                await sb.from('review_progress').update({ progress: prog, updated_at: new Date().toISOString() }).eq('user_id', userId);
            } else {
                await sb.from('review_progress').insert({ user_id: userId, progress: prog });
            }
        } catch (e) { /* 静默忽略 */ }
    })();
}

/** 章节进度统计 */
function reviewChapterStats(ch) {
    const progress = getReviewProgress();
    const chData = progress[ch.name] || {};
    const total = ch.sections.length;
    const done = ch.sections.filter(s => chData[s] && chData[s].done).length;
    return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
}

// ==================== 渲染复习计划 ====================
function renderReviewPlan() {
    const el = document.getElementById('reviewPlan');
    if (!el) return;
    const progress = getReviewProgress();

    if (REVIEW_CHAPTERS.length === 0) {
        el.innerHTML = `<div class="review-empty">
            <p style="text-align:center;color:var(--color-text-light);padding:40px 20px">
                📝 复习模块已就绪<br>
                <span style="font-size:.85rem">等待添加复习内容...</span>
            </p>
        </div>`;
        return;
    }

    el.innerHTML = REVIEW_CHAPTERS.map((ch, i) => {
        const stats = reviewChapterStats(ch);
        const chData = progress[ch.name] || {};
        const expanded = chData._expanded !== false;
        const chDone = stats.done === stats.total && stats.total > 0;

        const sectionHTML = ch.sections.map(sec => {
            const sData = chData[sec] || {};
            const sDone = sData.done || false;
            const sDate = sData.date || '';
            return `<div class="review-section ${sDone ? 'review-section--done' : ''}">
                <div class="review-section__check" data-ch="${escAttr(ch.name)}" data-sec="${escAttr(sec)}">${sDone ? '☑' : '☐'}</div>
                <span class="review-section__name">${esc(sec)}</span>
                <input type="date" class="review-section__date" data-ch="${escAttr(ch.name)}" data-sec="${escAttr(sec)}" value="${sDate}" title="计划日期">
            </div>`;
        }).join('');

        const chDate = chData._date || '';

        return `<div class="review-chapter ${chDone ? 'review-chapter--done' : ''}">
            <div class="review-chapter__header" data-ch="${escAttr(ch.name)}">
                <div class="review-chapter__arrow">${expanded ? '▼' : '▶'}</div>
                <div class="review-chapter__check" data-ch="${escAttr(ch.name)}" data-action="toggle-chapter">${chDone ? '☑' : '☐'}</div>
                <div class="review-chapter__info">
                    <div class="review-chapter__name">${esc(ch.name)}</div>
                    <div class="review-chapter__progress">
                        <div class="review-chapter__bar"><div class="review-chapter__fill" style="width:${stats.pct}%"></div></div>
                        <span class="review-chapter__stat">${stats.done}/${stats.total}</span>
                    </div>
                </div>
                <input type="date" class="review-chapter__date" data-ch="${escAttr(ch.name)}" value="${chDate}" title="整章计划日期" onclick="event.stopPropagation()">
            </div>
            <div class="review-chapter__body" style="${expanded ? '' : 'display:none'}">
                ${sectionHTML}
            </div>
        </div>`;
    }).join('');

    bindReviewEvents();
}

function bindReviewEvents() {
    const el = document.getElementById('reviewPlan');
    if (!el) return;

    // 展开/折叠章节
    el.querySelectorAll('.review-chapter__header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.closest('.review-chapter__check') || e.target.closest('.review-chapter__date')) return;

            const chName = header.dataset.ch;
            const body = header.nextElementSibling;
            const arrow = header.querySelector('.review-chapter__arrow');
            const progress = getReviewProgress();
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
            saveReviewProgress(progress);
        });
    });

    // 整章勾选
    el.querySelectorAll('.review-chapter__check[data-action="toggle-chapter"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const chName = btn.dataset.ch;
            const ch = REVIEW_CHAPTERS.find(c => c.name === chName);
            if (!ch) return;
            const progress = getReviewProgress();
            const chData = progress[chName] || {};
            const stats = reviewChapterStats(ch);
            const allDone = stats.done === stats.total;

            const newVal = !allDone;
            ch.sections.forEach(sec => {
                if (!chData[sec]) chData[sec] = {};
                chData[sec].done = newVal;
            });
            progress[chName] = chData;
            saveReviewProgress(progress);
            renderReviewPlan();
        });
    });

    // 小节勾选
    el.querySelectorAll('.review-section__check').forEach(btn => {
        btn.addEventListener('click', () => {
            const chName = btn.dataset.ch;
            const secName = btn.dataset.sec;
            const progress = getReviewProgress();
            const chData = progress[chName] || {};
            if (!chData[secName]) chData[secName] = {};
            chData[secName].done = !chData[secName].done;
            progress[chName] = chData;
            saveReviewProgress(progress);
            renderReviewPlan();
        });
    });

    // 小节日期
    el.querySelectorAll('.review-section__date').forEach(input => {
        input.addEventListener('change', (e) => {
            e.stopPropagation();
            const chName = input.dataset.ch;
            const secName = input.dataset.sec;
            const progress = getReviewProgress();
            const chData = progress[chName] || {};
            if (!chData[secName]) chData[secName] = {};
            chData[secName].date = input.value;
            progress[chName] = chData;
            saveReviewProgress(progress);
        });
    });

    // 整章日期
    el.querySelectorAll('.review-chapter__date').forEach(input => {
        input.addEventListener('change', (e) => {
            e.stopPropagation();
            const chName = input.dataset.ch;
            const progress = getReviewProgress();
            const chData = progress[chName] || {};
            chData._date = input.value;
            progress[chName] = chData;
            saveReviewProgress(progress);
        });
    });
}

function escAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ==================== 渲染入口 ====================
async function renderReviewView() {
    await initReviewProgress();
    renderReviewPlan();
}

// ==================== 事件绑定 ====================
document.addEventListener('DOMContentLoaded', () => {
    // 重置进度
    document.getElementById('reviewResetBtn')?.addEventListener('click', () => {
        if (confirm('确定重置所有复习进度？')) {
            saveReviewProgress({});
            renderReviewPlan();
        }
    });
});

// esc() is provided by script.js (loaded before us)
