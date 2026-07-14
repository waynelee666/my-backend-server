"""
TaskFlow - 批量导入 CET6 六级词汇到 Supabase
使用 REST API，分批插入，避免超时
"""
import json
import requests
import time

# Supabase 配置
SUPABASE_URL = "https://swouijpxhujlwlrsmwmo.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3b3VpanB4aHVqbHdscnNtd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMjQxMzIsImV4cCI6MjA5NjcwMDEzMn0.VhL4p8yoILq-5nFe2K5TKafoC03vsDwa_MBb-uBp8PQ"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

# 先查看已有 CET6 数据量
print("🔍 检查现有 CET6 单词...")
resp = requests.get(
    f"{SUPABASE_URL}/rest/v1/vocabulary",
    headers={**HEADERS, "Accept": "application/json"},
    params={"book": "eq.CET6", "select": "id"}
)
existing_ids = [r['id'] for r in resp.json()] if resp.ok else []
print(f"   已有 {len(existing_ids)} 条 CET6 记录")

# 读取导入数据
with open("cet6_import.json", "r", encoding="utf-8") as f:
    all_words = json.load(f)
print(f"📦 待导入: {len(all_words)} 条")

# 过滤已存在的（同 book+unit+part+word）
print("🔍 检查重复...")
existing_set = set()
batch_size = 500
for i in range(0, len(all_words), batch_size):
    chunk = all_words[i:i+batch_size]
    words_in_chunk = [w['word'].lower().strip() for w in chunk]
    # 简化检查：取所有已有的 CET6 word
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/vocabulary",
        headers={**HEADERS, "Accept": "application/json"},
        params={"book": "eq.CET6", "select": "word"}
    )
    if resp.ok:
        for r in resp.json():
            existing_set.add(r['word'].lower().strip())
    break  # 一次查全部即可

new_words = [w for w in all_words if w['word'].lower().strip() not in existing_set]
print(f"   新词: {len(new_words)} / 已有: {len(all_words) - len(new_words)}")

if not new_words:
    print("✅ 没有新词需要导入")
    exit()

# 分批插入
BATCH = 50
total = len(new_words)
inserted = 0
failed = 0

print(f"🚀 开始导入 (批次大小: {BATCH})...")
for i in range(0, total, BATCH):
    batch = new_words[i:i+BATCH]
    try:
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/vocabulary",
            headers=HEADERS,
            json=batch
        )
        if resp.status_code in (200, 201):
            inserted += len(batch)
            print(f"   ✅ [{i+1}-{min(i+BATCH, total)}/{total}] {inserted}/{total}")
        else:
            # 尝试单条插入回退
            print(f"   ⚠️ 批量失败 ({resp.status_code}): {resp.text[:200]}，回退单条...")
            for w in batch:
                try:
                    resp2 = requests.post(
                        f"{SUPABASE_URL}/rest/v1/vocabulary",
                        headers=HEADERS,
                        json=[w]
                    )
                    if resp2.status_code in (200, 201):
                        inserted += 1
                    else:
                        failed += 1
                        print(f"      ❌ {w['word']}: {resp2.status_code} {resp2.text[:100]}")
                except Exception as e2:
                    failed += 1
    except Exception as e:
        failed += len(batch)
        print(f"   ❌ 批次 [{i+1}-{min(i+BATCH, total)}] 异常: {e}")

    time.sleep(0.3)  # 避免速率限制

print(f"\n{'='*50}")
print(f"📊 导入完成: 成功 {inserted} / 失败 {failed} / 总计 {total}")
print(f"{'='*50}")
