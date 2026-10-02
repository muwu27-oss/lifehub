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
    ('history', 'history-week', 'harness-history-week.html'),    # 回顾：周
    ('history', 'history-month', 'harness-history-month.html'),   # 回顾：月
    ('history', 'history-year', 'harness-history-year.html'),     # 回顾：年
    ('history', 'history-empty', 'harness-history-empty.html'),   # 回顾：空库
    ('import', 'parse-scroll'),     # 解析一段群消息并滚到结果列表
    ('plan', 'calendar'),           # 切到日历模式
    ('today', 'taskeditor'),        # 打开新建任务浮层
    ('help', ''),                   # 操作手册（默认只展开第一节）
    ('help', 'expand'),             # 操作手册全部展开
    ('body', 'meal-ai'),            # 饮食：AI 查食物 / 拍照入口
    ('body', 'ai-eval'),            # 饮食页「发给 AI 评价这一天」必须真有反应（回归）
    ('money', 'import'),            # 账本：三种导入入口 + 导入记录
    ('money', 'import-photo'),      # 账本：截图识别说明页（上次截到哪儿）
    ('money', 'import-real'),       # 账本：真点「导入账单」按钮（回归：别掉进 CSV 页）
    ('money', 'import-to-photo'),   # 账本：真点「导入账单 → 截图识别」两下
    ('money', 'import-text'),       # 账本：粘贴文字
    ('money', 'import-csv'),        # 账本：CSV
    ('money', 'edit'),              # 账本：单笔编辑（删除按钮的位置）
    ('today', 'settings'),          # 设置面板（版本号 + 检查更新）
    ('money', 'edit-save'),         # 真点「更新」（回归：点了没反应）
    ('money', 'batch-save'),        # 真点「应用到 N 笔」
    ('today', 'backup-import'),     # 真点「导入备份」走完整条换设备流程
    ('today', 'diary-entry'),       # 长按「今天」进日记
    ('today', 'diary-tap'),         # 轻点「今天」不能进日记
    ('today', 'diary-flow'),        # 设密码 → 写日记 → 验证明文没泄漏
    ('money', 'rules'),             # 账本分类规则
    ('money', 'batch'),             # 账本批量整理
]

made = []
for spec in SPECS:
    view, act = spec[0], spec[1]
    custom = spec[2] if len(spec) > 2 else None
    name = custom or ('harness-%s%s.html' % (view, ('-' + act) if act else ''))
    body_attrs = 'data-view="%s"' % view
    if act:
        body_attrs += ' data-action="%s"' % act
    html = base.replace('<body>', '<body %s>' % body_attrs)
    (ROOT / name).write_text(html, encoding='utf-8')
    made.append(name)

print('已生成 %d 个测试页:' % len(made))
for m in made:
    print('  ' + m)
