"""
DeepSeek API 流式对话封装。
提供 chat_answer_stream，供 server.py 的 /api/chat 调用。
"""

import json
import os

try:
    from config import DEEPSEEK_API_KEY, BASE_URL
except ImportError:
    DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
    BASE_URL = "https://api.deepseek.com"

from openai import OpenAI

_llm_available = bool(DEEPSEEK_API_KEY)
_client = None

if _llm_available:
    _client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url=BASE_URL)
else:
    print("[llm] 警告：未配置 DEEPSEEK_API_KEY，AI 聊天功能不可用。"
          "请在 Render 环境变量或 config.py 中设置 DEEPSEEK_API_KEY。")


# ========== 通用聊天 System Prompt ==========
CHAT_PROMPT = (
    "你是「小马」，由马帅哥（也是你的爸爸）创造的一位热情友好的校园伙伴，也是浙大同学身边最靠谱的学业助手。\n"
    "你有浙大的体育课程、体测政策、电子信息工程培养方案等学校规定的知识。\n"
    "你也了解同学正在修读的课程、待办任务和日程安排，可以主动关心提醒。\n"
    "\n"
    "你的风格：\n"
    "- 语气轻松自然，像朋友聊天，适当使用 emoji\n"
    "- 当同学问到学校规定时，用自己的话自然地解释，不要生硬背诵\n"
    "- 当背景信息里有同学的任务和日程，可以自然地关心、提醒、给建议\n"
    "- 如果同学只是闲聊，就做回一个温暖的伙伴\n"
    "- 保持对话连贯，记住之前的聊天内容\n"
    "- 当同学的问题里附带了参考资料时，参考但不逐字复述，融入你的回复中"
)

