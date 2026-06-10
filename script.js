/* ============================================================
   个人主页 - 脚本
   负责：导航高亮、平滑滚动、表单处理、入场动画
   ============================================================ */

// ---------- DOM 就绪后执行 ----------
document.addEventListener('DOMContentLoaded', () => {
    initNavHighlight();
    initSmoothScroll();
    initContactForm();
    initScrollReveal();
});

// ==================== 1. 导航栏当前页高亮 ====================
function initNavHighlight() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav__link');

    /**
     * 使用 IntersectionObserver 监听每个 section 的可见比例，
     * 当某个 section 占据视口超过 50% 时，高亮对应导航链接。
     */
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('id');
                navLinks.forEach((link) => {
                    link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
                });
            }
        });
    }, {
        threshold: 0.5,         // section 50% 可见时触发
        rootMargin: '-64px 0px 0px 0px'  // 补偿固定导航高度
    });

    sections.forEach((section) => observer.observe(section));
}

// ==================== 2. 导航平滑滚动（弥补 Safari 不足） ====================
function initSmoothScroll() {
    document.querySelectorAll('.nav__link').forEach((link) => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').slice(1);
            const target = document.getElementById(targetId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

// ==================== 3. 联系表单处理 ====================
function initContactForm() {
    const form = document.getElementById('contactForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // 收集表单数据
        const formData = new FormData(form);
        const data = {};
        formData.forEach((value, key) => {
            // input 没有 name 属性时，用 placeholder 作为键名
            const inputEl = form.querySelector(`[name="${key}"]`) ||
                            [...form.querySelectorAll('input, textarea')]
                                .find(el => (el.value === value && el !== form.querySelector('button')));
        });

        // 简单校验：至少填写名字、邮箱和内容
        const inputs = form.querySelectorAll('input, textarea');
        const values = [...inputs].map((el) => el.value.trim());
        const hasEmpty = values.slice(0, 3).some((v) => !v); // 前三个为名字、邮箱、内容

        if (hasEmpty) {
            showToast('请填写名字、邮箱和消息内容 🙏', 'error');
            return;
        }

        // 模拟发送（实际项目中替换为 fetch / axios 请求）
        const btn = form.querySelector('button');
        const originalText = btn.textContent;
        btn.textContent = '发送中...';
        btn.disabled = true;

        setTimeout(() => {
            showToast('消息已发送！我会尽快回复你 ✨', 'success');
            form.reset();
            btn.textContent = originalText;
            btn.disabled = false;
        }, 1200);
    });
}

/**
 * 简易 Toast 提示
 * @param {string} message - 提示文本
 * @param {'success'|'error'} type - 提示类型
 */
function showToast(message, type = 'success') {
    // 移除已有 toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;

    // 内联样式（避免 CSS 文件膨胀，toast 只在这里用到）
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '32px',
        right: '32px',
        padding: '14px 24px',
        borderRadius: '10px',
        color: '#fff',
        fontWeight: 600,
        fontSize: '0.9rem',
        zIndex: 9999,
        opacity: 0,
        transform: 'translateY(20px)',
        transition: 'all 0.35s ease',
        background: type === 'success'
            ? 'linear-gradient(135deg, #10b981, #059669)'
            : 'linear-gradient(135deg, #ef4444, #dc2626)',
        boxShadow: '0 6px 20px rgba(0,0,0,0.15)'
    });

    document.body.appendChild(toast);

    // 触发入场动画
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    // 3 秒后自动消失
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
}

// ==================== 4. 滚动入场动画 ====================
function initScrollReveal() {
    const revealItems = document.querySelectorAll(
        '.skill-card, .project-card, .about__text, .section__title'
    );

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                observer.unobserve(entry.target); // 只播放一次
            }
        });
    }, {
        threshold: 0.15,
        rootMargin: '0px 0px -40px 0px'
    });

    revealItems.forEach((el) => {
        // 设置初始隐藏状态（保留占位空间）
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
}
