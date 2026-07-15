"""
TaskFlow - CET6 六级词汇数据生成脚本（合并版）
1. 合并 不背单词官方词书 + 新东方六级词汇 → 4,588 词
2. 随机打乱后分配到 units (每 Part 70 词，每 Unit 2 Part)
3. 生成 DOCX 文件到桌面（仅单词+释义）
4. 输出 JSON 供前端导入
"""
import json
import random
import os
import re
import openpyxl

# ── 配置 ──
WORDS_PER_PART = 70
PARTS_PER_UNIT = 2
WORDS_PER_UNIT = WORDS_PER_PART * PARTS_PER_UNIT
BOOK_NAME = "六级"
DESKTOP = os.path.join(os.environ['USERPROFILE'], 'Desktop')
INPUT_XLSX = "cet6_full.xlsx"
INPUT_XDF = "CET6_3.json"
OUTPUT_JSON = "cet6_import.json"
OUTPUT_DOCX = os.path.join(DESKTOP, "六级必备词汇.docx")

# ── 1. 读取不背单词官方词书 (xlsx) ──
print("📖 读取不背单词官方词书...")
wb = openpyxl.load_workbook(INPUT_XLSX)
ws = wb.active
words_dict = {}  # word_lower -> meaning
for row in ws.iter_rows(min_row=2, values_only=True):
    w, m = row[0], row[1]
    if w and m:
        key = str(w).strip()
        words_dict[key.lower()] = (key, str(m).strip())

print(f"   不背单词: {len(words_dict)} 词")

# ── 2. 读取新东方六级（补充不背单词没有的）──
print("📖 读取新东方六级词汇...")
with open(INPUT_XDF, 'r', encoding='utf-8') as f:
    xdf = json.load(f)

added = 0
for item in xdf:
    hw = item.get('headWord', '').strip()
    if not hw:
        continue
    key = hw.lower()
    if key in words_dict:
        continue  # 已有，跳过
    try:
        m = item['content']['word']['content']['trans'][0]['tranCn'].strip()
    except (KeyError, IndexError):
        m = ''
    if m:
        words_dict[key] = (hw, m)
        added += 1

print(f"   新东方补充: {added} 词")
print(f"   合并总计: {len(words_dict)} 词")

# ── 3. 转为列表并随机打乱 ──
words = [{'word': v[0], 'meaning': re.sub(r'\s+', ' ', v[1]).strip()} for v in words_dict.values()]
random.seed(42)
random.shuffle(words)
print("🎲 随机打乱完成")

# ── 4. 分配到 units ──
total = len(words)
num_units = (total + WORDS_PER_UNIT - 1) // WORDS_PER_UNIT

units = []
word_idx = 0
for i in range(num_units):
    unit_name = f"CET6-U{i+1}"
    for p in range(PARTS_PER_UNIT):
        part_name = f"P{p+1}"
        start = word_idx
        end = min(word_idx + WORDS_PER_PART, total)
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

print(f"📦 分配完成: {num_units} Unit × {PARTS_PER_UNIT} Part, 每 Part ~{WORDS_PER_PART} 词")
for u in units:
    print(f"   {u['unit']}-{u['part']}: {u['count']} 词")

# ── 5. 保存导入 JSON ──
import_data = []
for u in units:
    for w in u['words']:
        import_data.append({
            'book': BOOK_NAME,
            'unit': u['unit'],
            'part': u['part'],
            'word': w['word'],
            'meaning': w['meaning']
        })

with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
    json.dump(import_data, f, ensure_ascii=False, indent=2)
print(f"\n💾 JSON 已保存: {OUTPUT_JSON} ({len(import_data)} 条)")

# ── 6. 生成 DOCX（简洁版：仅单词+释义）──
print(f"📝 生成 DOCX: {OUTPUT_DOCX}")
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from itertools import groupby

doc = Document()
section = doc.sections[0]
section.page_width = Cm(21)
section.page_height = Cm(29.7)
section.top_margin = Cm(1.5)
section.bottom_margin = Cm(1.5)
section.left_margin = Cm(1.5)
section.right_margin = Cm(1.5)

for unit_name, group in groupby(units, key=lambda u: u['unit']):
    group_list = list(group)
    unit_total = sum(g['count'] for g in group_list)

    # Unit 标题
    h = doc.add_heading(f'{unit_name}  ({unit_total} 词)', level=2)

    for g in group_list:
        # Part 子标题
        ph = doc.add_paragraph()
        run = ph.add_run(f'{g["part"]}  ({g["count"]} 词)')
        run.font.size = Pt(10)
        run.font.bold = True
        run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)

        # 表格：序号 | 英文 | 中文
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
                    r.font.size = Pt(8)

        for idx, w in enumerate(g['words'], 1):
            row = table.add_row()
            row.cells[0].text = str(idx)
            row.cells[1].text = w['word']
            row.cells[2].text = w['meaning']
            for i, cell in enumerate(row.cells):
                for p in cell.paragraphs:
                    if i == 0:
                        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    for r in p.runs:
                        r.font.size = Pt(8)

        for row in table.rows:
            row.cells[0].width = Cm(0.6)
            row.cells[1].width = Cm(4)
            row.cells[2].width = Cm(11.4)

        doc.add_paragraph()

    doc.add_paragraph()

doc.save(OUTPUT_DOCX)
print(f"✅ DOCX 已保存: {OUTPUT_DOCX}")
print(f"\n🎉 全部完成！")