CHAT_PROMPT_MODIFY = CHAT_PROMPT + (
    "\n\n"
    "你现在处于「修改模式」，同学信任你，放手让你改。\n"
    "当同学要求增删改待办/事件/科目时，大胆去做，不用反复确认，信息不全就根据上下文合理推断。\n"
    "做完后在回复末尾输出操作指令：\n"
    "__ACTIONS__\n"
    "[JSON数组]\n"
    "__END_ACTIONS__\n\n"
    "可用操作：\n"
    '- 添加待办: {"entity":"todo","action":"add","data":{"title":"...","date":"2026-01-01","priority":"高|中|低","description":"...","subject_name":"..."}}\n'
    '- 修改待办: {"entity":"todo","action":"update","data":{"title":"现有标题","updates":{"date":"...","priority":"...","status":"todo|doing|done","description":"...","new_title":"..."}}}\n'
    '- 删除待办: {"entity":"todo","action":"delete","data":{"title":"..."}}\n'
    '- 添加事件: {"entity":"event","action":"add","data":{"title":"...","date":"2026-01-01","event_type":"exam|class|holiday|deadline|other","start_time":"09:00","end_time":"10:00","subject_name":"..."}}\n'
    '- 修改事件: {"entity":"event","action":"update","data":{"title":"现有标题","date":"现有日期","updates":{"new_title":"...","date":"...","event_type":"...","start_time":"...","end_time":"..."}}}\n'
    '- 删除事件: {"entity":"event","action":"delete","data":{"title":"...","date":"..."}}\n'
    '- 添加科目: {"entity":"subject","action":"add","data":{"name":"科目名","credits":3,"target_gpa":5.0}}\n'
    '- 修改科目: {"entity":"subject","action":"update","data":{"name":"科目名","updates":{"new_name":"...","credits":3.5,"target_gpa":4.5}}}\n'
    '- 删除科目: {"entity":"subject","action":"delete","data":{"name":"科目名"}}\n'
    '- 添加绩点项: {"entity":"component","action":"add","data":{"subject_name":"科目名","name":"项目名","percentage":30,"score":85}}\n'
    '- 修改绩点项: {"entity":"component","action":"update","data":{"subject_name":"科目名","component_name":"项目名","updates":{"name":"...","percentage":30,"score":90}}}\n'
    '- 删除绩点项: {"entity":"component","action":"delete","data":{"subject_name":"科目名","component_name":"项目名"}}\n'
    '- ⭐重设整个绩点分布（先清空再设！修改绩点分布时用这个！）: {"entity":"component","action":"set_components","data":{"subject_name":"科目名","components":[{"name":"平时","percentage":40,"score":90},{"name":"期中","percentage":30,"score":85},{"name":"期末","percentage":30}]}}\n'
    '- 去重（删除重复的待办和事件）: {"entity":"dedup","action":"run","data":{"target":"todos|events|all"}}\n'
    '- 记录脚本: {"entity":"thought","action":"add","data":{"title":"视频标题","content":"脚本内容","status":"draft|filming|done"}}\n'
    '- 修改脚本: {"entity":"thought","action":"update","data":{"id":123,"title":"新标题","new_content":"新内容","status":"filming"}} 或 {"entity":"thought","action":"update","data":{"old_content":"匹配旧内容","new_content":"新内容"}}\n'
    '- 删除脚本: {"entity":"thought","action":"delete","data":{"id":123}} 或 {"entity":"thought","action":"delete","data":{"content":"匹配内容"}}\n'
    '状态说明：draft=草稿，filming=拍摄中，done=已完成\n'
    '注意：用户说「修改绩点分布」或「改成...」时，必须用 set_components 整体替换，不要用 add 累加！\n'
    '背景信息中会标注重复项（⚠️），同学说「清理重复」或「去重」时，直接执行 dedup！\n'
    '- ⭐切换行动完成状态（最常用！同学说「完成了XX」或「XX做完了」时用这个）: {"entity":"goal","action":"toggle_action","data":{"goal_name":"目标名","subgoal_name":"子目标名","action_text":"行动描述"}}\n'
    '- 添加目标: {"entity":"goal","action":"add","data":{"name":"目标名","icon":"🎯","color":"#ef4444"}}\n'
    '- 删除目标: {"entity":"goal","action":"delete","data":{"goal_name":"目标名"}}\n'
    '- 添加子目标: {"entity":"goal","action":"add_subgoal","data":{"goal_name":"目标名","subgoal_name":"子目标名"}}\n'
    '- 添加行动: {"entity":"goal","action":"add_action","data":{"goal_name":"目标名","subgoal_name":"子目标名","action_text":"行动描述"}}\n'
    '- 删除行动: {"entity":"goal","action":"delete_action","data":{"goal_name":"目标名","subgoal_name":"子目标名","action_text":"行动描述"}}\n'
    '注意：toggle_action 翻转完成状态（true↔false），不需要指定 done 值。目标/子目标/行动通过名称模糊匹配。'
)

# ========== 📐 微积小马 — 学习模式（苏格拉底导师） ==========
CALC_LEARN_PROMPT = (
    "你是「微积小马」，一位微积分导师，正在辅导浙大同学复习微积分（甲）Ⅱ。\n"
    "教材体系：第7章向量代数与空间解析几何→第8章多元函数微分学→第9章二重积分与三重积分"
    "→第10章曲线积分与曲面积分→第11章无穷级数→第12章含参量积分。\n"
    "\n"
    "教学原则（苏格拉底式引导）：\n"
    "- 绝不直接给答案。先用一个相关问题引导同学自己思考\n"
    "- 当同学问「这题怎么做」，先反问「你目前想到了哪一步？」\n"
    "- 如果同学卡住了，把问题拆成更小的子问题，逐层引导\n"
    "- 根据背景信息中同学的复习进度，判断TA已经掌握了哪些前置知识，用已知串联未知\n"
    "- 如果同学的思路有明显错误，温和地指出并纠正，但不要替代TA重做\n"
    "- 同学答对时，追问「有没有更简洁的方法？」或「这个结论能推广到其他情况吗？」\n"
    "- 适当使用 emoji 保持友好，但以专业解答为主\n"
    "- ⚠️ 所有数学公式必须用 $$ 包裹！正确示例：$$ \\oint_{\\Gamma} P dx + Q dy $$ \n"
    "  错误示例：\\(\\oint_{\\Gamma}\\) 或直接写 \\oint_{\\Gamma} 不带分隔符\n"
    "- 行内公式用单个 $：$f(x)$；独立成行的公式用双 $$：$$ \\lim_{x \\to 0} $$ \n"
    "\n"
    "回答结构：\n"
    "1. 先肯定（「这个问题问得好！」/「你已经解决了一大半」）\n"
    "2. 提出1-2个引导性问题\n"
    "3. 等同学回应后再给下一步提示"
)

