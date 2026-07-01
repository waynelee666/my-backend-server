/* ============================================================
   复习模块  v3.0 — Supabase Storage + PptxViewJS 客户端渲染
   ============================================================ */

// ==================== 复习章节 ====================
const REVIEW_CHAPTERS = [
    { name: '数据结构',    sections: ['链表', '栈与队列', '树与二叉树', '图论基础', '排序算法', '查找算法'], pptPath: null },
    { name: '操作系统',    sections: ['进程管理', '内存管理', '文件系统', 'I/O系统', '死锁'], pptPath: null },
    { name: '计算机网络',  sections: ['OSI模型', 'TCP/IP协议', 'HTTP协议', '路由算法', '网络安全'], pptPath: null },
    { name: '数据库原理',  sections: ['关系模型', 'SQL查询', '范式设计', '事务与锁', '索引优化'], pptPath: null },
    { name: '高等数学',    sections: ['极限与连续', '导数与微分', '积分学', '级数', '微分方程'], pptPath: null },
    { name: '线性代数',    sections: ['矩阵运算', '行列式', '向量空间', '特征值', '二次型'], pptPath: null },
    { name: '概率论',      sections: ['随机事件', '分布函数', '数字特征', '大数定律', '参数估计'], pptPath: null },
    { name: '英语四级',    sections: ['听力理解', '阅读理解', '翻译', '写作', '词汇语法'], pptPath: null },
    { name: '思政理论',    sections: ['马原', '毛概', '思修', '近代史', '形策'], pptPath: null },
    { name: '专业课综合',  sections: ['重点概念', '公式推导', '实验原理', '案例分析', '综合练习'], pptPath: null },
];

const SUPABASE_BUCKET = 'review-ppts';

// ==================== 进度管理 ====================
const REVIEW_KEY = 'review_progress';
let _reviewProgressCache = null;

