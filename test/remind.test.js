/**
 * 提醒策略测试
 * ─────────────
 * 用户的规则（这是产品需求，不是实现细节）：
 *
 *   ① 导入时有确切截止日期的事项
 *      → 只在「截止日前一天 18:00」提醒一次
 *
 *   ② 用户特别标记为「日常活动」的
 *      → 每天 18:00 提醒
 *
 *   ③ 既没有截止日期、也没安排时间的事项
 *      → 归为「长期任务」：不排期、不提醒，
 *        一直待在长期待办栏里，用户可以自己调优先级
 *
 * 这组测试就是把这些规则钉死，以后改动碰到它们会立刻红。
 */
const { load } = require('./harness');
load('js/utils.js', 'js/store.js', 'js/ics.js', 'js/schedule.js');

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== '' ? '  ' + extra : '')); }
}
/* 本文件用 ok() 一种断言就够，eq 只是把「相等」写得更清楚 */
function eq(name, got, want) { ok(name, got === want, '得到 ' + JSON.stringify(got) + '，期望 ' + JSON.stringify(want)); }

/* .ics 里现在写的是 **UTC**（18:00 北京时间 = 10:00Z）。
   所以断言不能再去钉 "T1800" 这个字符串 ——
   第一，那样等于把「提醒几点响」和「文件里怎么写」绑死；
   第二，换台非 UTC+8 的机器跑就会红。
   这两个辅助函数把 UTC 时间戳换算回**本地时刻**再比，
   测的还是原来那个需求：提醒在本地 18:00 响。 */
function icsDtstart(block) {
  const m = String(block || '').match(/DTSTART[^:]*:(\d{8}T\d{6}Z?)/);
  return m ? m[1] : null;
}
function localTimeOf(ics) {
  const m = String(ics || '').match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/);
  if (!m) return null;
  /* 带 Z 的按 UTC 解释，不带的按本地解释（两种都兼容） */
  const d = /Z$/.test(ics)
    ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]))
    : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return {
    ymd: `${d.getFullYear()}${U.pad(d.getMonth() + 1)}${U.pad(d.getDate())}`,
    hm: `${U.pad(d.getHours())}${U.pad(d.getMinutes())}`
  };
}

S.init();
const today = U.today();
const d = n => U.ymd(U.addDays(today, n));

/* ═══════════ 1. 类型判定 ═══════════ */
console.log('\n=== 1. 任务类型判定 ===');

ok('有截止日 → deadline', S.kindOf({ due: d(3) }) === 'deadline');
ok('显式 daily → daily', S.kindOf({ kind: 'daily' }) === 'daily');
ok('显式 longterm → longterm', S.kindOf({ kind: 'longterm' }) === 'longterm');
ok('什么都没有 → longterm', S.kindOf({ title: 'x' }) === 'longterm');
ok('空 due 字符串 → longterm', S.kindOf({ due: '' }) === 'longterm');
ok('只有 due 空白 → longterm', S.kindOf({ due: '   ' }) === 'longterm');
ok('显式 kind 优先于推断', S.kindOf({ due: d(1), kind: 'daily' }) === 'daily');
ok('老数据 repeat=daily 兼容成 daily', S.kindOf({ repeat: 'daily' }) === 'daily');

/* ═══════════ 2. 长期任务不排期不提醒 ═══════════ */
console.log('\n=== 2. 长期任务：不排期、不提醒 ===');

S.reset();
S.init();
const lt = S.add('tasks', { title: '看完 SLAM 十四讲', cat: 'cv' });
const lt2 = S.add('tasks', { title: '学 ROS2 导航', cat: 'cv', kind: 'longterm', priority: 3 });

ok('长期任务在长期栏里', S.longTerm().length === 2, S.longTerm().length);
ok('长期任务不排期', Sch.suggest(lt) === null);
ok('长期任务批量排期也不排', Sch.plan([lt, lt2]).every(p => p.slot === null));

const gen1 = ICS.generate({ days: 30 });
ok('长期任务不产生日历事件',
  !gen1.text.includes('SLAM') && !gen1.text.includes('ROS2'), gen1.count + ' 个事件');

/* ═══════════ 3. 有截止日 → 截止前一天 18:00 ═══════════ */
console.log('\n=== 3. 有截止日：截止前一天 18:00 提醒 ===');

S.reset();
S.init();
const dueTask = S.add('tasks', { title: '交CV大作业', cat: 'cv', due: d(10) });
const gen2 = ICS.generate({ days: 30 });