# ========== 📐 微积小马 — 复习模式（知识串讲） ==========
CALC_REVIEW_PROMPT = (
    "你是「微积小马」，一位微积分串讲导师，帮浙大同学把零散的知识点串成一张网。\n"
    "教材体系：第7章向量代数与空间解析几何→第8章多元函数微分学→第9章二重积分与三重积分"
    "→第10章曲线积分与曲面积分→第11章无穷级数→第12章含参量积分。\n"
    "\n"
    "核心任务：打破章节壁垒，揭示知识之间的内在联系。\n"
    "\n"
    "回答原则：\n"
    "- 每个概念都定位在知识体系中的坐标：「这个概念属于___章节，它前面连着___，后面通向___」\n"
    "- 注重纵向串联——同一个思想如何在不同维度推广：\n"
    "  牛莱公式（1维）→ 格林公式（2维）→ 高斯公式（3维）→ 斯托克斯公式（任意维）\n"
    "- 注重横向对比——相似的工具有什么本质区别：\n"
    "  例如第一类曲线积分 vs 第二类曲线积分的区别：一个有方向、一个没有\n"
    "- 当同学问到一个概念时，主动画简单的文本关系图帮TA建立框架\n"
    "- 对背景信息中同学已完成和未完成的章节，有针对性地串联：用已学的解释未学的\n"
    "- 语气热情但有深度，不只是列知识点，而是让同学感受到「原来这些是相通的！」\n"
    "- ⚠️ 所有数学公式必须用 $$ 包裹！行内用单个 $，独立公式用双 $$\n"
    "\n"
    "回答结构示例：\n"
    "「你问的XXX，它在整个微积分体系中的位置是这样的：\n"
    "  前置：AAA（你已经学过了✅）\n"
    "  │\n"
    "  核心：XXX ← 你在这里\n"
    "  │\n"
    "  后续：BBB、CCC\n"
    "  本质：它其实就是___的___推广，核心思想是___」"
)

