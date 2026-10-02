/* ═══════════════════════════════════════════════
   views/help.js — 操作手册（帮助页）

   为什么放在 App 里而不是丢一个 md 文件：
   手机上打开 md 文件要么乱码、要么要额外 App。
   内置成页面，随时能查，还能直接跳到对应功能做操作。

   结构：可折叠的分节（accordion），默认只展开第一节目录，
   避免一屏塞满、找不到想看的东西。
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';
  const Views = global.Views || (global.Views = {});

  /* 记录哪些节是展开的（刷新后保持） */
  const st = { open: { start: true } };

  /* ═══════════ 小工具 ═══════════ */

  /** 段落 */
  function p(text, style) {
    return U.el('p', {
      style: Object.assign({
        fontSize: '13px', lineHeight: '1.75', margin: '0 0 10px',
        color: 'var(--text-dim)'
      }, style || {}),
      /* 和 table() 一样走行内标记，否则 **加粗** 会照着星号原样显示。
         （踩过的坑：帮助页里出现字面的 ** 符号） */
      html: mdInline(text)
    });
  }

  /** 带色块的提示条 kind: info | warn | ok */
  function note(text, kind) {
    const colors = {
      info: { c: 'var(--brand)', bg: 'rgba(59,130,246,.09)' },
      warn: { c: '#f59e0b', bg: 'rgba(245,158,11,.10)' },
      ok: { c: 'var(--ok)', bg: 'rgba(16,185,129,.10)' }
    };
    const k = colors[kind] || colors.info;
    return U.el('div', {
      style: {
        borderLeft: '3px solid ' + k.c, background: k.bg,
        padding: '9px 11px', borderRadius: '0 8px 8px 0',
        fontSize: '12.5px', lineHeight: '1.7', margin: '0 0 11px',
        color: 'var(--text)'
      },
      /* 同样走 mdInline：note 里也常写 **重点**，不解析就会漏出星号 */
      html: mdInline(text)
    });
  }

  /** 有序步骤 */
  function steps(items) {
    return U.el('div', { style: { margin: '0 0 11px' } }, items.map((s, i) =>
      U.el('div', {
        style: { display: 'flex', gap: '9px', padding: '5px 0', fontSize: '13px', lineHeight: '1.65' }
      }, [
        U.el('span', {
          style: {
            flexShrink: '0', width: '19px', height: '19px', borderRadius: '50%',
            background: 'var(--brand)', color: '#fff', fontSize: '11px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: '600', marginTop: '1px'
          },
          text: String(i + 1)
        }),
        U.el('span', { class: 'grow', text: s })
      ])
    ));
  }

  /** 两列表格 */
  function table(rows, heads) {
    const box = U.el('div', {
      style: {
        border: '1px solid var(--border)', borderRadius: '10px',
        overflow: 'hidden', margin: '0 0 12px', fontSize: '12.5px'
      }
    });
    if (heads) {
      box.appendChild(U.el('div', {
        style: {
          display: 'flex', background: 'var(--bg-sunken)', fontWeight: '600',
          padding: '8px 10px', gap: '8px', fontSize: '12px'
        }
      }, heads.map(h => U.el('span', { class: 'grow', text: h }))));
    }
    rows.forEach((r, i) => {
      box.appendChild(U.el('div', {
        style: {
          display: 'flex', padding: '8px 10px', gap: '8px',
          borderTop: i ? '1px solid var(--border)' : 'none',
          lineHeight: '1.6', alignItems: 'flex-start'
        }
      }, r.map(c => U.el('span', { class: 'grow' }, mdInline(c)))));
    });
    return box;
  }

  /** 行内标记：**粗体** 和 `代码`
   *  踩过的坑：只判断 startsWith('**') 设了粗体、却没把星号删掉，
   *  结果表格里满屏都是字面的 ** 符号。 */
  function mdInline(text) {
    const s = String(text == null ? '' : text);
    if (!/\*\*|`/.test(s)) return [s];          // 没标记就纯文本
    const out = [];
    /* 用一段正则同时切出 **粗体** 和 `代码` */
    const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
    let last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index));
      if (m[1] != null) out.push(U.el('strong', { text: m[1] }));
      else out.push(U.el('code', {
        style: {
          background: 'var(--bg-sunken)', padding: '1px 4px',
          borderRadius: '3px', fontSize: '11.5px'
        },
        text: m[2]
      }));
      last = re.lastIndex;
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
  }

  /** 代码/路径强调 */
  function code(text) {
    return U.el('code', {
      style: {
        background: 'var(--bg-sunken)', padding: '1px 5px', borderRadius: '4px',
        fontSize: '12px', fontFamily: 'ui-monospace,Menlo,monospace'
      },
      text
    });
  }

  /** 一个可折叠的节 */
  function section(id, title, badge, buildContent) {
    const isOpen = !!st.open[id];
    const body = U.el('div', { style: { display: isOpen ? 'block' : 'none', paddingTop: '4px' } });
    if (isOpen) buildContent(body);

    const head = U.el('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '9px',
        cursor: 'pointer', userSelect: 'none', padding: '2px 0'
      },
      onclick: () => {
        const nowOpen = !st.open[id];
        st.open[id] = nowOpen;
        body.style.display = nowOpen ? 'block' : 'none';
        if (nowOpen && !body.childNodes.length) buildContent(body);
        arrow.style.transform = nowOpen ? 'rotate(90deg)' : 'rotate(0deg)';
      }
    }, [
      U.el('span', {
        style: {
          transition: 'transform .18s', fontSize: '10px',
          color: 'var(--text-faint)', width: '10px', flexShrink: '0'
        },
        text: '▶'
      }),
      U.el('span', {
        class: 'grow',
        style: { fontSize: '14.5px', fontWeight: '650', lineHeight: '1.5' },
        text: title
      }),
      badge ? U.el('span', { class: 'badge ' + (badge.cls || ''), text: badge.text }) : null
    ]);
    const arrow = head.firstChild;

    return U.el('div', { class: 'card', style: { marginBottom: '10px' } }, [head, body]);
  }

  /* ═══════════ 主视图 ═══════════ */

  Views.help = function () {
    const root = U.$('#view-help');
    const st2 = S.settings;

    /* ───── 顶部：这是什么 + 关键概念 ───── */
    root.appendChild(U.el('div', { class: 'card', style: { marginBottom: '10px' } }, [
      U.el('div', {
        style: { fontSize: '15px', fontWeight: '700', marginBottom: '7px' },
        text: 'LifeHub 操作手册'
      }),
      p('管三件事：今天要做什么、身体状态怎么样、钱花到哪去了。下面按「你遇到问题时的顺序」编排，不用从头读。', { color: 'var(--text-dim)', margin: '0 0 10px' }),
      U.el('div', {
        style: {
          display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '11.5px'
        }
      }, [
        U.el('span', { class: 'chip', text: '📅 日程待办' }),
        U.el('span', { class: 'chip', text: '📥 一键导入' }),
        U.el('span', { class: 'chip', text: '⏰ 提醒' }),
        U.el('span', { class: 'chip', text: '🍚 饮食作息' }),
        U.el('span', { class: 'chip', text: '💰 记账' }),
        U.el('span', { class: 'chip', text: '📈 回顾' })
      ])
    ]));

    /* ═══ 0. 第一次用 ═══ */
    root.appendChild(section('start', '第一次用：装到手机桌面', null, body => {
      body.appendChild(note('这个 App 是网页，但能装成桌面图标，打开没地址栏，跟真 App 一样。', 'info'));

      body.appendChild(U.el('div', { class: 'section-label', text: '安装' }));
      body.appendChild(steps([
        '用手机浏览器（Chrome 或小米浏览器）打开本页网址',
        'Chrome：右上角 ⋮ → 添加到主屏幕',
        '小米浏览器：底部菜单 → 添加到桌面',
        '桌面出现蓝紫色日历图标，点开即用'
      ]));
      body.appendChild(note('别用微信打开——微信内置浏览器不能「添加到桌面」。', 'warn'));

      body.appendChild(U.el('div', { class: 'section-label', text: '小米手机建议设置' }));
      body.appendChild(p('这几步让 App 用起来更顺。注意：提醒功能不依赖它们（见「提醒」一节）。'));
      body.appendChild(steps([
        '设置 → 应用设置 → 应用管理 → Chrome → 省电策略 → 无限制',
        '设置 → 应用设置 → 应用管理 → Chrome → 自启动 → 允许',
        '最近任务里给浏览器下拉加锁'
      ]));
    }));

    /* ═══ 1. 每天怎么用 ═══ */
    root.appendChild(section('daily', '每天怎么用', null, body => {
      body.appendChild(p('打开 App 默认停在「今日」，一眼看到今天要做什么。'));
      body.appendChild(table([
        ['**顶部圆环**', '今天完成度。做完一项转一点'],
        ['**红色任务**', '已经逾期了，提醒你补'],
        ['**小方框**', '子任务，把一件事拆成几步'],
        ['**底部三个按钮**', '快速记饮食 / 记睡眠 / 记账']
      ], ['元素', '含义']));
      body.appendChild(note('做完点任务左边的圆圈打勾。打勾后提醒和日历事件都会自动消失。', 'ok'));
      body.appendChild(U.el('div', { class: 'row', style: { gap: '8px' } }, [
        U.el('button', {
          class: 'btn ghost grow sm', text: '去「今日」看看',
          onclick: () => App.go('today')
        }),
        U.el('button', {
          class: 'btn ghost grow sm', text: '新建任务',
          onclick: () => Views.editTask(null)
        })
      ]));
    }));

    /* ═══ 2. 三种任务 ═══ */
    root.appendChild(section('kinds', '三种任务，三种提醒（核心）', { text: '必读', cls: 'cv' }, body => {
      body.appendChild(note('这是整个 App 最需要先搞懂的一点。搞错了会觉得「提醒怎么不响」或「怎么天天响」。', 'warn'));

      body.appendChild(table([
        ['**有截止日**', '导入时解析出了截止时间', '截止日**前一天 18:00** 提醒一次'],
        ['**日常活动**', '你手动标记了，或标题带「每天/每日」', '**每天 18:00** 提醒'],
        ['**长期任务**', '既没截止日、也没安排时间', '**不提醒**，只在长期栏里待着']
      ], ['类型', '怎么判断', '提醒方式']));

      body.appendChild(U.el('div', { class: 'section-label', text: '为什么这么设计' }));
      body.appendChild(p('之前的做法是「每天只要有没做完的事就响一次」，结果一导日历天天响，很快就烦了、开始无视。现在只保留两类：真的要紧了（截止前）、和每天要打卡的。'));

      body.appendChild(U.el('div', { class: 'section-label', text: '怎么改类型' }));
      body.appendChild(steps([
        '导入预览页：每条右边有「设为日常」按钮，点一下切换',
        '任务编辑页：有「类型」选择器，还带说明文字',
        '给长期任务加个截止时间，它会自动变成「有截止日」'
      ]));
    }));

    /* ═══ 3. 一键导入 ═══ */
    root.appendChild(section('import', '一键导入：把群消息变成任务', null, body => {
      body.appendChild(p('这是最常用的功能。群里发的通知、待办，整段粘进来就行。'));

      body.appendChild(U.el('div', { class: 'section-label', text: '步骤' }));
      body.appendChild(steps([
        '点底部中间的 ➕',
        '把消息整段粘进输入框',
        '点「解析并推荐时间」',
        '检查结果，可改分类、改时间、取消勾选',
        '点「归档 N 条」'
      ]));

      body.appendChild(U.el('div', { class: 'section-label', text: '它能识别什么' }));
      body.appendChild(p('比如粘这段进去：'));
      body.appendChild(U.el('div', {
        style: {
          background: 'var(--bg-sunken)', padding: '10px 12px', borderRadius: '8px',
          fontSize: '12px', lineHeight: '1.8', margin: '0 0 11px',
          fontFamily: 'ui-monospace,Menlo,monospace', whiteSpace: 'pre-wrap',
          color: 'var(--text-dim)'
        },
        text: '【教务处】选课将于 3月5日 18:00 截止\n下周三下午2点 高数补考 在 A301\n3月20日前提交计算机视觉大作业\n每天 背 50 个考研单词\n看完 ROS2 tf2 坐标变换的视频'
      }));

      body.appendChild(table([
        ['选课将于 3月5日 18:00 截止', '截止 3月5日 18:00'],
        ['下周三下午2点 高数补考 在 A301', '周三 14:00，地点 A301'],
        ['3月20日前提交…大作业', '截止 3月20日'],
        ['**每天** 背 50 个考研单词', '**自动标为日常活动**'],
        ['看完 ROS2 教程', '**归入长期任务**']
      ], ['原文', '识别结果']));

      body.appendChild(U.el('div', { class: 'section-label', text: '三种时间状态都支持' }));
      body.appendChild(table([
        ['只有截止日期', '在截止前挑合适空档（CV 提前 10 天、学习 5 天、杂事 2 天）'],
        ['只有安排时间', '直接用你说的时间'],
        ['两个都有', '用你说的时间，同时记住截止日']
      ], ['情况', '怎么排']));

      body.appendChild(U.el('div', { class: 'section-label', text: '课表：只用来避让' }));
      body.appendChild(note('课表不会变成待办。它的作用只是告诉 App「这些时间我有课，别排任务进来」。导入一次即可。', 'info'));
      body.appendChild(U.el('div', { class: 'row', style: { gap: '8px', marginTop: '4px' } }, [
        U.el('button', {
          class: 'btn grow sm', text: '去导入',
          onclick: () => App.go('import')
        })
      ]));
    }));

    /* ═══ 4. 提醒设置 ═══ */
    root.appendChild(section('remind', '让提醒真的响（最容易踩坑）', { text: '重要', cls: 'life' }, body => {
      body.appendChild(note('只导出不导入是不会响的。提醒走系统日历，不走 App 自己弹通知——因为小米会杀后台，网页定时通知不可靠，日历 App 是系统级的、不会被杀。', 'warn'));

      body.appendChild(U.el('div', { class: 'section-label', text: '操作步骤' }));
      body.appendChild(steps([
        '打开「计划」页',
        '点右上角的 ⬇️ 图标（导出到日历）',
        '下载一个 .ics 文件',
        '用小米日历打开它（文件管理器里点一下 → 选「日历」打开）',
        '系统问导入到哪个日历时，建议新建一个叫「LifeHub」的日历',
        '完成'
      ]));

      body.appendChild(U.el('div', { class: 'section-label', text: '导出的内容' }));
      body.appendChild(table([
        ['⚠️ 明天截止：交CV大作业', '截止日前一天 18:00'],
        ['🔁 日常活动 3 项', '每天 18:00，列出所有日常活动']
      ], ['事件', '时间']));

      body.appendChild(U.el('div', { class: 'section-label', text: '多久导一次' }));
      body.appendChild(p('导出范围是未来 30 天。建议每 2 周到 1 个月重导一次，不用每天导。'));
      body.appendChild(note('建议建一个单独的「LifeHub」日历，重导前把它整个删掉，就不会有重复提醒。', 'ok'));
      body.appendChild(U.el('div', { class: 'row', style: { gap: '8px', marginTop: '4px' } }, [
        U.el('button', {
          class: 'btn grow sm', text: '去「计划」页导出',
          onclick: () => App.go('plan')
        })
      ]));
    }));

    /* ═══ 5. 长期任务 ═══ */
    root.appendChild(section('longterm', '长期任务栏怎么用', null, body => {
      body.appendChild(p('既没截止日、也没安排时间的任务，自动归到这里。比如「看完《视觉SLAM十四讲》」「整理 ROS2 笔记」。'));

      body.appendChild(note('为什么单独放一栏：如果把「看完SLAM十四讲」硬排到今晚 19:00，那今晚就干不了别的了。不排期，才不会挤掉真正要紧的事。', 'info'));

      body.appendChild(U.el('div', { class: 'section-label', text: '怎么操作' }));
      body.appendChild(table([
        ['**▲▼ 按钮**', '调整顺序，想先做的往上挪'],
        ['**点优先级标签**', '循环切换 紧急 → 重要 → 普通 → 随意'],
        ['**按优先级重排**', '一键让高优先级的排到前面'],
        ['**点任务本身**', '编辑。加个时间它就变成普通任务了']
      ], ['操作', '效果']));

      body.appendChild(U.el('div', { class: 'row', style: { gap: '8px', marginTop: '4px' } }, [
        U.el('button', {
          class: 'btn grow sm', text: '去「计划 → 长期」',
          onclick: () => { App.go('plan'); }
        })
      ]));
    }));

    /* ═══ 6. 饮食作息 ═══ */
    root.appendChild(section('body', '饮食作息与减脂', null, body => {
      body.appendChild(U.el('div', { class: 'section-label', text: '记饮食' }));
      body.appendChild(steps([
        '打开「饮食」页',
        '点「记饮食」',
        '搜索食物，或直接拍照'
      ]));
      body.appendChild(p('自动算热量、蛋白质、脂肪、碳水、膳食纤维、钠。'));

      body.appendChild(U.el('div', { class: 'section-label', text: '三种添加方式' }));
      body.appendChild(table([
        ['搜本地库', '84 种常见食物，秒出、不花 token'],
        ['🤖 用 AI 查', '库里没有的（外卖、地方菜、奶茶、零食），AI 现查营养'],
        ['📷 拍照', '拍一张，AI 认出盘子里有什么、各多少克']
      ], ['方式', '说明']));
      body.appendChild(note('本地库命中时，AI 入口也会同时给出——因为「宫保鸡丁」可能误命中「鸡丁」，那个营养值差很远。想拿准的就点 AI。', 'info'));
      body.appendChild(note('AI 查过的食物会自动存进你的食物库，下次直接搜到、不用再花 token。用得越久越省钱。', 'ok'));

      body.appendChild(U.el('div', { class: 'section-label', text: '拍照识别怎么用' }));
      body.appendChild(steps([
        '点「📷 拍照」→ 拍或选一张照片',
        '等 10~30 秒（AI 在看图算份量）',
        '逐项确认：不对的可以点单项单独加，也可以「全部添加」',
        '克数是估算，觉得不准可以改'
      ]));
      body.appendChild(note('拍照时把整盘菜拍全、光线别太暗，AI 估重量会准一些。有筷子/手的参照物更好。', 'info'));

      body.appendChild(U.el('div', { class: 'section-label', text: '没吃这一餐，也要记' }));
      body.appendChild(p('每餐卡片右边有个「没吃」按钮。点了会显示成「🚫 这餐没吃」，而不是空白的「未记录」。'));
      body.appendChild(table([
        ['有记录', '正常显示吃了什么'],
        ['没吃', '你主动标的 —— AI 会按「真没吃」处理'],
        ['未记录', '没记 —— AI 不知道是没吃还是忘了']
      ], ['状态', '含义']));
      body.appendChild(note('这两个必须分开：真没吃要提醒你补蛋白、别拖到中午暴食；忘了记只是数据缺失。混在一起 AI 只能瞎猜。', 'ok'));
      body.appendChild(p('标错了点「撤销」就恢复。同一天有几餐标了没吃，今日页会提示一句。'));

      body.appendChild(U.el('div', { class: 'section-label', text: '记作息' }));
      body.appendChild(p('点「记睡眠」→ 填入睡和起床时间 → 自动算时长。页面上有体重、睡眠、热量的趋势曲线。'));

      body.appendChild(U.el('div', { class: 'section-label', text: '让 AI 评价这一天' }));
      body.appendChild(p('点「📮 发给 AI 评价这一天」（需要配 API Key）。AI 会指出具体问题，比如纤维不够、睡眠不足、脂肪占比偏高。'));
      body.appendChild(note('要先在设置里填「当前体重」和「每日热量目标」，AI 才能判断你吃多了还是少了。', 'info'));
      body.appendChild(U.el('div', { class: 'row', style: { gap: '8px', marginTop: '4px' } }, [
        U.el('button', {
          class: 'btn grow sm', text: '去「饮食」页',
          onclick: () => App.go('body')
        })
      ]));
    }));

    /* ═══ 7. 账本 ═══ */
    root.appendChild(section('money', '账本：导入账单（三种方式）', null, body => {
      body.appendChild(note('微信不允许别的 App 直接读它的账单（数据库是加密的），所以拿数据必须绕一下。下面三种，越靠前越省事。', 'warn'));

      body.appendChild(U.el('div', { class: 'section-label', text: '三种方式，选一个' }));
      body.appendChild(table([
        ['📷 截图识别', '账单页截图，一次最多选 5 张，AI 读出交易', '最快，花一点 token'],
        ['📋 粘贴文字', '账单页长按全选复制，粘进来', '不花 token'],
        ['📄 CSV 文件', '官方导出的完整月度账单', '最全，但要走邮箱']
      ], ['方式', '怎么做', '特点']));
      body.appendChild(note('截图识别的局限：微信账单页是分页加载的，一屏 8~10 条。所以要往下翻、一屏一屏截，再**一次选最多 5 张**一起识别。要整月完整数据还是走 CSV。', 'info'));

      body.appendChild(U.el('div', { class: 'section-label', text: '导入记录：别再忘记上次截到哪儿' }));
      body.appendChild(p('截图导入是「一屏一屏」导的，隔几天再截，很容易忘记上次截到哪里，结果要么漏一段、要么重复截。所以每次导入都会自动留一条记录。'));
      body.appendChild(table([
        ['**导入时间**', '精确到分钟，如「今天 14:05」'],
        ['**导了什么**', '走哪条路、几笔、几张图'],
        ['**覆盖范围**', '这批流水里最早 ~ 最晚的日期'],
        ['**已覆盖到**', '所有记录里最新的那个日期']
      ], ['记录了什么', '说明']));
      body.appendChild(p('在「导入账单」第一屏最下面就有一张**📌 导入记录**卡片。点「截图识别」进去时，它还会直接告诉你「账目已经覆盖到 X 月 X 日，这次只截这之后的部分就行」。'));
      body.appendChild(note('最多保留最近 50 次导入记录，不会越滚越大。', 'info'));

      body.appendChild(U.el('div', { class: 'section-label', text: '方式一：截图识别（推荐）' }));
      body.appendChild(steps([
        '微信 → 我 → 服务 → 钱包 → 账单',
        '在账单页截图（音量下 + 电源），需要几屏就截几张',
        '回 LifeHub →「账本」→「导入账单」→「截图识别」',
        '一次选最多 5 张（多选），等 10~30 秒 × 张数',
        '确认预览，点导入。重复的会自动跳过'
      ]));
      body.appendChild(note('截图前把这一屏的金额都拍全，别让最后一条被截断。一张识别失败不会影响其它几张，剩下的照样入库。', 'ok'));

      body.appendChild(U.el('div', { class: 'section-label', text: '方式二：粘贴文字' }));
      body.appendChild(steps([
        '在账单页长按 → 全选 → 复制',
        '回 LifeHub →「导入账单」→「粘贴文字」',
        '粘贴（或点「从剪贴板粘贴」）→ 点「解析」'
      ]));
      body.appendChild(p('这种方式在你的手机上本地解析，不联网、不花 token。'));

      body.appendChild(U.el('div', { class: 'section-label', text: '方式三：CSV（完整月度数据）' }));
      body.appendChild(steps([
        '微信 → 我 → 服务 → 钱包 → 账单',
        '右上角「常见问题」→「下载账单」',
        '选「用于个人对账」',
        '选时间范围（比如上个月）→ 填邮箱',
        '邮箱收到 CSV 文件，传到手机，导入'
      ]));

      body.appendChild(U.el('div', { class: 'section-label', text: '导入后' }));
      body.appendChild(table([
        ['自动分类', '餐饮 / 交通 / 数码 / 运动 / 人情 等'],
        ['每笔可改', '点任意一笔，改分类和「用途」'],
        ['用途', '比分类细一层：分类管「算哪一类」，用途管「干什么用的」'],
        ['环形图', '看各类支出占比'],
        ['结余', '自动算收入和支出差额']
      ], ['功能', '说明']));
      body.appendChild(note('三种方式的分类和规则口径完全一致，重复导入同一笔也会自动跳过，不会记两遍。', 'ok'));

      body.appendChild(U.el('div', { class: 'section-label', text: '让下次导入自动分好（重点）' }));
      body.appendChild(p('改完一笔账，勾上「记住这条规则」，系统就记住「含某关键词的某方向账目 = 某分类」。下次导入同样的人，自动分好，不用再手动改。'));
      body.appendChild(table([
        ['关键词', '对方名字或商户名，如 张三、美团'],
        ['流向', '收入 / 支出 / 双向 —— 同一个人两个方向可以设两条规则'],
        ['分类', '自动归到哪一类'],
        ['用途', '可选，跟着规则一起记住']
      ], ['字段', '含义']));
      body.appendChild(note('流向是分开的：「张三转给我 = 生活费」和「我转给张三 = 其他」互不干扰。这正是最容易搞错的地方。', 'ok'));

      body.appendChild(U.el('div', { class: 'section-label', text: '例子' }));
      body.appendChild(steps([
        '导入后，找到「张三 收入 2000」这一笔',
        '点开，分类改成「生活费」，用途填「每月家用」',
        '勾上「记住这条规则」（默认就是勾上的）',
        '保存 → 规则列表里出现「张三 · 收入 → 生活费」',
        '下个月导入，凡是张三转进来的，自动就是生活费'
      ]));
      body.appendChild(note('规则可以随时在「账本 → 分类规则」里改、删，或点「回填」套用到已有记录上。', 'info'));

      body.appendChild(U.el('div', { class: 'section-label', text: '一次改很多笔' }));
      body.appendChild(p('刚导入时往往有几十笔没归类。点「批量整理」→ 勾选要改的 → 统一设分类和用途 → 应用。同一对方的会自动生成规则。'));

      body.appendChild(U.el('div', { class: 'section-label', text: '每月收入怎么算' }));
      body.appendChild(p('账本里的收入是**按账单实际算的**，设置里填的那个数只当参考值，不会覆盖真实收入。'));
      body.appendChild(note('**收入和支出用同一个统计窗口**：上月最后一天 ~ 本月倒数第二天。比如 10 月 = 9/30 ~ 10/30。因为你家里是月底先打一笔、月中再打一笔，按自然月算 9/30 那笔会漏在外头；支出跟着同一个范围走，两边才对得上账。设置里关掉「收支按错位窗口统计」就是自然月 10/1 ~ 10/31。', 'info'));
      body.appendChild(p('凡是金额等于「生活费金额」（默认 750，给 0.5 元容差）的收入，都算固定生活费；其余算额外收入。两笔都计入总收入。'));
    }));

    /* ═══ 8. 回顾 ═══ */
    root.appendChild(section('history', '回顾：周 / 月 / 年的历史', null, body => {
      body.appendChild(p('「回顾」页把过去的数据汇总起来，看趋势，不记新东西。顶部三档：**周**、**月**、**年**。'));

      body.appendChild(U.el('div', { class: 'section-label', text: '怎么翻' }));
      body.appendChild(table([
        ['**‹ ›**', '往前 / 往后翻一期'],
        ['**回到本期**', '翻到过去之后会出现，点一下回到现在'],
        ['**周 / 月 / 年**', '切换粒度，切完自动回到本期']
      ], ['操作', '效果']));

      body.appendChild(U.el('div', { class: 'section-label', text: '健康度是什么意思' }));
      body.appendChild(p('作息分和饮食分各占一半，合成一个 0~100 的健康度。'));
      body.appendChild(table([
        ['作息分', '睡眠时长 50%（7~8.5 小时最好）+ 入睡规律性 30% + 睡眠质量 20%'],
        ['饮食分', '热量达标 30% + 蛋白充足 25% + 结构均衡 15% + **记录坚持度 30%**']
      ], ['项目', '怎么算']));

      body.appendChild(note('分数旁边一定会写「记录覆盖率」。只记了 1 天也会算出分数，但覆盖率会明明白白写着 14% —— 别把这种分数当真。覆盖率低于 40% 还会弹一条黄色提醒。', 'warn'));

      body.appendChild(U.el('div', { class: 'section-label', text: '每一块看什么' }));
      body.appendChild(table([
        ['健康度', '总分 + 作息/饮食分 + 覆盖率'],
        ['和上期比', '这一期和上一期差多少，涨了绿、跌了红（支出和体重反过来，降了才是好）'],
        ['作息', '平均时长、平均入睡时间、规律性（入睡时间的标准差）、质量、晚睡天数'],
        ['饮食', '日均热量/蛋白/脂肪碳水、三大营养素供能比、记录天数、标「没吃」的次数'],
        ['体重', '区间内的变化、最低最高、称了几次'],
        ['账本', '收入/支出/结余、日均支出、支出分类、花钱最多的对方'],
        ['长期任务', '**只统计长期任务**，有截止日的任务不进来'],
        ['趋势', '最近 8 期的支出柱状图 + 健康度折线']
      ], ['板块', '内容']));

      body.appendChild(U.el('div', { class: 'section-label', text: '长期任务为什么单独一块' }));
      body.appendChild(p('有截止日的任务做完就从列表上消失了，回顾它没意义。长期任务不一样 —— 它一直在那儿，所以回顾时看的是：这期完成了几个、新加了几个、**哪些挂了一个月还没动**。'));
      body.appendChild(note('「挂了很久没动的」会按时间从久到近列出来。看到一堆挂着的，要么安排上，要么删掉——一直搁着只会让列表越来越沉。', 'info'));

      body.appendChild(U.el('div', { class: 'row', style: { gap: '8px', marginTop: '4px' } }, [
        U.el('button', {
          class: 'btn grow sm', text: '去看看回顾',
          onclick: () => App.go('history')
        })
      ]));
    }));

    /* ═══ 9. 学习蓝图 ═══ */
    root.appendChild(section('blueprint', '学习蓝图', null, body => {
      body.appendChild(p('展示 CV / 具身智能方向的学习路线，对齐 Obsidian 里的规划：当前阶段、进度环、四个优先级层次。'));
      body.appendChild(note('标 🔴 的是远期内容，不用现在学。', 'info'));
      body.appendChild(U.el('div', { class: 'row', style: { gap: '8px', marginTop: '4px' } }, [
        U.el('button', {
          class: 'btn grow sm', text: '看学习蓝图',
          onclick: () => App.go('learn')
        })
      ]));
    }));

    /* ═══ 10. AI 配置 ═══ */
    root.appendChild(section('ai', 'AI 功能怎么开', null, body => {
      body.appendChild(p('AI 是可选的。不配也能用全部核心功能（日程、导入、记账、饮食记录）。配了之后多出：饮食健康评价、课表图片识别、AI 生成计划。'));

      body.appendChild(U.el('div', { class: 'section-label', text: '申请 Key' }));
      body.appendChild(steps([
        '打开 bailian.console.aliyun.com/?apiKey=1',
        '注册/登录阿里云账号',
        '创建一个 API Key（个人用花不到几块钱）',
        '复制那串 sk-xxxxx'
      ]));

      body.appendChild(U.el('div', { class: 'section-label', text: '填入设置' }));
      body.appendChild(table([
        ['接口地址', 'https://dashscope.aliyuncs.com/compatible-mode/v1'],
        ['模型', 'qwen-plus'],
        ['视觉模型', 'qwen-vl-max']
      ], ['项', '值']));
      body.appendChild(p('填完点「测试连接」确认能通。'));
      body.appendChild(note('Key 只存在手机本地（浏览器 localStorage），不会上传到任何服务器。', 'ok'));

      body.appendChild(U.el('div', { class: 'section-label', text: '哪些功能用 AI，哪些不用' }));
      body.appendChild(table([
        ['用 AI', '食物查询、拍照识别食物、账单截图识别、评价饮食、评价日程、分析消费、学习规划建议、群消息解析、课表截图识别'],
        ['不用 AI', '任务增删改查、提醒、日历导出、营养计算、账本自动分类、图表统计、结余计算']
      ], ['类别', '功能']));
      body.appendChild(note('账本的自动分类是本地规则引擎，不花 token。营养计算查本地食物库，也不花。', 'ok'));

      body.appendChild(U.el('div', { class: 'section-label', text: '一个月大概花多少' }));
      body.appendChild(p('按「每天记饮食 + 偶尔拍照 + 每周评价几次」估，一个月约 9 万输入 token、5 万输出 token。'));
      body.appendChild(table([
        ['食物文本查询', '约 40 次/月'],
        ['拍照识别', '约 13 次/月'],
        ['评价饮食', '约 30 次/月'],
        ['评价日程', '约 8 次/月'],
        ['分析消费', '约 4 次/月'],
        ['群消息解析', '约 20 次/月']
      ], ['功能', '次数']));
      body.appendChild(note('具体多少钱取决于你用的模型单价。按常见的每百万 token「输入 ¥1 / 输出 ¥4」算，一个月约 ¥0.28。就算单价翻四倍也才一块多。', 'ok'));
      body.appendChild(note('省 token 的关键：AI 查过的食物会存进本地库，同一道菜第二次是免费命中。第一个月最贵，之后越来越便宜。', 'info'));

      /* 代填提示——只在还没填时显示 */
      const todo = (typeof S.pendingList === 'function') ? S.pendingList() : [];
      if (todo.length) {
        body.appendChild(note('现在设置里有 ' + todo.length + ' 项是「代填值」（占位用的假值），功能能跑但结果不准。设置页顶部有橙色提示告诉你哪些要换。', 'warn'));
        body.appendChild(U.el('div', { class: 'row', style: { gap: '8px', marginTop: '4px' } }, [
          U.el('button', {
            class: 'btn grow sm', text: '去设置填',
            onclick: () => App.openSettings()
          })
        ]));
      }
    }));

    /* ═══ 11. 数据安全 ═══ */
    root.appendChild(section('data', '数据备份与安全', null, body => {
      body.appendChild(U.el('div', { class: 'section-label', text: '数据存在哪' }));
      body.appendChild(p('全部存在手机浏览器本地，不上传云端，别人看不到。'));

      body.appendChild(U.el('div', { class: 'section-label', text: '一定要备份的时候' }));
      body.appendChild(table([
        ['换手机之前', '导出备份，新手机导入'],
        ['清理浏览器数据之前', '⚠️ 会连 App 数据一起清掉'],
        ['重装浏览器之前', '同上']
      ], ['场景', '做什么']));

      body.appendChild(note('清理浏览器数据会把 LifeHub 的数据一起清掉，别随手清。', 'warn'));

      body.appendChild(U.el('div', { class: 'section-label', text: '备份 / 恢复' }));
      body.appendChild(steps([
        '设置 → 导出备份 → 下载一个 JSON 文件，保存好',
        '换手机：新手机打开同一个网址 → 设置 → 导入备份 → 选那个文件',
        '平时恢复：设置 → 导入备份 → 选那个文件（合并进去，不覆盖）',
        '备份文件里含你的 AI API Key，别随便发给别人'
      ]));
      body.appendChild(U.el('div', { class: 'row', style: { gap: '8px', marginTop: '4px' } }, [
        U.el('button', {
          class: 'btn grow sm', text: '打开设置',
          onclick: () => App.openSettings()
        })
      ]));
    }));

    /* ═══ 12. 常见问题 ═══ */
    root.appendChild(section('faq', '常见问题', null, body => {
      const qa = [
        ['打不开网址？', '检查网络。刚部署完 GitHub 可能要等 1-2 分钟。'],
        ['添加到桌面后图标是白底？', '小米有时缓存旧图标。删掉桌面图标，重新添加。'],
        ['提醒没响？', '确认两件事：(1) 导出了 .ics (2) 用小米日历打开并导入了。只导出不导入不会响。'],
        ['导出日历后重复提醒？', '因为导入多次了。建一个单独的「LifeHub」日历，重导前先整个删掉。'],
        ['长期栏的任务怎么变普通任务？', '点它 → 编辑 → 加个截止时间或开始时间，自动变成普通任务。'],
        ['误标成「日常」了？', '再点一下「设为日常」就取消了。'],
        ['导入时一段话被拆错了？', '目前按行和关键词拆。可以在消息里换行分隔，或导入后手动编辑。'],
        ['任务排到我有课的时间了？', '检查是否导入了课表（导入页会显示「已避开你的上课时间」）。'],
        ['AI 报错？', '检查设置里的 API Key、接口地址、模型名。报错信息会显示具体原因。'],
        ['课表识别不准？', '截图尽量清晰、正面、别倾斜。识别结果先看一眼再保存。'],
        ['忘了吃早饭怎么记？', '在早餐卡片点「没吃」。别留空——空着 AI 不知道你是没吃还是忘了记。'],
        ['账本为什么有的没自动分类？', '规则没覆盖到。点那一笔改分类，勾上「记住这条规则」，下次就自动了。'],
        ['同一个人转进转出怎么分？', '规则带流向：「张三·收入」和「张三·支出」是两条独立规则，互不干扰。'],
        ['改错了规则怎么办？', '账本 → 分类规则 → 点那条规则可以改或删。点「回填」能把已有记录重刷一遍。'],
        ['食物库里没有我吃的东西？', '点「🤖 用 AI 查」，任意食物都能查。查过的会自动记住，下次直接搜到。'],
        ['拍照识别准吗？', '份量是估算，误差大概两三成。把整盘菜拍全、有筷子或手当参照会更准，加完可以自己改克数。'],
        ['AI 会花很多钱吗？', '一个月约 9 万输入 + 5 万输出 token，按常见单价不到五毛。而且本地库会越用越全，之后更便宜。'],
        ['账单为什么不能自动读？', '微信账单数据库是加密的，安卓也不让第三方 App 读它。剪贴板倒是能读，但需要你先复制一次——这是浏览器的安全限制，只有做成原生安卓 App 才能免掉。'],
        ['截图识别能读一整个月吗？', '不能。账单页分页加载，一屏 8~10 条。要整月完整数据请用 CSV，截图适合「这个月随手补几笔」。'],
        ['粘贴账单文字会不会重复记账？', '不会。三种导入方式用同一套去重，同一笔（同日期+金额+对方）只会进一次。'],
        ['回顾的入口在哪？底栏怎么没有？', '在**右上角的柱状图图标**（📊，问号左边）。它以前是底栏第 6 个 tab，但底栏塞 6 个会换行被裁掉，所以挪到顶栏了。'],
        ['一次能导入几张账单截图？', '最多 5 张，一次选好一起识别。超过 5 张的部分会被忽略，再导一次就行。单张识别失败不影响其它几张。'],
        ['怎么知道上次账单截到哪儿了？', '「导入账单」第一屏最下面有张「📌 导入记录」卡片，写着每次导入的时间（精确到分钟）和覆盖到的日期。点「截图识别」进去还会直接提示这次该从哪儿往上截。'],
        ['回顾里的健康度才 60 分，是不是很差？', '先看旁边的「记录覆盖率」。只记了几天的话，分数基本没有参考价值，先把记录习惯养起来。'],
        ['回顾里怎么找不到我有截止日的任务？', '这是故意的。有截止日的任务做完就消失了，回顾它没意义，所以那一块只统计长期任务。'],
        ['回顾的收入和账本页对不上？', '账本页和回顾用的是同一个窗口（上月最后一天 ~ 本月倒数第二天），所以对得上。唯一例外是**周/年**粒度：错位规则只用在「月」上，周和年按自然区间走。'],
        ['为什么一个任务在日历里有两条？', '一条是 **⚠️ 明天截止：xxx**，截止前一天 18:00 会响；另一条是**截止日当天**的展示条目，只占一格告诉你这天要交什么，**没有闹钟、不会响**。要删就删后者。'],
        ['导出的 .ics 用日历打开说「没有可导入的文件」？', '按顺序排查：① **先试导出面板里的「📤 分享到日历 / 文件」按钮**——添加到主屏幕后，「下载再导入」这条路在小米上经常走不通（文件被存到应用私有目录或存成 0 字节，日历看不到），分享面板是原生能力，可以直接分享到日历；② **确认不是空日历**——只有「有截止日的任务」和「标为日常的活动」会写进去，长期任务不导出；③ 文件管理 → Download → 长按 .ics → 打开方式 → 日历；④ 还不行就在电脑上用 Google 日历导入。'],
        ['换手机怎么办？', '**新手机打开同一个网址 → 设置 → 导入备份 → 选你导出的那个 JSON 文件。** 数据只在这台设备的浏览器里，没有云端同步，所以旧手机一定要先「导出备份」。备份文件含你的 AI API Key，别随便发给别人。'],
        ['导出备份之后怎么恢复？', '设置 → **导入备份** → 选那个 JSON 文件。内容是**合并**进去的，相同记录不会重复，不会覆盖你现在的数据。旧版本导出、带隐形字节的备份也能读。'],
        ['手机上怎么看不到刚改的东西？', '装到桌面后浏览器会缓存网页，新版本不会自己出现。先**下拉刷新**；还不行就去**设置 → 版本与更新 → 点「🔄 检查更新」**，它会清掉旧缓存重新拉最新版。数据不在缓存里，不会丢。'],
        ['账本记错了一笔怎么删？', '三种都行：①点开那一笔，底部的「删除」永远贴着屏幕底，不用滑；②长按进入不了？用「批量整理」勾选多笔后点「删除 N 笔」；③整批导错了（比如截图识别歪了），去「导入账单 → 导入记录」点那次的「撤销」，这批会一起删掉，不用一笔一笔来。']
      ];
      qa.forEach(([q, a], i) => {
        body.appendChild(U.el('div', {
          style: { padding: '9px 0', borderTop: i ? '1px solid var(--border)' : 'none' }
        }, [
          U.el('div', {
            style: { fontSize: '13px', fontWeight: '600', marginBottom: '4px', lineHeight: '1.55' },
            text: 'Q：' + q
          }),
          U.el('div', {
            style: { fontSize: '12.5px', color: 'var(--text-dim)', lineHeight: '1.7' },
            /* 跟 p()/table() 一样走 mdInline，否则 **粗体** 会原样显示成星号 */
            html: mdInline('A：' + a)
          })
        ]));
      });
    }));

    /* ═══ 13. 技术细节（折叠，默认不开） ═══ */
    root.appendChild(section('tech', '技术细节（不看也行）', null, body => {
      body.appendChild(table([
        ['形态', '纯静态网页（PWA），无后端、无数据库'],
        ['数据', '存在浏览器 localStorage'],
        ['离线', 'Service Worker 缓存，断网也能用'],
        ['托管', 'GitHub Pages，免费'],
        ['AI', '浏览器直连阿里云百炼，不经过中间服务器'],
        ['提醒', '通过 .ics 文件导入系统日历实现']
      ], ['项', '说明']));
    }));

    /* ───── 底部 ───── */
    root.appendChild(U.el('div', {
      style: {
        textAlign: 'center', fontSize: '11.5px', color: 'var(--text-faint)',
        padding: '18px 0 26px', lineHeight: '1.8'
      }
    }, [
      U.el('div', { text: 'LifeHub · 个人学习生活管理' }),
      U.el('div', { text: '还有问题？直接问我' })
    ]));
  };
})(window);