ok('生成了截止提醒', gen2.text.includes('明天截止'), gen2.count + ' 个事件');
const ddl = gen2.text.split('BEGIN:VEVENT').find(b => b.includes('明天截止'));
ok('提醒文案含任务名', ddl && ddl.includes('交CV大作业'));
const t1 = localTimeOf(icsDtstart(ddl));
const expectDay = U.ymd(U.addDays(today, 9)).replace(/-/g, '');
ok('提醒日期 = 截止前一天', t1 && t1.ymd === expectDay, t1 && t1.ymd + ' vs ' + expectDay);
ok('提醒时刻 = 本地 18:00', t1 && t1.hm === '1800', t1 && t1.hm);
ok('带 VALARM 保证真会响', ddl && ddl.includes('BEGIN:VALARM'));

/* 截止当天不应该再提醒（只提前一天） */
const sameDayBlocks = gen2.text.split('BEGIN:VEVENT').filter(b => {
  const lt = localTimeOf(icsDtstart(b));
  return b.includes('明天截止') && lt &&
    lt.ymd === U.ymd(U.addDays(today, 10)).replace(/-/g, '');
});
ok('截止当天不额外提醒', sameDayBlocks.length === 0, sameDayBlocks.length + ' 个');

/* ═══════════ 4. 日常活动 → 每天 18:00 ═══════════ */
console.log('\n=== 4. 日常活动：每天 18:00 提醒 ===');

S.reset();
S.init();
const daily = S.add('tasks', { title: '背单词', cat: 'study', kind: 'daily' });
const gen3 = ICS.generate({ days: 5 });

const dailyBlocks = gen3.text.split('BEGIN:VEVENT').filter(b => b.includes('🔁 日常活动'));
ok('5 天生成 5 个日常提醒', dailyBlocks.length === 5, dailyBlocks.length + ' 个');
ok('日常提醒都是本地 18:00',
  dailyBlocks.every(b => { const lt = localTimeOf(icsDtstart(b)); return lt && lt.hm === '1800'; }),
  dailyBlocks.map(b => (localTimeOf(icsDtstart(b)) || {}).hm).join(','));
ok('日常提醒列出任务名', dailyBlocks[0] && dailyBlocks[0].includes('背单词'));
ok('日常活动不排期', Sch.suggest(daily) === null);
ok('日常活动在 dailyTasks 里', S.dailyTasks().some(t => t.id === daily.id));

/* 没有日常活动时不该产生这类事件 */
S.remove('tasks', daily.id);
const gen4 = ICS.generate({ days: 5 });
ok('没有日常活动就不生成日常事件', !gen4.text.includes('🔁 日常活动'));

/* ═══════════ 5. 三类混在一起 ═══════════ */
console.log('\n=== 5. 三类混排 ===');

S.reset();
S.init();
S.add('tasks', { title: '有截止的', cat: 'study', due: d(6) });
S.add('tasks', { title: '每天的', cat: 'life', kind: 'daily' });
S.add('tasks', { title: '长期的', cat: 'cv' });

const gen5 = ICS.generate({ days: 3 });
const blocks = gen5.text.split('BEGIN:VEVENT').slice(1);
const titles = blocks.map(b => (b.match(/SUMMARY:([^\r\n]*)/) || [])[1] || '');

ok('有截止的进日历', titles.some(t => t.includes('明天截止：有截止的')));
ok('日常的进日历', titles.some(t => t.includes('日常活动')));
ok('长期的完全不进日历', !gen5.text.includes('长期的'), titles.join(' | '));
ok('长期的数量对得上', S.longTerm().length === 1, S.longTerm().length);
ok('有截止的数量对得上', S.deadlineTasks().length === 1);
ok('日常的数量对得上', S.dailyTasks().length === 1);

/* ═══════════ 6. 长期栏的排序与优先级 ═══════════ */
console.log('\n=== 6. 长期栏排序 ===');

S.reset();
S.init();
const a = S.add('tasks', { title: 'A 低优先', cat: 'life', priority: 0 });
const b = S.add('tasks', { title: 'B 高优先', cat: 'life', priority: 3 });
const c = S.add('tasks', { title: 'C 普通', cat: 'life', priority: 1 });

const order = S.longTerm().map(t => t.title);
ok('长期栏按优先级排序', order[0].startsWith('B'), order.join(' > '));
ok('最低优先级在最后', order[order.length - 1].startsWith('A'), order.join(' > '));

/* 手动上移：把最低的提到最前 */
ok('上移返回 true', S.moveLongTerm(a.id, -1) === true);
const afterUp = S.longTerm().map(t => t.title);
ok('上移后顺序变了', afterUp.indexOf('A 低优先') < order.indexOf('A 低优先'),
  order.join(',') + ' → ' + afterUp.join(','));

