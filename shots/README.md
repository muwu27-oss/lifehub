# 截图说明

这些是 390×844（iPhone/安卓主流尺寸）的真机渲染截图，
用 Chrome headless 实际打开页面拍的，可作为验收参照。

| 文件 | 内容 |
|---|---|
| `today.png` | 今日页：圆环、逾期提醒、子任务进度条、状态卡、账目卡 |
| `plan.png` | 计划页列表模式 |
| `plan-calendar.png` | 计划页日历模式：月历 + 有任务的日期打点 |
| `parse-flow.png` | 导入页解析后的结果（首屏） |
| `parse-list.png` | 导入页完整排期建议列表（**核心功能**） |
| `body.png` | 饮食作息页：热量/营养条 + 健康评估文字 |
| `money.png` | 账本页：环形图 + 分类构成 |
| `learn.png` | 学习蓝图页：阶段卡 + 进度环 + 学科地图 |
| `task-editor.png` | 任务编辑浮层（含新建子任务） |

## 重新生成

```bash
cd ~/lifehub
python3 -m http.server 8777 --bind 127.0.0.1 &   # 起服务器
python3 make_harness.py                          # 生成 harness-*.html
./shots/shoot.sh today:today plan:plan            # 截图
```

（`make_harness.py` 见 shots/ 目录，用于造带假数据的测试页）
