/* ============================================================
   认证模块 — auth.js
   基于 Supabase Auth SDK 实现登录、注册、会话验证、退出。
   被 login.html 和 index.html 共同引用。

   ⚠️ 使用前请替换下方的 Supabase URL 和 anon key：
     1. 在 https://supabase.com 创建项目
     2. Settings → API → 复制 URL 和 anon key
     3. Authentication → Settings → 关闭 "Confirm email"
   ============================================================ */

const Auth = (() => {
    // ---------- 🔧 Supabase 配置（替换为你的实际值） ----------
    const SUPABASE_URL = 'https://swouijpxhujlwlrsmwmo.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3b3VpanB4aHVqbHdscnNtd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMjQxMzIsImV4cCI6MjA5NjcwMDEzMn0.VhL4p8yoILq-5nFe2K5TKafoC03vsDwa_MBb-uBp8PQ';

    // 初始化 Supabase 客户端（CDN 提供的 window.supabase）
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // ---------- 公开方法 ----------

    /**
     * 检查是否已登录（通过 Supabase 服务端 session）
     * @returns {Promise<boolean>}
     */
    async function isLoggedIn() {
        const { data } = await sb.auth.getSession();
        return !!data.session;
    }

    /**
     * 登录
     * @param {string} email
     * @param {string} password
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    async function login(email, password) {
        const { data, error } = await sb.auth.signInWithPassword({
            email,
            password,
        });
        if (error) {
            return { ok: false, error: error.message };
        }
        return { ok: true, email: data.user.email };
    }

    /**
     * 注册
     * @param {string} email
     * @param {string} password
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    async function register(email, password) {
        const { data, error } = await sb.auth.signUp({
            email,
            password,
        });
        if (error) {
            return { ok: false, error: error.message };
        }
        // 如果关闭了邮箱确认，注册后会直接创建 session
        if (data.session) {
            return { ok: true };
        }
        // 如果开启了邮箱确认，需要提醒用户查收邮件
        return { ok: true, emailConfirm: true };
    }

    /**
     * 验证当前 session 是否有效
     * @returns {Promise<{valid: boolean, email?: string}>}
     */
    async function verify() {
        if (!(await isLoggedIn())) {
            return { valid: false };
        }
        const { data, error } = await sb.auth.getUser();
        if (error || !data.user) {
            return { valid: false };
        }
        return { valid: true, email: data.user.email };
    }

    /**
     * 退出登录
     */
    async function logout() {
        await sb.auth.signOut();
        window.location.href = '/login.html';
    }

    /**
     * 获取当前用户邮箱
     * @returns {Promise<string|null>}
     */
    async function getEmail() {
        const { data } = await sb.auth.getUser();
        return data.user?.email || null;
    }

    // ---------- 暴露 API ----------
    return {
        isLoggedIn,
        login,
        register,
        verify,
        logout,
        getEmail,
    };
})();
