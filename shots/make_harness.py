#!/usr/bin/env python3
"""
生成截图用的测试页。

为什么需要：真机截图前要往 localStorage 里灌一批假数据
（任务、三餐、账单、课表），否则页面都是空状态，看不出问题。

用法：
    cd ~/lifehub
    python3 shots/make_harness.py       # 生成 harness-*.html
    ./shots/shoot.sh today:today plan:plan ...
"""
import os, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'shots'
base = (SHOTS / 'harness.html').read_text(encoding='utf-8')

# (视图, 动作) —— 动作会在这批假数据灌完后自动触发
SPECS = [
    ('today', ''), ('plan', ''), ('import', ''), ('body', ''), ('money', ''), ('learn', ''),
    ('import', 'parse-scroll'),     # 解析一段群消息并滚到结果列表
    ('plan', 'calendar'),           # 切到日历模式
    ('today', 'taskeditor'),        # 打开新建任务浮层
]

made = []
for view, act in SPECS:
    name = 'harness-%s%s.html' % (view, ('-' + act) if act else '')
    body_attrs = 'data-view="%s"' % view
    if act:
        body_attrs += ' data-action="%s"' % act
    html = base.replace('<body>', '<body %s>' % body_attrs)
    (ROOT / name).write_text(html, encoding='utf-8')
    made.append(name)

print('已生成 %d 个测试页:' % len(made))
for m in made:
    print('  ' + m)
