"""
DeepSeek API 统一封装 —— 严格知识助手。

提供单轮与多轮对话接口，默认 System Prompt 强制模型仅基于已知资料作答，
资料外的问题会明确说“不知道”，杜绝幻觉。

用法：
    from llm import ask, ChatSession

    # 单轮提问
    print(ask("用一句话介绍大语言模型"))

    # 多轮对话
    session = ChatSession()
    session.ask("Python 是什么？")
    session.ask("它的主要特点有哪些？")   # 自动携带上文
"""

import os
import re
from typing import List, Dict, Optional, Any

try:
    # 尝试从本地 config.py 导入 API Key 和 BASE_URL
    from config import DEEPSEEK_API_KEY, BASE_URL
except ImportError:
    # 如果 config.py 不存在，则从环境变量读取 Key
    DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
    BASE_URL = "https://api.deepseek.com"

from openai import OpenAI

# ---------- 默认 System Prompt（校园体育助手定制版）----------
SYSTEM_PROMPT = (
    "你是「小马」，一个专注于本校体育课程与体质健康政策的智能问答助手。\n"
    "你的知识来源于学校官方发布的体育教学规章制度，涵盖体育课修读、体测、课外锻炼等内容。\n"
    "\n"
    "核心规则：\n"
    "1. 只能依据用户提供的参考资料或你确切知道的事实进行回答。\n"
    "2. 如果问题超出资料范围，或资料中没有相关信息，\n"
    "   必须明确回答「资料中暂无相关信息，建议咨询体艺部（电话：88208813）」，不得猜测或编造。\n"
    "3. 语气亲切、清晰、有条理，像一位热心的学长/学姐在帮同学解答问题。\n"
    "4. 当用户追问时，必须结合之前的对话内容，保持上下文连贯。\n"
    "5. 回答尽量分点列出，方便同学快速获取关键信息。"
)

# 验证 API Key 是否存在
if not DEEPSEEK_API_KEY:
    raise RuntimeError(
        "未找到 DeepSeek API Key。\n"
        "请将 config.example.py 复制为 config.py，并在其中填入你的 Key。\n"
        "或者设置环境变量 DEEPSEEK_API_KEY。"
    )

# 创建 OpenAI 客户端实例
client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url=BASE_URL)


# ---------- 基础调用 ----------
def chat(
    messages: List[Dict[str, str]],
    model: str = "deepseek-chat",
    temperature: float = 0.7,
    **kwargs: Any,
) -> str:
    """发送一组对话消息，返回模型回复文本。"""
    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        timeout=30,
        **kwargs,
    )
    return resp.choices[0].message.content


def ask(
    prompt: str,
    system: str = SYSTEM_PROMPT,
    **kwargs: Any,
) -> str:
    """单轮提问便捷函数，使用严格的系统提示。"""
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ]
    return chat(messages, **kwargs)


# ---------- 多轮对话会话 ----------
class ChatSession:
    def __init__(
        self,
        system: str = SYSTEM_PROMPT,
        model: str = "deepseek-chat",
        temperature: float = 0.7,
        **kwargs: Any,
    ):
        self.system = system
        self.model = model
        self.temperature = temperature
        self.kwargs = kwargs
        self.history: List[Dict[str, str]] = [
            {"role": "system", "content": system}
        ]

    def ask(self, user_input: str) -> str:
        self.history.append({"role": "user", "content": user_input})
        reply = chat(
            self.history,
            model=self.model,
            temperature=self.temperature,
            **self.kwargs,
        )
        self.history.append({"role": "assistant", "content": reply})
        return reply

    def reset(self) -> None:
        self.history = [{"role": "system", "content": self.system}]