async function initReviewProgress() {
    let local = {};
    try { local = JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}'); } catch (e) {}
    _reviewProgressCache = local;

    // 恢复 pptPath
    const pptData = local._pptData || {};
    REVIEW_CHAPTERS.forEach(ch => { if (pptData[ch.name]) ch.pptPath = pptData[ch.name].path || null; });

    try {
        const { data } = await Auth.getClient().from('review_progress').select('progress').single();
        if (data && data.progress) {
            _reviewProgressCache = data.progress;
            localStorage.setItem(REVIEW_KEY, JSON.stringify(data.progress));
            const d = data.progress._pptData || {};
            REVIEW_CHAPTERS.forEach(ch => { if (d[ch.name]) ch.pptPath = d[ch.name].path || null; });
        }
    } catch (e) { /* 静默忽略 */ }
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

function reviewChapterStats(ch) {
    const progress = getReviewProgress();
    const chData = progress[ch.name] || {};
    const total = ch.sections.length;
    const done = ch.sections.filter(s => chData[s] && chData[s].done).length;
    return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
}

function savePPTData(chapterName, data) {
    const progress = getReviewProgress();
    if (!progress._pptData) progress._pptData = {};
    progress._pptData[chapterName] = data;
    const ch = REVIEW_CHAPTERS.find(c => c.name === chapterName);
    if (ch) ch.pptPath = data.path || null;
    saveReviewProgress(progress);
}

function removePPTData(chapterName) {
    const progress = getReviewProgress();
    if (!progress._pptData) progress._pptData = {};
    delete progress._pptData[chapterName];
    const ch = REVIEW_CHAPTERS.find(c => c.name === chapterName);
    if (ch) ch.pptPath = null;
    saveReviewProgress(progress);
}

// ==================== 渲染复习计划 ====================
function renderReviewPlan() {
    const el = document.getElementById('reviewPlan');
    if (!el) return;
    const progress = getReviewProgress();

    el.innerHTML = REVIEW_CHAPTERS.map((ch, i) => {
        const stats = reviewChapterStats(ch);
        const chData = progress[ch.name] || {};
        const expanded = chData._expanded !== false;
        const chDone = stats.done === stats.total && stats.total > 0;
        const hasPPT = !!ch.pptPath;

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
        const pptName = hasPPT ? (ch.pptPath.split('/').pop() || ch.pptPath) : '';

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
                <div class="review-chapter__ppt">
                    <span class="review-chapter__ppt-filename">${hasPPT ? '📎 ' + esc(pptName) : '📂 暂无PPT'}</span>
                    <div class="review-chapter__ppt-actions">
                        <button class="btn btn--outline btn--sm review-ppt-upload-btn" data-ch="${i}">📤 ${hasPPT ? '更换' : '上传'}PPT</button>
                        ${hasPPT ? `<button class="btn btn--primary btn--sm review-ppt-view-btn" data-ch="${i}">👁 查看PPT</button>
                        <button class="btn btn--outline btn--sm review-ppt-del-btn" data-ch="${i}" title="删除PPT">✕</button>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');

    bindReviewEvents();
}

function bindReviewEvents() {
    const el = document.getElementById('reviewPlan');
    if (!el) return;

    el.querySelectorAll('.review-chapter__header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.closest('.review-chapter__check') || e.target.closest('.review-chapter__date')) return;
            const chName = header.dataset.ch;
            const body = header.nextElementSibling;
            const arrow = header.querySelector('.review-chapter__arrow');
            const progress = getReviewProgress();
            const chData = progress[chName] || {};
            const expanded = body.style.display !== 'none';
            if (expanded) { body.style.display = 'none'; arrow.textContent = '▶'; chData._expanded = false; }
            else { body.style.display = ''; arrow.textContent = '▼'; chData._expanded = true; }
            progress[chName] = chData;
            saveReviewProgress(progress);
        });
    });

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
            ch.sections.forEach(sec => { if (!chData[sec]) chData[sec] = {}; chData[sec].done = newVal; });
            progress[chName] = chData;
            saveReviewProgress(progress);
            renderReviewPlan();
        });
    });

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

    el.querySelectorAll('.review-ppt-upload-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            _pendingPPTChapter = parseInt(btn.dataset.ch);
            document.getElementById('reviewPPTInput').click();
        });
    });

    el.querySelectorAll('.review-ppt-view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openPPTViewer(parseInt(btn.dataset.ch));
        });
    });

    el.querySelectorAll('.review-ppt-del-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ch = REVIEW_CHAPTERS[parseInt(btn.dataset.ch)];
            if (confirm(`确定删除「${ch.name}」的PPT？`)) {
                removePPTData(ch.name);
                renderReviewPlan();
            }
        });
    });
}

function escAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ==================== PPT 上传到 Supabase Storage ====================
let _pendingPPTChapter = -1;

function handlePPTFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pptx')) {
        showToast && showToast('只支持 .pptx 格式', 'error');
        event.target.value = ''; return;
    }
    if (file.size > 30 * 1024 * 1024) {
        showToast && showToast('文件不能超过 30MB', 'error');
        event.target.value = ''; return;
    }

    const ch = REVIEW_CHAPTERS[_pendingPPTChapter];
    if (!ch) return;

    const btn = document.querySelector(`.review-ppt-upload-btn[data-ch="${_pendingPPTChapter}"]`);
    if (btn) { btn.textContent = '⏳ 上传中...'; btn.disabled = true; }

    const storagePath = `ch${_pendingPPTChapter + 1}/${Date.now()}_${file.name}`;

    Auth.getClient().storage.from(SUPABASE_BUCKET).upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false
    }).then(({ data, error }) => {
        if (error) throw error;
        savePPTData(ch.name, { path: data.path });
        showToast && showToast(`「${ch.name}」PPT 上传成功`, 'success');
        renderReviewPlan();
    }).catch(err => {
        console.error('Upload error:', err);
        showToast && showToast('上传失败: ' + (err.message || '未知错误'), 'error');
        if (btn) { btn.textContent = '📤 上传PPT'; btn.disabled = false; }
    });

    event.target.value = '';
}

// ==================== PPT 查看器（PptxViewJS） ====================
let pptViewer = null;

async function openPPTViewer(chapterIndex) {
    const ch = REVIEW_CHAPTERS[chapterIndex];
    if (!ch.pptPath) { showToast && showToast('请先上传PPT', 'error'); return; }

    const overlay = document.getElementById('pptViewerOverlay');
    const canvas = document.getElementById('pptViewerCanvas');
    const titleEl = document.getElementById('pptViewerTitle');

    overlay.classList.add('active');
    titleEl.textContent = ch.name;
    document.getElementById('pptViewerCounter').textContent = '加载中...';

    // 销毁旧 viewer
    if (pptViewer) { try { pptViewer.destroy(); } catch (e) {} pptViewer = null; }

    try {
        // 获取 Supabase 公开 URL
        const sb = Auth.getClient();
        const { data: urlData } = sb.storage.from(SUPABASE_BUCKET).getPublicUrl(ch.pptPath);
        const publicUrl = urlData.publicUrl;

        // 下载 PPTX 为 ArrayBuffer
        const resp = await fetch(publicUrl);
        if (!resp.ok) throw new Error('无法加载PPT文件');
        const blob = await resp.blob();

        // 创建 PptxViewJS viewer
        pptViewer = new PptxViewJS.PPTXViewer({
            canvas: canvas,
            autoExposeGlobals: false
        });

        // 监听事件
        pptViewer.on('loadComplete', () => {
            updatePPTNav();
        });
        pptViewer.on('renderComplete', () => {
            updatePPTNav();
        });

        await pptViewer.loadFile(new File([blob], ch.pptPath.split('/').pop() || 'slide.pptx'));

        // 绑定导航按钮
        bindPPTNavButtons();

    } catch (e) {
        console.error('PPT viewer error:', e);
        showToast && showToast('PPT 加载失败: ' + e.message, 'error');
        closePPTViewer();
    }
}

function updatePPTNav() {
    if (!pptViewer) return;
    try {
        const total = pptViewer.getSlideCount();
        const current = pptViewer.getCurrentSlideIndex();
        document.getElementById('pptViewerCounter').textContent = total ? `${current + 1} / ${total}` : '';
        const prevBtn = document.getElementById('pptViewerPrev');
        const nextBtn = document.getElementById('pptViewerNext');
        if (prevBtn) prevBtn.disabled = current <= 0;
        if (nextBtn) nextBtn.disabled = current >= total - 1;
    } catch (e) {}
}

function bindPPTNavButtons() {
    const prevBtn = document.getElementById('pptViewerPrev');
    const nextBtn = document.getElementById('pptViewerNext');
    prevBtn.onclick = () => { if (pptViewer) pptViewer.previousSlide(); };
    nextBtn.onclick = () => { if (pptViewer) pptViewer.nextSlide(); };
}

function closePPTViewer() {
    if (pptViewer) { try { pptViewer.destroy(); } catch (e) {} pptViewer = null; }
    document.getElementById('pptViewerOverlay').classList.remove('active');
}

// ==================== 渲染入口 ====================
async function renderReviewView() {
    await initReviewProgress();
    renderReviewPlan();
}

// ==================== 事件绑定 ====================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('reviewPPTInput')?.addEventListener('change', handlePPTFileSelected);

    document.getElementById('reviewResetBtn')?.addEventListener('click', () => {
        if (confirm('确定重置所有复习进度？')) { saveReviewProgress({}); renderReviewPlan(); }
    });

    document.getElementById('pptViewerBack')?.addEventListener('click', closePPTViewer);
    document.getElementById('pptViewerClose')?.addEventListener('click', closePPTViewer);

    // 键盘导航
    document.addEventListener('keydown', (e) => {
        const overlay = document.getElementById('pptViewerOverlay');
        if (!overlay || !overlay.classList.contains('active')) return;
        if (e.key === 'Escape') closePPTViewer();
        if (e.key === 'ArrowLeft' && pptViewer) pptViewer.previousSlide();
        if (e.key === 'ArrowRight' && pptViewer) pptViewer.nextSlide();
    });

    // 点击 overlay 背景关闭
    document.getElementById('pptViewerOverlay')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closePPTViewer();
    });

    // 触摸滑动 PPT 翻页
    let touchStartX = 0;
    const viewerContainer = document.getElementById('pptViewerOverlay');
    viewerContainer?.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
    viewerContainer?.addEventListener('touchend', (e) => {
        if (!pptViewer) return;
        const delta = touchStartX - e.changedTouches[0].screenX;
        if (Math.abs(delta) > 60) {
            delta > 0 ? pptViewer.nextSlide() : pptViewer.previousSlide();
        }
    }, { passive: true });
});
