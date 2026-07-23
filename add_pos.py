"""
批量给旧词补充词性
- 找出 vocabulary 表中 meaning 不含词性缩写的词
- 调用 DeepSeek 批量补词性（n./v./adj./adv./prep./conj./pron./int.）
- 写回 Supabase
"""
import json
import sys
import os
from urllib.request import Request, urlopen
from urllib.error import URLError

# --- 配置 ---
SUPABASE_URL = "https://swouijpxhujlwlrsmwmo.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3b3VpanB4aHVqbHdscnNtd21vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTEyNDEzMiwiZXhwIjoyMDk2NzAwMTMyfQ.QweD9E3W6wSYf_JmM1kZU1s5Us1ic1YgVzF8El9ku7s"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DEEPSEEK_API_KEY

BATCH_SIZE = 50  # 每批发给 DeepSeek 的词数

# 词性缩写正则
import re
POS_RE = re.compile(r'^(n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|int\.|det\.|num\.|art\.|aux\.|vi\.|vt\.)\s')

def supabase_fetch(table, select="*", filters=None):
    """GET /rest/v1/{table} — 分页获取全部数据"""
    all_rows = []
    offset = 0
    limit = 1000
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}&limit={limit}&offset={offset}"
        if filters:
            url += "&" + "&".join(filters)
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        }
        req = Request(url, headers=headers)
        with urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if not data:
                break
            all_rows.extend(data)
            if len(data) < limit:
                break
            offset += limit
    return all_rows

def supabase_patch(table, row_id, fields):
    """PATCH /rest/v1/{table}?id=eq.{id} — 使用 service_role 绕过 RLS"""
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{row_id}"
    body = json.dumps(fields).encode("utf-8")
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    req = Request(url, data=body, headers=headers, method="PATCH")
    with urlopen(req, timeout=15) as resp:
        resp.read()  # consume

def deepseek_add_pos(words_batch):
    """调用 DeepSeek 给一批单词补充词性，只改 meaning 字段"""
    word_list = "\n".join(w["word"] for w in words_batch)
    prompt = f"""你是一个专业的英汉词典编辑。下面每个英文单词后附有当前中文释义。请在每个释义前补充对应的词性缩写（n. v. adj. adv. prep. conj. pron. int. det. num. art. aux. vi. vt.），保持原有释义不变。

规则：
- 动词统一用 v.，不用 vi. 或 vt.（特殊需要区分时再用）
- 只修改词性，不修改释义内容
- 返回纯 JSON 数组，格式：[{{"word": "yes", "meaning": "adv. 是；是的"}}, ...]

示例输入：
yes 是；是的
apple 苹果
run 跑；运行

示例输出：
[
  {{"word": "yes", "meaning": "adv. 是；是的"}},
  {{"word": "apple", "meaning": "n. 苹果"}},
  {{"word": "run", "meaning": "v. 跑；运行"}}
]

请只返回纯 JSON 数组，不要任何额外文字。

单词列表：
"""
    for w in words_batch:
        prompt += f"{w['word']} {w['meaning']}\n"

    body = json.dumps({
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "你是一个专业的英汉词典，只返回JSON数组。"},
            {"role": "user", "content": prompt}
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

    with urlopen(req, timeout=90) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1]
            if content.endswith("```"):
                content = content[:-3]
        return json.loads(content)

def main():
    print("📖 从 Supabase 加载所有单词...")
    all_words = supabase_fetch("vocabulary", select="id,word,meaning")

    # 筛选缺词性的词
    need_pos = [w for w in all_words if w.get("meaning") and not POS_RE.match(w["meaning"].strip())]
    total = len(need_pos)
    print(f"🔍 {len(all_words)} 个单词中，{total} 个缺词性")

    if total == 0:
        print("✅ 所有单词都已有词性，无需处理！")
        return

    updated = 0
    for i in range(0, total, BATCH_SIZE):
        batch = need_pos[i:i + BATCH_SIZE]
        print(f"\n📤 批次 {i // BATCH_SIZE + 1}: {len(batch)} 个词 → DeepSeek...")
        try:
            result = deepseek_add_pos(batch)
        except Exception as e:
            print(f"  ❌ DeepSeek 调用失败: {e}")
            continue

        # 构建 word→meaning 映射
        result_map = {r["word"].strip(): r["meaning"].strip() for r in result}

        # 更新 Supabase
        batch_done = 0
        for w in batch:
            new_meaning = result_map.get(w["word"].strip())
            if not new_meaning or not POS_RE.match(new_meaning):
                continue
            try:
                supabase_patch("vocabulary", w["id"], {"meaning": new_meaning})
                batch_done += 1
            except Exception as e:
                print(f"  ⚠️ 更新 {w['word']} 失败: {e}")

        updated += batch_done
        print(f"  ✅ 本批更新 {batch_done}/{len(batch)} 个")

    print(f"\n🎉 完成！共更新 {updated}/{total} 个单词")

if __name__ == "__main__":
    main()
