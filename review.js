/* ============================================================
   复习模块  v2.0 — 10章节 + PPT上传 + 滑动查看
   ============================================================ */

// ==================== 复习章节（含小节） ====================
const REVIEW_CHAPTERS = [
    { name: '数据结构',    sections: ['链表', '栈与队列', '树与二叉树', '图论基础', '排序算法', '查找算法'], pptFile: null, slideCount: 0, slideImages: [] },
    { name: '操作系统',    sections: ['进程管理', '内存管理', '文件系统', 'I/O系统', '死锁'], pptFile: null, slideCount: 0, slideImages: [] },
    { name: '计算机网络',  sections: ['OSI模型', 'TCP/IP协议', 'HTTP协议', '路由算法', '网络安全'], pptFile: null, slideCount: 0, slideImages: [] },
    { name: '数据库原理',  sections: ['关系模型', 'SQL查询', '范式设计', '事务与锁', '索引优化'], pptFile: null, slideCount: 0, slideImages: [] },
    { name: '高等数学',    sections: ['极限与连续', '导数与微分', '积分学', '级数', '微分方程'], pptFile: null, slideCount: 0, slideImages: [] },
    { name: '线性代数',    sections: ['矩阵运算', '行列式', '向量空间', '特征值', '二次型'], pptFile: null, slideCount: 0, slideImages: [] },
    { name: '概率论',      sections: ['随机事件', '分布函数', '数字特征', '大数定律', '参数估计'], pptFile: null, slideCount: 0, slideImages: [] },
    { name: '英语四级',    sections: ['听力理解', '阅读理解', '翻译', '写作', '词汇语法'], pptFile: null, slideCount: 0, slideImages: [] },
    { name: '思政理论',    sections: ['马原', '毛概', '思修', '近代史', '形策'], pptFile: null, slideCount: 0, slideImages: [] },
    { name: '专业课综合',  sections: ['重点概念', '公式推导', '实验原理', '案例分析', '综合练习'], pptFile: null, slideCount: 0, slideImages: [] },
];

// ==================== 进度管理 ====================
const REVIEW_KEY = 'review_progress';
let _reviewProgressCache = null;

async function initReviewProgress() {
    let local = {};
    try { local = JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}'); } catch (e) {}
    _reviewProgressCache = local;

    // 从持久化进度恢复 pptFile / slideCount / slideImages
    REVIEW_CHAPTERS.forEach(ch => {
        const pptData = (local._pptData || {})[ch.name];
        if (pptData) { ch.pptFile = pptData.file || null; ch.slideCount = pptData.slides || 0; ch.slideImages = pptData.images || []; }
    });

    try {
        const { data } = await Auth.getClient().from('review_progress').select('progress').single();
        if (data && data.progress) {
            _reviewProgressCache = data.progress;
            localStorage.setItem(REVIEW_KEY, JSON.stringify(data.progress));
            const pptData = data.progress._pptData || {};
            REVIEW_CHAPTERS.forEach(ch => {
                const d = pptData[ch.name];
                if (d) { ch.pptFile = d.file || null; ch.slideCount = d.slides || 0; ch.slideImages = d.images || []; }
            });
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
    if (ch) { ch.pptFile = data.file || null; ch.slideCount = data.slides || 0; ch.slideImages = data.images || []; }
    saveReviewProgress(progress);
}

function removePPTFile(chapterName) {
    const progress = getReviewProgress();
    if (!progress._pptData) progress._pptData = {};
    delete progress._pptData[chapterName];
    const ch = REVIEW_CHAPTERS.find(c => c.name === chapterName);
    if (ch) { ch.pptFile = null; ch.slideCount = 0; ch.slideImages = []; }
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
        const hasPPT = !!ch.pptFile;

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
                <div class="review-chapter__ppt">
                    <span class="review-chapter__ppt-filename">${hasPPT ? `📎 ${esc(ch.pptFile)} · ${ch.slideCount} 页` : '📂 暂无PPT'}</span>
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
            if (expanded) { body.style.display = 'none'; arrow.textContent = '▶'; chData._expanded = false; }
            else { body.style.display = ''; arrow.textContent = '▼'; chData._expanded = true; }
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
            ch.sections.forEach(sec => { if (!chData[sec]) chData[sec] = {}; chData[sec].done = newVal; });
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

    // PPT 上传按钮
    el.querySelectorAll('.review-ppt-upload-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            _pendingPPTChapter = parseInt(btn.dataset.ch);
            document.getElementById('reviewPPTInput').click();
        });
    });

    // PPT 查看按钮
    el.querySelectorAll('.review-ppt-view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openPPTViewer(parseInt(btn.dataset.ch));
        });
    });

    // PPT 删除按钮
    el.querySelectorAll('.review-ppt-del-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ch = REVIEW_CHAPTERS[parseInt(btn.dataset.ch)];
            if (confirm(`确定删除「${ch.name}」的PPT (${ch.pptFile})？`)) {
                removePPTFile(ch.name);
                renderReviewPlan();
            }
        });
    });
}

function escAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ==================== PPT 上传 ====================
let _pendingPPTChapter = -1;

function handlePPTFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pptx')) {
        showToast && showToast('只支持 .pptx 格式', 'error');
        return;
    }
    if (file.size > 50 * 1024 * 1024) {
        showToast && showToast('文件不能超过 50MB', 'error');
        return;
    }

    const ch = REVIEW_CHAPTERS[_pendingPPTChapter];
    if (!ch) return;

    // 更新 UI 状态
    const btn = document.querySelector(`.review-ppt-upload-btn[data-ch="${_pendingPPTChapter}"]`);
    const origText = btn ? btn.textContent : '';
    if (btn) { btn.textContent = '⏳ 上传中...'; btn.disabled = true; }

    const formData = new FormData();
    formData.append('file', file);

    fetch(`/api/upload-review-ppt?chapter=${_pendingPPTChapter + 1}`, {
        method: 'POST',
        body: formData
    })
    .then(r => r.json())
    .then(async data => {
        if (data.ok) {
            // 立即触发转换
            if (btn) { btn.textContent = '🔄 转换中...'; btn.disabled = true; }
            try {
                const convResp = await fetch('/api/convert-ppt', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: data.filename })
                });
                const convData = await convResp.json();
                if (convData.ok) {
                    savePPTData(ch.name, {
                        file: data.filename,
                        slides: convData.slides,
                        images: convData.images,
                        prefix: convData.prefix
                    });
                    showToast && showToast(`「${ch.name}」PPT 已就绪 (${convData.slides} 页)`, 'success');
                } else {
                    // 转换失败，只保存文件引用
                    savePPTData(ch.name, { file: data.filename, slides: 0, images: [] });
                    showToast && showToast(`PPT 已保存但转换失败: ${convData.error}`, 'error');
                }
            } catch (convErr) {
                savePPTData(ch.name, { file: data.filename, slides: 0, images: [] });
                showToast && showToast('PPT 已保存但转换失败', 'error');
            }
            renderReviewPlan();
        } else {
            showToast && showToast(data.error || '上传失败', 'error');
            if (btn) { btn.textContent = origText; btn.disabled = false; }
        }
    })
    .catch(err => {
        showToast && showToast('上传失败: ' + err.message, 'error');
        if (btn) { btn.textContent = origText; btn.disabled = false; }
    });

    event.target.value = '';
}

// ==================== PPT 查看器 ====================
let pptSwiper = null;

