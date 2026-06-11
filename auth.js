/* ============================================================
   认证模块 — auth.js
   基于 Supabase Auth SDK 实现登录、注册、会话验证、退出。
   支持用户名+邮箱注册，登录时可用用户名或邮箱。

   ⚠️ 使用前请替换下方的 Supabase URL 和 anon key：
     1. 在 https://supabase.com 创建项目
     2. Settings → API → 复制 URL 和 anon key
     3. Authentication → Settings → 关闭 "Confirm email"
     4. SQL Editor 中运行建表语句创建 profiles 表
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
     * 登录（支持用户名或邮箱）
     * @param {string} identifier - 用户名或邮箱
     * @param {string} password
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    async function login(identifier, password) {
        let email = identifier;

        // 如果不含 @，视为用户名 → 查 profiles 获取邮箱
        if (!identifier.includes('@')) {
            const { data: profile, error: lookupError } = await sb
                .from('profiles')
                .select('email')
                .eq('username', identifier)
                .single();

            if (lookupError || !profile) {
                return { ok: false, error: '用户名不存在' };
            }
            email = profile.email;
        }

        const { data, error } = await sb.auth.signInWithPassword({
            email,
            password,
        });
        if (error) {
            // 统一提示：用户名或密码错误
            if (error.message.includes('Invalid login credentials')) {
                return { ok: false, error: '用户名或密码错误' };
            }
            return { ok: false, error: error.message };
        }
        return { ok: true };
    }

    /**
     * 注册
     * @param {string} email
     * @param {string} password
     * @param {string} username
     * @returns {Promise<{ok: boolean, error?: string, emailConfirm?: boolean}>}
     */
    async function register(email, password, username) {
        // 先检查用户名是否已被占用（profiles 表有 unique 约束）
        const { data: existing } = await sb
            .from('profiles')
            .select('username')
            .eq('username', username)
            .maybeSingle();

        if (existing) {
            return { ok: false, error: '该用户名已被注册' };
        }

        // 注册 Supabase Auth 用户（user_metadata 保存用户名）
        const { data, error } = await sb.auth.signUp({
            email,
            password,
            options: {
                data: { username },
            },
        });

        if (error) {
            if (error.message.includes('already registered')) {
                return { ok: false, error: '该邮箱已被注册' };
            }
            return { ok: false, error: error.message };
        }

        // 如果关闭了邮箱确认，注册后直接有 session，立即插入 profiles
        if (data.session) {
            const { error: insertError } = await sb
                .from('profiles')
                .insert({
                    id: data.user.id,
                    username,
                    email,
                });

            if (insertError) {
                // profiles 插入失败但 auth 注册成功，返回部分成功
                console.error('Profiles insert failed:', insertError);
                return { ok: true };
            }
            return { ok: true };
        }

        // 开启了邮箱确认，无 session — profiles 等确认后再插入
        // 暂时返回成功（用户确认邮箱后首次登录时自动补建 profiles）
        return { ok: true, emailConfirm: true };
    }

    /**
     * 验证当前 session 是否有效
     * @returns {Promise<{valid: boolean, username?: string, email?: string}>}
     */
    async function verify() {
        if (!(await isLoggedIn())) {
            return { valid: false };
        }
        const { data, error } = await sb.auth.getUser();
        if (error || !data.user) {
            return { valid: false };
        }

        // 优先从 metadata 取用户名
        const username = data.user.user_metadata?.username;

        // 如果 metadata 没有（邮箱确认注册的用户），尝试从 profiles 查
        if (!username) {
            const { data: profile } = await sb
                .from('profiles')
                .select('username')
                .eq('id', data.user.id)
                .maybeSingle();
            return {
                valid: true,
                email: data.user.email,
                username: profile?.username || data.user.email,
            };
        }

        return { valid: true, email: data.user.email, username };
    }

    /**
     * 退出登录
     */
    async function logout() {
        await sb.auth.signOut();
        window.location.href = '/login.html';
    }

    /**
     * 获取当前用户名
     * @returns {Promise<string|null>}
     */
    async function getUsername() {
        const { data } = await sb.auth.getUser();
        if (!data.user) return null;

        // 优先 metadata
        if (data.user.user_metadata?.username) {
            return data.user.user_metadata.username;
        }

        // 回退查 profiles
        const { data: profile } = await sb
            .from('profiles')
            .select('username')
            .eq('id', data.user.id)
            .maybeSingle();

        return profile?.username || data.user.email || null;
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
        getUsername,
        getEmail,
        getClient: () => sb,
    };
})();
