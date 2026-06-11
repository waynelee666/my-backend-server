"""
个人主页静态文件服务器
======================
纯 Python 标准库实现，仅提供静态文件服务。
用户认证由 Supabase Auth SDK 在客户端处理。

启动方式：
    python server.py
    然后访问 http://localhost:8080
"""

import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse

# -------------------- 配置 --------------------
PORT = int(os.environ.get("PORT", 8080))
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))

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

# 禁止通过 HTTP 访问的敏感文件
BLOCKED_FILES = {"server.py", ".gitignore"}
BLOCKED_EXTENSIONS = {".py"}


# ==================== HTTP 请求处理器 ====================

class RequestHandler(BaseHTTPRequestHandler):
    """自定义 HTTP 请求处理器：仅提供静态文件服务。"""

    # ---------- 日志 ----------
    def log_message(self, format, *args):
        print(f"[{self.command}] {self.path} -> {args[1] if args else '-'}")

    # ---------- 路由 ----------
    def do_GET(self):
        """处理所有 GET 请求。"""
        parsed = urlparse(self.path)
        path = parsed.path

        # 根路径 → index.html
        if path == "/":
            path = "/index.html"

        # 安全校验：防止路径穿越攻击
        safe_path = path.lstrip("/")
        file_path = os.path.normpath(os.path.join(SERVER_DIR, safe_path))

        # 确保解析后的路径在项目目录内
        if not file_path.startswith(os.path.normpath(SERVER_DIR)):
            self.send_response(403)
            self.end_headers()
            return

        # 安全：禁止访问敏感文件
        filename = os.path.basename(file_path)
        _, ext = os.path.splitext(file_path)
        if filename in BLOCKED_FILES or ext.lower() in BLOCKED_EXTENSIONS:
            self.send_response(403)
            self.end_headers()
            return

        # 检查文件是否存在
        if not os.path.isfile(file_path):
            self.send_response(404)
            self.end_headers()
            return

        # 确定 MIME 类型并返回
        mime = MIME_TYPES.get(ext.lower(), "application/octet-stream")
        try:
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", len(content))
            self.end_headers()
            self.wfile.write(content)
        except IOError:
            self.send_response(500)
            self.end_headers()


# ==================== 多线程服务器 ====================

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """支持多线程的 HTTP 服务器。"""
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
