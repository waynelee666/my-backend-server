"""
TaskFlow 静态文件服务器
======================
纯 Python 标准库实现。
- 静态文件服务
- /api/parse — 调用 DeepSeek 智能解析文本（考试安排/绩点规则等）
用户认证由 Supabase Auth SDK 在客户端处理。

启动方式：
    python server.py
    设置环境变量 DEEPSEEK_API_KEY 启用 AI 解析功能
"""

import json
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import URLError

# -------------------- 配置 --------------------
PORT = int(os.environ.get("PORT", 8080))
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")

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

BLOCKED_FILES = {"server.py", ".gitignore"}
BLOCKED_EXTENSIONS = {".py"}

# DeepSeek 解析提示词
PARSE_PROMPT = """你是一个学业助手。从用户上传的文本中提取所有跟课程、考试、成绩相关的结构化信息。

返回纯JSON数组，每个元素代表一门课或一场考试：

[
  { "type": "subject", "name": "...", "credits": 数字, "components": [{"name":"...","percentage":数字}] },
  { "type": "exam", "subject": "...", "date": "YYYY-MM-DD", "start": "HH:MM", "end": "HH:MM", "location": "...", "seat": 数字 }
]

请自行理解文本内容，灵活提取。不确定的字段填null，不要遗漏任何能找到的信息。

文本内容：
"""


def call_deepseek(text: str) -> list:
    """调用 DeepSeek API 解析文本"""
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("未配置 DEEPSEEK_API_KEY")

    body = json.dumps({
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "你是一个智能助手，擅长从非结构化文本中提取学业相关信息，只返回JSON。"},
            {"role": "user", "content": PARSE_PROMPT + text}
        ],
        "temperature": 0,
        "max_tokens": 4096,
    }).encode("utf-8")

    req = Request(
        "https://api.deepseek.com/chat/completions",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        },
    )

    try:
        with urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data["choices"][0]["message"]["content"].strip()
            # 去除可能的 markdown 代码块标记
            if content.startswith("```"):
                content = content.split("\n", 1)[1]
                if content.endswith("```"):
                    content = content[:-3]
            return json.loads(content)
    except URLError as e:
        raise RuntimeError(f"DeepSeek API 请求失败: {e}")
    except (KeyError, json.JSONDecodeError) as e:
        raise RuntimeError(f"DeepSeek 返回解析失败: {e}")


class RequestHandler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        print(f"[{self.command}] {self.path} -> {args[1] if args else '-'}")

    def send_json(self, data: dict, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self) -> dict | None:
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length == 0: return None
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (json.JSONDecodeError, ValueError):
            return None

    # ---------- 路由 ----------
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/health":
            self.send_json({
                "ok": True,
                "deepseek": bool(DEEPSEEK_API_KEY),
            })
            return

        if path == "/":
            path = "/index.html"

        safe_path = path.lstrip("/")
        file_path = os.path.normpath(os.path.join(SERVER_DIR, safe_path))

        if not file_path.startswith(os.path.normpath(SERVER_DIR)):
            self.send_response(403); self.end_headers(); return

        filename = os.path.basename(file_path)
        _, ext = os.path.splitext(file_path)
        if filename in BLOCKED_FILES or ext.lower() in BLOCKED_EXTENSIONS:
            self.send_response(403); self.end_headers(); return

        if not os.path.isfile(file_path):
            self.send_response(404); self.end_headers(); return

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
            self.send_response(500); self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/parse":
            self.handle_parse()
        else:
            self.send_json({"ok": False, "error": "未知接口"}, 404)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def handle_parse(self):
        """POST /api/parse — 调用 DeepSeek 解析文本"""
        body = self.read_json_body()
        if not body or "text" not in body:
            self.send_json({"ok": False, "error": "请提供 text 字段"}, 400)
            return

        try:
            results = call_deepseek(body["text"])
            print(f"  [AI] Parsed {len(results)} items")
            self.send_json({"ok": True, "results": results})
        except RuntimeError as e:
            print(f"  [AI ERROR] {e}")
            self.send_json({"ok": False, "error": str(e)}, 500)


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    server = ThreadedHTTPServer(("0.0.0.0", PORT), RequestHandler)
    print(f"Server started at http://localhost:{PORT}")
    print(f"Root dir: {SERVER_DIR}")
    if DEEPSEEK_API_KEY:
        print(f"DeepSeek API: enabled")
    else:
        print(f"DeepSeek API: disabled (set DEEPSEEK_API_KEY to enable)")
    print("Press Ctrl+C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.shutdown()


if __name__ == "__main__":
    main()
