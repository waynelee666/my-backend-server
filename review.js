/* ============================================================
   复习模块  v5.1 — 全平台原版呈现
   ============================================================

   流程：
   上传 → localhost COM 转 PNG → PNG 逐页同步到 Supabase Storage
   查看 → 所有设备从 Supabase 加载 PNG（100% 原版）

   ⚠️ Supabase SQL（建表）：
   ─────────────────────────────────────────────────────────
   DROP TABLE IF EXISTS review_ppts;
   CREATE TABLE review_ppts (
       id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
       user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
       chapter_name TEXT NOT NULL,
       pptx_path TEXT DEFAULT '',
       slide_prefix TEXT NOT NULL DEFAULT '',
       slides_count INTEGER NOT NULL DEFAULT 0,
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
const REVIEW_KEY = 'review_ppt';
const LOCAL_BASE = 'http://localhost:8080';  // 仅用于 COM 转换

let _pptCache = null;
let _pptLoaded = false;

// ==================== 数据层 ====================

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

async function loadPPTsFromDB() {
    try {
        const sb = Auth.getClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { _pptLoaded = true; return getLocalCache(); }

        const { data, error } = await sb
            .from('review_ppts')
            .select('chapter_name, pptx_path, slide_prefix, slides_count')
            .eq('user_id', user.id);

        if (error) throw error;

        const local = getLocalCache();
        const merged = { ...local };
        (data || []).forEach(row => {
            if (row.slide_prefix || row.pptx_path) {
                merged[row.chapter_name] = {
                    pptx_path: row.pptx_path || '',
                    slide_prefix: row.slide_prefix || '',
                    slides_count: row.slides_count || 0,
                };
            }
        });
        saveLocalCache(merged);
        _pptLoaded = true;
        return merged;
    } catch (e) {
        console.warn('加载云端PPT记录失败:', e.message);
        _pptLoaded = true;
        return getLocalCache();
    }
}

function getChapterPPT(chapterName) {
    const rec = getLocalCache()[chapterName];
    if (!rec) return null;
    if (typeof rec === 'string') return { pptx_path: rec, slide_prefix: '', slides_count: 0 };
    return rec;
}

async function setChapterPPT(chapterName, record) {
    try {
        const sb = Auth.getClient();
        const { data: { user } } = await sb.auth.getUser();
        if (user) {
            await sb.from('review_ppts').upsert({
                user_id: user.id,
                chapter_name: chapterName,
                pptx_path: record.pptx_path || '',
                slide_prefix: record.slide_prefix || '',
                slides_count: record.slides_count || 0,
            }, { onConflict: 'user_id, chapter_name' });
        }
    } catch (e) { console.error('云端保存PPT失败:', e.message); }

    const cache = getLocalCache();
    cache[chapterName] = record;
    saveLocalCache(cache);
}

async function removeChapterPPT(chapterName) {
    try {
        const sb = Auth.getClient();
        const { data: { user } } = await sb.auth.getUser();
        if (user) {
            await sb.from('review_ppts').delete()
                .eq('user_id', user.id).eq('chapter_name', chapterName);
        }
    } catch (e) { console.error('云端删除PPT失败:', e.message); }

    const cache = getLocalCache();
    delete cache[chapterName];
    saveLocalCache(cache);
}

// ==================== 渲染章节列表 ====================

function renderReviewPlan() {
    const el = document.getElementById('reviewPlan');
    if (!el) return;

    el.innerHTML = REVIEW_CHAPTERS.map((name, i) => {
        const rec = getChapterPPT(name);
        const hasPNG = !!(rec && rec.slide_prefix && rec.slides_count > 0);
        const hasPPTXOnly = !!(rec && rec.pptx_path && !rec.slide_prefix);
        const hasPPT = hasPNG || hasPPTXOnly;
        const label = hasPNG ? `📱 ${rec.slides_count}页` : (hasPPTXOnly ? 'PPT' : '');

        return `<div class="review-chapter">
            <div class="review-chapter__row">
                <span class="review-chapter__label">第${i + 1}章</span>
                <span class="review-chapter__name">${esc(name)}</span>
                <span class="review-chapter__ppt-filename">${hasPPT ? esc(label) : ''}</span>
                <div class="review-chapter__ppt-actions">
                    <button class="btn btn--outline btn--sm review-ppt-upload-btn" data-ch="${i}">📤</button>
                    ${hasPPT ? `<button class="btn btn--primary btn--sm review-ppt-view-btn" data-ch="${i}">👁 查看</button>
                    <button class="btn btn--outline btn--sm review-ppt-del-btn" data-ch="${i}" title="删除">✕</button>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');

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

// ==================== 上传：COM 转换 → 逐页同步到 Supabase ====================
let _pendingPPTChapter = -1;

async function isLocalServerAvailable() {
    try {
        const resp = await fetch(`${LOCAL_BASE}/api/health`, { signal: AbortSignal.timeout(1500) });
        return resp.ok;
    } catch { return false; }
}

async function handlePPTFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pptx')) {
        showToast && showToast('只支持 .pptx 格式', 'error');
        event.target.value = ''; return;
    }

    const chIdx = _pendingPPTChapter;
    const name = REVIEW_CHAPTERS[chIdx];
    const btn = document.querySelector(`.review-ppt-upload-btn[data-ch="${chIdx}"]`);
    if (btn) { btn.textContent = '⏳ 检测...'; btn.disabled = true; }

    let slide_prefix = '';   // Supabase Storage 中 PNG 文件夹路径
    let slides_count = 0;
    let usePNG = false;

    // ===== ① 尝试 localhost COM 转换 =====
    const localOK = await isLocalServerAvailable();
    if (localOK) {
        try {
            // 上传 PPTX 到本地 server
            if (btn) btn.textContent = '⬆ 上传...';
            const form = new FormData();
            form.append('file', file);
            const upResp = await fetch(`${LOCAL_BASE}/api/upload-review-ppt?chapter=${chIdx + 1}`, {
                method: 'POST', body: form
            });
            const upJson = await upResp.json();
            if (!upJson.ok) throw new Error(upJson.error);

            // COM 转 PNG
            if (btn) btn.textContent = '🖼 转换...';
            const cvResp = await fetch(`${LOCAL_BASE}/api/convert-ppt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: upJson.filename })
            });
            const cvJson = await cvResp.json();
            if (!cvJson.ok) throw new Error(cvJson.error);

            slides_count = cvJson.slides;

            // ② 逐页上传 PNG 到 Supabase Storage（全平台通用）
            const sbFolder = `ch${chIdx + 1}/${cvJson.prefix}`;
            for (let i = 1; i <= slides_count; i++) {
                if (btn) btn.textContent = `☁ 同步 ${i}/${slides_count}`;
                try {
                    const imgResp = await fetch(
                        `${LOCAL_BASE}/uploads/review/${cvJson.prefix}_slide_${i}.png`
                    );
                    if (!imgResp.ok) throw new Error(`slide ${i} fetch failed`);
                    const imgBlob = await imgResp.blob();
                    await Auth.getClient().storage.from(SUPABASE_BUCKET)
                        .upload(`${sbFolder}/slide_${i}.png`, imgBlob, {
                            contentType: 'image/png',
                            cacheControl: '31536000',
                            upsert: true
                        });
                } catch (e) {
                    console.warn(`上传第${i}页失败:`, e.message);
                }
            }
            slide_prefix = sbFolder;
            usePNG = true;
        } catch (e) {
            console.warn('本地COM转换失败:', e.message);
        }
    }

    // ===== ③ 上传 PPTX 到 Supabase（备份 + 降级用） =====
    if (btn) btn.textContent = usePNG ? '☁ 完成' : '☁ 云端上传...';
    let pptxPath = '';
    try {
        const sp = `ch${chIdx + 1}/${Date.now()}_${file.name}`;
        const { data: sbData, error: sbErr } = await Auth.getClient()
            .storage.from(SUPABASE_BUCKET).upload(sp, file, { cacheControl: '3600', upsert: false });
        if (!sbErr) pptxPath = sbData.path || sp;
    } catch (e) { console.warn('Supabase PPTX上传失败:', e.message); }

    if (!pptxPath && !usePNG) {
        showToast && showToast('上传失败：无法连接到云存储', 'error');
        if (btn) { btn.textContent = '📤'; btn.disabled = false; }
        event.target.value = ''; return;
    }

    // ===== ④ 存入 Supabase DB =====
    await setChapterPPT(name, { pptx_path: pptxPath, slide_prefix, slides_count });

    if (usePNG) {
        showToast && showToast(`「${name}」上传成功 · ${slides_count} 页 · 全平台原版呈现`, 'success');
    } else {
        showToast && showToast(`「${name}」已上传 · 云端同步（手机端效果可能不佳）`, 'success');
    }
    renderReviewPlan();

    event.target.value = '';
}

// ==================== PPT 查看器（全屏放映模式） ====================
let _slideState = null;
let _pptViewerJS = null;
let _toolbarTimer = null;
let _hintTimer = null;

function getSupabaseSlideURL(slidePrefix, n) {
    const { data } = Auth.getClient().storage
        .from(SUPABASE_BUCKET)
        .getPublicUrl(`${slidePrefix}/slide_${n}.png`);
    return data.publicUrl;
}

async function openPPTViewer(chapterIndex) {
    const name = REVIEW_CHAPTERS[chapterIndex];
    const rec = getChapterPPT(name);
    if (!rec || (!rec.slides_count && !rec.pptx_path)) {
        showToast && showToast('请先上传PPT', 'error'); return;
    }

    const overlay = document.getElementById('pptViewerOverlay');
    const img = document.getElementById('pptViewerImg');
    const canvas = document.getElementById('pptViewerCanvas');
    const loading = document.getElementById('pptViewerLoading');
    document.getElementById('pptViewerTitle').textContent = name;
    overlay.classList.add('active');

    // 隐藏工具栏
    hideToolbar();

    if (rec.slide_prefix && rec.slides_count > 0) {
        // ★ 图片模式（全平台原版）
        _slideState = { mode: 'images', prefix: rec.slide_prefix, total: rec.slides_count, current: 0 };
        img.style.display = 'block';
        canvas.style.display = 'none';
        if (loading) { loading.style.display = 'none'; }
        if (_pptViewerJS) { try { _pptViewerJS.destroy(); } catch (e) {} _pptViewerJS = null; }
        loadSlide(0);
    } else if (rec.pptx_path) {
        // ★ 降级：PptxViewJS
        _slideState = { mode: 'pptxjs', pptx_path: rec.pptx_path };
        img.style.display = 'none';
        canvas.style.display = 'block';
        if (loading) { loading.style.display = 'flex'; loading.textContent = '加载中...'; }
        await openWithPptxJS(name, rec.pptx_path);
    } else {
        showToast && showToast('PPT文件不可用', 'error');
        closePPTViewer();
    }
}

// ---- 工具栏显示/隐藏 ----
function showToolbar() {
    document.getElementById('pptViewerTopbar').classList.add('visible');
    document.getElementById('pptViewerControls').classList.add('visible');
    resetToolbarTimer();
}

function hideToolbar() {
    document.getElementById('pptViewerTopbar').classList.remove('visible');
    document.getElementById('pptViewerControls').classList.remove('visible');
    if (_toolbarTimer) { clearTimeout(_toolbarTimer); _toolbarTimer = null; }
}

function resetToolbarTimer() {
    if (_toolbarTimer) clearTimeout(_toolbarTimer);
    _toolbarTimer = setTimeout(hideToolbar, 3000);
}

// ---- 页码提示 ----
function showHint() {
    if (!_slideState || _slideState.mode !== 'images') return;
    const hint = document.getElementById('pptViewerHint');
    hint.textContent = `${_slideState.current + 1} / ${_slideState.total}`;
    hint.classList.add('show');
    if (_hintTimer) clearTimeout(_hintTimer);
    _hintTimer = setTimeout(() => hint.classList.remove('show'), 1500);
}

// ---- 图片模式 ----
function loadSlide(index) {
    if (!_slideState || _slideState.mode !== 'images') return;
    _slideState.current = index;

    const img = document.getElementById('pptViewerImg');
    const loading = document.getElementById('pptViewerLoading');
    img.style.opacity = '0';
    if (loading) { loading.style.display = 'flex'; loading.textContent = '加载中...'; loading.style.color = '#aaa'; }

    const url = getSupabaseSlideURL(_slideState.prefix, index + 1);
    img.src = url;
    img.onload = () => {
        img.style.opacity = '1';
        if (loading) loading.style.display = 'none';
    };
    img.onerror = () => {
        if (loading) { loading.textContent = '加载失败'; loading.style.color = '#ef4444'; }
    };

    updateSlideNav();
    showHint();

    // 预加载相邻页
    if (index > 0) new Image().src = getSupabaseSlideURL(_slideState.prefix, index);
    if (index + 2 <= _slideState.total) new Image().src = getSupabaseSlideURL(_slideState.prefix, index + 2);
}

function updateSlideNav() {
    if (!_slideState || _slideState.mode !== 'images') return;
    const { current, total } = _slideState;
    document.getElementById('pptViewerCounter').textContent = `${current + 1} / ${total}`;
    document.getElementById('pptViewerPrev').disabled = current <= 0;
    document.getElementById('pptViewerNext').disabled = current >= total - 1;
}

function pptPrev() {
    if (!_slideState) return;
    if (_slideState.mode === 'images' && _slideState.current > 0) { loadSlide(_slideState.current - 1); resetToolbarTimer(); }
    else if (_slideState.mode === 'pptxjs' && _pptViewerJS) { _pptViewerJS.previousSlide(); resetToolbarTimer(); }
}

function pptNext() {
    if (!_slideState) return;
    if (_slideState.mode === 'images' && _slideState.current < _slideState.total - 1) { loadSlide(_slideState.current + 1); resetToolbarTimer(); }
    else if (_slideState.mode === 'pptxjs' && _pptViewerJS) { _pptViewerJS.nextSlide(); resetToolbarTimer(); }
}

// ---- PptxViewJS 降级 ----
async function openWithPptxJS(name, storagePath) {
    const canvas = document.getElementById('pptViewerCanvas');
    document.getElementById('pptViewerCounter').textContent = '...';
    document.getElementById('pptViewerPrev').disabled = true;
    document.getElementById('pptViewerNext').disabled = true;

    if (_pptViewerJS) { try { _pptViewerJS.destroy(); } catch (e) {} _pptViewerJS = null; }

    try {
        const sb = Auth.getClient();
        const { data: urlData } = sb.storage.from(SUPABASE_BUCKET).getPublicUrl(storagePath);
        const resp = await fetch(urlData.publicUrl);
        if (!resp.ok) throw new Error('无法加载PPT文件');
        const blob = await resp.blob();

        _pptViewerJS = new PptxViewJS.PPTXViewer({ canvas, autoExposeGlobals: false });
        _pptViewerJS.on('loadComplete', syncPptxNav);
        _pptViewerJS.on('renderComplete', syncPptxNav);

        await _pptViewerJS.loadFile(new File([blob], name + '.pptx'));
        const loading = document.getElementById('pptViewerLoading');
        if (loading) loading.style.display = 'none';
    } catch (e) {
        console.error(e);
        showToast && showToast('加载失败: ' + e.message, 'error');
        closePPTViewer();
    }
}

function syncPptxNav() {
    if (!_pptViewerJS) return;
    try {
        const total = _pptViewerJS.getSlideCount();
        const current = _pptViewerJS.getCurrentSlideIndex();
        document.getElementById('pptViewerCounter').textContent = `${current + 1} / ${total}`;
        document.getElementById('pptViewerPrev').disabled = current <= 0;
        document.getElementById('pptViewerNext').disabled = current >= total - 1;
    } catch (e) {}
}

function closePPTViewer() {
    hideToolbar();
    if (_pptViewerJS) { try { _pptViewerJS.destroy(); } catch (e) {} _pptViewerJS = null; }
    _slideState = null;
    document.getElementById('pptViewerOverlay').classList.remove('active');
    document.getElementById('pptViewerImg').src = '';
}

// ==================== 入口 ====================
async function renderReviewView() {
    if (!_pptLoaded) await loadPPTsFromDB();
    renderReviewPlan();
}

// ==================== 事件绑定 ====================
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('pptViewerOverlay');
    const wrap = document.getElementById('pptViewerWrap');

    document.getElementById('reviewPPTInput')?.addEventListener('change', handlePPTFileSelected);

    document.getElementById('reviewResetBtn')?.addEventListener('click', async () => {
        if (!confirm('确定清除所有PPT记录？')) return;
        for (const name of REVIEW_CHAPTERS) {
            if (getChapterPPT(name)) await removeChapterPPT(name);
        }
        saveLocalCache({});
        renderReviewPlan();
    });

    document.getElementById('pptViewerPrev').onclick = (e) => { e.stopPropagation(); pptPrev(); };
    document.getElementById('pptViewerNext').onclick = (e) => { e.stopPropagation(); pptNext(); };
    document.getElementById('pptViewerBack')?.addEventListener('click', (e) => { e.stopPropagation(); closePPTViewer(); });
    document.getElementById('pptViewerClose')?.addEventListener('click', (e) => { e.stopPropagation(); closePPTViewer(); });

    // ===== 键盘 =====
    document.addEventListener('keydown', (e) => {
        if (!overlay?.classList.contains('active')) return;
        if (e.key === 'Escape') closePPTViewer();
        if (e.key === 'ArrowLeft') pptPrev();
        if (e.key === 'ArrowRight') pptNext();
    });

    // ===== 点击/触摸：左 1/3 上一页，右 2/3 下一页，中间显示工具栏 =====
    wrap?.addEventListener('click', (e) => {
        if (!_slideState) return;
        const rect = wrap.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const third = rect.width / 3;

        if (x < third) pptPrev();
        else if (x > third * 2) pptNext();
        else showToolbar();  // 中间 → 显示/隐藏工具栏
    });

    // ===== 滑动切换 =====
    let _touchStartX = 0, _touchStartY = 0, _touchMoved = false;

    overlay?.addEventListener('touchstart', (e) => {
        _touchStartX = e.touches[0].clientX;
        _touchStartY = e.touches[0].clientY;
        _touchMoved = false;
    }, { passive: true });

    overlay?.addEventListener('touchmove', (e) => {
        // 阻止页面滚动（在查看器内）
        if (Math.abs(e.touches[0].clientY - _touchStartY) > 10) {
            // 用户在做垂直滑动，允许
        }
        _touchMoved = true;
    }, { passive: true });

    overlay?.addEventListener('touchend', (e) => {
        if (!_slideState || !_touchMoved) return;
        const deltaX = _touchStartX - e.changedTouches[0].clientX;
        const deltaY = Math.abs(_touchStartY - e.changedTouches[0].clientY);

        // 水平滑动 > 50px 且大于垂直滑动
        if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > deltaY) {
            deltaX > 0 ? pptNext() : pptPrev();
        }
    });

    // ===== 双击切换工具栏 =====
    overlay?.addEventListener('dblclick', (e) => {
        e.preventDefault();
        const topbar = document.getElementById('pptViewerTopbar');
        topbar.classList.contains('visible') ? hideToolbar() : showToolbar();
    });
});
