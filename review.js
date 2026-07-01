/* ============================================================
   复习模块  v5.0 — 服务端 PowerPoint COM 渲染，原版呈现
   ============================================================

   流程：
   上传 → server 保存 + COM 转 PNG → Supabase Storage 备份
   查看 → 优先 server PNG 图片（100% 原版），fallback PptxViewJS

   ⚠️ Supabase SQL Editor 执行以下建表语句（v5 更新）：
   ─────────────────────────────────────────────────────────
   DROP TABLE IF EXISTS review_ppts;  -- 如果旧表存在则删
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
const LOCAL_BASE = 'http://localhost:8080';  // 本地 PC server（用于 COM 转换 + PNG 服务）

let _pptCache = null;    // { chapterName: {pptx_path, slide_prefix, slides_count} }
let _pptLoaded = false;

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
        console.warn('加载云端PPT记录失败，使用本地缓存:', e.message);
        _pptLoaded = true;
        return getLocalCache();
    }
}

function getChapterPPT(chapterName) {
    const rec = getLocalCache()[chapterName];
    if (!rec) return null;
    // 兼容旧数据（纯字符串路径）
    if (typeof rec === 'string') return { pptx_path: rec, slide_prefix: '', slides_count: 0 };
    return rec;
}

async function setChapterPPT(chapterName, record) {
    // 1. 写 Supabase
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

    // 2. 同步本地缓存
    const cache = getLocalCache();
    cache[chapterName] = record;
    saveLocalCache(cache);
}

async function removeChapterPPT(chapterName) {
    // 1. 删 Supabase
    try {
        const sb = Auth.getClient();
        const { data: { user } } = await sb.auth.getUser();
        if (user) {
            await sb.from('review_ppts').delete()
                .eq('user_id', user.id).eq('chapter_name', chapterName);
        }
    } catch (e) { console.error('云端删除PPT失败:', e.message); }

    // 2. 同步本地缓存
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
        const hasPPT = !!(rec && (rec.slides_count > 0 || rec.pptx_path));
        const label = rec && rec.slides_count > 0 ? `${rec.slides_count}页` : (rec && rec.pptx_path ? 'PPT' : '');

        return `<div class="review-chapter">
            <div class="review-chapter__row">
                <span class="review-chapter__label">第${i + 1}章</span>
                <span class="review-chapter__name">${esc(name)}</span>
                <span class="review-chapter__ppt-filename">${hasPPT ? '📎 ' + esc(label) : ''}</span>
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

// ==================== 上传：server COM 转换 + Supabase 备份 ====================
let _pendingPPTChapter = -1;

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
    if (btn) { btn.textContent = '⏳ 上传中...'; btn.disabled = true; }

    let slide_prefix = '';
    let slides_count = 0;
    let useComRender = false;

    // ===== 尝试 localhost COM 转换 =====
    const localOK = await isLocalServerAvailable();
    if (localOK) {
        try {
            // ① 上传 PPTX 到本地 server
            if (btn) btn.textContent = '⬆ 上传...';
            const form = new FormData();
            form.append('file', file);
            const upResp = await fetch(`${LOCAL_BASE}/api/upload-review-ppt?chapter=${chIdx + 1}`, {
                method: 'POST', body: form
            });
            const upJson = await upResp.json();
            if (!upJson.ok) throw new Error(upJson.error);

            // ② COM 转 PNG（100% 原版）
            if (btn) btn.textContent = '🖼 转换...';
            const cvResp = await fetch(`${LOCAL_BASE}/api/convert-ppt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: upJson.filename })
            });
            const cvJson = await cvResp.json();
            if (cvJson.ok) {
                slide_prefix = cvJson.prefix;
                slides_count = cvJson.slides;
                useComRender = true;
            }
        } catch (e) {
            console.warn('本地COM转换失败:', e.message);
        }
    }

    // ===== 上传 PPTX 到 Supabase（云端备份 + 跨设备） =====
    if (btn) btn.textContent = '☁ 云端同步...';
    let pptxPath = '';
    try {
        const sp = `ch${chIdx + 1}/${Date.now()}_${file.name}`;
        const { data: sbData, error: sbErr } = await Auth.getClient()
            .storage.from(SUPABASE_BUCKET).upload(sp, file, { cacheControl: '3600', upsert: false });
        if (!sbErr) pptxPath = sbData.path || sp;
    } catch (e) { console.warn('Supabase上传失败:', e.message); }

    if (!pptxPath && !useComRender) {
        showToast && showToast('上传失败：无法连接到云存储，且本地服务器不可用', 'error');
        if (btn) { btn.textContent = '📤'; btn.disabled = false; }
        event.target.value = ''; return;
    }

    // ===== 存入 Supabase DB + localStorage =====
    await setChapterPPT(name, { pptx_path: pptxPath, slide_prefix, slides_count });

    if (useComRender) {
        showToast && showToast(`「${name}」上传成功 · ${slides_count} 页 · PowerPoint 原版渲染`, 'success');
    } else {
        showToast && showToast(`「${name}」上传成功 · 云端同步（非原版渲染）`, 'success');
    }
    renderReviewPlan();

    event.target.value = '';
}

// ==================== PPT 查看器（图片滑块 + PptxViewJS 降级）====================
let _slideState = null;   // { mode:'images'|'pptxjs', prefix, total, current }
let _pptViewerJS = null;  // PptxViewJS 实例（降级用）

async function isLocalServerAvailable() {
    try {
        const resp = await fetch(`${LOCAL_BASE}/api/health`, { signal: AbortSignal.timeout(2000) });
        return resp.ok;
    } catch { return false; }
}

function getSlideURL(prefix, n) {
    return `${LOCAL_BASE}/uploads/review/${prefix}_slide_${n}.png`;
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

    const serverOK = await isLocalServerAvailable();

    if (serverOK && rec.slide_prefix && rec.slides_count > 0) {
        // ★ 原版呈现：加载服务器 PNG（PowerPoint COM 导出，100% 还原）
        _slideState = { mode: 'images', prefix: rec.slide_prefix, total: rec.slides_count, current: 0 };
        img.style.display = 'block';
        canvas.style.display = 'none';
        if (loading) { loading.style.display = 'none'; }
        if (_pptViewerJS) { try { _pptViewerJS.destroy(); } catch (e) {} _pptViewerJS = null; }
        loadSlide(0);
    } else if (rec.pptx_path) {
        // ★ 降级：PptxViewJS 渲染（移动端或服务器不可用时）
        _slideState = { mode: 'pptxjs', pptx_path: rec.pptx_path };
        img.style.display = 'none';
        canvas.style.display = 'block';
        if (loading) { loading.style.display = 'flex'; loading.textContent = '加载中...'; }
        await openWithPptxJS(name, rec.pptx_path);
    } else {
        showToast && showToast('PPT文件不可用（服务器离线且无云端备份）', 'error');
        closePPTViewer();
    }
}

// ---- 图片模式 ----
function loadSlide(index) {
    if (!_slideState || _slideState.mode !== 'images') return;
    _slideState.current = index;

    const img = document.getElementById('pptViewerImg');
    const loading = document.getElementById('pptViewerLoading');
    img.style.opacity = '0';
    if (loading) { loading.style.display = 'flex'; loading.textContent = '加载中...'; loading.style.color = '#aaa'; }

    const url = getSlideURL(_slideState.prefix, index + 1);
    img.src = url;
    img.onload = () => {
        img.style.opacity = '1';
        if (loading) loading.style.display = 'none';
    };
    img.onerror = () => {
        if (loading) { loading.textContent = '幻灯片加载失败'; loading.style.color = '#ef4444'; }
    };

    updateSlideNav();

    // 预加载相邻页
    if (index > 0) new Image().src = getSlideURL(_slideState.prefix, index);
    if (index + 2 <= _slideState.total) new Image().src = getSlideURL(_slideState.prefix, index + 2);
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
    if (_slideState.mode === 'images' && _slideState.current > 0) loadSlide(_slideState.current - 1);
    else if (_slideState.mode === 'pptxjs' && _pptViewerJS) _pptViewerJS.previousSlide();
}

function pptNext() {
    if (!_slideState) return;
    if (_slideState.mode === 'images' && _slideState.current < _slideState.total - 1) loadSlide(_slideState.current + 1);
    else if (_slideState.mode === 'pptxjs' && _pptViewerJS) _pptViewerJS.nextSlide();
}

// ---- PptxViewJS 降级模式（移动端）----
async function openWithPptxJS(name, storagePath) {
    const canvas = document.getElementById('pptViewerCanvas');
    document.getElementById('pptViewerCounter').textContent = '加载中...';
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

// ---- 关闭 ----
function closePPTViewer() {
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
    document.getElementById('reviewPPTInput')?.addEventListener('change', handlePPTFileSelected);

    document.getElementById('reviewResetBtn')?.addEventListener('click', async () => {
        if (!confirm('确定清除所有PPT记录？（PPT文件仍保留在服务器和云端）')) return;
        for (const name of REVIEW_CHAPTERS) {
            if (getChapterPPT(name)) await removeChapterPPT(name);
        }
        saveLocalCache({});
        renderReviewPlan();
    });

    document.getElementById('pptViewerPrev').onclick = pptPrev;
    document.getElementById('pptViewerNext').onclick = pptNext;
    document.getElementById('pptViewerBack')?.addEventListener('click', closePPTViewer);
    document.getElementById('pptViewerClose')?.addEventListener('click', closePPTViewer);

    document.addEventListener('keydown', (e) => {
        if (!document.getElementById('pptViewerOverlay')?.classList.contains('active')) return;
        if (e.key === 'Escape') closePPTViewer();
        if (e.key === 'ArrowLeft') pptPrev();
        if (e.key === 'ArrowRight') pptNext();
    });

    document.getElementById('pptViewerOverlay')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closePPTViewer();
    });

    let _touchStartX = 0;
    document.getElementById('pptViewerOverlay')?.addEventListener('touchstart', (e) => {
        _touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    document.getElementById('pptViewerOverlay')?.addEventListener('touchend', (e) => {
        if (!_slideState) return;
        const delta = _touchStartX - e.changedTouches[0].screenX;
        if (Math.abs(delta) > 60) delta > 0 ? pptNext() : pptPrev();
    }, { passive: true });
});