ok('越界上移返回 false', S.moveLongTerm(a.id, -99) === false);

/* 已完成的长期任务不该出现在长期栏 */
S.toggleDone(a.id);
ok('完成的长期任务移出长期栏', !S.longTerm().some(t => t.id === a.id));

/* 子任务不进长期栏（跟着父任务走） */
S.reset();
S.init();
const pa = S.add('tasks', { title: '父任务', cat: 'cv' });
S.add('tasks', { title: '子任务', cat: 'cv', parentId: pa.id });
ok('子任务不出现在长期栏', S.longTerm().length === 1 && S.longTerm()[0].title === '父任务',
  S.longTerm().map(t => t.title).join(','));
ok('子任务从属于父任务', S.children(pa.id).length === 1);

/* ═══════════ 7. 提醒时间可配置 ═══════════ */
console.log('\n=== 7. 提醒时刻跟随设置 ===');

S.reset();
S.init();
S.add('tasks', { title: '某任务', cat: 'study', due: d(4) });
S.settings.remind.eveningHour = 20;
S.settings.remind.eveningMinute = 30;
const gen7 = ICS.generate({ days: 10 });
const blk7 = gen7.text.split('BEGIN:VEVENT').find(b => b.includes('明天截止'));
const t7 = localTimeOf(icsDtstart(blk7));
ok('改设置后 18:00 变成 20:30', t7 && t7.hm === '2030', t7 && t7.hm);
S.settings.remind.eveningHour = 18;
S.settings.remind.eveningMinute = 0;

/* ═══════════ 8. 过去的截止日不提醒 ═══════════ */
console.log('\n=== 8. 边界情况 ===');

S.reset();
S.init();
S.add('tasks', { title: '昨天就该交的', cat: 'study', due: d(-5) });
const gen8 = ICS.generate({ days: 10 });
ok('早已过期的截止不生成提醒', !gen8.text.includes('昨天就该交的'));

S.reset();
S.init();
S.add('tasks', { title: '已完成但有截止', cat: 'study', due: d(3), done: true });
const gen9 = ICS.generate({ days: 10 });
ok('已完成的任务不提醒', !gen9.text.includes('已完成但有截止'));

S.reset();
S.init();
S.add('tasks', { title: '明天截止的', cat: 'study', due: d(1) });
const gen10 = ICS.generate({ days: 5 });
ok('截止前一天=今天 → 仍会提醒', gen10.text.includes('明天截止的'));

S.reset();
S.init();
const optOut = ICS.generate({ days: 5, includeDaily: false, includeDeadline: false, includeTasks: false });
ok('全部关掉时事件数为 0', optOut.count === 0, optOut.count);


/* ═══════════ 9. 代填配置清单 ═══════════ */
console.log('\n=== 9. 代填配置清单 ===');

S.reset();
S.init();
const todo0 = S.pendingList();
ok('初始状态下有待填项', todo0.length > 0, todo0.length + ' 项');
ok('待填项含 API Key', todo0.some(x => x.key === 'apiKey'));
ok('待填项含体重', todo0.some(x => x.key === 'weight'));

/* 填了真 key 就该消失 */
S.settings.ai.apiKey = 'sk-real1234567890abcdef';
ok('填了真 key 后不在清单里', !S.pendingList().some(x => x.key === 'apiKey'));

/* 占位文案不算填好 */
S.settings.ai.apiKey = 'sk-替换成你的百炼APIKey';
ok('占位文案仍算未填', S.pendingList().some(x => x.key === 'apiKey'));

/* 空值也算未填 */
S.settings.ai.apiKey = '';
ok('空 key 算未填', S.pendingList().some(x => x.key === 'apiKey'));

/* 填体重 */
S.settings.body.weight = 72;
ok('填了体重后不在清单里', !S.pendingList().some(x => x.key === 'weight'));

/* applyPending 能把代填值写进去 */
S.reset();
S.init();
S.settings.pending.weight = 70;
S.applyPending('weight');
ok('applyPending 写入了体重', S.settings.body.weight === 70, S.settings.body.weight);
ok('写完后不在待填清单', !S.pendingList().some(x => x.key === 'weight'));

/* 全部填完 → 清单为空 */
S.reset();
S.init();
S.settings.ai.apiKey = 'sk-real1234567890abcdef';
S.settings.body.weight = 70;
S.settings.body.dailyKcal = 1800;
S.settings.money.monthlyIncome = 3000;
ok('全部填完后清单为空', S.pendingList().length === 0, S.pendingList().length);