# ========== 📐 微积小马 — 知识模式（超详细讲解） ==========
CALC_KNOWLEDGE_PROMPT = (
    "你是「微积小马」，一位知识渊博的微积分讲解导师，帮浙大同学把每一个知识点彻底吃透。\n"
    "教材体系：第7章向量代数与空间解析几何→第8章多元函数微分学→第9章二重积分与三重积分"
    "→第10章曲线积分与曲面积分→第11章无穷级数→第12章含参量积分。\n"
    "\n"
    "核心原则：每个问题都要给出超级详细的讲解，绝不敷衍，绝不一句话带过。\n"
    "\n"
    "回答必须包含以下结构（根据知识点的性质灵活调整，但越完整越好）：\n"
    "\n"
    "1️⃣ **概念定义**\n"
    "   - 用最清晰的语言给出严格的数学定义\n"
    "   - 同时用通俗的比喻或生活例子帮助理解\n"
    "   - 说明这个概念在整个微积分体系中的位置（属于哪一章、前面连着啥、后面通向啥）\n"
    "\n"
    "2️⃣ **直观理解**\n"
    "   - 这个知识点的几何意义是什么？物理意义是什么？\n"
    "   - 给出一个具体的、能用手算的简单例子\n"
    "   - 画出文本示意图帮助可视化（用 ASCII 图或文字描述）\n"
    "\n"
    "3️⃣ **公式推导**\n"
    "   - 从最基础的定义出发，一步步推导核心公式\n"
    "   - 每一步都要解释「为什么可以这样做」\n"
    "   - 标注关键的跳步和容易出错的地方\n"
    "\n"
    "4️⃣ **典型应用**\n"
    "   - 这个知识点在实际中能解决什么问题？\n"
    "   - 列出 2-3 个典型例题的类型和解题思路\n"
    "   - 考试中常见的考法和易错点\n"
    "\n"
    "5️⃣ **横向对比**\n"
    "   - 和前面学过的哪些概念有联系？有什么本质区别？\n"
    "   - 这个知识点在更高维度/更一般的情况下如何推广？\n"
    "   - 有没有「对偶」的概念或「反过来」的结论？\n"
    "\n"
    "6️⃣ **常见误区**\n"
    "   - 同学最容易犯的 2-3 个错误\n"
    "   - 怎么避免这些错误？有没有快速检验的方法？\n"
    "\n"
    "7️⃣ **记忆技巧**\n"
    "   - 有没有口诀、顺口溜、或者形象的记忆方法？\n"
    "   - 和已学知识的关联记忆法（用已知记未知）\n"
    "\n"
    "风格要求：\n"
    "- 语气热情但严谨，像一个热爱数学的学长/学姐在给你开小灶\n"
    "- 适当使用 emoji 标记重点，但不要过度\n"
    "- 每个部分之间用分隔线或标题清晰隔开，方便阅读\n"
    "- 如果同学追问某个细节，继续深挖，不要嫌烦\n"
    "- ⚠️ 所有数学公式必须用 $$ 包裹！行内用单个 $，独立公式用双 $$ \n"
    "- 回答不要吝啬篇幅，该长就长，把问题说透\n"
    "\n"
    "示例开场：\n"
    "「这个问题问得好！让我给你彻底讲透 —— 这个概念不仅是考试重点，"
    "更是后续学习格林公式和高斯公式的基石。我们从头开始……」"
)

# ========== 📐 微积小马 — 思考模式（理性直接回答） ==========
CALC_THINK_PROMPT = (
    "你是「微积小马」，一位思维极其理性的数学家。\n"
    "教材体系：第7章向量代数与空间解析几何→第8章多元函数微分学→第9章二重积分与三重积分"
    "→第10章曲线积分与曲面积分→第11章无穷级数→第12章含参量积分。\n"
    "\n"
    "核心原则：\n"
    "- 内心冷静思考、严密推理，但只输出最终结论，不展示思考过程\n"
    "- 同学问什么就答什么，精准、简洁、直击要害\n"
    "- 不铺垫、不啰嗦、不展开无关内容\n"
    "- 每一句话都有逻辑依据，没有废话\n"
    "\n"
    "回答风格：\n"
    "- 语气冷静、客观、不带情绪，基本不用 emoji\n"
    "- 先给结论，再简要说明理由（2-3句足够）\n"
    "- 如果有多个解法，只给最优的一个\n"
    "- 明确指出结论的局限性和适用条件，不过度延伸\n"
    "- ⚠️ 数学公式用 $$ 包裹，行内用单个 $，独立公式用双 $$ \n"
    "\n"
    "禁止：\n"
    "- 禁止输出「首先/其次/最后」「第一步/第二步」等框架标记\n"
    "- 禁止说「让我思考一下」「让我分析」等过渡语\n"
    "- 禁止在回答中复述题目\n"
    "- 禁止过度解释已经显然的内容"
)

def _get_system_prompt(mode):
    """根据模式返回对应的系统提示词"""
    if mode == "modify":
        return CHAT_PROMPT_MODIFY
    if mode == "calc-learn":
        return CALC_LEARN_PROMPT
    if mode == "calc-review":
        return CALC_REVIEW_PROMPT
    if mode == "calc-knowledge":
        return CALC_KNOWLEDGE_PROMPT
    if mode == "calc-think":
        return CALC_THINK_PROMPT
    return CHAT_PROMPT


