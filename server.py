"""
TaskFlow 服务器
==============
- 静态文件服务
- /api/parse — DeepSeek 智能解析文本（考试安排/绩点规则等）
- /api/chat  — 校园体育 RAG 问答助手
用户认证由 Supabase Auth SDK 在客户端处理。

启动方式：
    python server.py
    需要 config.py 中的 DEEPSEEK_API_KEY
"""

import json
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import URLError

# 设置 HuggingFace 镜像（必须在 import retriever 之前）
# 海外服务器直连 HuggingFace 更快；国内可设环境变量 HF_ENDPOINT="https://hf-mirror.com"
if not os.environ.get("HF_ENDPOINT"):
    os.environ["HF_ENDPOINT"] = "https://huggingface.co"
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import numpy as np
import retriever
try:
    import llm
    _llm_available = getattr(llm, '_llm_available', True)
except Exception as e:
    print(f"[server] 警告：llm 模块加载失败: {e}")
    llm = None
    _llm_available = False

# -------------------- 配置 --------------------
PORT = int(os.environ.get("PORT", 8080))
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))

# 优先从环境变量读取，其次从 config.py（与 llm.py 保持一致）
try:
    from config import DEEPSEEK_API_KEY as _cfg_key
    DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", _cfg_key)
except ImportError:
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

BLOCKED_FILES = {"server.py", ".gitignore", "config.py"}
BLOCKED_EXTENSIONS = {".py"}

# ==================== RAG 问答缓存 ====================
_KNOWLEDGE_CHUNKS = None  # 知识库文本列表
_KNOWLEDGE_VECS = None    # 预计算的向量矩阵

def init_rag():
    """启动时加载知识库并预计算向量（只做一次）"""
    global _KNOWLEDGE_CHUNKS, _KNOWLEDGE_VECS
    try:
        _KNOWLEDGE_CHUNKS = retriever.load_knowledge()
        if _KNOWLEDGE_CHUNKS:
            _KNOWLEDGE_VECS = retriever.build_vector(_KNOWLEDGE_CHUNKS)
            print(f"[RAG] {len(_KNOWLEDGE_CHUNKS)} 条知识已加载")
        else:
            print("[RAG] 警告：知识库为空")
    except Exception as e:
        print(f"[RAG] 加载失败: {e}")

def rag_search(query: str, top_k: int = 5, threshold: float = 0.2):
    """在预计算的知识库向量中检索（每次只编码查询）"""
    if not _KNOWLEDGE_CHUNKS:
        return []
    q_vec = retriever.encode_query(query)
    scores = np.dot(_KNOWLEDGE_VECS, q_vec)
    idx_score = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
    results = []
    for idx, s in idx_score:
        if s >= threshold:
            results.append((idx + 1, _KNOWLEDGE_CHUNKS[idx]["text"]))
            if len(results) >= top_k:
                break
    return results

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

