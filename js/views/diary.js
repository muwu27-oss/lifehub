/* ═══════════════════════════════════════════════
   views/diary.js — 日记模块界面

   这个版块是**藏起来**的：不在底部导航里，靠长按「今天」标签进入。
   进去之后完全自成一块：自己的回顾、自己的 AI 配置、自己的说明书，
   跟外面的「回顾」版块和「操作手册」都不打通（用户明确要求）。

   界面分五种状态：
     ① 没设过密码 → 设置密码
     ② 设过但锁着 → 输密码
     ③④⑤ 解锁后 → 日记 / 回顾 / 谈话 / 设置 / 说明
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const Views = global.Views = global.Views || {};

  /* 视图会话状态。不落盘：刷新即忘，这正是我们要的。 */
  const VS = {
    tab: 'write',
    editDate: null,
    editText: '',
    editMood: null,
    gran: 'month',
    key: null,          // 当前区间 key（null = 按今天算）
    dim: 'mood',
    chatId: null,       // 正在进行的谈话记录 id
    chatMsgs: [],       // 进行中的对话（明文，只在内存）
    chatBusy: false
  };

  const TABS = [
    { id: 'write', name: '日记' },
    { id: 'review', name: '回顾' },
    { id: 'chat', name: '谈话' },
    { id: 'settings', name: '设置' },
    { id: 'help', name: '说明' }
  ];

  function curKey() {
    return VS.key || Diary.keyOf(VS.gran, U.ymd(U.today()));
  }

  function esc(s) { return U.esc(s); }

  /* ═══════════════════════════════════════════════
     入口
     ═══════════════════════════════════════════════ */
  Views.diary = function () {
    const root = U.$('#view-diary');
    if (!root) return;

    /* 这个模块会**自己重新渲染自己**（切子标签、写完日记、改完设置都要重画），
       而别的视图都靠 App.go 先把容器清空 —— 我们这条路上没有 App.go。
       不清的话每点一次子标签就往上追加一整份界面：内容翻倍、
       还会出现两个一模一样的密码框，用户输的那个跟按钮读的那个不是同一个。
       （这个 bug 就是被 test/diary-browser.test.js 抓出来的。） */
    root.innerHTML = '';

    if (!Crypto.available()) return renderNoCrypto(root);
    if (!Diary.hasPassword()) return renderSetup(root);
    if (!Diary.isUnlocked()) return renderUnlock(root);
    return renderMain(root);
  };

  /* ── 环境不支持加密 ── */
  function renderNoCrypto(root) {
    root.appendChild(U.el('div', { class: 'card' }, [
      U.el('div', { style: { fontWeight: '600', marginBottom: '8px' }, text: '这个环境用不了加密' }),
      U.el('p', { style: { fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.7', margin: 0 },
        text: Crypto.whyUnavailable() }),
      U.el('p', { style: { fontSize: '12.5px', color: 'var(--text-dim)', lineHeight: '1.7', marginTop: '10px' },
        text: '日记是先加密再存进手机本地的，没有加密能力就不敢收你的内容——'
            + '那等于把日记明文摊在浏览器里，还不如不做。' }),
      U.el('button', {
        class: 'btn ghost block', style: { marginTop: '14px' },
        text: '返回', onclick: () => App.go('today')
      })
    ]));
  }

  /* ── ① 第一次：设置密码 ── */
  function renderSetup(root) {
    /* 变量声明在外面：底部按钮的处理器会读它们（踩过的坑，见 DEVLOG） */
    let pw1 = '', pw2 = '', err = '';
    const errBox = U.el('div', { style: { color: 'var(--danger)', fontSize: '12.5px', minHeight: '18px' } });
    const hintBox = U.el('div', { style: { fontSize: '11.5px', color: 'var(--text-faint)', minHeight: '16px' } });

    root.appendChild(U.el('div', { class: 'card' }, [
      U.el('div', { class: 'section-label', style: { marginTop: 0 }, text: '第一次进来，先设个密码' }),
      U.el('p', {
        style: { fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.7', marginTop: 0 },
        text: '日记会先用这个密码加密，再存进手机。'
            + '别人拿到你的手机、翻到浏览器存储、甚至拿到你导出的备份文件，看到的都只是乱码。'
      }),
      App.field('密码', U.el('input', {
        class: 'input', type: 'password', placeholder: '至少 6 位，别用生日/学号',
        oninput: e => {
          pw1 = e.target.value;
          const h = Diary.passwordHint(pw1);
          hintBox.textContent = pw1 ? h.text : '';
          hintBox.style.color = h.level === 'weak' ? 'var(--warn)'
            : (h.level === 'strong' ? 'var(--ok)' : 'var(--text-faint)');
        }
      })),
      hintBox,
      App.field('再输一遍', U.el('input', {
        class: 'input', type: 'password', placeholder: '确认',
        oninput: e => { pw2 = e.target.value; }
      })),
      errBox,
      U.el('div', {
        class: 'hint',
        style: {
          fontSize: '11.5px', lineHeight: '1.7', marginTop: '8px', padding: '10px',
          background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 'var(--radius-sm)'
        },
        html: '⚠️ <b>密码忘了，日记就永久找不回来了。</b>'
          + '没有找回、没有客服、没有后门——能帮你找回，就等于别人也能打开。'
          + '<br>设好之后建议把密码记在别处（比如纸条或密码管理器）。'
      }),
      U.el('div', { class: 'row', style: { marginTop: '14px' } }, [
        U.el('button', { class: 'btn ghost grow', text: '算了', onclick: () => App.go('today') }),
        U.el('button', {
          class: 'btn primary grow', text: '设好了，进去',
          onclick: async e => {
            if (pw1.length < 6) { errBox.textContent = '密码至少 6 位'; return; }
            if (pw1 !== pw2) { errBox.textContent = '两次输入的密码不一样'; return; }
            const btn = e.currentTarget;
            btn.disabled = true; btn.textContent = '正在加密…';
            try {
              await Diary.setup(pw1);
              VS.tab = 'write';
              U.toast('日记已加密', 'ok');
              Views.diary();
            } catch (ex) {
              errBox.textContent = ex.message;
            } finally {
              btn.disabled = false; btn.textContent = '设好了，进去';
            }
          }
        })
      ])
    ]));
  }

  /* ── ② 已设密码：解锁 ── */
  function renderUnlock(root) {
    let pw = '';
    const errBox = U.el('div', { style: { color: 'var(--danger)', fontSize: '12.5px', minHeight: '18px' } });
    const inp = U.el('input', {
      class: 'input', type: 'password', placeholder: '日记密码',
      oninput: e => { pw = e.target.value; errBox.textContent = ''; },
      onkeydown: e => { if (e.key === 'Enter') go(); }
    });

    async function go() {
      if (!pw) return;
      errBox.textContent = '正在解密…';
      errBox.style.color = 'var(--text-dim)';
      try {
        await Diary.unlock(pw);
        errBox.textContent = '';
        errBox.style.color = 'var(--danger)';
        U.toast('已解锁', 'ok');
        Views.diary();
      } catch (ex) {
        errBox.style.color = 'var(--danger)';
        errBox.textContent = ex.message === '密码不对'
          ? '密码不对。再想想 —— 实在想不起来，就用下面的「重置日记」，但内容会一起删掉。'
          : ex.message;
      }
    }

    root.appendChild(U.el('div', { class: 'card' }, [
      U.el('div', { class: 'section-label', style: { marginTop: 0 }, text: '🔒 日记已加密' }),
      U.el('p', {
        style: { fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.7', marginTop: 0 },
        text: '输入密码解锁。密码只在这台手机上用来解密，不会发给任何人。'
      }),
      App.field('密码', inp),
      errBox,
      U.el('div', { class: 'row', style: { marginTop: '12px' } }, [
        U.el('button', { class: 'btn ghost grow', text: '返回', onclick: () => App.go('today') }),
        U.el('button', { class: 'btn primary grow', text: '解锁', onclick: go })
      ])
    ]));

    /* ── 忘记密码的唯一出口 ──
       这里给的**不是「找回」而是「重置」**。真要能找回，就等于别人也能打开，
       那这套加密就白做了 —— 所以重置的代价是内容一起永久删掉。

       为什么必须放在锁屏上：设了密码又想不起来的人**根本进不去「设置」子页**，
       而原来那个「清空整个日记」按钮恰好就藏在里面，等于没有出口。
       重置本身不需要密钥（Diary.wipe 只清集合 + 复位 cfg），这里也确实没碰解密。

       故意做得低调、和「解锁」隔开一段、标签自带警告：
       知道密码的人不该在这块屏幕上手滑毁掉整本日记。 */
    function resetDiary() {
      const n = Diary.counts();
      const empty = n.entries + n.chats + n.digests === 0;
      App.confirm(
        '重置会把日记里的全部内容永久删除，并清掉密码 —— 没有任何找回的可能。'
        + '\n\n当前有 ' + n.entries + ' 篇日记、' + n.chats + ' 段谈话、' + n.digests + ' 份小结。'
        + (empty ? '\n\n现在是空的，重置不会丢任何东西。' : '\n\n删掉就真的没了。'),
        () => {
          Diary.wipe();
          VS.tab = 'write';
          U.toast('日记已重置，可以重新设密码了', 'ok');
          Views.diary();
        },
        '永久删除并重置'
      );
    }

    root.appendChild(U.el('button', {
      class: 'btn ghost block sm',
      style: { marginTop: '16px' },
      text: '忘记密码？重置日记（会删掉全部内容）',
      onclick: resetDiary
    }));
  }

  /* ═══════════════════════════════════════════════
     解锁后的主体
     ═══════════════════════════════════════════════ */
  function renderMain(root) {
    Diary.touch();

    /* 模块自己的标签栏 —— 只在这一块里有，底部导航不出现 */
    const tabs = U.el('div', { class: 'seg', style: { marginBottom: '12px' } });
    TABS.forEach(t => {
      tabs.appendChild(U.el('button', {
        class: t.id === VS.tab ? 'active' : '', text: t.name,
        onclick: () => { VS.tab = t.id; VS.chatId = null; Views.diary(); }
      }));
    });
    root.appendChild(U.el('div', { class: 'card tight', style: { padding: '4px' } }, [tabs]));

    const box = U.el('div', {});
    root.appendChild(box);

    if (VS.tab === 'write') return tabWrite(box);
    if (VS.tab === 'review') return tabReview(box);
    if (VS.tab === 'chat') return tabChat(box);
    if (VS.tab === 'settings') return tabSettings(box);
    if (VS.tab === 'help') return tabHelp(box);
  }

  /* ═══════════ 日记 ═══════════ */
  async function tabWrite(root) {
    const st = await Diary.stats();

    root.appendChild(U.el('div', { class: 'row', style: { marginBottom: '12px' } }, [
      U.el('button', {
        class: 'btn primary grow', text: '✍️ 写今天',
        onclick: () => openEditor(U.ymd(U.today()))
      }),
      U.el('button', {
        class: 'btn ghost', style: { flexShrink: '0' }, text: '选日期',
        onclick: () => pickDate(d => openEditor(d))
      })
    ]));

    root.appendChild(U.el('div', { class: 'card tight' }, [
      U.el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [
        U.el('div', {}, [
          U.el('div', { style: { fontSize: '22px', fontWeight: '600' }, text: String(st.total) }),
          U.el('div', { style: { fontSize: '11px', color: 'var(--text-dim)' }, text: '篇' })
        ]),
        U.el('div', {}, [
          U.el('div', { style: { fontSize: '22px', fontWeight: '600' }, text: String(st.avgChars) }),
          U.el('div', { style: { fontSize: '11px', color: 'var(--text-dim)' }, text: '平均字数' })
        ]),
        U.el('div', {}, [
          U.el('div', { style: { fontSize: '22px', fontWeight: '600' }, text: String(st.chats) }),
          U.el('div', { style: { fontSize: '11px', color: 'var(--text-dim)' }, text: '次谈话' })
        ]),
        U.el('div', {}, [
          U.el('div', { style: { fontSize: '22px', fontWeight: '600' }, text: String(st.digests) }),
          U.el('div', { style: { fontSize: '11px', color: 'var(--text-dim)' }, text: '份小结' })
        ])
      ]),
      st.first ? U.el('div', {
        style: { fontSize: '11px', color: 'var(--text-faint)', marginTop: '8px' },
        text: `${st.first} 开始写 · 最近一次 ${st.last}`
      }) : null
    ]));

    const list = await Diary.entries();
    const written = list.filter(e => e.text && e.text.trim());
    if (!written.length) {
      root.appendChild(App.empty('还没有日记', '点上面「写今天」开始。这里只有你能看到。'));
      return;
    }

    /* 按月份分组，符合翻日记的习惯 */
    const groups = {};
    written.forEach(e => {
      const m = e.date.slice(0, 7);
      (groups[m] = groups[m] || []).push(e);
    });

    Object.keys(groups).sort().reverse().forEach(ym => {
      const [y, mm] = ym.split('-');
      root.appendChild(U.el('div', { class: 'section-label', text: `${y} 年 ${Number(mm)} 月` }));
      groups[ym].forEach(e => {
        const preview = e.text.trim().replace(/\s+/g, ' ').slice(0, 52);
        root.appendChild(U.el('div', {
          class: 'card tight', style: { marginBottom: '8px', cursor: 'pointer' },
          onclick: () => openEditor(e.date)
        }, [
          U.el('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '4px' } }, [
            U.el('span', { style: { fontSize: '12.5px', fontWeight: '600' }, text: U.friendly(e.date) }),
            e.mood != null ? U.el('span', {
              style: { fontSize: '11.5px', color: moodColor(e.mood) }, text: `心情 ${e.mood}/10`
            }) : U.el('span', {})
          ]),
          U.el('div', { style: { fontSize: '12.5px', color: 'var(--text-dim)', lineHeight: '1.6' },
            text: preview + (e.text.trim().length > 52 ? '…' : '') })
        ]));
      });
    });
  }

  function moodColor(m) {
    if (m >= 8) return 'var(--ok)';
    if (m >= 6) return 'var(--text)';
    if (m >= 4) return 'var(--warn)';
    return 'var(--danger)';
  }

  /* ── 日期选择 ── */
  function pickDate(onPick) {
    const inp = U.el('input', {
      class: 'input', type: 'date', value: U.ymd(U.today()),
      onchange: e => { if (e.target.value) { App.closeSheet(); setTimeout(() => onPick(e.target.value), 260); } }
    });
    App.sheet('选一个日期', [
      U.el('p', { style: { fontSize: '13px', color: 'var(--text-dim)', marginTop: 0 },
        text: '补写以前某天的日记。' }),
      App.field('日期', inp)
    ], { autofocus: false });
  }

  /* ── 编辑器 ── */
  async function openEditor(date) {
    const exist = await Diary.entryOn(date);
    VS.editDate = date;
    VS.editText = exist ? exist.text : '';
    VS.editMood = exist ? exist.mood : null;

    /* 底部按钮的处理器会读这些，所以必须声明在 rebuild 外面（DEVLOG 里记过这个坑） */
    let text = VS.editText;
    let mood = VS.editMood;
    const ta = U.el('textarea', {
      class: 'textarea', style: { minHeight: '220px' },
      placeholder: '今天怎么样？不用写得像作文。想到什么写什么，没人看。',
      value: text,
      oninput: e => { text = e.target.value; countBox.textContent = text.length + ' 字'; }
    });
    const countBox = U.el('div', {
      style: { fontSize: '11px', color: 'var(--text-faint)', textAlign: 'right', marginTop: '4px' },
      text: text.length + ' 字'
    });

    const moodRow = U.el('div', { class: 'chip-row', style: { flexWrap: 'wrap' } });
    for (let i = 1; i <= 10; i++) {
      moodRow.appendChild(U.el('button', {
        class: 'chip' + (mood === i ? ' active' : ''), text: String(i),
        onclick: () => { mood = (mood === i ? null : i); refreshMood(); }
      }));
    }
    function refreshMood() {
      [].slice.call(moodRow.children).forEach((b, idx) => {
        b.classList.toggle('active', mood === idx + 1);
      });
      moodLabel.textContent = mood == null ? '没选（可以不选）' : `心情自评 ${mood}/10`;
    }
    const moodLabel = U.el('div', {
      style: { fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' },
      text: mood == null ? '没选（可以不选）' : `心情自评 ${mood}/10`
    });

    const body = [
      U.el('p', { style: { fontSize: '12.5px', color: 'var(--text-dim)', marginTop: 0 },
        text: U.friendly(date) + ' · ' + U.dowName(date) + (exist ? '（已有内容，改了会覆盖）' : '') }),
      ta, countBox,
      U.el('div', { class: 'section-label', text: '当天心情（可选）' }),
      moodRow, moodLabel
    ];

    const foot = [
      exist ? U.el('button', {
        class: 'btn danger', style: { flexShrink: '0' }, text: '删除',
        onclick: () => App.confirm('删掉这天的日记？删了就没了。', async () => {
          await Diary.removeEntry(exist.id);
          App.closeSheet();
          U.toast('已删除', 'ok');
          Views.diary();
        }, '删除')
      }) : null,
      U.el('button', { class: 'btn ghost grow', text: '取消', onclick: () => App.closeSheet() }),
      U.el('button', {
        class: 'btn primary grow', text: '保存',
        onclick: async () => {
          if (!text.trim()) {
            if (!exist) return U.toast('还没写内容', 'err');
          }
          try {
            await Diary.saveEntry(date, text, mood);
            App.closeSheet();
            U.toast('已保存并加密', 'ok');
            Views.diary();
          } catch (e) { U.toast(e.message, 'err'); }
        }
      })
    ];

    App.sheet(U.friendly(date), body, { footer: foot, autofocus: false });
    setTimeout(() => { try { ta.focus(); } catch (e) {} }, 300);
  }

  /* ═══════════ 回顾 ═══════════ */
  function granBar(current, onChange) {
    const row = U.el('div', { class: 'seg', style: { marginBottom: '10px' } });
    Diary.GRANS.forEach(g => {
      row.appendChild(U.el('button', {
        class: g.id === current ? 'active' : '', text: g.name,
        onclick: () => onChange(g.id)
      }));
    });
    return row;
  }

  function rangeNav(onChange) {
    const k = curKey();
    const todayKey = Diary.keyOf(VS.gran, U.ymd(U.today()));
    const isNow = k === todayKey;
    return U.el('div', { class: 'row', style: { alignItems: 'center', marginBottom: '12px' } }, [
      U.el('button', {
        class: 'btn ghost sm', style: { flexShrink: '0' }, text: '‹',
        onclick: () => { VS.key = Diary.shift(VS.gran, k, -1); onChange(); }
      }),
      U.el('div', { style: { flex: '1', textAlign: 'center' } }, [
        U.el('div', { style: { fontSize: '14px', fontWeight: '600' }, text: Diary.label(VS.gran, k) }),
        isNow ? U.el('div', { style: { fontSize: '10.5px', color: 'var(--text-faint)' }, text: '当前' }) : null
      ]),
      U.el('button', {
        class: 'btn ghost sm', style: { flexShrink: '0', opacity: isNow ? '.4' : '1' }, text: '›',
        onclick: () => {
          if (isNow) return;
          VS.key = Diary.shift(VS.gran, k, 1);
          onChange();
        }
      })
    ]);
  }

  async function tabReview(root) {
    root.appendChild(granBar(VS.gran, g => { VS.gran = g; VS.key = null; Views.diary(); }));
    root.appendChild(rangeNav(() => Views.diary()));

    const k = curKey();
    const entries = await Diary.entriesIn(VS.gran, k);
    const digest = await Diary.digestFor(VS.gran, k);

    /* ── 小结 ── */
    if (digest && digest.payload) {
      const p = digest.payload;
      root.appendChild(U.el('div', { class: 'card' }, [
        U.el('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '10px' } }, [
          U.el('span', { class: 'section-label', style: { margin: 0 }, text: '这一期的小结' }),
          U.el('span', {
            style: { fontSize: '10.5px', color: 'var(--text-faint)' },
            text: digest.createdAt ? digest.createdAt.slice(0, 10) : ''
          })
        ]),

        /* 评分条 */
        U.el('div', { style: { marginBottom: '12px' } }, Diary.DIMS.map(d => {
          const v = Number(p[d.id]);
          if (!isFinite(v)) return null;
          return U.el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' } }, [
            U.el('span', { style: { fontSize: '11.5px', width: '34px', color: 'var(--text-dim)' }, text: d.name }),
            U.el('div', { class: 'bar', style: { flex: '1' } }, [
              U.el('div', { class: 'bar-fill', style: { width: (v * 10) + '%', background: d.color } })
            ]),
            U.el('span', { style: { fontSize: '11.5px', width: '26px', textAlign: 'right' }, text: String(v) })
          ]);
        })),

        U.el('div', { class: 'section-label', text: '他写了什么' }),
        U.el('div', { style: { fontSize: '13px', lineHeight: '1.75', color: 'var(--text-dim)' }, text: p.brief }),

        U.el('div', { class: 'section-label', text: '想对他说的话' }),
        U.el('div', {
          class: 'ai-out', style: { fontSize: '13.5px', lineHeight: '1.8' },
          html: App.md(p.review)
        }),

        (p.noticed && p.noticed.length) ? U.el('div', { style: { marginTop: '12px' } }, [
          U.el('div', { class: 'section-label', text: '他可能没意识到的' }),
          U.el('div', {}, p.noticed.map(x => U.el('div', {
            style: {
              fontSize: '12.5px', lineHeight: '1.65', padding: '7px 9px', marginBottom: '5px',
              background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 'var(--radius-sm)'
            },
            text: '· ' + x
          })))
        ]) : null,

        (p.keywords && p.keywords.length) ? U.el('div', {
          style: { marginTop: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }
        }, p.keywords.map(w => U.el('span', {
          style: {
            fontSize: '11px', padding: '3px 8px', borderRadius: '99px',
            background: 'var(--bg-soft, rgba(127,127,127,.12))', color: 'var(--text-dim)'
          }, text: w
        }))) : null,

        U.el('div', { class: 'row', style: { marginTop: '14px' } }, [
          U.el('button', {
            class: 'btn ghost sm grow', text: '重新生成',
            onclick: () => makeDigest(true)
          }),
          U.el('button', {
            class: 'btn ghost sm grow', text: '删除这份',
            onclick: () => App.confirm('删掉这一期的小结？日记本身不动。', async () => {
              await Diary.removeDigest(digest.id);
              U.toast('已删除', 'ok');
              Views.diary();
            }, '删除')
          })
        ])
      ]));
    } else {
      root.appendChild(U.el('div', { class: 'card' }, [
        U.el('div', { style: { fontSize: '13.5px', fontWeight: '600', marginBottom: '6px' }, text: '这一期还没有小结' }),
        U.el('p', { style: { fontSize: '12.5px', color: 'var(--text-dim)', lineHeight: '1.7', margin: 0 },
          text: entries.length
            ? `这期写了 ${entries.length} 天。可以让 AI 读一遍，写一份「内容简概 + 想对你说的话」，并存下来看变化。`
            : '这一期没有日记内容。先去「日记」里写几天，再来做小结。' }),
        entries.length ? U.el('button', {
          class: 'btn primary block', style: { marginTop: '12px' }, text: '生成小结',
          onclick: () => makeDigest(false)
        }) : null
      ]));
    }

    /* ── 趋势 ── */
    await renderTrend(root);

    /* ── 往期小结列表 ── */
    const all = (await Diary.digests(VS.gran)).filter(d => d.key !== k);
    if (all.length) {
      root.appendChild(U.el('div', { class: 'section-label', text: '往期' }));
      all.slice(0, 20).forEach(d => {
        const p = d.payload || {};
        root.appendChild(U.el('div', {
          class: 'card tight', style: { marginBottom: '7px', cursor: 'pointer' },
          onclick: () => { VS.key = d.key; Views.diary(); }
        }, [
          U.el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [
            U.el('span', { style: { fontSize: '12.5px', fontWeight: '600' }, text: Diary.label(VS.gran, d.key) }),
            p.mood != null ? U.el('span', {
              style: { fontSize: '11.5px', color: moodColor(p.mood) }, text: '整体 ' + p.mood
            }) : null
          ]),
          U.el('div', { style: { fontSize: '12px', color: 'var(--text-dim)', marginTop: '3px', lineHeight: '1.55' },
            text: String(p.brief || '').slice(0, 60) + (String(p.brief || '').length > 60 ? '…' : '') })
        ]));
      });
    }
  }

  async function renderTrend(root) {
    const N = VS.gran === 'day' ? 14 : (VS.gran === 'year' ? 6 : 12);
    const cov = await Diary.coverage(VS.gran, N);
    if (cov.has < 1) return;

    const card = U.el('div', { class: 'card' });
    card.appendChild(U.el('div', { class: 'section-label', style: { marginTop: 0 }, text: '状态变化' }));

    /* 维度选择 */
    const dimRow = U.el('div', { class: 'chip-row', style: { flexWrap: 'wrap', marginBottom: '10px' } });
    Diary.DIMS.forEach(d => {
      dimRow.appendChild(U.el('button', {
        class: 'chip' + (VS.dim === d.id ? ' active' : ''), text: d.name,
        onclick: () => { VS.dim = d.id; Views.diary(); }
      }));
    });
    card.appendChild(dimRow);

    /* 样本太少要说清楚，不能画一条看着很确定的线 */
    if (cov.pct < 40) {
      card.appendChild(U.el('div', {
        style: {
          fontSize: '11.5px', lineHeight: '1.6', padding: '8px 10px', marginBottom: '10px',
          background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 'var(--radius-sm)'
        },
        text: `最近 ${cov.total} 期里只有 ${cov.has} 期做过小结（${cov.pct}%）。`
            + '线是断的，别当成完整趋势看。'
      }));
    }

    const series = await Diary.series(VS.gran, VS.dim, N);
    const pts = series.filter(x => x.value != null);
    if (pts.length >= 1) {
      const cv = U.el('canvas', { width: 660, height: 260, style: { width: '100%', height: '130px' } });
      card.appendChild(cv);
      const dim = Diary.DIMS.find(d => d.id === VS.dim) || Diary.DIMS[0];
      setTimeout(() => {
        try {
          Charts.line(cv, [{
            name: dim.name, color: dim.color,
            points: pts.map(p => ({ x: p.key, y: p.value }))
          }], { height: 130, yFormat: v => String(Math.round(v)), min: 0, max: 10 });
        } catch (e) { console.warn('日记趋势画失败', e); }
      }, 0);
      card.appendChild(U.el('div', {
        style: { fontSize: '10.5px', color: 'var(--text-faint)', textAlign: 'center', marginTop: '4px' },
        text: `${dim.name}（满分 10）· 只画做过小结的期`
      }));
    } else {
      card.appendChild(U.el('div', { style: { fontSize: '12px', color: 'var(--text-dim)' },
        text: '这一维度还没有数据。' }));
    }
    root.appendChild(card);
  }

  async function makeDigest(regen) {
    if (!Diary.aiReady()) return toastNoAi();
    const k = curKey();
    const label = Diary.label(VS.gran, k);
    App.confirm(regen ? `重新生成「${label}」的小结？会覆盖原来那份。` : `让 AI 读一遍「${label}」的日记，写一份小结？`,
      async () => {
        U.toast('AI 正在读…', 'info');
        try {
          const chats = await Diary.chats(VS.gran, k);
          const payload = await Diary.runDigest(VS.gran, k, chats);
          await Diary.saveDigest(VS.gran, k, payload);
          U.toast('小结已保存', 'ok');
          Views.diary();
        } catch (e) {
          U.toast('生成失败：' + e.message, 'err');
        }
      }, regen ? '重新生成' : '生成');
  }

  function toastNoAi() {
    App.sheet('还没配 AI', [
      U.el('p', { style: { fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.7', marginTop: 0 },
        text: '日记的 AI 是**单独配置**的，跟外面那套不共用（可以填不同的 Key 和模型）。' }),
      U.el('button', {
        class: 'btn primary block', text: '去配置',
        onclick: () => { App.closeSheet(); VS.tab = 'settings'; setTimeout(() => Views.diary(), 260); }
      })
    ], { autofocus: false });
  }

  /* ═══════════ 谈话 ═══════════ */
  async function tabChat(root) {
    root.appendChild(granBar(VS.gran, g => { VS.gran = g; VS.key = null; VS.chatId = null; Views.diary(); }));
    root.appendChild(rangeNav(() => { VS.chatId = null; Views.diary(); }));

    const k = curKey();
    const entries = await Diary.entriesIn(VS.gran, k);
    const chats = await Diary.chats(VS.gran, k);

    root.appendChild(U.el('div', { class: 'card' }, [
      U.el('p', { style: { fontSize: '12.5px', color: 'var(--text-dim)', lineHeight: '1.7', margin: '0 0 10px' },
        text: entries.length
          ? `AI 会读这 ${entries.length} 天的日记，还有同时期的作息/饮食/任务记录，然后跟你聊。`
          : '这一期还没写日记。AI 只能凭客观记录跟你聊，先把日记补上会好得多。' }),
      U.el('button', {
        class: 'btn primary block', text: '开始新谈话',
        onclick: () => { VS.chatId = null; VS.chatMsgs = []; openChatSheet(); }
      })
    ]));

    if (chats.length) {
      root.appendChild(U.el('div', { class: 'section-label', text: `已保存的谈话（${chats.length}）` }));
      chats.forEach(c => {
        const last = (c.messages || []).filter(m => m.role === 'assistant').slice(-1)[0];
        root.appendChild(U.el('div', {
          class: 'card tight', style: { marginBottom: '7px', cursor: 'pointer' },
          onclick: () => { VS.chatId = c.id; VS.chatMsgs = (c.messages || []).slice(); openChatSheet(); }
        }, [
          U.el('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '3px' } }, [
            U.el('span', { style: { fontSize: '12px', fontWeight: '600' },
              text: (c.messages || []).length ? ((c.messages.filter(m => m.role === 'user')[0] || {}).content || '').slice(0, 24) : '（空）' }),
            U.el('span', { style: { fontSize: '10.5px', color: 'var(--text-faint)' },
              text: c.createdAt ? c.createdAt.slice(0, 10) : '' })
          ]),
          U.el('div', { style: { fontSize: '11.5px', color: 'var(--text-dim)', lineHeight: '1.5' },
            text: last ? String(last.content).replace(/\s+/g, ' ').slice(0, 60) + '…' : '' })
        ]));
      });
    } else {
      root.appendChild(App.empty('这一期还没聊过', '聊完会自动存下来，之后能翻回去看。'));
    }
  }

  function openChatSheet() {
    if (!Diary.aiReady()) return toastNoAi();
    const k = curKey();
    const msgs = VS.chatMsgs;

    const list = U.el('div', { class: 'ai-out', style: { maxHeight: '46vh', overflowY: 'auto' } });
    const input = U.el('textarea', {
      class: 'textarea', style: { minHeight: '64px' }, placeholder: '想说什么就说什么…'
    });

    function paintBusy(on) {
      sendBtn.disabled = !!on;
      sendBtn.textContent = on ? '…' : '发送';
    }

    function bubble(role, text) {
      const isMe = role === 'user';
      return U.el('div', { style: { marginBottom: '10px', textAlign: isMe ? 'right' : 'left' } }, [
        U.el('div', {
          style: {
            display: 'inline-block', textAlign: 'left', maxWidth: '86%',
            padding: '9px 12px', borderRadius: '12px', fontSize: '13.5px', lineHeight: '1.75',
            background: isMe ? 'var(--brand-soft, rgba(59,110,246,.14))' : 'var(--bg-soft, rgba(127,127,127,.10))'
          },
          html: isMe ? esc(text) : App.md(text)
        })
      ]);
    }

    function paint() {
      list.innerHTML = '';
      if (!msgs.length) {
        list.appendChild(U.el('div', { style: { fontSize: '12px', color: 'var(--text-faint)', textAlign: 'center', padding: '16px 0' },
          text: '还没开始。点「让他先说」或者直接打字。' }));
      }
      msgs.forEach(m => list.appendChild(bubble(m.role, m.content)));
      list.scrollTop = list.scrollHeight;
    }

    const sendBtn = U.el('button', {
      class: 'btn primary', style: { flexShrink: '0' }, text: '发送',
      onclick: () => send(input.value.trim())
    });

    async function send(text, opts) {
      const auto = opts && opts.auto;
      if (!auto && !text) return;
      if (VS.chatBusy) return;
      VS.chatBusy = true;
      paintBusy(true);

      if (!auto) {
        msgs.push({ role: 'user', content: text });
        input.value = '';
        paint();
      }

      /* 占位气泡，流式往里填 */
      const ph = { role: 'assistant', content: '' };
      msgs.push(ph);
      paint();
      const lastEl = list.lastChild;

      try {
        const history = msgs.slice(0, -1);      // 不含刚推入的空助手上
        const payload = auto
          ? await Diary.buildOpenPrompt(VS.gran, curKey())
          : await Diary.buildChatMessages(VS.gran, curKey(), history.filter(m => m.content), text);

        let acc = '';
        await Diary.runChat(payload, (d, full) => {
          acc = full;
          ph.content = full;
          if (lastEl) {
            lastEl.innerHTML = '';
            lastEl.appendChild(bubble('assistant', full));
            list.scrollTop = list.scrollHeight;
          }
        });
        if (!acc.trim()) throw new Error('AI 没返回内容');

        /* 每聊完一轮就存一次 —— 用户要求「每次谈话需要保存」 */
        const save = msgs.filter(m => m.content).map(m => ({ role: m.role, content: m.content }));
        if (VS.chatId) await Diary.updateChat(VS.chatId, save, { model: Diary.aiCfg().model });
        else {
          const rec = await Diary.saveChat(VS.gran, curKey(), save, { model: Diary.aiCfg().model });
          VS.chatId = rec.id;
        }
        VS.chatMsgs = save;
        U.toast('已保存', 'ok');
      } catch (e) {
        msgs.pop();
        paint();
        list.appendChild(U.el('div', { style: { color: 'var(--danger)', fontSize: '12.5px' }, text: '出错：' + e.message }));
      } finally {
        VS.chatBusy = false;
        paintBusy(false);
      }
    }

    paint();

    const body = [
      U.el('div', { style: { fontSize: '11.5px', color: 'var(--text-faint)', marginBottom: '8px' },
        text: Diary.label(VS.gran, curKey()) + ' · 聊完自动保存（加密）' }),
      list
    ];

    const foot = [
      U.el('button', {
        class: 'btn ghost', style: { flexShrink: '0' }, text: '让他先说',
        onclick: () => send('', { auto: true })
      }),
      U.el('button', {
        class: 'btn ghost', style: { flexShrink: '0' }, text: '关闭',
        onclick: () => { App.closeSheet(); Views.diary(); }
      })
    ];

    App.sheet('谈话', body, { footer: foot, autofocus: false });

    /* 输入框 + 发送放在正文最下面（底部固定栏留给「让他先说 / 关闭」） */
    U.$('#sheetBody').appendChild(U.el('div', { class: 'row', style: { marginTop: '10px', alignItems: 'flex-end' } }, [
      U.el('div', { style: { flex: '1' } }, [input]),
      sendBtn
    ]));
  }

  /* ═══════════ 设置 ═══════════ */
  function tabSettings(root) {
    const c = Diary.aiCfg();
    const d = S.settings.diary;

    /* ── AI ── */
    root.appendChild(U.el('div', { class: 'section-label', text: '日记的 AI（单独配置）' }));
    root.appendChild(U.el('div', {
      class: 'hint',
      style: { fontSize: '11.5px', color: 'var(--text-dim)', marginBottom: '10px', lineHeight: '1.65' },
      html: '这里的 Key <b>和外面「设置 → AI 助手」那一套完全独立</b>，互不影响。'
        + '可以填同一个 Key，也可以用不同的服务商和模型。'
        + '<br>选型建议见「说明」页。'
    }));

    const presets = Object.keys(AI.PRESETS).map(k => ({ value: k, label: AI.PRESETS[k].name }));
    root.appendChild(App.field('服务商', App.selectEl(presets, c.provider, v => {
      c.provider = v;
      const p = AI.PRESETS[v];
      if (p && p.baseURL) { c.baseURL = p.baseURL; if (p.models && p.models[0]) c.model = p.models[0]; }
      Views.diary();
    })));
    root.appendChild(App.field('接口地址', U.el('input', {
      class: 'input', type: 'text', value: c.baseURL,
      oninput: e => { c.baseURL = e.target.value.trim(); }
    })));
    root.appendChild(App.field('API Key', U.el('input', {
      class: 'input', type: 'password', value: c.apiKey, placeholder: 'sk-...',
      oninput: e => { c.apiKey = e.target.value.trim(); c.enabled = !!c.apiKey; }
    })));

    /* 模型：优先给「适合文本深聊」的清单，避免用户随手选了个识图模型 */
    const isDash = /dashscope/.test(c.baseURL || '');
    const opts = isDash ? AI.TEXT_MODELS.slice()
      : (AI.PRESETS[c.provider] && AI.PRESETS[c.provider].models || []).map(x => ({ value: x, label: x }));
    if (c.model && !opts.some(o => o.value === c.model)) opts.unshift({ value: c.model, label: c.model + '（当前）' });
    root.appendChild(App.field('模型', opts.length ? App.selectEl(opts, c.model, v => { c.model = v; Views.diary(); })
      : U.el('input', { class: 'input', value: c.model, oninput: e => { c.model = e.target.value.trim(); } }),
      '文本 / 交流类推荐 qwen3.8-max；只想省钱可用 qwen3.7-plus'));

    root.appendChild(App.field('温度（越高越随意）', U.el('input', {
      class: 'input', type: 'number', step: '0.05', value: c.temperature,
      oninput: e => { const v = Number(e.target.value); if (isFinite(v)) c.temperature = U.clamp(v, 0, 1.5); }
    }), '聊天建议 0.8~1.0；写小结时会自动降到 0.5'));

    root.appendChild(U.el('div', { class: 'row', style: { marginBottom: '18px' } }, [
      U.el('button', {
        class: 'btn ghost grow sm', text: '测试连接',
        onclick: async e => {
          const b = e.currentTarget;
          b.disabled = true; b.textContent = '测试中…';
          try {
            c.enabled = true;
            const out = await AI.test(c);
            S.saveNow();
            U.toast('连接成功：' + out.slice(0, 16), 'ok');
          } catch (err) { U.toast(err.message, 'err'); }
          finally { b.disabled = false; b.textContent = '测试连接'; }
        }
      }),
      U.el('button', {
        class: 'btn ghost grow sm', text: '获取 Key',
        onclick: () => {
          const p = AI.PRESETS[c.provider];
          if (p && p.keyURL) window.open(p.keyURL, '_blank');
          else U.toast('该服务商没有预设链接');
        }
      })
    ]));

    /* ── AI 能看到什么 ── */
    root.appendChild(U.el('div', { class: 'section-label', text: 'AI 能看到什么' }));
    root.appendChild(toggleRow('参考客观数据', d.useContext, v => { d.useContext = v; Views.diary(); },
      '除了日记，还让 AI 看同时期的作息 / 饮食 / 任务 / 账目。它才判断得出「你说的累是真的累，还是只是这周写得多」。'));
    if (d.useContext) {
      const parts = d.useContextParts || (d.useContextParts = {});
      const names = { sleep: '作息', meals: '饮食', tasks: '任务', money: '账目', weight: '体重' };
      Object.keys(names).forEach(k => {
        root.appendChild(toggleRow('　└ ' + names[k], parts[k] !== false,
          v => { parts[k] = v; }, ''));
      });
    }
    root.appendChild(U.el('div', {
      class: 'hint',
      style: { fontSize: '11px', color: 'var(--text-faint)', margin: '4px 0 18px', lineHeight: '1.6' },
      text: '这些数据只在「问 AI 的那一刻」随请求发出去，平时不出手机。'
    }));

    /* ── 安全 ── */
    root.appendChild(U.el('div', { class: 'section-label', text: '安全' }));
    root.appendChild(App.field('闲置多久自动上锁（分钟，0 = 不自动锁）', U.el('input', {
      class: 'input', type: 'number', value: d.autoLockMinutes,
      oninput: e => { const v = Number(e.target.value); d.autoLockMinutes = isFinite(v) && v >= 0 ? v : 5; S.save(); }
    }), '离开后超过这个时间没动，就要重新输密码'));

    root.appendChild(U.el('div', { class: 'row wrap', style: { marginBottom: '18px' } }, [
      U.el('button', {
        class: 'btn ghost sm grow', text: '立即上锁',
        onclick: () => { Diary.lock(); VS.tab = 'write'; U.toast('已上锁', 'ok'); Views.diary(); }
      }),
      U.el('button', {
        class: 'btn ghost sm grow', text: '修改密码',
        onclick: changePwSheet
      })
    ]));

    /* ── 备份 ── */
    root.appendChild(U.el('div', { class: 'section-label', text: '备份' }));
    root.appendChild(U.el('div', {
      class: 'hint',
      style: { fontSize: '11.5px', color: 'var(--text-dim)', marginBottom: '10px', lineHeight: '1.7' },
      html: '日记<b>跟着设置页的「导出备份」一起走</b>，不用单独导出。'
        + '备份里存的是密文，<b>没有密码打不开</b>。'
        + '<br>换新手机后：导入备份 → 进日记 → 用<b>原来的密码</b>解锁。'
    }));
    root.appendChild(U.el('button', {
      class: 'btn ghost block sm', style: { marginBottom: '18px' }, text: '去导出 / 导入备份',
      onclick: () => { App.closeSheet(); setTimeout(App.openSettings, 200); }
    }));

    /* ── 危险操作 ── */
    root.appendChild(U.el('div', { class: 'section-label', text: '危险操作' }));
    root.appendChild(U.el('button', {
      class: 'btn danger block sm',
      text: '清空整个日记（含密码）',
      onclick: () => App.confirm(
        '这会删掉所有日记、谈话和小结，并清除密码。无法恢复。确定吗？',
        () => { Diary.wipe(); VS.tab = 'write'; U.toast('日记已清空', 'ok'); Views.diary(); },
        '全部删除')
    }));

    root.appendChild(U.el('button', {
      class: 'btn primary block', style: { marginTop: '18px' }, text: '保存设置',
      onclick: () => { S.saveNow(); U.toast('已保存', 'ok'); Views.diary(); }
    }));
  }

  function toggleRow(label, on, onChange, hint) {
    return U.el('div', { style: { marginBottom: '10px' } }, [
      U.el('label', { class: 'row', style: { gap: '10px', alignItems: 'center', cursor: 'pointer' } }, [
        U.el('input', {
          type: 'checkbox', checked: !!on,
          style: { width: '18px', height: '18px', accentColor: 'var(--accent)', flexShrink: '0' },
          onchange: e => { onChange(e.target.checked); S.save(); if (hint) Views.diary(); }
        }),
        U.el('span', { style: { fontSize: '13px' }, text: label })
      ]),
      hint ? U.el('div', { style: { fontSize: '11px', color: 'var(--text-faint)', marginTop: '3px', lineHeight: '1.6' }, text: hint }) : null
    ]);
  }

  function changePwSheet() {
    let oldPw = '', np1 = '', np2 = '';
    const err = U.el('div', { style: { color: 'var(--danger)', fontSize: '12.5px', minHeight: '18px' } });
    App.sheet('修改密码', [
      U.el('p', { style: { fontSize: '12.5px', color: 'var(--text-dim)', lineHeight: '1.7', marginTop: 0 },
        text: '改密码会把所有日记用新密码重新加密一遍。中途别关页面。' }),
      App.field('当前密码', U.el('input', { class: 'input', type: 'password', oninput: e => { oldPw = e.target.value; } })),
      App.field('新密码', U.el('input', { class: 'input', type: 'password', oninput: e => { np1 = e.target.value; } })),
      App.field('再输一遍', U.el('input', { class: 'input', type: 'password', oninput: e => { np2 = e.target.value; } })),
      err,
      U.el('div', { class: 'row', style: { marginTop: '12px' } }, [
        U.el('button', { class: 'btn ghost grow', text: '取消', onclick: () => App.closeSheet() }),
        U.el('button', {
          class: 'btn primary grow', text: '改',
          onclick: async e => {
            if (np1.length < 6) { err.textContent = '新密码至少 6 位'; return; }
            if (np1 !== np2) { err.textContent = '两次输入不一样'; return; }
            const b = e.currentTarget;
            b.disabled = true; b.textContent = '重新加密中…';
            try {
              await Diary.changePassword(oldPw, np1);
              App.closeSheet();
              U.toast('密码已改，全部日记已重新加密', 'ok');
              Views.diary();
            } catch (ex) { err.textContent = ex.message; }
            finally { b.disabled = false; b.textContent = '改'; }
          }
        })
      ])
    ], { autofocus: false });
  }

  /* ═══════════ 说明（内置，不接外层手册） ═══════════ */
  function tabHelp(root) {
    const H = [];
    function sec(title, nodes) {
      H.push(U.el('div', { class: 'section-label', text: title }));
      [].concat(nodes).forEach(n => n && H.push(n));
    }
    function p(text) {
      return U.el('p', { style: { fontSize: '13px', lineHeight: '1.8', color: 'var(--text-dim)', margin: '0 0 10px' }, text });
    }
    function steps(list) {
      return U.el('div', { style: { marginBottom: '14px' } }, list.map((s, i) =>
        U.el('div', { style: { display: 'flex', gap: '8px', marginBottom: '6px' } }, [
          U.el('span', { style: { color: 'var(--brand)', fontWeight: '600', flexShrink: '0' }, text: (i + 1) + '.' }),
          U.el('span', { style: { fontSize: '12.5px', lineHeight: '1.7' }, text: s })
        ])));
    }

    sec('怎么进来', [
      p('这一块不在底部导航里 —— 长按底部「今天」那个标签约 1.2 秒就能进来。'),
      p('第一次进来会让你设密码，之后每次都要输密码。'),
      U.el('div', {
        style: {
          fontSize: '12px', lineHeight: '1.7', padding: '10px', marginBottom: '14px',
          background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 'var(--radius-sm)'
        },
        text: '⚠️ 忘记密码 = 日记打不开。没有「找回」流程 —— 能帮你找回，就等于别人也能打开。'
          + '唯一的出路是解锁页下面的「重置日记」：密码会清掉、日记重新可用，'
          + '但里面的内容会一起永久删除。'
      })
    ]);

    sec('日记', [
      p('一天一篇。点「写今天」写今天的，「选日期」可以补写以前某天。'),
      p('右下角会记字数，当天心情可以顺手选一个 1~10 的分数，不选也行。'),
      p('写的东西保存时立刻加密，存储里只有乱码。')
    ]);

    sec('回顾（本模块自己的，跟外面「回顾」不通用）', [
      p('分日 / 周 / 月 / 年四档。每档可以「生成小结」：AI 读一遍这段时间的日记，产出两样东西——'),
      U.el('div', { style: { marginBottom: '10px' } }, [
        U.el('div', { style: { fontSize: '12.5px', lineHeight: '1.7' }, text: '① 内容简概：客观地说你这段时间写了什么' }),
        U.el('div', { style: { fontSize: '12.5px', lineHeight: '1.7' }, text: '② 想对你说的话：用朋友的口吻，不是医生口吻' })
      ]),
      p('另外会给六个维度打分（整体 / 情绪 / 精力 / 身体 / 学业 / 人际，满分 10）。小结会存下来，'
        + '所以「状态变化」那张图才画得出来 —— 它只画做过小结的期，没做的地方是断的，不会瞎补。'),
      p('样本太少时会黄字提醒。小于 40% 的覆盖率下那条线不该当成趋势看。')
    ]);

    sec('谈话', [
      p('选一个时间段，跟 AI 聊。它会先读这段时间的日记和客观记录，再开口。'),
      p('每聊完一轮就自动保存（加密的），下次点那条记录能接着聊。'),
      p('两种开头：「开始新谈话」自己说第一句，或者「让他先说」让它主动开口。')
    ]);

    sec('AI 怎么配', [
      p('这一块的 AI 是独立配置的：设置 → 日记的 AI。填的 Key 跟外面那套互不影响。'),
      p('模型怎么选（都是百炼上的名字）：'),
      U.el('div', { style: { marginBottom: '14px' } }, [
        ['qwen3.8-max', '最强，深聊和月度/年度总结首选。日记这个量级一个月也就几毛钱。'],
        ['qwen3.7-plus', '性价比之选，日常谈话够用，比 max 便宜。'],
        ['qwen3.8-flash', '最便宜，只做粗小结可以，深聊会显得敷衍。'],
        ['qwen-max / qwen-plus', '上一代，仍可用，但长对话里更容易说套话。']
      ].map(([m, why]) => U.el('div', { style: { marginBottom: '6px' } }, [
        U.el('div', { style: { fontSize: '12.5px', fontWeight: '600' }, text: m }),
        U.el('div', { style: { fontSize: '11.5px', color: 'var(--text-dim)', lineHeight: '1.6' }, text: why })
      ]))),
      p('温度建议 0.8~1.0（聊天要有点人味）；做小结时程序会自动降到 0.5，让评分稳一点。')
    ]);

    sec('安全和备份', [
      p('加密方式：PBKDF2-SHA256（20 万次）从密码派生出密钥，'
        + '再用 AES-256-GCM 逐条加密。盐和校验块跟数据一起存，但没有密码就用不了。'),
      p('密钥只存在内存里，从不写进存储 —— 所以刷新页面等于自动上锁。'),
      p('能防住什么：别人拿到你手机、翻浏览器存储、甚至拿到你导出的备份文件，都只能看到乱码。'),
      U.el('div', {
        style: {
          fontSize: '12px', lineHeight: '1.7', padding: '10px', marginBottom: '14px',
          background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 'var(--radius-sm)'
        },
        text: '防不住什么：这是客户端加密，密码强度就是你数据的强度。'
          + '如果有人专门针对你、又拿到了备份文件，理论上可以离线慢慢猜密码。'
          + '所以别用生日、学号、手机号。'
      }),
      p('备份：日记跟着「设置 → 导出备份」一起走，不用单独导。备份里是密文，没密码打不开。'),
      steps([
        '旧手机：设置 → 导出备份',
        '文件传到新手机',
        '新手机：设置 → 导入备份',
        '进日记，用原来的密码解锁'
      ]),
      p('注意：如果新手机上已经另外设过日记密码、而且已经写过日记，'
        + '系统会拒绝导入备份里的日记内容 —— 因为两把不同的钥匙没法混在一起。'
        + '会明确告诉你，不会悄悄混成一堆打不开的乱码。')
    ]);

    root.appendChild(U.el('div', { class: 'card' }, H));
  }

  Views.diaryInternal = { VS, openEditor };
})(window);