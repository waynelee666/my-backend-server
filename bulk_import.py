"""
批量导入基础/四级/六级词库到 Supabase
"""
import json
import os
import sys
import io

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import requests

SUPABASE_URL = "https://swouijpxhujlwlrsmwmo.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3b3VpanB4aHVqbHdscnNtd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMjQxMzIsImV4cCI6MjA5NjcwMDEzMn0.VhL4p8yoILq-5nFe2K5TKafoC03vsDwa_MBb-uBp8PQ"
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))

EMAIL = "2810303976@qq.com"
PASSWORDS = ["Mw002530.", "Mw003520!"]

BOOKS = [
    ("基础", "basic_import.json"),
    ("四级", "cet4_import.json"),
    ("六级", "cet6_import.json"),
]


def sign_in():
    """登录 Supabase 获取 JWT token"""
    print("🔐 登录 Supabase...")
    for pw in PASSWORDS:
        print(f"  尝试: {pw[:4]}...")
        resp = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            json={"email": EMAIL, "password": pw},
            headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
        )
        if resp.status_code == 200:
            data = resp.json()
            token = data["access_token"]
            user_id = data["user"]["id"]
            print(f"✅ 登录成功 user_id={user_id[:12]}...")
            return token, user_id
        print(f"    失败: {resp.status_code}")
    print("❌ 所有密码都失败了")
    sys.exit(1)


def auth_headers(token):
    return {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def clear_book(token, user_id, book):
    """删除此用户当前词书的所有单词"""
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/vocabulary?select=id&book=eq.{book}&user_id=eq.{user_id}",
        headers=auth_headers(token),
    )
    ids = [r["id"] for r in (resp.json() or []) if r]
    if not ids:
        print(f"  🗑️ {book}: 0 条，跳过")
        return

    # 分批删除
    for i in range(0, len(ids), 500):
        batch = ids[i:i + 500]
        id_list = ",".join(f"eq.{x}" for x in batch)
        requests.delete(
            f"{SUPABASE_URL}/rest/v1/vocabulary?or=({id_list})",
            headers=auth_headers(token),
        )
    print(f"  🗑️ {book}: 已删除 {len(ids)} 条旧数据")


def import_book(token, book, filename):
    """导入一个词书"""
    filepath = os.path.join(SERVER_DIR, filename)
    with open(filepath, "r", encoding="utf-8") as f:
        words = json.load(f)

    print(f"\n📥 导入 {book}: {len(words)} 词...")

    batch_size = 500
    imported = 0
    for i in range(0, len(words), batch_size):
        batch = words[i:i + batch_size]
        rows = [{"book": w["book"], "unit": w["unit"], "part": w["part"],
                 "word": w["word"], "meaning": w["meaning"]} for w in batch]

        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/vocabulary",
            json=rows,
            headers=auth_headers(token),
        )
        if resp.status_code >= 400:
            print(f"  ⚠️ 批次失败 [{i}-{i+len(batch)}]: {resp.status_code}")
            continue
        imported += len(batch)
        pct = round((i + len(batch)) / len(words) * 100)
        print(f"  [{pct}%] {imported}/{len(words)}")

    print(f"  ✅ {book}: 导入完成 {imported} 词")


def main():
    token, user_id = sign_in()

    for book, filename in BOOKS:
        clear_book(token, user_id, book)
        import_book(token, book, filename)

    print(f"\n🎉 全部完成！基础+四级+六级已导入")


if __name__ == "__main__":
    main()
