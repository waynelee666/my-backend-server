/* ============================================================
   认证模块 — auth.js
   提供登录、注册、会话验证、退出等全部前端认证逻辑。
   被 login.html 和 index.html 共同引用。
   ============================================================ */

const Auth = (() => {
    // ---------- 存储键名 ----------
    const TOKEN_KEY = 'auth_token';
    const USERNAME_KEY = 'auth_username';

    // ---------- Token 读写 ----------
    /** 获取当前存储的 token */
    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    /** 存储 token */
    function setToken(token) {
        localStorage.setItem(TOKEN_KEY, token);
    }

    /** 清除 token */
    function clearToken() {
        localStorage.removeItem(TOKEN_KEY);
    }

    // ---------- Username 读写 ----------
    /** 获取当前存储的用户名 */
    function getUsername() {
        return localStorage.getItem(USERNAME_KEY);
    }

    /** 存储用户名 */
    function setUsername(name) {
        localStorage.setItem(USERNAME_KEY, name);
    }

    /** 清除用户名 */
    function clearUsername() {
        localStorage.removeItem(USERNAME_KEY);
    }

    // ---------- 通用 API 请求 ----------
    /**
     * 发送 JSON API 请求
     * @param {string} url    - API 路径（如 "/api/login"）
     * @param {object} body   - 请求体对象（GET 时传 null）
     * @param {string} method - HTTP 方法
     * @returns {Promise<object>} 响应 JSON
     */
    async function api(url, body = null, method = 'POST') {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        // GET 请求附带 token 用于身份校验
        if (method === 'GET') {
            const token = getToken();
            if (token) {
                options.headers['Authorization'] = `Bearer ${token}`;
            }
            delete options.headers['Content-Type'];  // GET 无请求体
        }
        // POST 请求附带 JSON 请求体
        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);
        const data = await response.json();
        return data;
    }

    // ---------- 公开方法 ----------

    /** 检查是否已登录（仅检查本地是否有 token，不做服务端验证） */
    function isLoggedIn() {
        return !!getToken();
    }

    /**
     * 登录
     * @param {string} username
     * @param {string} password
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    async function login(username, password) {
        const result = await api('/api/login', { username, password });
        if (result.ok) {
            setToken(result.token);
            setUsername(result.username);
        }
        return result;
    }

    /**
     * 注册
     * @param {string} username
     * @param {string} password
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    async function register(username, password) {
        const result = await api('/api/register', { username, password });
        return result;
    }

    /**
     * 验证当前 token 是否有效（向服务器确认）
     * @returns {Promise<{valid: boolean, username?: string}>}
     */
    async function verify() {
        if (!isLoggedIn()) {
            return { valid: false };
        }
        const result = await api('/api/me', null, 'GET');
        if (result.ok) {
            // 以服务器返回的用户名为准
            setUsername(result.username);
            return { valid: true, username: result.username };
        }
        // token 无效，清理本地状态
        clearToken();
        clearUsername();
        return { valid: false };
    }

    /**
     * 退出登录：清除本地存储并跳转到登录页
     */
    function logout() {
        clearToken();
        clearUsername();
        window.location.href = '/login.html';
    }

    // ---------- 暴露 API ----------
    return {
        isLoggedIn,
        login,
        register,
        verify,
        logout,
        getUsername,
    };
})();