TRANSLATE_PROMPT = """你是一个英汉词典。请将以下英文单词或短语翻译成中文，给出最常用的1-3个中文释义。

规则：
- 优先给出最常见、最核心的释义（不要冷门释义）
- 多个释义用分号；分隔
- 单词标注词性时用缩写：n. v. adj. adv. prep. conj.，词性放在释义前面
- 短语可以不标注词性，直接给出中文释义

示例输入：
apple
look after
run
take off

示例输出：
[
  {"word": "apple", "meaning": "n. 苹果"},
  {"word": "look after", "meaning": "v. 照顾；照料"},
  {"word": "run", "meaning": "v. 跑；n. 跑步；v. 运行"},
  {"word": "take off", "meaning": "v. 起飞；脱下；n. 模仿"}
]

请只返回纯JSON数组，不要任何额外文字。

单词/短语列表：
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


def translate_words(words: list) -> list:
    """调用 DeepSeek API 批量翻译单词"""
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("未配置 DEEPSEEK_API_KEY")
    if not words:
        return []

    word_list = "\n".join(words)
    body = json.dumps({
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "你是一个专业的英汉词典，只返回JSON数组。"},
            {"role": "user", "content": TRANSLATE_PROMPT + word_list}
        ],
        "temperature": 0.1,
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
        with urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data["choices"][0]["message"]["content"].strip()
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
                "deepseek": bool(_llm_available and DEEPSEEK_API_KEY),
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
        elif parsed.path == "/api/chat":
            self.handle_chat()
        elif parsed.path == "/api/translate-words":
            self.handle_translate_words()
        elif parsed.path == "/api/generate-practice":
            self.handle_generate_practice()
        elif parsed.path == "/api/grade-practice":
            self.handle_grade_practice()
        elif parsed.path == "/api/word-lookup":
            self.handle_word_lookup()
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

    def handle_translate_words(self):
        """POST /api/translate-words — 调用 DeepSeek 批量翻译单词"""
        body = self.read_json_body()
        if not body or "words" not in body:
            self.send_json({"ok": False, "error": "请提供 words 字段（英文单词数组）"}, 400)
            return

        words = [w.strip() for w in body["words"] if w and w.strip()]
        if not words:
            self.send_json({"ok": False, "error": "单词列表不能为空"}, 400)
            return

        # 限制一次最多 200 个单词/短语
        if len(words) > 200:
            self.send_json({"ok": False, "error": f"一次最多翻译 200 个条目，当前 {len(words)} 个"}, 400)
            return

        try:
            translations = translate_words(words)
            print(f"  [Translate] {len(words)} words → {len(translations)} results")
            self.send_json({"ok": True, "translations": translations})
        except RuntimeError as e:
            print(f"  [Translate ERROR] {e}")
            self.send_json({"ok": False, "error": str(e)}, 500)

    def handle_generate_practice(self):
        """POST /api/generate-practice — AI 生成选词填空练习"""
        if not _llm_available or llm is None:
            self.send_json({
                "ok": False,
                "error": "AI 功能未配置。请在环境变量中设置 DEEPSEEK_API_KEY。"
            }, 503)
            return

        body = self.read_json_body()
        if not body or "words" not in body or "count" not in body:
            self.send_json({"ok": False, "error": "请提供 words 和 count 字段"}, 400)
            return

        words = body["words"]
        count = int(body["count"])

        if not isinstance(words, list) or len(words) == 0:
            self.send_json({"ok": False, "error": "单词列表不能为空"}, 400)
            return

        if count < 1 or count > len(words):
            self.send_json({
                "ok": False,
                "error": f"出题数需在 1-{len(words)} 之间（单词库共 {len(words)} 个）"
            }, 400)
            return

        if count > 30:
            self.send_json({"ok": False, "error": "最多出 30 题"}, 400)
            return

        try:
            print(f"  [Practice] 从 {len(words)} 个单词中生成 {count} 题练习...")
            result = llm.generate_practice(words, count)
            print(f"  [Practice] 生成成功 → {len(result.get('blanks', []))} 个空")
            self.send_json({"ok": True, **result})
        except Exception as e:
            print(f"  [Practice ERROR] {e}")
            self.send_json({"ok": False, "error": str(e)}, 500)

    def handle_grade_practice(self):
        """POST /api/grade-practice — AI 批改练习答案"""
        if not _llm_available or llm is None:
            self.send_json({
                "ok": False,
                "error": "AI 功能未配置。请在环境变量中设置 DEEPSEEK_API_KEY。"
            }, 503)
            return

        body = self.read_json_body()
        if not body or "blanks" not in body or "answers" not in body:
            self.send_json({"ok": False, "error": "请提供 blanks 和 answers 字段"}, 400)
            return

        blanks = body["blanks"]
        answers = body["answers"]
        passage = body.get("passage", "")

        if not isinstance(blanks, list) or len(blanks) == 0:
            self.send_json({"ok": False, "error": "blanks 不能为空"}, 400)
            return

        try:
            print(f"  [Grade] 批改 {len(blanks)} 题...")
            result = llm.grade_practice(blanks, answers, passage)
            print(f"  [Grade] 得分: {result.get('score')}/{result.get('total')}")
            self.send_json({"ok": True, **result})
        except Exception as e:
            print(f"  [Grade ERROR] {e}")
            self.send_json({"ok": False, "error": str(e)}, 500)

    def handle_word_lookup(self):
        """POST /api/word-lookup — Oxford 风格英文释义 + 例句"""
        if not _llm_available or llm is None:
            self.send_json({
                "ok": False,
                "error": "AI 功能未配置。请在环境变量中设置 DEEPSEEK_API_KEY。"
            }, 503)
            return

        body = self.read_json_body()
        if not body or "word" not in body:
            self.send_json({"ok": False, "error": "请提供 word 字段"}, 400)
            return

        word = body["word"].strip()
        if not word:
            self.send_json({"ok": False, "error": "单词不能为空"}, 400)
            return

        try:
            print(f"  [WordLookup] 查询: {word}")
            result = llm.lookup_word(word)
            print(f"  [WordLookup] 返回: {result.get('definition', '')[:50]}...")
            self.send_json({"ok": True, **result})
        except Exception as e:
            print(f"  [WordLookup ERROR] {e}")
            self.send_json({"ok": False, "error": str(e)}, 500)

    def handle_chat(self):
        """POST /api/chat — 小马聊天（知识库作为背景资料）"""
        if not _llm_available or llm is None:
            self.send_json({
                "ok": False,
                "error": "AI 聊天功能未配置。请在 Render 环境变量中设置 DEEPSEEK_API_KEY。"
            }, 503)
            return

        body = self.read_json_body()
        if not body or "question" not in body:
            self.send_json({"ok": False, "error": "请提供 question 字段"}, 400)
            return

        question = body["question"].strip()
        if not question:
            self.send_json({"ok": False, "error": "问题不能为空"}, 400)
            return

        history = body.get("history", [])
        use_stream = body.get("stream", True)
        user_context = body.get("userContext", "")
        mode = body.get("mode", "qa")  # 'qa' 问答模式 | 'chat' 聊天模式

        try:
            # 问答模式才检索知识库，聊天模式只看用户数据
            id_docs = []
            if mode == "qa":
                id_docs = rag_search(question, top_k=10)
                if not id_docs and history:
                    last_question = history[-1][0]
                    id_docs = rag_search(last_question, top_k=10)

            # 组装背景信息
            context_parts = []
            if id_docs:
                doc_ids, doc_texts = zip(*id_docs)
                context_parts.append("学校规定：\n" + "\n".join(doc_texts))
            if user_context:
                context_parts.append("用户当前状态：\n" + user_context)

            if context_parts:
                enhanced = (
                    f"{question}\n\n"
                    f"---\n"
                    f"以下是一些背景信息，你可以参考，"
                    f"但不要生硬复述，自然地融入你的回复中：\n"
                    f"{chr(10).join(context_parts)}"
                )
                print(f"  [Chat:{mode}] Q: {question[:40]}... → {len(id_docs) if id_docs else 0} 条资料 + 用户数据")
            else:
                enhanced = question
                print(f"  [Chat:{mode}] Q: {question[:40]}... → 自由聊天")

            generator = llm.chat_answer_stream(enhanced, history=history, mode=mode)

            if not use_stream:
                answer = "".join(generator)
                self.send_json({"ok": True, "answer": answer})
                return

            # === 流式 SSE 输出 ===
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            def emit(data: dict):
                payload = json.dumps(data, ensure_ascii=False)
                self.wfile.write(f"data: {payload}\n\n".encode("utf-8"))
                self.wfile.flush()

            for token in generator:
                emit({"token": token})
            emit({"done": True})
            self.close_connection = True  # 强制关闭，让客户端 reader 收到 done

        except Exception as e:
            print(f"  [Chat ERROR] {e}")
            try:
                emit({"error": str(e)})
            except Exception:
                self.send_json({"ok": False, "error": str(e)}, 500)


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    print("正在加载 RAG 知识库...")
    init_rag()
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