async function openPPTViewer(chapterIndex) {
    const ch = REVIEW_CHAPTERS[chapterIndex];
    if (!ch.pptFile) { showToast && showToast('请先上传PPT', 'error'); return; }

    const overlay = document.getElementById('pptViewerOverlay');
    const container = document.getElementById('pptViewerSlides');
    const titleEl = document.getElementById('pptViewerTitle');
    const wrapper = container.querySelector('.swiper-wrapper');
    const pagEl = container.querySelector('.swiper-pagination');

    overlay.classList.add('active');
    titleEl.textContent = ch.name;
    document.getElementById('pptViewerCounter').textContent = '加载中...';
    wrapper.innerHTML = `<div class="swiper-slide"><div class="ppt-viewer__loading"><div class="practice-loading__spinner"></div><p>正在加载...</p></div></div>`;
    if (pagEl) pagEl.style.display = 'none';
    if (pptSwiper) { pptSwiper.destroy(true, true); pptSwiper = null; }

    try {
        const images = ch.slideImages || [];
        const prefix = (ch.pptFile || '').replace('.pptx', '');

        // 如果没有预转换的图片列表，尝试推断
        let slideImages = images;
        if (slideImages.length === 0 && ch.slideCount > 0) {
            slideImages = Array.from({ length: ch.slideCount }, (_, i) => `${prefix}_slide_${i + 1}.png`);
        }
        if (slideImages.length === 0) {
            throw new Error('此 PPT 尚未转换为图片，请尝试重新上传');
        }

        // 验证第一张图片是否存在
        const testResp = await fetch('/uploads/review/' + slideImages[0], { method: 'HEAD' });
        if (!testResp.ok) throw new Error('图片文件不存在，请重新上传');

        // 渲染所有幻灯片到 Swiper
        wrapper.innerHTML = '';
        slideImages.forEach((imgName, i) => {
            const slide = document.createElement('div');
            slide.className = 'swiper-slide';
            const img = document.createElement('img');
            img.src = '/uploads/review/' + imgName;
            img.className = 'ppt-slide-img';
            img.alt = `第 ${i + 1} 页`;
            img.loading = (i === 0) ? 'eager' : 'lazy';
            slide.appendChild(img);
            wrapper.appendChild(slide);
        });

        if (pagEl) pagEl.style.display = '';
        document.getElementById('pptViewerCounter').textContent = `1 / ${slideImages.length}`;

        // 初始化 Swiper
        await new Promise(r => requestAnimationFrame(r));
        pptSwiper = new Swiper(container, {
            slidesPerView: 1,
            spaceBetween: 0,
            pagination: { el: '.swiper-pagination', clickable: true },
            keyboard: { enabled: true },
            on: {
                slideChange: function () {
                    document.getElementById('pptViewerCounter').textContent =
                        `${this.activeIndex + 1} / ${slideImages.length}`;
                }
            }
        });
    } catch (e) {
        console.error('PPT 加载错误:', e);
        wrapper.innerHTML = `<div class="swiper-slide"><div class="ppt-viewer__loading"><p class="ppt-viewer__error">加载失败: ${esc(e.message)}</p></div></div>`;
        document.getElementById('pptViewerCounter').textContent = '0 / 0';
    }
}

function closePPTViewer() {
    if (pptSwiper) { pptSwiper.destroy(true, true); pptSwiper = null; }
    document.getElementById('pptViewerOverlay').classList.remove('active');
    document.getElementById('pptViewerSlides').querySelector('.swiper-wrapper').innerHTML = '';
}

// ==================== 渲染入口 ====================
async function renderReviewView() {
    await initReviewProgress();
    renderReviewPlan();
}

// ==================== 事件绑定 ====================
document.addEventListener('DOMContentLoaded', () => {
    // 文件选择
    document.getElementById('reviewPPTInput')?.addEventListener('change', handlePPTFileSelected);

    // 重置进度
    document.getElementById('reviewResetBtn')?.addEventListener('click', () => {
        if (confirm('确定重置所有复习进度？这将清除所有勾选和 PPT 文件记录。')) {
            saveReviewProgress({});
            renderReviewPlan();
        }
    });

    // PPT 查看器控制
    document.getElementById('pptViewerBack')?.addEventListener('click', closePPTViewer);
    document.getElementById('pptViewerClose')?.addEventListener('click', closePPTViewer);
    document.getElementById('pptViewerPrev')?.addEventListener('click', () => pptSwiper && pptSwiper.slidePrev());
    document.getElementById('pptViewerNext')?.addEventListener('click', () => pptSwiper && pptSwiper.slideNext());

    // 键盘导航
    document.addEventListener('keydown', (e) => {
        const overlay = document.getElementById('pptViewerOverlay');
        if (!overlay || !overlay.classList.contains('active')) return;
        if (e.key === 'Escape') closePPTViewer();
        if (e.key === 'ArrowLeft') pptSwiper && pptSwiper.slidePrev();
        if (e.key === 'ArrowRight') pptSwiper && pptSwiper.slideNext();
    });

    // 触摸点击 overlay 背景关闭（点击容器内部不关闭）
    document.getElementById('pptViewerOverlay')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closePPTViewer();
    });
});

// esc() is provided by script.js (loaded before us)
