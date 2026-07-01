/* ============================================================
   复习模块  v4.1 — 极简：章节 + PPT（Supabase 云端同步）
   ============================================================

   ⚠️ 使用前先在 Supabase SQL Editor 执行以下建表语句：
   ─────────────────────────────────────────────────────────
   CREATE TABLE IF NOT EXISTS review_ppts (
       id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
       user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
       chapter_name TEXT NOT NULL,
       storage_path TEXT NOT NULL,
       created_at TIMESTAMPTZ DEFAULT now(),
       UNIQUE(user_id, chapter_name)
   );
   ALTER TABLE review_ppts ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Users can manage their own review_ppts" ON review_ppts
       FOR ALL USING (auth.uid() = user_id);
   ─────────────────────────────────────────────────────────
   */

const REVIEW_CHAPTERS = [
    '数据结构', '操作系统', '计算机网络', '数据库原理', '高等数学',
    '线性代数', '概率论', '英语四级', '思政理论', '专业课综合'
];

const SUPABASE_BUCKET = 'review-ppts';
const REVIEW_KEY = 'review_ppt';  // localStorage 离线缓存 key

let _pptCache = null;           // { chapterName: storagePath }
let _pptLoaded = false;         // 是否已从云端同步过

// ==================== 数据层：Supabase 为主，localStorage 为缓存 ====================

function getLocalCache() {
    if (!_pptCache) {
        try { _pptCache = JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}'); } catch (e) { _pptCache = {}; }
    }
    return _pptCache;
}

function saveLocalCache(cache) {
    _pptCache = cache;
    try { localStorage.setItem(REVIEW_KEY, JSON.stringify(cache)); } catch (e) {}
}

/** 从 Supabase 加载云端 PPT 记录，与本地缓存合并（云端优先） */
async function loadPPTsFromDB() {
    try {
        const sb = Auth.getClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { _pptLoaded = true; return getLocalCache(); }

        const { data, error } = await sb
            .from('review_ppts')
            .select('chapter_name, storage_path')
            .eq('user_id', user.id);

        if (error) throw error;

        // 云端数据优先覆盖本地
        const local = getLocalCache();
        const merged = { ...local };
        (data || []).forEach(row => { merged[row.chapter_name] = row.storage_path; });
        saveLocalCache(merged);
        _pptLoaded = true;
        return merged;
    } catch (e) {
        console.warn('加载云端PPT记录失败，使用本地缓存:', e.message);
        _pptLoaded = true;
        return getLocalCache();
    }
}

function getChapterPPT(chapterName) {
    return getLocalCache()[chapterName] || null;
}

async function setChapterPPT(chapterName, storagePath) {
    // 1. 写 Supabase（主存储）
    try {
        const sb = Auth.getClient();
        const { data: { user } } = await sb.auth.getUser();
        if (user) {
            await sb.from('review_ppts').upsert({
                user_id: user.id,
                chapter_name: chapterName,
                storage_path: storagePath,
            }, { onConflict: 'user_id, chapter_name' });
        }
    } catch (e) {
        console.error('云端保存PPT失败:', e.message);
    }

    // 2. 同步本地缓存（离线兜底）
    const cache = getLocalCache();
    cache[chapterName] = storagePath;
    saveLocalCache(cache);
}

async function removeChapterPPT(chapterName) {
    // 1. 删 Supabase
    try {
        const sb = Auth.getClient();
        const { data: { user } } = await sb.auth.getUser();
        if (user) {
            await sb.from('review_ppts').delete()
                .eq('user_id', user.id)
                .eq('chapter_name', chapterName);
        }
    } catch (e) {
        console.error('云端删除PPT失败:', e.message);
    }

    // 2. 同步本地缓存
    const cache = getLocalCache();
    delete cache[chapterName];
    saveLocalCache(cache);
}

// ==================== 渲染 ====================

function renderReviewPlan() {
    const el = document.getElementById('reviewPlan');
    if (!el) return;

    el.innerHTML = REVIEW_CHAPTERS.map((name, i) => {
        const path = getChapterPPT(name);
        const hasPPT = !!path;
        const pptName = hasPPT ? path.split('/').pop() : '';

        return `<div class="review-chapter">
            <div class="review-chapter__row">
                <span class="review-chapter__label">第${i + 1}章</span>
                <span class="review-chapter__name">${esc(name)}</span>
                <span class="review-chapter__ppt-filename">${hasPPT ? '📎 ' + esc(pptName) : ''}</span>
                <div class="review-chapter__ppt-actions">
                    <button class="btn btn--outline btn--sm review-ppt-upload-btn" data-ch="${i}">📤</button>
                    ${hasPPT ? `<button class="btn btn--primary btn--sm review-ppt-view-btn" data-ch="${i}">👁 查看</button>
                    <button class="btn btn--outline btn--sm review-ppt-del-btn" data-ch="${i}" title="删除">✕</button>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');

    // 绑定事件
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
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const name = REVIEW_CHAPTERS[parseInt(btn.dataset.ch)];
            if (confirm(`确定删除「${name}」的PPT？`)) {
                await removeChapterPPT(name);
                renderReviewPlan();
            }
        });
    });
}

