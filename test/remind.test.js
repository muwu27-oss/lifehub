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
const m = ddl && ddl.match(/DTSTART[^:]*:(\d{8})T(\d{4})/);
const expectDay = U.ymd(U.addDays(today, 9)).replace(/-/g, '');
ok('提醒日期 = 截止前一天', m && m[1] === expectDay, m && m[1] + ' vs ' + expectDay);
ok('提醒时刻 = 18:00', m && m[2] === '1800', m && m[2]);
ok('带 VALARM 保证真会响', ddl && ddl.includes('BEGIN:VALARM'));

/* 截止当天不应该再提醒（只提前一天） */
const sameDayBlocks = gen2.text.split('BEGIN:VEVENT').filter(b =>
  b.includes('明天截止') && /DTSTART[^:]*:(\d{8})/.test(b) &&
  b.match(/DTSTART[^:]*:(\d{8})/)[1] === U.ymd(U.addDays(today, 10)).replace(/-/g, ''));
ok('截止当天不额外提醒', sameDayBlocks.length === 0, sameDayBlocks.length + ' 个');

/* ═══════════ 4. 日常活动 → 每天 18:00 ═══════════ */
console.log('\n=== 4. 日常活动：每天 18:00 提醒 ===');

S.reset();
S.init();
const daily = S.add('tasks', { title: '背单词', cat: 'study', kind: 'daily' });
const gen3 = ICS.generate({ days: 5 });

const dailyBlocks = gen3.text.split('BEGIN:VEVENT').filter(b => b.includes('🔁 日常活动'));
ok('5 天生成 5 个日常提醒', dailyBlocks.length === 5, dailyBlocks.length + ' 个');
ok('日常提醒都是 18:00',
  dailyBlocks.every(b => /DTSTART[^:]*:\d{8}T1800/.test(b)));
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
ok('改设置后 18:00 变成 20:30', blk7 && /DTSTART[^:]*:\d{8}T2030/.test(blk7),
  blk7 && (blk7.match(/DTSTART[^:]*:(\d{8}T\d{4})/) || [])[1]);
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

console.log('\n═══════════════════════════════════');
console.log(`结果: ${pass} 通过, ${fail} 失败`);
console.log('═══════════════════════════════════');
process.exit(fail ? 1 : 0);