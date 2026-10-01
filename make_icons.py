#!/usr/bin/env python3
"""生成 PWA 所需的 PNG 图标（无外部 SVG 渲染库，直接用 PIL 绘制）。"""
from PIL import Image, ImageDraw

def rounded_mask(size, radius):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size-1, size-1], radius=radius, fill=255)
    return m

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(3))

def make(size, maskable=False):
    S = size * 4                      # 超采样后缩小，边缘更干净
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 渐变底板
    c0, c1, c2 = (79,126,248), (59,110,246), (139,92,246)
    for y in range(S):
        t = y / (S-1)
        col = lerp(c0, c1, t/0.55) if t < 0.55 else lerp(c1, c2, (t-0.55)/0.45)
        d.line([(0,y),(S,y)], fill=col+(255,))

    # 柔光
    glow = Image.new('RGBA', (S,S), (0,0,0,0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-S*0.18, -S*0.22, S*0.42, S*0.36], fill=(255,255,255,34))
    gd.ellipse([S*0.45, S*0.55, S*1.25, S*1.32], fill=(0,0,0,20))
    img = Image.alpha_composite(img, glow)
    d = ImageDraw.Draw(img)

    # 内容缩放：maskable 需要留出安全边距（内容缩到 ~78%）
    # 设计坐标系是 512×512，实际画布是 S×S，所以还要乘 S/512
    k = 0.78 if maskable else 1.0
    unit = S / 512.0
    def sc(v): return S/2 + (v - 256) * k * unit

    def R(x0,y0,x1,y1,rad,**kw):
        d.rounded_rectangle([sc(x0),sc(y0),sc(x1),sc(y1)], radius=rad*k*unit, **kw)

    # 白色日历主体
    R(104,140,408,412,38, fill=(255,255,255,250))
    # 挂钩
    R(158,106,184,168,13, fill=(255,255,255,242))
    R(328,106,354,168,13, fill=(255,255,255,242))
    # 顶栏分隔线
    d.line([(sc(104),sc(214)),(sc(408),sc(214))], fill=(59,110,246,70), width=max(2,int(7*k*unit)))
    # 勾选块
    R(150,248,214,312,19, fill=(18,161,80,45))
    w = max(2,int(13*k*unit))
    d.line([(sc(167),sc(280)),(sc(180),sc(294))], fill=(18,161,80,255), width=w)
    d.line([(sc(180),sc(294)),(sc(205),sc(265))], fill=(18,161,80,255), width=w)
    # 进度条
    R(240,262,358,279,8, fill=(59,110,246,225))
    R(240,292,316,309,8, fill=(139,92,246,175))
    # 底部两格
    R(150,340,214,382,13, fill=(13,148,136,55))
    R(240,340,358,382,13, fill=(59,110,246,42))

    img = img.resize((size, size), Image.LANCZOS)

    if maskable:
        return img        # maskable 用满幅方图，由系统裁切

    # 普通图标：圆角裁切
    out = Image.new('RGBA', (size, size), (0,0,0,0))
    out.paste(img, (0,0), rounded_mask(size, int(size*0.2266)))
    return out

for s in (192, 512):
    make(s).save(f'icons/icon-{s}.png')
    print(f'icons/icon-{s}.png')

make(512, maskable=True).save('icons/icon-maskable-512.png')
print('icons/icon-maskable-512.png')

# 顺带生成 favicon
make(32).save('icons/favicon-32.png')
print('icons/favicon-32.png')
