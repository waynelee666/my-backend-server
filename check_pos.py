import re, json, os, sys
from urllib.request import Request, urlopen

# 密钥从 config.py 读（已被 .gitignore 忽略，不会上传）
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import SUPABASE_URL as URL, SUPABASE_SERVICE_KEY as SK

def fetch(table, select='*'):
    rows, offset, limit = [], 0, 1000
    while True:
        url = f'{URL}/rest/v1/{table}?select={select}&limit={limit}&offset={offset}'
        req = Request(url, headers={'apikey': SK, 'Authorization': f'Bearer {SK}'})
        with urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if not data: break
            rows.extend(data)
            if len(data) < limit: break
            offset += limit
    return rows

all_words = fetch('vocabulary', select='id,word,meaning')
total = len(all_words)
POS_RE = re.compile(r'^(n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|int\.|det\.|num\.|art\.|aux\.|vi\.|vt\.)\s')
without = [w for w in all_words if w.get('meaning') and not POS_RE.match(w['meaning'].strip())]

print(f'总单词: {total}')
print(f'已有词性: {total - len(without)} ({ (total - len(without))/total*100:.1f}%)')
print(f'缺词性: {len(without)}')

if without:
    print('\n仍缺词性的词:')
    for w in without[:20]:
        print(f'  [{w.get("unit","?")}] {w["word"]}: {w.get("meaning","(空)")}')
else:
    print('\n✅ 所有单词词性已补全！')