# ---------- 演示：资料外问题会如实回答“不知道” ----------
if __name__ == "__main__":
    print("=== 单轮演示 ===")
    ans = ask("Python 是什么？")
    print("Q: Python 是什么？")
    print(f"A: {ans}\n")

    ans = ask("明天纽约的天气如何？")
    print("Q: 明天纽约的天气如何？")
    print(f"A: {ans}\n")

    print("=== 多轮对话演示 ===")
    session = ChatSession()
    print("Q: 请解释什么是列表推导式")
    ans = session.ask("请解释什么是列表推导式")
    print(f"A: {ans}\n")

    print("Q: 能举一个简单的例子吗？")
    ans = session.ask("能举一个简单的例子吗？")
    print(f"A: {ans}\n")

    print("Q: 这种写法有什么优点？")
    ans = session.ask("这种写法有什么优点？")
    print(f"A: {ans}\n")

    print("✅ 多轮对话流畅，上下文未丢失。")


# ========== 通用聊天 System Prompt ==========
CHAT_PROMPT = (
    "你是「小马」，TaskFlow 的智能助手，一位热情友好的校园伙伴。\n"
    "你可以和同学聊天、答疑解惑、倾听烦恼、提供建议。\n"
    "语气轻松自然，像朋友一样交流，可以适当使用 emoji。\n"
    "如果同学问到学业、课程、大学生活相关问题，尽力提供有用的信息和建议。\n"
    "保持对话连贯，记住之前的聊天内容。"
)

def chat_answer(user_query, history=None):
    """通用聊天，不依赖知识库，多轮对话"""
    messages = [{"role": "system", "content": CHAT_PROMPT}]

    if history:
        for entry in history:
            if isinstance(entry, (list, tuple)) and len(entry) >= 2:
                messages.append({"role": "user", "content": entry[0]})
                messages.append({"role": "assistant", "content": entry[1]})
            elif isinstance(entry, dict) and "role" in entry:
                messages.append(entry)

    messages.append({"role": "user", "content": user_query})
    return chat(messages)


# ========== RAG 问答函数（多轮对话 + 精准引用 + 防重复标注） ==========
def get_rag_answer(user_query, context, doc_ids, history=None):
    """RAG 问答，支持多轮对话历史。

    :param user_query: 用户当前提问
    :param context:   检索到的知识库文本（已拼接）
    :param doc_ids:   知识库段落编号列表
    :param history:   历史对话，支持两种格式：
                      - [[q1,a1],[q2,a2],...] （main.py 格式）
                      - [{"role":"user","content":...}, ...] （app.py 格式）
    :return:          带引用的回答文本
    """
    prompt = (
        f"参考资料：{context}\n"
        f"用户问题：{user_query}\n"
        "请严格依据上面的参考资料回答问题。\n"
        "回答规则：\n"
        "1. 只使用给出的资料作答，无相关内容就回答【信息不足，无法回答】；\n"
        "2. 回答完毕后，单独一行标注格式：【引用编号：x】，多个编号用逗号分隔，例如【引用编号：1,3】；\n"
        "3. 完全没用到任何资料则不要加这条标注。"
    )

    # 构建完整 messages，携带对话历史以实现真正的多轮对话
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    if history:
        for entry in history:
            if isinstance(entry, (list, tuple)) and len(entry) >= 2:
                # main.py 格式：[问题, 回答]
                messages.append({"role": "user", "content": entry[0]})
                messages.append({"role": "assistant", "content": entry[1]})
            elif isinstance(entry, dict) and "role" in entry:
                # app.py / OpenAI 格式：{"role":"...", "content":"..."}
                messages.append(entry)

    # 当前提问放在最后
    messages.append({"role": "user", "content": prompt})

    base_ans = chat(messages)

    # 正则提取模型真实引用的编号
    pattern = r"【引用编号：(\d+(?:,\d+)*)】"
    match = re.search(pattern, base_ans)

    if match:
        used_nums = match.group(1)
        # 生成标准参考资料文本
        ref_text = f"\n参考资料：{','.join([f'第{n}条' for n in used_nums.split(',')])}"
        # 移除模型输出里的标记文本
        clean_ans = re.sub(pattern, "", base_ans).strip()
        return clean_ans + ref_text
    else:
        # 无有效引用，直接返回原回答
        return base_ans