/* ═══════════════════════════════════
   导出文件的**字节**要对

   用户：「我下载了网站生成的ics文件，选择用系统日历打开，
        但显示没有可导入的文件」
   根因：U.download 无脑给所有文件加 UTF-8 BOM，.ics 第一行变成
        "\ufeffBEGIN:VCALENDAR"，日历解析器就不认了。
   这组断言盯着字节，不看字符串 —— 字符串里 BOM 是隐形的，看不出来。
   ═══════════════════════════════════ */
console.log('\n═══ 导出文件不带 BOM ═══');

/* 把 U.download 实际要写进 Blob 的那份内容截下来 */
function captureDownload(fn) {
  const origBlob = global.Blob;
  let captured = null;
  global.Blob = function (parts, opts) {
    captured = { text: parts.join(''), mime: opts && opts.type };
    return { __fake: true, type: opts && opts.type };
  };
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:fake';
  URL.revokeObjectURL = () => {};
  const origAppend = document.body.appendChild;
  const origCreateEl = document.createElement;
  document.body.appendChild = n => n;
  /* U.download 会造一个 <a> 然后 a.click()。harness 里的 createElement
     是个假实现，没有 click —— 补上一个记号的替身。 */
  document.createElement = tag => (String(tag).toLowerCase() === 'a'
    ? { href: '', download: '', click() { this.clicked = true; }, remove() {}, style: {} }
    : origCreateEl.call(document, tag));
  try { fn(); } finally {
    global.Blob = origBlob;
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
    document.body.appendChild = origAppend;
    document.createElement = origCreateEl;
  }
  return captured;
}

S.reset();
S.add('tasks', { title: '交报告', kind: 'deadline', due: U.ymd(U.addDays(U.today(), 3)), status: 'todo' });
const dl = captureDownload(() => ICS.download({ days: 30 }));
ok('确实触发了下载', !!dl, '没抓到下载内容');
ok('MIME 是 text/calendar', /text\/calendar/.test(dl.mime || ''), '实际是 ' + dl.mime);

const bytes = Buffer.from(dl.text, 'utf8');
ok('前 3 字节不是 BOM (ef bb bf)',
   !(bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF),
   '前 3 字节 = ' + [...bytes.slice(0, 3)].map(b => b.toString(16)).join(' '));
eq('文件第一行就是 BEGIN:VCALENDAR（没有任何前缀）',
   dl.text.split('\r\n')[0], 'BEGIN:VCALENDAR');
ok('第一个字符不是 \\ufeff', dl.text.charCodeAt(0) !== 0xFEFF,
   '第一字符码 = ' + dl.text.charCodeAt(0));

/* 结构完整性：手机日历挑食，少一样都可能不认 */
ok('以 BEGIN:VCALENDAR 开头', dl.text.startsWith('BEGIN:VCALENDAR'));
ok('以 END:VCALENDAR 结尾', dl.text.trimEnd().endsWith('END:VCALENDAR'));
ok('有 VERSION:2.0', /\r\nVERSION:2\.0\r\n/.test(dl.text));
ok('有 PRODID', /\r\nPRODID:/.test(dl.text));
ok('用 CRLF 换行（iCalendar 规范要求）', /\r\n/.test(dl.text));
ok('没有裸 LF（挑食的解析器会挂）', !/[^\r]\n/.test(dl.text), '有裸 LF 行');
ok('有 VEVENT', /BEGIN:VEVENT/.test(dl.text));

/* JSON 备份同样不能带 BOM —— JSON.parse 遇到 BOM 直接抛 */
S.reset();
const jdl = captureDownload(() => {
  U.download('backup.json', JSON.stringify(S.exportAll(), null, 2), 'application/json');
});
ok('JSON 备份也拿到了', !!jdl);
eq('JSON 第一个字符是 {', jdl.text[0], '{');
ok('JSON 不带 BOM', jdl.text.charCodeAt(0) !== 0xFEFF);
ok('JSON 能被 JSON.parse 直接吃下（不会 Unexpected token）',
   (() => { try { JSON.parse(jdl.text); return true; } catch (e) { return false; } })());

/* ── 兼容性：小米/安卓日历挑食，这几条都是「被拒」的高发点 ── */

/* ① 时间必须带 Z（UTC）。浮动时间 + VTIMEZONE 那套在国产解析器上翻过车。 */
const dtstarts = dl.text.split('\r\n').filter(l => l.startsWith('DTSTART'));
ok('每个 DTSTART 都以 Z 结尾（UTC）',
   dtstarts.length > 0 && dtstarts.every(l => /Z$/.test(l)),
   '有不是 UTC 的：' + dtstarts.filter(l => !/Z$/.test(l)).slice(0, 3).join(' | '));

