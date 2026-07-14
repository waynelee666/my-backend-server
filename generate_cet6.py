"""
TaskFlow - CET6 六级词汇数据生成脚本
1. 从 CET6_3.json (新东方六级词汇) 提取 2,345 词
2. 随机打乱后分配到 units (~80词/part)
3. 生成 DOCX 文件到桌面
4. 输出 JSON 供前端导入
"""
import json
import random
import os

# ── 配置 ──
WORDS_PER_UNIT = 80   # 每个 Unit 总词数
PARTS_PER_UNIT = 2    # 每个 Unit 分成几个 Part
BOOK_NAME = "六级"
DESKTOP = os.path.join(os.environ['USERPROFILE'], 'Desktop')
INPUT_FILE = "CET6_3.json"
OUTPUT_JSON = "cet6_import.json"
OUTPUT_DOCX = os.path.join(DESKTOP, "六级必备词汇_新东方大纲.docx")

# ── 1. 解析 ──
print("📖 读取 CET6_3.json...")
with open(INPUT_FILE, 'r', encoding='utf-8') as f:
    raw = json.load(f)

words = []
for item in raw:
    hw = item.get('headWord', '').strip()
    if not hw:
        continue
    # 提取第一条中文释义
    try:
        trans_list = item['content']['word']['content']['trans']
        # 取第一条翻译，清理空格
        meaning = trans_list[0].get('tranCn', '').strip()
        pos = trans_list[0].get('pos', '')
    except (KeyError, IndexError):
        meaning = ''
        pos = ''

    if not meaning:
        continue

    # 清理释义（去除多余空格）
    import re
    meaning = re.sub(r'\s+', ' ', meaning).strip()

    words.append({
        'word': hw,
        'meaning': meaning,
        'pos': pos
    })

print(f"✅ 解析完成: {len(words)} 个单词")

# ── 2. 随机打乱 ──
random.seed(42)  # 固定种子，可复现
random.shuffle(words)
print("🎲 随机打乱完成")

# ── 3. 分配到 units（每个 unit 含多个 part）──
total = len(words)
words_per_part = WORDS_PER_UNIT // PARTS_PER_UNIT  # 每 part 词数
num_units = (total + WORDS_PER_UNIT - 1) // WORDS_PER_UNIT  # 向上取整

units = []
word_idx = 0
for i in range(num_units):
    unit_name = f"CET6-U{i+1}"
    unit_words = []
    for p in range(PARTS_PER_UNIT):
        part_name = f"P{p+1}"
        start = word_idx
        end = min(word_idx + words_per_part, total)
        chunk = words[start:end]
        word_idx = end
        if chunk:
            units.append({
                'unit': unit_name,
                'part': part_name,
                'count': len(chunk),
                'words': chunk
            })
        if word_idx >= total:
            break
    if word_idx >= total:
        break

print(f"📦 分配完成: {num_units} 个 Unit, 每 Unit {PARTS_PER_UNIT} 个 Part, 每 Part ~{words_per_part} 词")
for u in units:
    print(f"   {u['unit']}-{u['part']}: {u['count']} 词")

# ── 4. 保存导入 JSON ──
import_data = []
for u in units:
    for w in u['words']:
        import_data.append({
            'book': BOOK_NAME,
            'unit': u['unit'],
            'part': u['part'],
            'word': w['word'],
            'meaning': f"{w['pos']}. {w['meaning']}" if w['pos'] else w['meaning']
        })

with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
    json.dump(import_data, f, ensure_ascii=False, indent=2)

print(f"\n💾 导入数据已保存: {OUTPUT_JSON} ({len(import_data)} 条)")

# ── 5. 生成 DOCX ──
print(f"📝 生成 DOCX: {OUTPUT_DOCX}")
from docx import Document
from docx.shared import Pt, Inches, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_ORIENT

doc = Document()

# 页面设置
section = doc.sections[0]
section.page_width = Cm(21)
section.page_height = Cm(29.7)
section.top_margin = Cm(2)
section.bottom_margin = Cm(2)
section.left_margin = Cm(1.8)
section.right_margin = Cm(1.8)

# 标题
title = doc.add_paragraph()
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = title.add_run('六级必备词汇 —— 新东方大纲词表')
run.font.size = Pt(22)
run.font.bold = True
run.font.color.rgb = RGBColor(0x1a, 0x56, 0xdb)

subtitle = doc.add_paragraph()
subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = subtitle.add_run(f'共 {total} 词 | {num_units} 个单元 × {PARTS_PER_UNIT} Part | 每 Part ~{words_per_part} 词 | 随机排列')
run.font.size = Pt(10)
run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

doc.add_paragraph()  # 空行

# 逐 Unit 输出（每个 Unit 下按 Part 分组）
from itertools import groupby
for unit_name, group in groupby(units, key=lambda u: u['unit']):
    group_list = list(group)
    unit_total = sum(g['count'] for g in group_list)
    h = doc.add_heading(f'{unit_name}  ({unit_total} 词)', level=2)

    for g in group_list:
        # Part 子标题
        ph = doc.add_paragraph()
        run = ph.add_run(f'{g["part"]}  ({g["count"]} 词)')
        run.font.size = Pt(11)
        run.font.bold = True
        run.font.color.rgb = RGBColor(0x1a, 0x56, 0xdb)

        # 表格
        table = doc.add_table(rows=1, cols=3)
        table.style = 'Table Grid'

        hdr = table.rows[0].cells
        hdr[0].text = '#'
        hdr[1].text = 'English'
        hdr[2].text = '中文释义'
        for cell in hdr:
            for p in cell.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for r in p.runs:
                    r.font.bold = True
                    r.font.size = Pt(9)

        for idx, w in enumerate(g['words'], 1):
            row = table.add_row()
            cells = row.cells
            cells[0].text = str(idx)
            cells[1].text = w['word']
            cells[2].text = w['meaning']
            for i, cell in enumerate(cells):
                for p in cell.paragraphs:
                    if i == 0:
                        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    for r in p.runs:
                        r.font.size = Pt(9)
                        if i == 1:
                            r.font.bold = True

        for row in table.rows:
            row.cells[0].width = Cm(0.8)
            row.cells[1].width = Cm(4.5)
            row.cells[2].width = Cm(10)

        doc.add_paragraph()  # Part 间隔

    doc.add_paragraph()  # Unit 间隔

doc.save(OUTPUT_DOCX)
print(f"✅ DOCX 已保存: {OUTPUT_DOCX}")
print("\n🎉 全部完成！")
