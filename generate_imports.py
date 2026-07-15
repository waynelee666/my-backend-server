"""
从 cet6_classified.json 生成三个词书的导入 JSON
- 基础: 50词/Part, 2Part/Unit
- 四级: 70词/Part, 2Part/Unit
- 六级: 40词/Part, 2Part/Unit
"""
import json
import os
import random
import sys
import io

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
CLASSIFIED_FILE = os.path.join(SERVER_DIR, "cet6_classified.json")

BOOKS_CONFIG = {
    "基础": {"words_per_part": 50, "output": "basic_import.json"},
    "四级": {"words_per_part": 70, "output": "cet4_import.json"},
    "六级": {"words_per_part": 40, "output": "cet6_import.json"},
}

# 加载分类结果
with open(CLASSIFIED_FILE, "r", encoding="utf-8") as f:
    classified = json.load(f)

# 加载原始词库获取释义
with open(os.path.join(SERVER_DIR, "cet6_import.json"), "r", encoding="utf-8") as f:
    original = json.load(f)

# 构建 word → meaning 映射
word_meaning = {}
for entry in original:
    w = entry["word"].strip()
    m = entry.get("meaning", "").strip()
    if w not in word_meaning and m:
        word_meaning[w] = m
    # 小写也存一份
    wl = w.lower()
    if wl not in word_meaning and m:
        word_meaning[wl] = m

# 按等级分组
groups = {"基础": [], "四级": [], "六级": []}
for word, level in classified.items():
    if level in groups:
        meaning = word_meaning.get(word, word_meaning.get(word.lower(), ""))
        groups[level].append((word, meaning))

print(f"📊 分类统计: 基础 {len(groups['基础'])} | 四级 {len(groups['四级'])} | 六级 {len(groups['六级'])}")

random.seed(42)

for book, cfg in BOOKS_CONFIG.items():
    words = groups[book]
    wpp = cfg["words_per_part"]
    random.shuffle(words)

    import_data = []
    word_idx = 0
    unit_num = 1
    words_per_unit = wpp * 2  # 2 parts per unit
    total_units = (len(words) + words_per_unit - 1) // words_per_unit

    while word_idx < len(words):
        for part_num in [1, 2]:
            start = word_idx
            end = min(word_idx + wpp, len(words))
            chunk = words[start:end]
            word_idx = end

            if chunk:
                for w, m in chunk:
                    import_data.append({
                        "book": book,
                        "unit": f"{book}-U{unit_num}",
                        "part": f"P{part_num}",
                        "word": w,
                        "meaning": m
                    })

        unit_num += 1

    output_path = os.path.join(SERVER_DIR, cfg["output"])
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(import_data, f, ensure_ascii=False, indent=2)

    print(f"📝 {book}: {len(words)} 词 → {total_units} Unit, {output_path}")

print("\n🎉 全部生成完毕！")