// ==================== PPT 上传到 Supabase Storage ====================
let _pendingPPTChapter = -1;

async function handlePPTFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pptx')) {
        showToast && showToast('只支持 .pptx 格式', 'error');
        event.target.value = ''; return;
    }

    const name = REVIEW_CHAPTERS[_pendingPPTChapter];
    const btn = document.querySelector(`.review-ppt-upload-btn[data-ch="${_pendingPPTChapter}"]`);
    if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

    const storagePath = `ch${_pendingPPTChapter + 1}/${Date.now()}_${file.name}`;

    try {
        const { data, error } = await Auth.getClient().storage.from(SUPABASE_BUCKET).upload(storagePath, file, {
            cacheControl: '3600', upsert: false
        });
        if (error) throw error;

        await setChapterPPT(name, data.path || storagePath);
        showToast && showToast(`「${name}」上传成功`, 'success');
        renderReviewPlan();
    } catch (err) {
        console.error(err);
        showToast && showToast('上传失败: ' + (err.message || '未知错误'), 'error');
        if (btn) { btn.textContent = '📤'; btn.disabled = false; }
    }

    event.target.value = '';
}

// ==================== PPT 查看器 ====================
let pptViewer = null;

async function openPPTViewer(chapterIndex) {
    const name = REVIEW_CHAPTERS[chapterIndex];
    const path = getChapterPPT(name);
    if (!path) { showToast && showToast('请先上传PPT', 'error'); return; }

    const overlay = document.getElementById('pptViewerOverlay');
    const canvas = document.getElementById('pptViewerCanvas');
    document.getElementById('pptViewerTitle').textContent = name;
    document.getElementById('pptViewerCounter').textContent = '加载中...';
    overlay.classList.add('active');

    if (pptViewer) { try { pptViewer.destroy(); } catch (e) {} pptViewer = null; }

    try {
        const sb = Auth.getClient();
        const { data: urlData } = sb.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
        const resp = await fetch(urlData.publicUrl);
        if (!resp.ok) throw new Error('无法加载PPT');
        const blob = await resp.blob();

        pptViewer = new PptxViewJS.PPTXViewer({ canvas, autoExposeGlobals: false });
        pptViewer.on('loadComplete', updatePPTNav);
        pptViewer.on('renderComplete', updatePPTNav);

        await pptViewer.loadFile(new File([blob], name + '.pptx'));
        bindPPTNav();
    } catch (e) {
        console.error(e);
        showToast && showToast('加载失败: ' + e.message, 'error');
        closePPTViewer();
    }
}

function updatePPTNav() {
    if (!pptViewer) return;
    try {
        const total = pptViewer.getSlideCount();
        const current = pptViewer.getCurrentSlideIndex();
        document.getElementById('pptViewerCounter').textContent = `${current + 1} / ${total}`;
        document.getElementById('pptViewerPrev').disabled = current <= 0;
        document.getElementById('pptViewerNext').disabled = current >= total - 1;
    } catch (e) {}
}

function bindPPTNav() {
    document.getElementById('pptViewerPrev').onclick = () => pptViewer && pptViewer.previousSlide();
    document.getElementById('pptViewerNext').onclick = () => pptViewer && pptViewer.nextSlide();
}

function closePPTViewer() {
    if (pptViewer) { try { pptViewer.destroy(); } catch (e) {} pptViewer = null; }
    document.getElementById('pptViewerOverlay').classList.remove('active');
}

// ==================== 入口 ====================
async function renderReviewView() {
    if (!_pptLoaded) await loadPPTsFromDB();
    renderReviewPlan();
}

// ==================== 事件绑定 ====================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('reviewPPTInput')?.addEventListener('change', handlePPTFileSelected);

    document.getElementById('reviewResetBtn')?.addEventListener('click', async () => {
        if (!confirm('确定清除所有PPT记录？')) return;
        // 逐个删除云端记录
        for (const name of REVIEW_CHAPTERS) {
            if (getChapterPPT(name)) await removeChapterPPT(name);
        }
        saveLocalCache({});
        renderReviewPlan();
    });

    document.getElementById('pptViewerBack')?.addEventListener('click', closePPTViewer);
    document.getElementById('pptViewerClose')?.addEventListener('click', closePPTViewer);

    document.addEventListener('keydown', (e) => {
        if (!document.getElementById('pptViewerOverlay')?.classList.contains('active')) return;
        if (e.key === 'Escape') closePPTViewer();
        if (e.key === 'ArrowLeft' && pptViewer) pptViewer.previousSlide();
        if (e.key === 'ArrowRight' && pptViewer) pptViewer.nextSlide();
    });

    document.getElementById('pptViewerOverlay')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closePPTViewer();
    });

    let touchStartX = 0;
    document.getElementById('pptViewerOverlay')?.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    document.getElementById('pptViewerOverlay')?.addEventListener('touchend', (e) => {
        if (!pptViewer) return;
        const delta = touchStartX - e.changedTouches[0].screenX;
        if (Math.abs(delta) > 60) delta > 0 ? pptViewer.nextSlide() : pptViewer.previousSlide();
    }, { passive: true });
});