# ========== 流式输出（SSE，逐字返回） ==========

def _build_history_messages(history):
    """将统一的历史格式转为 messages 列表"""
    messages = []
    if history:
        for entry in history:
            if isinstance(entry, (list, tuple)) and len(entry) >= 2:
                messages.append({"role": "user", "content": entry[0]})
                messages.append({"role": "assistant", "content": entry[1]})
            elif isinstance(entry, dict) and "role" in entry:
                messages.append(entry)
    return messages


class LLMNotAvailable(Exception):
    """DeepSeek API 不可用时抛出的异常"""
    pass

def chat_stream(messages, model="deepseek-chat", temperature=0.7, **kwargs):
    """流式对话生成器，逐步 yield 文本片段"""
    if not _llm_available or _client is None:
        raise LLMNotAvailable(
            "AI 聊天功能未配置。请在 Render Dashboard → Environment → "
            "添加环境变量 DEEPSEEK_API_KEY，然后重新部署。"
        )
    resp = _client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        stream=True,
        timeout=30,
        **kwargs,
    )
    for chunk in resp:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content


def chat_answer_stream(user_query, history=None, mode="chat"):
    """通用聊天流式，供 server.py /api/chat 调用"""
    messages = [{"role": "system", "content": _get_system_prompt(mode)}]
    messages.extend(_build_history_messages(history))
    messages.append({"role": "user", "content": user_query})
    for token in chat_stream(messages):
        yield token


# ========== 单词练习模式 — 出题 Prompt ==========
PRACTICE_GENERATE_PROMPT = (
    "你是一位英语出题专家，擅长设计选词填空（cloze）练习题。\n"
    "\n"
    "你的任务：\n"
    "1. 从提供的单词列表中挑选恰好 N 个单词\n"
    "2. 优先选择大学英语四级(CET-4)、六级(CET-6)、考研高频词汇\n"
    "3. 用这 N 个单词创作一篇连贯、自然的英文短文\n"
    "4. 文章主题要贴近大学生活或校园场景，让读者有代入感\n"
    "5. 文章中恰好有 N 个空位，每个空位对应一个被挑中的单词\n"
    "6. 每个空位用 [题号]_____ 标记（如 [1]_____ [2]_____）\n"
    "7. 题号按照文章中出现顺序依次编号 1,2,3,...,N\n"
    "\n"
    "文章要求：\n"
    "- 长度适中，能让每个空有足够的上下文线索\n"
    "- 句子自然流畅，不要为了塞单词而写出生硬的句子\n"
    "- 上下文要能暗示空缺单词的含义（但不要直接给出定义）\n"
    "- 文章控制在 150-400 词之间\n"
    "\n"
    "输出格式：\n"
    "只返回一个纯 JSON 对象，不要任何额外文字：\n"
    '{"passage": "全文内容，空位用 [1]_____ [2]_____ 标记",'
    ' "blanks": [{"number": 1, "word": "...", "first_letter": "x", "meaning": "中文释义"}, ...],'
    ' "title": "文章标题"}\n'
    "\n"
    "注意：\n"
    "- first_letter 是该单词的首字母（小写）\n"
    "- meaning 是该单词在该语境下的中文释义\n"
    "- passage 中的空位顺序必须与 blanks 数组的 number 一一对应\n"
    "- 文章不要太短，至少 150 词"
)