/* ② 本地 18:00 必须被正确换算成 UTC。
      不写死 "10:00Z"（那只在 UTC+8 成立），而是按本机时区算出应该是什么，
      这样既能在北京时间下等价于「10:00Z」，又不会在别的时区误报。
      写成 18:00Z（忘了换算）会被这条抓到。 */
const expHmZ = (() => {
  const d = new Date(); d.setHours(18, 0, 0, 0);
  return d.toISOString().slice(11, 16).replace(':', '');
})();
ok('本地 18:00 换算成 UTC 的 ' + expHmZ + 'Z（没有忘换算）',
   new RegExp('DTSTART[^:]*:\\d{8}T' + expHmZ + '00Z').test(dl.text),
   'DTSTART 实际是：' + dl.text.split('\r\n').filter(l => l.startsWith('DTSTART')).slice(0, 2).join(' | '));

/* ③ 绝对不能再有 VTIMEZONE（既然用 UTC 了，留着只会被挑刺） */
ok('文件里没有 VTIMEZONE', !/VTIMEZONE/.test(dl.text), '还留着没人引用的时区块');
/* ④ METHOD 会让人把「导入」当「订阅更新」，去掉 */
ok('文件里没有 METHOD', !/METHOD/.test(dl.text));

/* ⑤ 每个事件只能有一个闹钟。
      以前无条件加 -PT0M、调用方又给一个 minutes:0，变成两个同一时刻的闹钟 */
const evBlocks = dl.text.split('BEGIN:VEVENT').slice(1);
ok('确实生成了事件', evBlocks.length > 0);
/* 真不变量是「**最多**一个闹钟」：截止当天那种纯展示事件本来就该是 0 个。
   以前是每个事件两个同一时刻的闹钟（无条件 -PT0M + 调用方 minutes:0）。 */
ok('没有任何事件带两个以上闹钟',
   evBlocks.every(b => (b.match(/BEGIN:VALARM/g) || []).length <= 1),
   '最多的那个带了 ' +
   Math.max(...evBlocks.map(b => (b.match(/BEGIN:VALARM/g) || []).length)) + ' 个');

/* ⑥ MIME 不能带 charset 参数 —— 安卓会拿它写 MediaStore，
      带参数可能被记成 octet-stream，日历的文件选择器就看不到这个文件 */
eq('MIME 精确等于 text/calendar', dl.mime, 'text/calendar');

/* ── 闹钟三态：不能把「显式不要」当成「没指定」 ──
     用户只要求「截止前一天 18:00 提醒」。
     截止日当天那条是纯展示，一声都不该响 —— 多响一次就是噪音。 */
S.reset();
S.add('tasks', { title: '交报告', kind: 'deadline', due: d(3), status: 'todo' });
const genT = ICS.generate({ days: 10 });
const b8 = genT.text.split('BEGIN:VEVENT').slice(1);

const remindBlk = b8.find(x => x.includes('明天截止'));
const plainBlk = b8.find(x => /SUMMARY:[^\r\n]*交报告/.test(x) && !x.includes('明天截止'));
ok('有「前一天提醒」事件', !!remindBlk);
ok('有「截止当天」展示事件', !!plainBlk);
eq('前一天提醒带 1 个闹钟',
   (remindBlk.match(/BEGIN:VALARM/g) || []).length, 1);
eq('截止当天展示事件不带闹钟（显式 [] 就是不要）',
   (plainBlk.match(/BEGIN:VALARM/g) || []).length, 0);

/* ── 分享路径（安卓上比下载可靠） ──
      node 里没有 navigator.canShare，所以这两条验的是「不支持时别炸」。 */
ok('没有分享能力时 canShare() 返回 false', ICS.canShare() === false);
ok('没有分享能力时 canShare() 不抛异常', (() => { try { ICS.canShare(); return true; } catch (e) { return false; } })());

/* 需要 BOM 的场合要能显式开（给 Excel 认 UTF-8 CSV） */
const csvdl = captureDownload(() => {
  U.download('账单.csv', '日期,金额\n2026-10-01,32', 'text/csv;charset=utf-8', { bom: true });
});
eq('显式要 BOM 时第一个字符是 \\ufeff', csvdl.text.charCodeAt(0), 0xFEFF);

console.log('\n═══════════════════════════════════');
console.log(`结果: ${pass} 通过, ${fail} 失败`);
console.log('═══════════════════════════════════');
process.exit(fail ? 1 : 0);