from PIL import Image, ImageDraw

W = 512
img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)


def rounded_rect(box, r, fill):
    """Hack: draw a rounded rectangle using pieslice + rectangle."""
    x1, y1, x2, y2 = box
    draw.pieslice([x1, y1, x1 + r * 2, y1 + r * 2], 180, 270, fill=fill)
    draw.pieslice([x2 - r * 2, y1, x2, y1 + r * 2], 270, 360, fill=fill)
    draw.pieslice([x1, y2 - r * 2, x1 + r * 2, y2], 90, 180, fill=fill)
    draw.pieslice([x2 - r * 2, y2 - r * 2, x2, y2], 0, 90, fill=fill)
    draw.rectangle([x1 + r, y1, x2 - r, y2], fill=fill)
    draw.rectangle([x1, y1 + r, x2, y2 - r], fill=fill)


# 圆角紫色背景
rounded_rect((0, 0, 512, 512), 110, (102, 126, 234, 255))

# 剪贴板主体
rounded_rect((140, 100, 372, 410), 28, (255, 255, 255, 242))

# 剪贴板顶部横条
rounded_rect((170, 80, 342, 130), 14, (255, 255, 255, 230))

# 夹子
rounded_rect((210, 60, 302, 96), 12, (255, 255, 255, 180))

# ---- 列表项 ----
# 勾选框1（已完成 — 蓝色实心 + 白色对勾）
x, y = 175, 155
rounded_rect((x, y, x + 28, y + 28), 7, (102, 126, 234, 255))
draw.line([(183, 170), (190, 177)], fill="white", width=5)
draw.line([(190, 177), (203, 164)], fill="white", width=5)
draw.rounded_rectangle([(220, 158), (330, 170)], 6, fill=(196, 181, 253, 255))

# 勾选框2（未完成 — 浅色框 + 横线）
x, y = 175, 212
rounded_rect((x, y, x + 28, y + 28), 7, (224, 231, 255, 255))
draw.line([(183, 226), (195, 226)], fill=(102, 126, 234, 255), width=5)
draw.rounded_rectangle([(220, 215), (310, 227)], 6, fill=(196, 181, 253, 255))

# 勾选框3（未完成）
x, y = 175, 269
rounded_rect((x, y, x + 28, y + 28), 7, (224, 231, 255, 255))
draw.line([(183, 283), (195, 283)], fill=(102, 126, 234, 255), width=5)
draw.rounded_rectangle([(220, 272), (320, 284)], 6, fill=(196, 181, 253, 255))

# 底部装饰短横
draw.rounded_rectangle([(185, 340), (265, 346)], 3, fill=(196, 181, 253, 255))

img.save("icon.png")
print("icon.png (512x512) created")