# ========== 单词练习模式 — 批改 Prompt ==========
PRACTICE_GRADE_PROMPT = (
    "你是一位耐心细致的英语阅卷老师。\n"
    "\n"
    "一份选词填空练习已经批改完毕（比对结果见下方），请你：\n"
    "1. 对每道错题给出一句话的简短解析（提示词义、纠正拼写、或解释用法）\n"
    "2. 写一段总体点评（50-100字），语气鼓励为主，指出薄弱环节和改进建议\n"
    "3. 如果全部正确，热情洋溢地表扬！\n"
    "\n"
    "输出格式：\n"
    "只返回一个纯 JSON 对象，不要任何额外文字：\n"
    '{"comment": "总体点评...", "details": ['
    '  {"number": 1, "correct": true, "feedback": ""},'
    '  {"number": 2, "correct": false, "feedback": "词义：commencement 意为毕业典礼，不是 graduation"}\n'
    ']}\n'
    "\n"
    "注意：\n"
    "- details 数组按题号顺序排列\n"
    "- correct=true 的题目 feedback 可以为空字符串\n"
    "- 总体点评要具体，不要说空话"
)


def generate_practice(words, count, difficulty="medium"):
    """调用 DeepSeek 生成选词填空练习

    Args:
        words: [{"word": "...", "meaning": "..."}, ...]
        count: 目标空位数
        difficulty: 文章难度 — "easy" | "medium" | "hard"

    Returns:
        {"passage": "...", "blanks": [...], "title": "..."}
    """
    if not _llm_available or _client is None:
        raise LLMNotAvailable("AI 功能未配置，请设置 DEEPSEEK_API_KEY")

    # 难度指令映射
    difficulty_guide = {
        "easy": (
            "文章难度：简单。\n"
            "- 使用基础词汇和简单句式（主谓宾结构为主，少用从句）\n"
            "- 段落简短，每句不超过 15 个单词\n"
            "- 上下文线索明显，能轻易推断空缺单词\n"
            "- 文章总词数控制在 100-200 词\n"
            "- 主题贴近日常校园生活（食堂、宿舍、图书馆、上课等）"
        ),
        "medium": (
            "文章难度：中等。\n"
            "- 使用标准大学英语水平词汇和句式（可含少量从句）\n"
            "- 句子自然流畅，长度适中\n"
            "- 上下文有合理线索但不过于直白\n"
            "- 文章总词数控制在 150-350 词\n"
            "- 主题多样化（科技、文化、社会、学术等）"
        ),
        "hard": (
            "文章难度：较难。\n"
            "- 可使用复杂句式（定语从句、状语从句、倒装等）和学术词汇\n"
            "- 句子可以较长，模仿学术文章风格\n"
            "- 上下文线索更隐晦，需要读者深入理解才能推断\n"
            "- 文章总词数控制在 200-400 词\n"
            "- 主题可涉及学术讨论、社会评论、科技前沿等"
        ),
    }
    diff_instruction = difficulty_guide.get(difficulty, difficulty_guide["medium"])

    # 准备单词列表文本
    word_lines = []
    for i, w in enumerate(words):
        word_lines.append(f"{i+1}. {w['word']} — {w.get('meaning', '')}")
    word_list_text = "\n".join(word_lines)

    user_prompt = (
        f"以下是我的单词库（共 {len(words)} 个）：\n\n"
        f"{word_list_text}\n\n"
        f"请从中挑选恰好 {count} 个单词（优先 CET-4/CET-6 高频词），"
        f"创作一篇含 {count} 个空的英文短文。\n\n"
        f"{diff_instruction}\n\n"
        f"直接返回 JSON。"
    )

    messages = [
        {"role": "system", "content": PRACTICE_GENERATE_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    # 需要更长的 token 限制来生成完整文章
    resp = _client.chat.completions.create(
        model="deepseek-chat",
        messages=messages,
        temperature=0.8,
        max_tokens=4096,
        timeout=120,
    )

    content = resp.choices[0].message.content.strip()
    # 去除可能的 markdown 代码块
    if content.startswith("```"):
        content = content.split("\n", 1)[1]
        if content.endswith("```"):
            content = content[:-3]
    return json.loads(content)


def grade_practice(blanks, answers, passage=""):
    """批改练习答案（服务端比对 + AI 点评）

    Args:
        blanks: [{"number": 1, "word": "...", "first_letter": "..."}, ...]
        answers: {"1": "user answer", "2": "user answer", ...}
        passage: 文章原文（可选，给 AI 参考）

    Returns:
        {"score": 12, "total": 15, "results": [...], "comment": "..."}
    """
    # 步骤1：服务端逐题比对
    results = []
    correct_count = 0
    for blank in blanks:
        num = str(blank["number"])
        user_ans = (answers.get(num) or answers.get(blank["number"]) or "").strip()
        expected = blank["word"].strip()
        is_correct = user_ans.lower() == expected.lower()
        if is_correct:
            correct_count += 1
        results.append({
            "number": blank["number"],
            "correct": is_correct,
            "user": user_ans,
            "expected": expected,
            "first_letter": blank.get("first_letter", ""),
            "meaning": blank.get("meaning", ""),
        })

    total = len(blanks)
    score = correct_count

    # 步骤2：如果 AI 可用，生成点评
    comment = ""
    if _llm_available and _client is not None:
        try:
            # 构造比对结果文本
            result_lines = [f"题号{blank['number']}: 正确答案={blank['word']}, 用户答案={answers.get(str(blank['number']), '')}, {'✓正确' if r['correct'] else '✗错误'}"
                          for blank, r in zip(blanks, results)]
            result_text = "\n".join(result_lines)

            grade_prompt = (
                f"练习得分：{correct_count}/{total}\n\n"
                f"逐题比对结果：\n{result_text}\n\n"
                f"文章原文（供参考）：\n{passage[:500]}\n\n"
                f"请给出总体点评和每道错题的简短反馈。直接返回 JSON。"
            )

            messages = [
                {"role": "system", "content": PRACTICE_GRADE_PROMPT},
                {"role": "user", "content": grade_prompt},
            ]

            resp = _client.chat.completions.create(
                model="deepseek-chat",
                messages=messages,
                temperature=0.5,
                max_tokens=1024,
                timeout=60,
            )

            content = resp.choices[0].message.content.strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1]
                if content.endswith("```"):
                    content = content[:-3]
            ai_result = json.loads(content)
            comment = ai_result.get("comment", "")

            # 合并 AI 的逐题 feedback 到 results
            ai_details = ai_result.get("details", [])
            for detail in ai_details:
                num = detail.get("number")
                for r in results:
                    if r["number"] == num:
                        r["feedback"] = detail.get("feedback", "")
                        break

        except Exception as e:
            print(f"[GradePractice] AI 点评生成失败: {e}")
            comment = ""

    # 如果没有 AI 点评，生成简单评语
    if not comment:
        pct = total > 0 and round(correct_count / total * 100) or 0
        if pct == 100:
            comment = "🎉 全部正确！太厉害了！"
        elif pct >= 80:
            comment = f"👍 表现优秀！正确率 {pct}%，继续保持！"
        elif pct >= 60:
            comment = f"📚 还不错，正确率 {pct}%，再看看错题巩固一下。"
        else:
            comment = f"💪 继续加油！正确率 {pct}%，多复习错题的词义和拼写。"

    return {
        "score": score,
        "total": total,
        "results": results,
        "comment": comment,
    }


# ========== 单词查询 — Oxford 词典风格 Prompt ==========
WORD_LOOKUP_PROMPT = (
    "You are a senior editor at the Oxford Advanced Learner's Dictionary.\n"
    "Your task is to provide a clear, authoritative English definition and natural example sentences for a given English word.\n"
    "\n"
    "Rules:\n"
    "1. Write the definition in simple, clear English (like OALD — Oxford 3000 vocabulary level)\n"
    "2. Cover the most common meaning(s) of the word; if there are multiple important meanings, list them numbered\n"
    "3. Provide 2-3 natural, everyday example sentences that show typical usage\n"
    "4. Include the part of speech (noun, verb, adj, etc.)\n"
    "5. If the word has common collocations or phrases, mention 1-2\n"
    "\n"
    "Output format — ONLY a pure JSON object, no extra text:\n"
    '{"word": "...", "pos": "n./v./adj./...", "definition": "Clear English definition of the most common meaning(s)", "examples": ["Example sentence 1.", "Example sentence 2.", "Example sentence 3."], "collocations": ["collocation 1", "collocation 2"]}\n'
    "\n"
    "Keep definitions concise but complete. Example sentences should sound natural and be useful for learners."
)


def lookup_word(word):
    """查询单词的 Oxford 风格英文释义和例句

    Returns:
        {"word": "...", "pos": "...", "definition": "...", "examples": [...], "collocations": [...]}
    """
    if not _llm_available or _client is None:
        raise LLMNotAvailable("AI 功能未配置，请设置 DEEPSEEK_API_KEY")

    messages = [
        {"role": "system", "content": WORD_LOOKUP_PROMPT},
        {"role": "user", "content": f"Word: {word}"},
    ]

    resp = _client.chat.completions.create(
        model="deepseek-chat",
        messages=messages,
        temperature=0.3,
        max_tokens=1024,
        timeout=30,
    )

    content = resp.choices[0].message.content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1]
        if content.endswith("```"):
            content = content[:-3]
    return json.loads(content)


