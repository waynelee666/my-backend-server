"""
重新翻译 vocabulary 表中所有词汇的中文释义
用法: python retranslate.py
"""
import json, sys, time
from urllib.request import Request, urlopen
from urllib.error import URLError

# ---- Supabase 配置 ----
SUPABASE_URL = "https://swouijpxhujlwlrsmwmo.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3b3VpanB4aHVqbHdscnNtd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMjQxMzIsImV4cCI6MjA5NjcwMDEzMn0.VhL4p8yoILq-5nFe2K5TKafoC03vsDwa_MBb-uBp8PQ"
REST_URL = f"{SUPABASE_URL}/rest/v1/vocabulary"

# ---- DeepSeek 配置 ----
from config import DEEPSEEK_API_KEY
DS_URL = "https://api.deepseek.com/chat/completions"

BATCH_SIZE = 50  # 每批翻译数量

TRANSLATE_PROMPT = """你是一个英汉词典。请将以下英文单词或短语翻译成中文，给出最常用的1-3个中文释义。

规则：
- 优先给出最常见、最核心的释义（不要冷门释义）
- 多个释义用分号；分隔
- 单词标注词性时用缩写：n. v. adj. adv. prep. conj.，词性放在释义前面
- 短语可以不标注词性，直接给出中文释义

请只返回纯JSON数组，不要任何额外文字。

单词/短语列表：
"""

def supabase_request(method, path, body=None):
    url = f"{REST_URL}{path}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    data = json.dumps(body).encode("utf-8") if body else None
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except URLError as e:
        print(f"  Supabase error: {e}")
        return None

def fetch_all():
    """获取所有词汇"""
    all_rows = []
    offset = 0
    limit = 1000
    while True:
        data = supabase_request("GET", f"?select=*&order=id&limit={limit}&offset={offset}")
        if not data:
            break
        all_rows.extend(data)
        if len(data) < limit:
            break
        offset += limit
    return all_rows

def translate_batch(words):
    """调用 DeepSeek 翻译一批单词"""
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

    req = Request(DS_URL, data=body, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
    })

    try:
        with urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data["choices"][0]["message"]["content"].strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1]
                if content.endswith("```"):
                    content = content[:-3]
            return json.loads(content)
    except Exception as e:
        print(f"  Translation error: {e}")
        return None

def update_meaning(vocab_id, meaning):
    """更新单条词汇的释义"""
    return supabase_request("PATCH", f"?id=eq.{vocab_id}", {"meaning": meaning})

def main():
    print("Fetching all vocabulary...")
    rows = fetch_all()
    total = len(rows)
    print(f"Found {total} entries\n")

    if total == 0:
        print("No entries found.")
        return

    # 分离单词和短语
    words_only = [r for r in rows if (r.get('type') or 'word') == 'word']
    phrases_only = [r for r in rows if r.get('type') == 'phrase']
    print(f"  Words: {len(words_only)}, Phrases: {len(phrases_only)}")

    # 分批处理
    all_entries = rows
    processed = 0
    failed = 0
    skipped = 0

    for i in range(0, total, BATCH_SIZE):
        batch = all_entries[i:i + BATCH_SIZE]
        words = [r['word'] for r in batch]
        batch_num = i // BATCH_SIZE + 1
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE

        print(f"\nBatch {batch_num}/{total_batches} ({len(words)} words)...")
        print(f"  Words: {', '.join(words[:5])}{'...' if len(words) > 5 else ''}")

        translations = translate_batch(words)
        if not translations:
            print(f"  FAILED — skipping batch")
            failed += len(batch)
            continue

        # 建立 word -> translation 的映射
        trans_map = {}
        for t in translations:
            if t.get('word') and t.get('meaning'):
                trans_map[t['word'].lower().strip()] = t['meaning']

        for row in batch:
            word = row['word']
            key = word.lower().strip()
            if key in trans_map:
                meaning = trans_map[key]
                # 只更新释义有变化的
                if meaning != row.get('meaning', ''):
                    result = update_meaning(row['id'], meaning)
                    if result:
                        processed += 1
                        if processed % 10 == 0:
                            print(f"  ... {processed} updated")
                    else:
                        failed += 1
                else:
                    skipped += 1
            else:
                print(f"  No translation for: {word}")
                failed += 1

        # API 限流：每批之间短暂休息
        if i + BATCH_SIZE < total:
            time.sleep(1)

    print(f"\n{'='*50}")
    print(f"DONE!")
    print(f"  Total: {total}")
    print(f"  Updated: {processed}")
    print(f"  Skipped (same): {skipped}")
    print(f"  Failed: {failed}")

if __name__ == '__main__':
    main()
