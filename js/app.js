/* ═══════════════════════════════════════════════
   app.js — 应用外壳：路由、浮层、设置、通用 UI
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const App = {};

  const VIEWS = {
    today:  { title: '今日',     sub: () => U.friendly(U.today()) + ' · ' + U.dowName(U.today()), render: () => Views.today() },
    plan:   { title: '计划',     sub: () => '日程 · 待办 · 学习规划',                                render: () => Views.plan() },
    import: { title: '一键导入', sub: () => '粘贴文本，自动归档',                                    render: () => Views.importv() },
    body:   { title: '饮食作息', sub: () => '记录与健康评估',                                        render: () => Views.body() },
    money:  { title: '账本',     sub: () => '收支统计与储蓄',                                        render: () => Views.money() },
    history: { title: '回顾',    sub: () => '周 / 月 / 年 · 历史与健康趋势',                          render: () => Views.history() },
    learn:  { title: '学习蓝图', sub: () => '计算机视觉 · 具身智能',                                  render: () => Views.learn() },
    help:   { title: '操作手册', sub: () => '怎么用 · 常见问题',                                      render: () => Views.help() },
    /* 隐藏模块：不在底部导航里，靠长按「今天」进入。
       tab:'today' 是让底部「今天」保持高亮 —— 否则所有标签都会失去选中态，
       看起来像界面坏了。 */
    diary:  { title: '日记',     sub: () => '只有你能看到',                                          render: () => Views.diary(), tab: 'today' }
  };

  App.current = 'today';
  App.state = {};      // 视图临时状态（日历选中日期、账本月份等）

  /* ───────── 路由 ───────── */
  App.go = function (viewId, opts = {}) {
    if (!VIEWS[viewId]) return;
    App.current = viewId;
    const v = VIEWS[viewId];

    if (!opts.keepScroll) {
      const vp = U.$('#viewport');
      if (vp) vp.scrollTop = 0;
    }

    U.$$('.view').forEach(el => el.classList.remove('active'));
    const el = U.$('#view-' + viewId);
    if (el) {
      el.innerHTML = '';
      el.classList.add('active');      // ← 必须加回来，否则 CSS 的 .view{display:none} 会藏掉整页
    }

    U.$('#pageTitle').textContent = typeof v.title === 'function' ? v.title() : v.title;
    U.$('#pageSub').textContent = typeof v.sub === 'function' ? v.sub() : v.sub;

    const tabFor = v.tab || viewId;
    U.$$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === tabFor));

    try {
      v.render();
    } catch (e) {
      console.error('[render]', viewId, e);
      if (el) el.appendChild(U.el('div', { class: 'empty' }, [
        U.el('p', { text: '页面渲染出错：' + e.message })
      ]));
    }
  };

  App.refresh = function () { App.go(App.current, { keepScroll: true }); };

  /* ───────── 浮层 ───────── */
  let sheetOnClose = null;

  App.sheet = function (title, contentNodes, opts = {}) {
    const sheet = U.$('#sheet'), scrim = U.$('#scrim'), body = U.$('#sheetBody');
    U.$('#sheetTitle').textContent = title;
    body.innerHTML = '';
    (Array.isArray(contentNodes) ? contentNodes : [contentNodes]).forEach(n => n && body.appendChild(n));

    /* 固定底栏：长表单里的「删除 / 保存」原来在滚动区最底下，
       手机上要滑三屏才看得到，用户会以为根本没有删除。
       放进 .sheet-foot 就永远贴在底部、不跟着滚。 */
    const oldFoot = sheet.querySelector('.sheet-foot');
    if (oldFoot) oldFoot.remove();
    if (opts.footer) {
      sheet.appendChild(U.el('div', { class: 'sheet-foot' },
        Array.isArray(opts.footer) ? opts.footer : [opts.footer]));
    }

    sheet.hidden = false; scrim.hidden = false;
    document.body.style.overflow = 'hidden';
    sheetOnClose = opts.onClose || null;
    // 自动聚焦第一个输入框（延迟，等动画结束）
    if (opts.autofocus !== false) {
      setTimeout(() => {
        const inp = body.querySelector('input:not([type=hidden]),textarea');
        if (inp && window.innerWidth > 400) inp.focus();
      }, 320);
    }
  };

  App.closeSheet = function () {
    const sheet = U.$('#sheet'), scrim = U.$('#scrim');
    sheet.hidden = true; scrim.hidden = true;
    document.body.style.overflow = '';
    if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; try { f(); } catch (e) {} }
  };

  App.confirm = function (message, onYes, yesLabel = '确定') {
    const box = U.el('div', {}, [
      U.el('p', { text: message, style: { marginTop: 0, fontSize: '14.5px', lineHeight: '1.65' } }),
      U.el('div', { class: 'row', style: { marginTop: '18px' } }, [
        U.el('button', { class: 'btn ghost grow', onclick: () => App.closeSheet(), text: '取消' }),
        U.el('button', { class: 'btn danger grow', text: yesLabel, onclick: () => { App.closeSheet(); onYes(); } })
      ])
    ]);
    App.sheet('请确认', box, { autofocus: false });
  };

  /* ───────── 通用小组件 ───────── */

  /** 分类标签 */
  App.catBadge = function (catId) {
    const c = S.CATS[catId] || S.CATS.life;
    return U.el('span', { class: 'badge ' + c.id, text: c.short });
  };

  /** 空状态 */
  App.empty = function (text, sub) {
    return U.el('div', { class: 'empty' }, [
      U.svg(['M4 7a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2z', 'M8 10h8M8 14h5'], { sw: '1.6' }),
      U.el('p', { text }),
      sub ? U.el('p', { text: sub, style: { fontSize: '12px', marginTop: '6px', opacity: '.8' } }) : null
    ]);
  };

  /** 环形进度 */
  App.ring = function (pct, size, color, centerMain, centerSub) {
    const r = (size - 10) / 2;
    const circ = 2 * Math.PI * r;
    const off = circ * (1 - U.clamp(pct, 0, 100) / 100);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', size); svg.setAttribute('height', size);
    [['ring-bg', circ, 0], ['ring-fg', circ, off]].forEach(([cls, dash, o]) => {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', size / 2); c.setAttribute('cy', size / 2); c.setAttribute('r', r);
      c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', '6');
      c.setAttribute('stroke-dasharray', dash);
      c.setAttribute('stroke-dashoffset', o);
      c.setAttribute('class', cls);
      if (cls === 'ring-fg' && color) c.style.stroke = color;
      svg.appendChild(c);
    });
    return U.el('div', { class: 'ring', style: { width: size + 'px', height: size + 'px' } }, [
      svg,
      U.el('div', { class: 'ring-text' }, [
        U.el('div', { class: 'ring-num', text: centerMain != null ? centerMain : Math.round(pct) + '%' }),
        centerSub ? U.el('div', { class: 'ring-label', text: centerSub }) : null
      ])
    ]);
  };

  /** 进度条行 */
  App.barRow = function (label, value, max, color, valueText) {
    const pct = max > 0 ? U.clamp(value / max * 100, 0, 100) : 0;
    const fill = U.el('div', { class: 'bar-fill', style: { width: pct + '%' } });
    if (color) fill.style.background = color;
    return U.el('div', { class: 'bar-row' }, [
      U.el('div', { class: 'bar-label', text: label, style: { minWidth: '72px' } }),
      U.el('div', { class: 'bar' }, [fill]),
      U.el('div', { class: 'bar-val', text: valueText != null ? valueText : `${U.round(value, 1)}/${max}` })
    ]);
  };

  /** 统计格 */
  App.stat = function (label, value, unit, sub) {
    return U.el('div', { class: 'stat' }, [
      U.el('div', { class: 'stat-label', text: label }),
      U.el('div', { class: 'stat-value' }, [
        String(value),
        unit ? U.el('small', { text: unit }) : null
      ]),
      sub ? U.el('div', { class: 'stat-sub', text: sub }) : null
    ]);
  };

  /** 分段控制器 */
  App.seg = function (options, current, onChange) {
    const box = U.el('div', { class: 'seg' });
    options.forEach(o => {
      const b = U.el('button', {
        class: o.value === current ? 'active' : '',
        text: o.label,
        onclick: () => { if (o.value !== current) onChange(o.value); }
      });
      box.appendChild(b);
    });
    return box;
  };

  /** chip 选择行 */
  App.chips = function (options, current, onChange, opts = {}) {
    const row = U.el('div', { class: 'chip-row' });
    options.forEach(o => {
      row.appendChild(U.el('button', {
        class: 'chip' + (String(o.value) === String(current) ? ' active' : ''),
        text: o.label,
        onclick: () => onChange(o.value)
      }));
    });
    return row;
  };

  /* ───────── 设置面板 ───────── */
  App.openSettings = function () {
    const st = S.settings;
    const body = [];

    /* ───── 待填配置提示：让用户一眼看到还有哪些是代填的 ───── */
    (function () {
      const todo = S.pendingList();
      if (!todo.length) {
        body.push(U.el('div', {
          class: 'card tight',
          style: {
            marginBottom: '14px', fontSize: '12.5px', color: 'var(--ok)',
            display: 'flex', alignItems: 'center', gap: '8px'
          }
        }, [
          U.svg('M20 6L9 17l-5-5', { sw: '3' }),
          U.el('span', { text: '所有配置都已填好' })
        ]));
        return;
      }
      body.push(U.el('div', {
        class: 'card tight',
        style: {
          marginBottom: '14px', borderLeft: '3px solid var(--warn)',
          background: 'var(--warn-bg, rgba(245,158,11,.08))'
        }
      }, [
        U.el('div', {
          style: { fontWeight: '600', fontSize: '13.5px', marginBottom: '6px', color: 'var(--warn)' },
          text: `还有 ${todo.length} 项是代填的，需要你确认`
        }),
        U.el('div', {
          style: { fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.7' },
          text: '下面这些项现在用的是占位值，功能能跑但结果不准。填上真实值后这条提示会自动消失。'
        }),
        U.el('div', { style: { marginTop: '8px' } }, todo.map(it =>
          U.el('div', {
            style: {
              fontSize: '12px', color: 'var(--text-dim)', padding: '5px 0',
              borderTop: '1px solid var(--line)', display: 'flex',
              justifyContent: 'space-between', gap: '8px'
            }
          }, [
            U.el('div', {}, [
              U.el('div', { style: { color: 'var(--text)', fontWeight: '500' }, text: it.label }),
              U.el('div', { style: { fontSize: '11px', marginTop: '2px' }, text: it.hint })
            ]),
            U.el('button', {
              class: 'btn ghost sm', style: { flexShrink: '0', alignSelf: 'center' },
              text: '去填',
              onclick: () => {
                /* 滚到对应区域比什么都不做有用 */
                U.toast(it.where, 'ok');
              }
            })
          ])
        ))
      ]));
    })();

    /* 个人 / 减脂 */
    body.push(U.el('div', { class: 'section-label', text: '身体与减脂目标' }));
    const b = st.body;
    body.push(field('当前体重 (kg)', input('number', b.weight, v => { b.weight = v === '' ? null : Number(v); }, '65.5')));
    body.push(field('目标体重 (kg)', input('number', b.targetWeight, v => { b.targetWeight = v === '' ? null : Number(v); }, '58')));
    body.push(field('每日热量目标 (kcal)', input('number', b.dailyKcal, v => { b.dailyKcal = v === '' ? null : Number(v); }, '1800')));
    body.push(field('每日蛋白目标 (g)', input('number', b.proteinTarget, v => { b.proteinTarget = v === '' ? null : Number(v); }, '120')));
    body.push(U.el('p', {
      class: 'hint',
      style: { fontSize: '12px', color: 'var(--text-dim)', margin: '-6px 0 14px' },
      text: '留空则早报只报事实、不做评价。设了目标才能判断摄入是否达标。'
    }));
    body.push(field('目标睡眠时长 (小时)', input('number', b.sleepTarget, v => { b.sleepTarget = Number(v) || 7.5; }, '7.5', '0.5')));

    /* 财务 */
    body.push(U.el('div', { class: 'section-label', text: '财务' }));
    const m = st.money;
    body.push(field('每月生活费总额 (元)', input('number', m.monthlyIncome, v => { m.monthlyIncome = v === '' ? null : Number(v); }, '1500'),
      '家里每月给的定额。只用来提示「收齐了吗」，不算进总收入'));
    body.push(field('单笔固定生活费 (元)', input('number', m.stipendAmount, v => { m.stipendAmount = v === '' ? null : Number(v); }, '750'),
      '金额等于这个数的收入算固定生活费（比如 1500 分两次各 750）'));
    body.push(field('金额容差 (元)', input('number', m.stipendTolerance, v => { m.stipendTolerance = v === '' ? 0.5 : Number(v); }, '0.5', '0.1'),
      '防止手续费或浮点误差导致认不出来'));
    body.push(field('收支按错位窗口统计', checkbox(m.incomeWindowShift !== false, v => { m.incomeWindowShift = v; }),
      '开启后 10 月 = 9/30 ~ 10/30，收入和支出都按这个范围算（生活费常在上月底提前到账）。关掉就是自然月 10/1 ~ 10/31'));
    body.push(field('每月预算 (元)', input('number', m.monthlyBudget, v => { m.monthlyBudget = v === '' ? null : Number(v); }, '2500')));
    body.push(field('每月储蓄目标 (元)', input('number', m.savingGoal, v => { m.savingGoal = v === '' ? null : Number(v); }, '500')));

    /* 提醒 */
    body.push(U.el('div', { class: 'section-label', text: '提醒设置' }));
    const r = st.remind;
    body.push(field('每日检查时间（几点提醒未完成）', input('time', `${U.pad(r.eveningHour)}:${U.pad(r.eveningMinute)}`, v => {
      const [h, mi] = String(v).split(':');
      r.eveningHour = Number(h) || 18; r.eveningMinute = Number(mi) || 0;
    })));
    /* 第二次提醒（日常任务）。默认 22:30。
       留空 = 不要第二次，退回「一天只提醒一次」的老行为。
       用 null 而不是 00:00 表示「没有」—— 00:00 是个合法时刻，不能拿来当空值。 */
    body.push(field('睡前再提醒一次（留空则只提醒一次）',
      input('time', r.nightHour == null ? '' : `${U.pad(r.nightHour)}:${U.pad(r.nightMinute)}`, v => {
        if (!v) { r.nightHour = null; r.nightMinute = null; return; }
        const [h, mi] = String(v).split(':');
        r.nightHour = Number(h) || 0; r.nightMinute = Number(mi) || 0;
      }),
      `日常活动每天提醒两次（${ICS.dailyTimesText()}）。只影响「日常活动」，不影响截止提醒`));
    body.push(field('长任务提前几天提醒', input('number', r.deadlineLeadDays, v => { r.deadlineLeadDays = Number(v) || 1; }, '1', '1')));
    body.push(field('日历导出覆盖未来天数', input('number', r.lookaheadDays, v => { r.lookaheadDays = Number(v) || 30; }, '30', '5')));

    /* AI */
    body.push(U.el('div', { class: 'section-label', text: 'AI 助手' }));
    const a = st.ai;
    const presetOpts = Object.keys(AI.PRESETS).map(k => ({ value: k, label: AI.PRESETS[k].name }));
    body.push(field('服务商', selectEl(presetOpts, a.provider, v => {
      a.provider = v;
      const p = AI.PRESETS[v];
      if (p && p.baseURL) { a.baseURL = p.baseURL; a.model = p.models[0] || a.model; }
      App.openSettings();     // 重建面板以刷新字段
    })));

    body.push(field('接口地址 (Base URL)', input('text', a.baseURL, v => { a.baseURL = v.trim(); }, 'https://.../v1')));
    /* API Key 用「代填」值预置：功能能跑、界面能演示，
       但设置页顶部会一直提示这是占位值，等你换成真的。
       一旦填了像样的 key，提示自动消失。 */
    const apiKeyFilled = (function () {
      const k = String(a.apiKey || '').trim();
      return k.length > 10 && !/替换/.test(k);
    })();
    if (!apiKeyFilled && !a.apiKey) {
      a.apiKey = st.pending.apiKey;      // 首次打开时预置占位值
    }
    body.push(field('API Key', input('password', a.apiKey, v => {
      a.apiKey = v.trim();
      /* 用户改成真 key 时顺手清掉占位标记 */
      if (a.apiKey.length > 10 && !/替换/.test(a.apiKey)) S.save();
    }, 'sk-...'))),
    body.push(U.el('p', {
      class: 'hint',
      style: {
        fontSize: '11.5px', margin: '-6px 0 14px', lineHeight: '1.6',
        color: apiKeyFilled ? 'var(--text-faint)' : 'var(--warn)'
      },
      text: apiKeyFilled
        ? '已填写。Key 只存在手机本地，不会上传。'
        : '⚠️ 现在填的是代填值（sk-替换成你的百炼APIKey），AI 功能会报错。'
          + '去 https://bailian.console.aliyun.com/?apiKey=1 申请一个真 key 替换掉。'
    }))
    body.push(field('模型名', (() => {
      const preset = AI.PRESETS[a.provider];
      if (preset && preset.models && preset.models.length) {
        const opts = preset.models.map(x => ({ value: x, label: x }));
        const has = preset.models.includes(a.model);
        if (!has) opts.unshift({ value: a.model, label: a.model + '（当前）' });
        return selectEl(opts, a.model, v => { a.model = v; });
      }
      return input('text', a.model, v => { a.model = v.trim(); }, 'model-name');
    })()));

    body.push(U.el('div', { class: 'row', style: { marginBottom: '8px' } }, [
      U.el('button', {
        class: 'btn ghost grow sm', text: '测试连接',
        onclick: async e => {
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = '测试中…';
          try {
            a.enabled = true;
            const out = await AI.test();
            U.toast('连接成功：' + out.slice(0, 20), 'ok');
          } catch (err) {
            U.toast(err.message, 'err');
          } finally {
            btn.disabled = false; btn.textContent = '测试连接';
          }
        }
      }),
      U.el('button', {
        class: 'btn ghost grow sm', text: '获取 Key',
        onclick: () => {
          const p = AI.PRESETS[a.provider];
          if (p && p.keyURL) window.open(p.keyURL, '_blank');
          else U.toast('该服务商没有预设链接');
        }
      })
    ]));
    body.push(U.el('p', {
      style: { fontSize: '12px', color: 'var(--text-dim)', margin: '0 0 14px', lineHeight: '1.6' },
      text: 'Key 只保存在你手机本地（localStorage），请求直接从手机发往服务商，不经过任何中间服务器。'
    }));

    /* 数据管理 */
    body.push(U.el('div', { class: 'section-label', text: '数据' }));
    const stats = S.stats();
    body.push(U.el('div', { class: 'kv' }, [
      U.el('span', { class: 'k', text: '任务' }), U.el('span', { class: 'v', text: stats.tasks + ' 条' })
    ]));
    body.push(U.el('div', { class: 'kv' }, [
      U.el('span', { class: 'k', text: '账目' }), U.el('span', { class: 'v', text: stats.txns + ' 条' })
    ]));
    body.push(U.el('div', { class: 'kv' }, [
      U.el('span', { class: 'k', text: '占用' }), U.el('span', { class: 'v', text: Math.round(stats.bytes / 1024) + ' KB' })
    ]));

    /* 换设备这条路要写清楚 —— 用户只有在新手机上才会想起它 */
    body.push(U.el('div', {
      class: 'hint',
      style: { fontSize: '11.5px', color: 'var(--text-dim)', margin: '14px 0 0', lineHeight: 1.65 },
      html: '<b>换设备就靠这一对按钮。</b>导出得到的是一个 JSON 文件，'
        + '里面包含你全部的数据和设置（<b>含 AI 的 API Key，别随便发给别人</b>）。'
        + '在新手机上打开这个网址 → 设置 → 导入备份 → 选那个文件即可。'
        + '<br>数据只存在这台设备的浏览器里，没有云端同步，所以<b>换手机 / 清浏览器数据之前一定要先导出</b>。'
    }));

    body.push(U.el('div', { class: 'row wrap', style: { marginTop: '14px' } }, [
      U.el('button', {
        class: 'btn ghost sm grow', text: '导出备份',
        onclick: () => {
          U.download(`lifehub-backup-${U.ymd(new Date())}.json`, JSON.stringify(S.exportAll(), null, 2), 'application/json');
          U.toast('已导出备份文件', 'ok');
        }
      }),
      U.el('button', {
        class: 'btn ghost sm grow', text: '导入备份',
        onclick: () => {
          const inp = U.el('input', { type: 'file', accept: '.json,application/json' });
          inp.addEventListener('change', async () => {
            const f = inp.files && inp.files[0];
            if (!f) return;
            let obj;
            try {
              /* 老备份是用带 BOM 的老版本导出的，这里顺手剥掉，
                 否则 JSON.parse 会抛 Unexpected token，用户的备份就成了死文件 */
              const raw = String(await U.readFile(f)).replace(/^\ufeff/, '');
              obj = JSON.parse(raw);
            } catch (err) {
              U.toast('这个文件读不出来：' + err.message, 'err');
              return;
            }
            const st2 = S.stats();
            App.confirm(
              `导入这份备份？当前有 ${st2.tasks} 个任务、${st2.txns} 笔账。`
              + '备份里的内容会并进来，相同的记录不会重复。',
              () => {
                try {
                  S.importAll(obj, 'merge');
                  App.closeSheet();
                  App.refresh();
                  U.toast('已导入备份', 'ok');
                } catch (err) {
                  U.toast('导入失败：' + err.message, 'err');
                }
              }, '导入');
          });
          inp.click();
        }
      }),
      U.el('button', {
        class: 'btn danger sm grow', text: '清空所有数据',
        onclick: () => App.confirm('这会删除全部任务、账目、饮食记录，**以及加密的日记**，且无法恢复。确定吗？', () => {
          S.reset(); U.toast('已清空', 'ok'); App.go('today');
        }, '清空')
      })
    ]));

    /* 关于 */
    /* 版本与更新：手机上「改了没生效」十有八九是 SW 缓存还停在旧版，
       所以这里要能一眼看到版本号，并且能一键强制更新。 */
    body.push(U.el('div', { class: 'section-label', text: '版本与更新' }));
    body.push(U.el('div', { class: 'kv' }, [
      U.el('span', { class: 'k', text: '当前版本' }),
      U.el('span', { class: 'v', text: App.VERSION })
    ]));
    body.push(U.el('p', {
      class: 'hint',
      style: { margin: '6px 0 10px' },
      text: '手机上看不到刚改的东西时，点下面这个按钮：会清掉本地缓存重新拉取最新版。'
          + '你的数据存在浏览器里，不受影响。'
    }));
    body.push(U.el('button', {
      class: 'btn ghost block', style: { marginBottom: '18px' },
      text: '🔄 检查更新（清缓存重载）',
      onclick: () => {
        U.toast('正在更新…', 'info');
        App.forceUpdate();
      }
    }));

    /* 关于 */
    body.push(U.el('div', { class: 'section-label', text: '关于' }));
    body.push(U.el('p', {
      style: { fontSize: '12.5px', color: 'var(--text-dim)', lineHeight: '1.7', margin: '0 0 20px' },
      html: 'LifeHub · 个人学习生活管理 <b>' + App.VERSION + '</b><br>完全离线运行，数据只存在本机。<br>' +
            '提醒通过导出 .ics 到系统日历实现（小米/HyperOS 上最可靠）。'
    }));

    /* 帮助与学习蓝图入口（这两个不在底部导航里，放这儿方便找） */
    body.push(U.el('div', { class: 'section-label', text: '更多' }));
    body.push(U.el('div', { class: 'row', style: { gap: '8px', marginBottom: '18px' } }, [
      U.el('button', {
        class: 'btn ghost grow', text: '📖 操作手册',
        onclick: () => { App.closeSheet(); App.go('help'); }
      }),
      U.el('button', {
        class: 'btn ghost grow', text: '🧭 学习蓝图',
        onclick: () => { App.closeSheet(); App.go('learn'); }
      })
    ]));

    /* 保存 */
    const btnSave = U.el('button', {
      class: 'btn primary block', text: '保存设置',
      onclick: () => { S.saveNow(); U.toast('设置已保存', 'ok'); App.closeSheet(); App.refresh(); }
    });
    body.push(btnSave);

    App.sheet('设置', body);

    /* 输入即改：全局监听，因为上面的 input() 已绑好回调 */
  };

  function field(label, control, hint) {
    return U.el('div', { class: 'field' }, [
      U.el('label', { text: label }),
      control,
      /* 可选的说明文字：像「类型」这种会影响行为的字段，值得解释一句 */
      hint ? U.el('div', {
        style: { fontSize: '11.5px', color: 'var(--text-faint)', marginTop: '5px', lineHeight: '1.5' },
        text: hint
      }) : null
    ]);
  }

  function input(type, value, onChange, placeholder, step) {
    const el = U.el('input', {
      class: 'input', type,
      value: value == null ? '' : value,
      placeholder: placeholder || '',
      inputmode: (type === 'number') ? 'decimal' : undefined,
      oninput: e => onChange(e.target.value)
    });
    if (step) el.setAttribute('step', step);
    return el;
  }

  /* 开关型字段：设置里「开/关某行为」的地方用这个，比 select 省事 */
  function checkbox(checked, onChange) {
    return U.el('label', {
      class: 'row',
      style: { gap: '10px', alignItems: 'center', cursor: 'pointer', padding: '2px 0' }
    }, [
      U.el('input', {
        type: 'checkbox', checked: !!checked,
        style: { width: '18px', height: '18px', accentColor: 'var(--accent)', flexShrink: '0' },
        onchange: e => onChange(e.target.checked)
      }),
      U.el('span', { style: { fontSize: '13px' }, text: checked ? '已开启' : '已关闭' })
    ]);
  }

  function selectEl(options, current, onChange) {
    const sel = U.el('select', { class: 'select', onchange: e => onChange(e.target.value) });
    options.forEach(o => {
      const op = U.el('option', { value: o.value, text: o.label });
      if (String(o.value) === String(current)) op.selected = true;
      sel.appendChild(op);
    });
    return sel;
  }

  App.field = field;
  App.input = input;
  App.selectEl = selectEl;

  /* ───────── Gist 风格的 AI 结果面板 ───────── */

  /** 把轻量 Markdown 渲染成 HTML（只支持常用语法，避免引入依赖） */
  App.md = function (text) {
    let s = U.esc(text || '');
    // 代码块
    s = s.replace(/```([\s\S]*?)```/g, (m, code) => `<code>${code.trim()}</code>`);
    // 行内代码
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    // 标题
    s = s.replace(/^###\s+(.+)$/gm, '<h4>$1</h4>');
    s = s.replace(/^##\s+(.+)$/gm, '<h4>$1</h4>');
    s = s.replace(/^#\s+(.+)$/gm, '<h4>$1</h4>');
    // 粗体
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    // 列表
    s = s.replace(/^[\-\*]\s+(.+)$/gm, '· $1');
    return s;
  };

  /** AI 对话浮层 */
  App.openAI = function () {
    const body = [];
    const ready = AI.isReady();

    body.push(U.el('div', { class: 'row', style: { marginBottom: '14px' } }, [
      U.el('button', {
        class: 'btn primary grow', text: '评价我的日程',
        onclick: () => App.aiRun('schedule', body)
      }),
      U.el('button', {
        class: 'btn grow', text: '评价饮食作息',
        onclick: () => App.aiRun('body', body)
      })
    ]));
    body.push(U.el('div', { class: 'row', style: { marginBottom: '14px' } }, [
      U.el('button', {
        class: 'btn grow', text: '评价学习进度',
        onclick: () => App.aiRun('learn', body)
      }),
      U.el('button', {
        class: 'btn grow', text: '生成日程',
        onclick: () => App.aiGenerate(body)
      })
    ]));

    if (!ready) {
      body.push(U.el('div', {
        style: {
          padding: '13px', background: 'var(--warn-soft)', color: 'var(--warn)',
          borderRadius: 'var(--radius-sm)', fontSize: '13px', lineHeight: '1.6', marginBottom: '14px'
        },
        text: '还没配置 AI。到「设置 → AI 助手」填一个 API Key，就能让 App 直接调用大模型，不需要电脑。'
      }));
      body.push(U.el('button', {
        class: 'btn block', text: '去设置', onclick: () => { App.closeSheet(); setTimeout(App.openSettings, 260); }
      }));
    }

    body.push(U.el('div', { class: 'section-label', text: '输出' }));
    const out = U.el('div', { class: 'ai-out', id: 'aiOut', text: ready ? '点上面的按钮开始。' : '等待配置…' });
    body.push(out);

    body.push(U.el('div', { class: 'row', style: { marginTop: '12px' } }, [
      U.el('button', {
        class: 'btn ghost sm grow', text: '复制结果',
        onclick: async () => {
          const t = U.$('#aiOut')?.innerText || '';
          if (!t.trim()) return U.toast('还没有内容');
          (await U.copy(t)) ? U.toast('已复制', 'ok') : U.toast('复制失败', 'err');
        }
      }),
      U.el('button', {
        class: 'btn ghost sm grow', text: '复制原始数据',
        onclick: async () => {
          const dump = AI.promptScheduleReview(
            U.friendly(U.today()),
            S.all('tasks').filter(t => !t.done),
            { overdue: S.overdue().length, soon: S.upcoming(7).length }
          );
          (await U.copy(dump)) ? U.toast('已复制，可粘贴到 DSH', 'ok') : U.toast('复制失败', 'err');
        }
      })
    ]));

    App.sheet('AI 助手', body, { autofocus: false });
  };

  App.aiRun = async function (kind, bodyNodes) {
    if (!AI.isReady()) return U.toast('请先在设置里配置 AI', 'err');

    /* #aiOut 只存在于 AI 面板里，而「饮食作息」页上那个
       「🤖 发给 AI 评价这一天」按钮会**直接**调到这里。
       以前拿不到 #aiOut 就 `return` —— 按钮按下去完全没反应，
       用户只会以为按钮坏了（这个 bug 是用户报上来的）。
       现在：面板没开就先把面板开出来，再往里写。 */
    if (!U.$('#aiOut')) App.openAI();
    const out = U.$('#aiOut');
    if (!out) return U.toast('打不开 AI 面板，稍后再试', 'err');

    out.textContent = '';
    const spin = U.el('div', { class: 'row', style: { alignItems: 'center', gap: '8px' } }, [
      U.el('div', { class: 'spin' }), U.el('span', { text: '思考中…' })
    ]);
    out.appendChild(spin);

    try {
      let prompt, sys;
      if (kind === 'schedule') {
        const tasks = S.all('tasks').filter(t => !t.done);
        if (!tasks.length) { out.textContent = '还没有任何任务，先去「导入」或「计划」里加一些。'; return; }
        prompt = AI.promptScheduleReview(U.friendly(U.today()), tasks, {
          overdue: S.overdue().length, soon: S.upcoming(7).length
        });
      } else if (kind === 'body') {
        const today = U.ymd(U.today());
        const meals = S.mealsOn(today);
        const totals = Nutrition.dayTotals(meals);
        const sleepRec = S.sleepOn(today) || S.sleepOn(U.ymd(U.addDays(U.today(), -1)));
        prompt = Nutrition.toPrompt(today, meals, totals, sleepRec, S.settings.body, S.all('weights'));
      } else if (kind === 'learn') {
        prompt = AI.promptBlueprintReview(
          { summary: Blueprint.summaryText(), stage: Blueprint.stageText() },
          Blueprint.progressMap()
        );
      }

      let acc = '';
      await AI.chat([
        { role: 'system', content: '你是一个务实的学习生活管理助手，服务对象是中国大学生，正在减脂，方向是计算机视觉与具身智能。说人话，给具体可执行建议，不要客套话。' },
        { role: 'user', content: prompt }
      ], {
        onDelta: (d, full) => {
          acc = full;
          out.innerHTML = App.md(full);
          out.scrollTop = out.scrollHeight;
        }
      });

      AI.log(kind, prompt, acc);

    } catch (e) {
      out.innerHTML = '';
      out.appendChild(U.el('div', { style: { color: 'var(--danger)' }, text: '出错：' + e.message }));
    }
  };

  App.aiGenerate = function (bodyNodes) {
    const ta = U.el('textarea', {
      class: 'textarea',
      placeholder: '用大白话说你想要什么，例如：\n\n下周要把多目标跟踪调好，周三之前改完代码，周五做一次双球实验并记录参数。另外下周二下午三点去实验室找老师拿设备。'
    });

    const box = U.el('div', {}, [
      U.el('p', { style: { fontSize: '13px', color: 'var(--text-dim)', marginTop: 0 }, text: '描述你的事项，AI 会解析成结构化日程，你确认后入库。' }),
      ta
    ]);

    App.sheet('AI 生成日程', [box,
      U.el('div', { class: 'row', style: { marginTop: '12px' } }, [
        U.el('button', { class: 'btn ghost grow', text: '取消', onclick: () => App.closeSheet() }),
        U.el('button', {
          class: 'btn primary grow', text: '生成',
          onclick: async e => {
            const btn = e.currentTarget;
            const txt = ta.value.trim();
            if (!txt) return U.toast('先写点什么');
            btn.disabled = true; btn.textContent = '生成中…';
            try {
              const raw = await AI.chat([
                { role: 'system', content: '你是一个精确的日程解析器，只输出 JSON。' },
                { role: 'user', content: AI.promptGenerateSchedule(txt, S.all('tasks').slice(0, 40).map(t => t.title)) }
              ], { temperature: 0.2, json: true });
              const tasks = AI.parseTasksJSON(raw);
              if (!tasks.length) throw new Error('没能解析出任何任务');
              App.closeSheet();
              setTimeout(() => Views.importv.showPreview(tasks, 'AI 生成'), 280);
            } catch (err) {
              U.toast(err.message, 'err');
            } finally {
              btn.disabled = false; btn.textContent = '生成';
            }
          }
        })
      ])
    ], { autofocus: false });
  };

  /* ───────── 启动 ───────── */

  function initTheme() {
    const pref = S.settings.ui.theme || 'auto';
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'auto' && mq.matches);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      if (global.Charts && Charts.invalidateTheme) Charts.invalidateTheme();
    };
    apply();
    mq.addEventListener('change', apply);
  }

  /* ───────── 日记的隐蔽入口 ─────────
     长按底部「今天」标签 1.2 秒进入。为什么用长按：
     点一下是正常切到「今天」，别人拿起手机随手点不会发现这个模块；
     自己也只要记「按住今天」一句话。 */
  /* 长按是否已经触发过。用它让紧随其后的 click 失效。
     ⚠️ 不能用 stopPropagation 来做这件事：
     事件在**目标元素**上时，捕获型和冒泡型监听器是按**注册顺序**依次调用的，
     捕获标志并不会让它提前。而标签的 click 早就绑定过了，
     所以「后加一个 capture 监听器去拦」是拦不住的 —— 先跑的是原处理器。
     用一个显式标志最可靠。 */
  let longPressFired = false;

  function bindDiaryEntry() {
    const tab = U.$('.tab[data-view="today"]');
    if (!tab) return;
    let timer = null;

    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };

    tab.addEventListener('pointerdown', () => {
      /* 每次新手势开始都把标志清掉。
         不清的话：一次长按之后如果没等到那次补发的 click
         （手指滑走了、或者系统根本没补），标志会一直留着 true，
         下一次**普通轻点**就会被它吃掉 —— 用户会觉得「今天这个标签点不动了」。
         这个坑是 test/diary-browser.test.js 抓出来的。 */
      longPressFired = false;
      cancel();
      timer = setTimeout(() => {
        timer = null;
        longPressFired = true;
        try { if (navigator.vibrate) navigator.vibrate(18); } catch (err) {}
        App.go('diary');
      }, 1200);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
      tab.addEventListener(ev, cancel));

    /* 手机上长按还会弹出系统的选择/复制菜单，一并压掉 */
    tab.addEventListener('contextmenu', e => e.preventDefault());
    tab.style.webkitTouchCallout = 'none';
    tab.style.userSelect = 'none';
  }

  /* 闲置自动上锁。默认 5 分钟。
     不在切走时立刻锁：那样去别处看一眼再回来就要重新输密码，太烦。 */
  function startAutoLock() {
    setInterval(() => {
      if (!Diary.isUnlocked()) return;
      const mins = Number(S.settings.diary.autoLockMinutes);
      if (!mins || mins <= 0) return;
      if (Date.now() - Diary.lastActive() > mins * 60000) {
        Diary.lock();
        if (App.current === 'diary') { App.go('diary'); U.toast('已自动上锁', 'info'); }
      }
    }, 20000);

    /* 切到别的模块时也记一次活动时间，避免在别处待很久回来刚好被锁 */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) Diary.touch();
    });
  }

  /* bindShell 只许绑一次。
     真机上 App.start() 只会跑一次，但测试页里会跑两次：
     harness 自己调了一次，app.js 加载后那个 setTimeout(App.start, 0) 又跑一次。
     绑两遍的后果不是「效果翻倍」，而是**行为错乱** ——
     长按进日记后补发的那次 click 会被第一个监听器吃掉，
     第二个监听器看到标志已经清掉了，就又把页面弹回「今天」；
     顺带 #btnSettings 会开两次设置、自动上锁会挂两个定时器。
     这个坑是 test/diary-browser.test.js 抓出来的。 */
  let shellBound = false;

  function bindShell() {
    if (shellBound) return;
    shellBound = true;

    U.$$('.tab').forEach(t => t.addEventListener('click', () => {
      /* 长按进日记之后紧跟着的那次 click 要吃掉，
         否则会「先进日记，立刻又被弹回今天」。 */
      if (t.dataset.view === 'today' && longPressFired) { longPressFired = false; return; }
      App.go(t.dataset.view);
    }));
    bindDiaryEntry();
    startAutoLock();
    U.$('#sheetClose').addEventListener('click', App.closeSheet);
    U.$('#scrim').addEventListener('click', App.closeSheet);
    U.$('#btnHelp').addEventListener('click', () => App.go('help'));
    U.$('#btnSettings').addEventListener('click', App.openSettings);
    U.$('#btnHistory').addEventListener('click', () => App.go('history'));
    U.$('#btnAi').addEventListener('click', App.openAI);

    // 顶部栏滚动阴影
    const vp = U.$('#viewport'), tb = U.$('#topbar');
    vp.addEventListener('scroll', () => {
      tb.classList.toggle('scrolled', vp.scrollTop > 4);
    }, { passive: true });

    // 返回键关闭浮层
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') App.closeSheet();
    });
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return;

    /* updateViaCache:'none' 是关键 —— 默认情况下浏览器会拿 HTTP 缓存里的
       sw.js 去比对，GitHub Pages 给的缓存头可能让这个「更新检查」长达一天
       都看不到新版本，用户就会一直卡在旧版上（踩过：改了功能手机上「没生效」）。 */
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then(reg => { try { reg.update(); } catch (e) {} })
      .catch(e => { console.warn('[sw] 注册失败（不影响使用）', e.message); });

    /* 新 SW 接管后自动刷一次，用户不用自己找刷新按钮。
       只在「本来就有 SW 在管」时才刷，避免首次安装时多刷一次。 */
    let hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; }
      if (reloading) return;
      reloading = true;
      console.log('[LifeHub] 新版本已接管，自动刷新');
      location.reload();
    });
  }

  /** 强制更新：注销 SW、清掉所有缓存、带时间戳重载。
   *  手机上「改了没生效」时的兜底手段。 */
  App.forceUpdate = function () {
    const bust = () => {
      const u = new URL(location.href);
      u.searchParams.set('v', String(Date.now()));
      location.replace(u.toString());
    };
    const jobs = [];
    try {
      if ('serviceWorker' in navigator) {
        jobs.push(navigator.serviceWorker.getRegistrations()
          .then(rs => Promise.all(rs.map(r => r.unregister().catch(() => false)))));
      }
    } catch (e) {}
    try {
      if (global.caches) {
        jobs.push(caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))));
      }
    } catch (e) {}
    if (!jobs.length) { bust(); return; }
    Promise.all(jobs).then(bust).catch(bust);
  };

  let started = false;

  App.start = function () {
    /* 只启动一次。
       真机上本来就只会跑一次，但测试页里会跑两次：
       harness 自己调一次，app.js 加载后那个 setTimeout(App.start, 0) 又跑一次。
       第二次会重新 App.go('today')，把用户（和测试）从当前页面硬拽回「今日」——
       表现就是「在日记里刚设完密码，人却被弹回今日」，非常难查。
       让 start 幂等，测试页的行为就和真机一致了。 */
    if (started) return;
    started = true;

    S.init();
    initTheme();
    bindShell();
    App.go('today');
    registerSW();
    console.log('[LifeHub] 已启动', S.stats());
  };

  /* 界面上的版本号。改功能时和 sw.js 的 VERSION 一起改。
     手机上「改了没生效」的时候，先来这里看是不是旧版。 */
  App.VERSION = 'v19';

  global.App = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(App.start, 0));
  } else {
    setTimeout(App.start, 0);
  }
})(window);