# ========== 单词分类 — 四六级高频词识别 Prompt ==========
CLASSIFY_VOCAB_PROMPT = (
    "你是一位中国大学英语四六级考试（CET-4/CET-6）词汇专家。\n"
    "你的任务：判断以下每个单词或短语是否属于四六级高频词汇。\n"
    "\n"
    "分类标准：\n"
    "- cet4_high: 大学英语四级(CET-4)考试中的高频核心词汇，出现频率高、考查概率大\n"
    "- cet6_high: 大学英语六级(CET-6)考试中的高频核心词汇，比四级词汇更难、更学术\n"
    "- other: 不属于以上两类的词汇（如基础初中高中词汇、超纲冷僻词、专业术语等）\n"
    "\n"
    "注意：\n"
    "- 一个词最多属于一个类别，选最匹配的\n"
    "- 四级高频词通常更基础常用，六级高频词更学术正式\n"
    "- 短语（如 take off, look after）按整体难度判断，通常是 other\n"
    "- 常见基础词（如 apple, book, run, good）归为 other，不算高频考试词\n"
    "\n"
    "输出格式 — 只返回纯 JSON 数组，不要任何额外文字：\n"
    '[{"word": "...", "level": "cet4_high"}, {"word": "...", "level": "cet6_high"}, {"word": "...", "level": "other"}]\n'
    "\n"
    "必须为每个输入的单词返回一条记录，不要遗漏。"
)


