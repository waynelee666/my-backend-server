"""
个人主页认证服务器
====================
纯 Python 标准库实现，无需安装第三方依赖。
功能：静态文件服务 + 用户注册/登录 API

启动方式：
    python server.py
    然后访问 http://localhost:8080
"""

import json
import hashlib
import secrets
import threading
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse
from datetime import datetime, timezone

# -------------------- 配置 --------------------
PORT = 8080
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
USERS_FILE = os.path.join(SERVER_DIR, "users.json")

# -------------------- MIME 类型映射 --------------------
MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg":  "image/svg+xml",
    ".ico":  "image/x-icon",
}


# ==================== 线程安全的数据存储 ====================

class UsersStore:
    """线程安全的用户持久化存储（JSON 文件）。"""

    def __init__(self, filepath: str):
        self.filepath = filepath
        self.lock = threading.Lock()
        self._ensure_file()

    def _ensure_file(self):
        """如果 users.json 不存在则创建空文件。"""
        if not os.path.exists(self.filepath):
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump({}, f)

    def _read(self) -> dict:
        """读取全部用户数据（调用方需持有锁）。"""
        try:
            with open(self.filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}

    def _write(self, data: dict):
        """写入全部用户数据（调用方需持有锁）。"""
        with open(self.filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def get_user(self, username: str) -> dict | None:
        """获取单个用户信息，不存在返回 None。"""
        with self.lock:
            users = self._read()
            return users.get(username)

    def create_user(self, username: str, password_hash: str) -> bool:
        """
        创建新用户。成功返回 True，用户名已存在返回 False。
        password_hash 格式： "salt:hash"
        """
        with self.lock:
            users = self._read()
            if username in users:
                return False
            users[username] = {
                "password": password_hash,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            self._write(users)
            return True


class SessionStore:
    """线程安全的内存会话存储。"""

    def __init__(self):
        self._sessions: dict[str, str] = {}  # token -> username
        self.lock = threading.Lock()

    def create(self, username: str) -> str:
        """创建新会话，返回 token。"""
        token = secrets.token_hex(32)
        with self.lock:
            self._sessions[token] = username
        return token

    def get_username(self, token: str) -> str | None:
        """根据 token 获取用户名，不存在返回 None。"""
        with self.lock:
            return self._sessions.get(token)

    def remove(self, token: str):
        """删除会话。"""
        with self.lock:
            self._sessions.pop(token, None)


# 全局实例
users_store = UsersStore(USERS_FILE)
session_store = SessionStore()


# ==================== 密码工具 ====================

def hash_password(password: str) -> str:
    """
    对密码进行加盐哈希。
    返回格式： "salt:hash"（均为十六进制字符串）
    """
    salt = secrets.token_hex(32)
    h = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return f"{salt}:{h}"


def verify_password(password: str, stored: str) -> bool:
    """
    验证密码是否匹配。
    stored 格式： "salt:hash"
    """
    try:
        salt, stored_hash = stored.split(":", 1)
    except ValueError:
        return False
    computed = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return secrets.compare_digest(computed, stored_hash)


# ==================== HTTP 请求处理器 ====================

class RequestHandler(BaseHTTPRequestHandler):
    """自定义 HTTP 请求处理器：API 路由 + 静态文件服务。"""

    # ---------- 日志精简 ----------
    def log_message(self, format, *args):
        # 只输出关键信息，格式：[POST] /api/login -> 200
        print(f"[{self.command}] {self.path} -> {args[1] if args else '-'}")

    # ---------- 通用响应工具 ----------
    def send_json(self, data: dict, status: int = 200):
        """发送 JSON 响应。"""
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self) -> dict | None:
        """读取并解析 JSON 请求体。"""
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length == 0:
                return None
            raw = self.rfile.read(length)
            return json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, ValueError):
            return None

    # ---------- API 路由 ----------
    def handle_api_register(self):
        """POST /api/register — 注册新用户。"""
        body = self.read_json_body()
        if not body:
            self.send_json({"ok": False, "error": "请求体必须为 JSON 格式"}, 400)
            return

        username = (body.get("username") or "").strip()
        password = (body.get("password") or "")

        # ---- 校验用户名 ----
        if not (3 <= len(username) <= 30):
            self.send_json({"ok": False, "error": "用户名长度需在 3–30 个字符之间"}, 400)
            return
        if not username.replace("_", "").isalnum():
            self.send_json({"ok": False, "error": "用户名只能包含字母、数字和下划线"}, 400)
            return

        # ---- 校验密码 ----
        if len(password) < 6:
            self.send_json({"ok": False, "error": "密码长度至少 6 个字符"}, 400)
            return

        # ---- 创建用户 ----
        pw_hash = hash_password(password)
        success = users_store.create_user(username, pw_hash)
        if not success:
            self.send_json({"ok": False, "error": "该用户名已被注册"}, 409)
            return

        print(f"  [OK] New user registered: {username}")
        self.send_json({"ok": True}, 201)

    def handle_api_login(self):
        """POST /api/login — 用户登录。"""
        body = self.read_json_body()
        if not body:
            self.send_json({"ok": False, "error": "请求体必须为 JSON 格式"}, 400)
            return

        username = (body.get("username") or "").strip()
        password = body.get("password") or ""

        # ---- 查找用户 ----
        user = users_store.get_user(username)
        if not user:
            self.send_json({"ok": False, "error": "用户名或密码错误"}, 401)
            return

        # ---- 验证密码 ----
        if not verify_password(password, user["password"]):
            self.send_json({"ok": False, "error": "用户名或密码错误"}, 401)
            return

        # ---- 创建会话 ----
        token = session_store.create(username)
        print(f"  [OK] User logged in: {username}")
        self.send_json({"ok": True, "token": token, "username": username})

    def handle_api_me(self):
        """GET /api/me — 校验当前登录状态。"""
        # 从 Authorization 头提取 token
        auth_header = self.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            self.send_json({"ok": False, "error": "未提供认证令牌"}, 401)
            return

        token = auth_header[7:]  # 去掉 "Bearer " 前缀
        username = session_store.get_username(token)
        if not username:
            self.send_json({"ok": False, "error": "令牌无效或已过期"}, 401)
            return

        self.send_json({"ok": True, "username": username})

    # ---------- 静态文件服务 ----------
    def serve_static(self, path: str):
        """根据 URL 路径返回静态文件。"""
        # 根路径重定向到 index.html
        if path == "/":
            path = "/index.html"

        # 安全校验：防止路径穿越攻击
        # 去除开头的 /，构建安全路径
        safe_path = path.lstrip("/")
        file_path = os.path.normpath(os.path.join(SERVER_DIR, safe_path))

        # 确保解析后的路径在项目目录内
        if not file_path.startswith(os.path.normpath(SERVER_DIR)):
            self.send_json({"ok": False, "error": "禁止访问"}, 403)
            return

        # 检查文件是否存在
        if not os.path.isfile(file_path):
            self.send_json({"ok": False, "error": "页面不存在"}, 404)
            return

        # 确定 MIME 类型
        _, ext = os.path.splitext(file_path)
        mime = MIME_TYPES.get(ext.lower(), "application/octet-stream")

        # 读取并返回文件
        try:
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", len(content))
            self.end_headers()
            self.wfile.write(content)
        except IOError:
            self.send_json({"ok": False, "error": "文件读取失败"}, 500)

    # ---------- 路由分发 ----------
    def do_GET(self):
        """处理 GET 请求。"""
        parsed = urlparse(self.path)

        if parsed.path == "/api/me":
            self.handle_api_me()
        else:
            self.serve_static(parsed.path)

    def do_POST(self):
        """处理 POST 请求。"""
        parsed = urlparse(self.path)

        if parsed.path == "/api/register":
            self.handle_api_register()
        elif parsed.path == "/api/login":
            self.handle_api_login()
        else:
            self.send_json({"ok": False, "error": "未知的 API 路径"}, 404)


# ==================== 线程安全的 HTTP 服务器 ====================

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """支持多线程的 HTTP 服务器，每个请求一个线程。"""
    allow_reuse_address = True
    daemon_threads = True


# ==================== 入口 ====================

def main():
    server = ThreadedHTTPServer(("0.0.0.0", PORT), RequestHandler)
    print(f"Server started at http://localhost:{PORT}")
    print(f"Root dir: {SERVER_DIR}")
    print("Press Ctrl+C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.shutdown()


if __name__ == "__main__":
    main()