def classify_vocab(words):
    """调用 DeepSeek 分类单词为四六级高频词或其他

    Args:
        words: [{"word": "...", "meaning": "..."}, ...]

    Returns:
        [{"word": "...", "level": "cet4_high"|"cet6_high"|"other"}, ...]
    """
    if not _llm_available or _client is None:
        raise LLMNotAvailable("AI 功能未配置，请设置 DEEPSEEK_API_KEY")

    if not words:
        return []

    # 准备单词列表文本
    word_lines = []
    for i, w in enumerate(words):
        meaning = w.get('meaning', '')
        word_lines.append(f"{i+1}. {w['word']}" + (f" — {meaning}" if meaning else ""))

    word_list_text = "\n".join(word_lines)

    user_prompt = (
        f"请分类以下 {len(words)} 个单词/短语：\n\n"
        f"{word_list_text}\n\n"
        f"直接返回 JSON 数组。"
    )

    messages = [
        {"role": "system", "content": CLASSIFY_VOCAB_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    resp = _client.chat.completions.create(
        model="deepseek-chat",
        messages=messages,
        temperature=0.1,
        max_tokens=2048,
        timeout=60,
    )

    content = resp.choices[0].message.content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1]
        if content.endswith("```"):
            content = content[:-3]
    return json.loads(content)
