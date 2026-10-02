#!/usr/bin/env node
/**
 * history.js — 历史回顾的聚合层
 *
 * 这层是纯计算，不碰 DOM，所以能直接在 Node 里测。
 * 重点测三类东西：
 *   ① 区间边界（跨月、跨年、闰月、周与月的归属）
 *   ② 评分公式的边界（没数据 / 数据很少 / 极端值）
 *   ③ 「没记录」必须是 null，不能用 0 冒充 —— 0 分和没记是两回事
 */
const { load } = require('./harness');
load('js/utils.js', 'js/store.js', 'js/nutrition.js', 'js/history.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
const eq = (n, got, want) => ok(n, got === want, `得到 ${JSON.stringify(got)}，期望 ${JSON.stringify(want)}`);

S.init(); S.reset();

/* ═══════════════ 一、区间 ═══════════════ */
console.log('\n═══ 周区间（周一到周日）═══');
let r = History.range('week', '2026-10-01');   // 周四是 10/1
eq('周一是 9/28', r.start, '2026-09-28');
eq('周日是 10/4', r.end, '2026-10-04');
eq('一周 7 天', r.days, 7);
eq('周号', r.sub, '2026 年第 40 周');

r = History.range('week', '2026-09-28');       // 周一本身
eq('给周一 → 还是这一周', r.start, '2026-09-28');
r = History.range('week', '2026-10-04');       // 周日
eq('给周日 → 还是这一周', r.end, '2026-10-04');
eq('周日的 start 仍为周一', r.start, '2026-09-28');

console.log('\n═══ 跨年那一周 ═══');
r = History.range('week', '2027-01-01');       // 2027-01-01 是周五
eq('周末尾跨到 2027', r.end, '2027-01-03');
eq('周首在 2026', r.start, '2026-12-28');
ok('周号按周四归属（第 53 周）', /第 (52|53) 周/.test(r.sub), r.sub);

console.log('\n═══ 月区间 ═══');
r = History.range('month', '2026-10-15');
eq('月初', r.start, '2026-10-01');
eq('月末', r.end, '2026-10-31');
eq('天数', r.days, 31);
eq('标签', r.label, '2026 年 10 月');
eq('key', r.key, '2026-10');

r = History.range('month', '2026-02-10');
eq('平年 2 月 28 天', r.end, '2026-02-28');
eq('平年 2 月天数', r.days, 28);
r = History.range('month', '2028-02-10');
eq('闰年 2 月 29 天', r.end, '2028-02-29');
eq('闰年 2 月天数', r.days, 29);
r = History.range('month', '2026-04-01');
eq('4 月 30 天', r.days, 30);

console.log('\n═══ 年区间 ═══');
r = History.range('year', '2026-06-15');
eq('年初', r.start, '2026-01-01');
eq('年末', r.end, '2026-12-31');
eq('天数', r.days, 365);
eq('标签', r.label, '2026 年');
eq('key', r.key, '2026');
eq('闰年天数', History.range('year', '2028-06-01').days, 366);

console.log('\n═══ 翻页 ═══');
eq('上一周 → 归到那个周的周一', History.shift('week', '2026-10-01', -1), '2026-09-21');
eq('下一周 → 归到那个周的周一', History.shift('week', '2026-10-01', 1), '2026-10-05');
eq('周翻页幂等（已经是周一）', History.shift('week', '2026-09-21', -1), '2026-09-14');
eq('上一月', History.shift('month', '2026-10-15', -1), '2026-09-01');
eq('下一月', History.shift('month', '2026-12-05', 1), '2027-01-01');
eq('跨年往前', History.shift('month', '2026-01-15', -1), '2025-12-01');
eq('上一年 → 归到 1 月 1 日', History.shift('year', '2026-05-05', -1), '2025-01-01');
eq('闰日往前一年不炸', History.shift('year', '2028-02-29', -1), '2027-01-01');
eq('跨 3 月', History.shift('month', '2026-01-31', 2), '2026-03-01');

console.log('\n═══ 是否在本期 ═══');
ok('今天所在周就是本期', History.isCurrent('week', new Date()));
ok('今天所在月就是本期', History.isCurrent('month', new Date()));
ok('去年不是本期', !History.isCurrent('year', '2020-01-01'));
ok('上个月不是本期', !History.isCurrent('month', History.shift('month', new Date(), -1)));

console.log('\n═══ 区间内所有日期 ═══');
const dl = History.daysIn(History.range('month', '2026-02-05'));
eq('2 月 28 天', dl.length, 28);
eq('第一天', dl[0], '2026-02-01');
eq('最后一天', dl[27], '2026-02-28');
eq('周 7 天', History.daysIn(History.range('week', '2026-10-01')).length, 7);

/* ═══════════════ 二、评分 ═══════════════ */
console.log('\n═══ 睡眠评分 ═══');
S.reset();
eq('没数据 → null（不是 0 分）', History.sleepScore(null), null);
eq('0 天 → null', History.sleepScore({ days: 0 }), null);
ok('7~8.5 小时满分偏高', History.sleepScore({ days: 3, avgHours: 7.5 }) === 100,
   String(History.sleepScore({ days: 3, avgHours: 7.5 })));
ok('睡太少扣分', History.sleepScore({ days: 3, avgHours: 5 }) < 80,
   String(History.sleepScore({ days: 3, avgHours: 5 })));
ok('睡太多也扣分', History.sleepScore({ days: 3, avgHours: 11 }) < 80,
   String(History.sleepScore({ days: 3, avgHours: 11 })));
ok('规律性差会拉低', History.sleepScore({ days: 5, avgHours: 7.5, bedtimeStdMin: 120 })
   < History.sleepScore({ days: 5, avgHours: 7.5, bedtimeStdMin: 10 }));
ok('质量高会拉高', History.sleepScore({ days: 5, avgHours: 7, bedtimeStdMin: 20, avgQuality: 5 })
   > History.sleepScore({ days: 5, avgHours: 7, bedtimeStdMin: 20, avgQuality: 1 }));
ok('分数落在 0~100', (() => {
  const a = History.sleepScore({ days: 9, avgHours: 0.5, bedtimeStdMin: 500, avgQuality: 0 });
  return a >= 0 && a <= 100;
})());

console.log('\n═══ 饮食评分 ═══');
eq('没数据 → null', History.dietScore(null), null);
const dt = { kcalTarget: 1800, proteinTarget: 100 };
ok('热量达标 + 蛋白够 + 记录全 → 高分',
   History.dietScore({ days: 7, avgKcal: 1800, avgProtein: 110, proteinPct: 25, logRate: 1 }, dt) >= 90,
   String(History.dietScore({ days: 7, avgKcal: 1800, avgProtein: 110, proteinPct: 25, logRate: 1 }, dt)));
ok('吃太多扣分',
   History.dietScore({ days: 7, avgKcal: 3000, avgProtein: 110, proteinPct: 25, logRate: 1 }, dt)
   < History.dietScore({ days: 7, avgKcal: 1800, avgProtein: 110, proteinPct: 25, logRate: 1 }, dt));
ok('吃太少也扣分',
   History.dietScore({ days: 7, avgKcal: 600, avgProtein: 110, proteinPct: 25, logRate: 1 }, dt)
   < History.dietScore({ days: 7, avgKcal: 1800, avgProtein: 110, proteinPct: 25, logRate: 1 }, dt));
ok('蛋白不够扣分',
   History.dietScore({ days: 7, avgKcal: 1800, avgProtein: 30, proteinPct: 25, logRate: 1 }, dt)
   < History.dietScore({ days: 7, avgKcal: 1800, avgProtein: 110, proteinPct: 25, logRate: 1 }, dt));
ok('记录坚持度低会拉低总分（只记 1 天不该得高分）',
   History.dietScore({ days: 7, avgKcal: 1800, avgProtein: 110, proteinPct: 25, logRate: 1 / 7 }, dt)
   < History.dietScore({ days: 7, avgKcal: 1800, avgProtein: 110, proteinPct: 25, logRate: 1 }, dt));
ok('10% 以内算达标', (() => {
  const a = History.dietScore({ days: 7, avgKcal: 1900, avgProtein: 110, proteinPct: 25, logRate: 1 }, dt);
  const b = History.dietScore({ days: 7, avgKcal: 1800, avgProtein: 110, proteinPct: 25, logRate: 1 }, dt);
  return a === b;
})());

console.log('\n═══ 综合与档位 ═══');
eq('都没有 → null', History.healthScore(null, null), null);
eq('只有作息 → 就是作息分', History.healthScore(80, null), 80);
eq('只有饮食 → 就是饮食分', History.healthScore(null, 60), 60);
eq('两个取平均', History.healthScore(80, 60), 70);
eq('档位 很好', History.grade(90).tone, 'great');
eq('档位 不错', History.grade(75).tone, 'good');
eq('档位 一般', History.grade(60).tone, 'ok');
eq('档位 偏差', History.grade(45).tone, 'warn');
eq('档位 要改', History.grade(20).tone, 'bad');
eq('无数据档位', History.grade(null).tone, 'none');

/* ═══════════════ 三、作息聚合（跨零点） ═══════════════ */
console.log('\n═══ 平均入睡时间要处理跨零点 ═══');
S.reset();
/* 23:40 和 00:20 只差 40 分钟。
   如果按 0~1440 直接平均，会算成差了 1400 分钟。 */
S.add('sleep', { date: '2026-10-01', bedtime: '23:40', wake: '07:00', hours: 7.3 });
S.add('sleep', { date: '2026-10-02', bedtime: '00:20', wake: '07:00', hours: 6.7 });
let sl = History.sleepOf(History.range('week', '2026-10-01'));
ok('标准差小于 60 分钟（没有被跨零点骗到）', sl.bedtimeStdMin < 60, String(sl.bedtimeStdMin));
eq('平均入睡在 00:00 附近', sl.avgBedtime, '00:00');

S.reset();
S.add('sleep', { date: '2026-10-01', bedtime: '23:00', wake: '07:00', hours: 8 });
S.add('sleep', { date: '2026-10-02', bedtime: '23:00', wake: '07:00', hours: 8 });
sl = History.sleepOf(History.range('week', '2026-10-01'));
eq('完全规律 → 标准差 0', sl.bedtimeStdMin, 0);
eq('平均入睡 23:00', sl.avgBedtime, '23:00');
eq('平均时长 8 小时', sl.avgHours, 8);
eq('记录 2 天', sl.days, 2);

S.reset();
S.add('sleep', { date: '2026-10-01', bedtime: '01:00', wake: '09:00', hours: 8, quality: 3 });
sl = History.sleepOf(History.range('week', '2026-10-01'));
eq('晚于 00:30 记一次晚睡', sl.lateNights, 1);

S.reset();
eq('没有作息记录 → days 0', History.sleepOf(History.range('week', '2026-10-01')).days, 0);
eq('没有记录 → score null', History.sleepOf(History.range('week', '2026-10-01')).score, null);
eq('没有记录 → avgHours null（不是 0）',
   History.sleepOf(History.range('week', '2026-10-01')).avgHours, null);
eq('只有 1 天 → 标准差 null（样本不够）', (() => {
  S.add('sleep', { date: '2026-10-01', bedtime: '23:00', wake: '07:00', hours: 8 });
  return History.sleepOf(History.range('week', '2026-10-01')).bedtimeStdMin;
})(), null);

/* ═══════════════ 四、饮食聚合 ═══════════════ */
console.log('\n═══ 饮食按天聚合（一天记 3 餐不能算 3 天）═══');
S.init(); S.reset();
S.add('meals', { date: '2026-10-01', type: 'breakfast', items: [{ name: '鸡蛋', grams: 100 }] });
S.add('meals', { date: '2026-10-01', type: 'lunch', items: [{ name: '米饭', grams: 200 }] });
S.add('meals', { date: '2026-10-01', type: 'dinner', items: [{ name: '米饭', grams: 200 }] });
let di = History.dietOf(History.range('week', '2026-10-01'));
eq('3 餐只算 1 天', di.days, 3 > 0 ? 1 : 1);
eq('有记录的天数 1', di.loggedDayCount, 1);
eq('餐次 3', di.mealCount, 3);
eq('覆盖率 1/7', Math.round(di.logRate * 100), 14);

console.log('\n═══ 全天「没吃」的日子不参与热量均值 ═══');
S.reset();
S.add('meals', { date: '2026-10-01', type: 'lunch', items: [{ name: '米饭', grams: 200 }] });
const before = History.dietOf(History.range('week', '2026-10-01')).avgKcal;
S.add('meals', { date: '2026-10-02', type: 'lunch', items: [], skipped: true });
S.add('meals', { date: '2026-10-02', type: 'dinner', items: [], skipped: true });
S.add('meals', { date: '2026-10-02', type: 'breakfast', items: [], skipped: true });
const after = History.dietOf(History.range('week', '2026-10-01'));
eq('均值不被「没吃」拉低', after.avgKcal, before);
ok('「没吃」的餐次被计数', after.skipped >= 3, String(after.skipped));

console.log('\n═══ 蛋白供能比 ═══');
S.reset();
S.add('meals', { date: '2026-10-01', type: 'lunch', items: [
  { name: 'A', grams: 100, nut: { k: 400, p: 40, f: 10, c: 20 } }   // 160kcal 蛋白 / 400
]});
di = History.dietOf(History.range('week', '2026-10-01'));
eq('蛋白供能比 40%', di.proteinPct, 40);
eq('日均蛋白 40g', di.avgProtein, 40);

S.reset();
eq('没有饮食记录 → score null', History.dietOf(History.range('week', '2026-10-01')).score, null);
eq('没有记录 → avgKcal null（不是 0）',
   History.dietOf(History.range('week', '2026-10-01')).avgKcal, null);

/* ═══════════════ 五、账本 ═══════════════ */
console.log('\n═══ 账本：支出按自然区间 ═══');
S.init(); S.reset();
S.restore ? null : null;
S.settings.money = Object.assign({}, S.settings.money, {
  stipendAmount: 750, stipendTolerance: 0.5, incomeWindowShift: true
});
S.save();
S.add('txns', { date: '2026-09-30', type: 'income', amount: 750, category: '生活费' });  // 上月末
S.add('txns', { date: '2026-10-15', type: 'income', amount: 750, category: '生活费' });
S.add('txns', { date: '2026-10-12', type: 'income', amount: 300, category: '其他' });
S.add('txns', { date: '2026-10-03', type: 'expense', amount: 32, category: '餐饮', counterparty: '美团' });
S.add('txns', { date: '2026-10-20', type: 'expense', amount: 100, category: '数码', counterparty: '京东' });
S.add('txns', { date: '2026-09-15', type: 'expense', amount: 999, category: '数码' });   // 上月支出不该算进来

let mo = History.moneyOf(History.range('month', '2026-10-15'));
eq('支出只含本月（32+100）', mo.expense, 132);
ok('上期支出不算进来', mo.expense < 999, String(mo.expense));
eq('收入含 9/30 的 750（错位窗口）', mo.income, 1800);
eq('生活费 = 1500（两笔 750）', mo.stipend, 1500);
eq('额外收入 = 300', mo.extra, 300);
eq('收入窗口起点 9/30', mo.incomeWindow.start, '2026-09-30');
eq('收入窗口终点 10/30', mo.incomeWindow.end, '2026-10-30');
ok('标记为错位', mo.incomeWindow.shifted === true);
eq('结余 = 1800-132', mo.balance, 1668);
eq('分类聚合', mo.byCategory[0].category, '数码');
eq('分类金额', mo.byCategory[0].amount, 100);
eq('商户聚合', mo.topPeople[0].name, '京东');

console.log('\n═══ 周/年粒度不用错位窗口 ═══');
mo = History.moneyOf(History.range('week', '2026-10-01'));
ok('周粒度窗口就是自然周', mo.incomeWindow.start === '2026-09-28' && mo.incomeWindow.end === '2026-10-04',
   JSON.stringify(mo.incomeWindow));
ok('周粒度不标错位', mo.incomeWindow.shifted === false);

console.log('\n═══ 关掉错位就是自然月 ═══');
S.settings.money.incomeWindowShift = false;
S.save();
mo = History.moneyOf(History.range('month', '2026-10-15'));
eq('自然月收入不含 9/30 的 750', mo.income, 1050);
ok('不再标错位', mo.incomeWindow.shifted === false);
S.settings.money.incomeWindowShift = true;
S.save();

console.log('\n═══ 750 容差 ═══');
S.reset();
S.add('txns', { date: '2026-10-05', type: 'income', amount: 750.5, category: '生活费' });
S.add('txns', { date: '2026-10-06', type: 'income', amount: 749.5, category: '生活费' });
S.add('txns', { date: '2026-10-07', type: 'income', amount: 749, category: '其他' });
S.add('txns', { date: '2026-10-08', type: 'income', amount: 2000, category: '其他' });
mo = History.moneyOf(History.range('month', '2026-10-15'));
eq('750.5 和 749.5 算生活费', mo.stipend, 1500);
eq('生活费笔数 2', mo.stipendCount, 2);
eq('749 和 2000 算额外', mo.extra, 2749);

S.reset();
eq('没有流水时 income 为 0（不是 null）', History.moneyOf(History.range('month', '2026-10-15')).income, 0);

/* ═══════════════ 六、长期任务 ═══════════════ */
console.log('\n═══ 长期任务：只看 longterm ═══');
S.init(); S.reset();
S.add('tasks', { title: '读SLAM', kind: 'longterm', cat: 'cv', priority: 2,
  createdAt: '2026-05-01T00:00:00Z' });
S.add('tasks', { title: '有截止日的', kind: 'deadline', cat: 'study', due: '2026-10-02', priority: 3,
  createdAt: '2026-09-25T00:00:00Z' });
S.add('tasks', { title: '每日打卡', kind: 'daily', cat: 'life', priority: 1,
  createdAt: '2026-09-25T00:00:00Z' });
S.add('tasks', { title: '做完了', kind: 'longterm', cat: 'study', done: true,
  doneAt: '2026-10-02T10:00:00Z', createdAt: '2026-09-01T00:00:00Z' });

let lt = History.longtermOf(History.range('week', '2026-10-01'));
eq('只统计 longterm（2 条）', lt.existedCount, 2);
eq('本期完成 1', lt.completed, 1);
eq('在办 1', lt.active, 1);
ok('deadline/daily 没混进来', lt.existedCount === 2, String(lt.existedCount));
eq('完成列表带标题', lt.completedList[0].title, '做完了');

console.log('\n═══ 挂了很久没动的会被挑出来 ═══');
ok('5 月建的那条被标为陈旧', lt.stale.some(t => t.title === '读SLAM'), JSON.stringify(lt.stale));
ok('陈旧项带天数', lt.stale[0] && lt.stale[0].ageDays > 30, JSON.stringify(lt.stale[0]));
ok('刚建的不算陈旧', !lt.stale.some(t => t.title === '有截止日的'));

console.log('\n═══ 本期新增 ═══');
S.reset();
S.add('tasks', { title: '本周新建', kind: 'longterm', cat: 'cv', createdAt: '2026-10-02T00:00:00Z' });
S.add('tasks', { title: '上周建的', kind: 'longterm', cat: 'cv', createdAt: '2026-09-20T00:00:00Z' });
lt = History.longtermOf(History.range('week', '2026-10-01'));
eq('本期新增 1', lt.added, 1);
eq('累计存在 2', lt.existedCount, 2);

S.reset();
eq('没有长期任务 → 计数为 0', History.longtermOf(History.range('week', '2026-10-01')).existedCount, 0);

/* ═══════════════ 七、体重 ═══════════════ */
console.log('\n═══ 体重 ═══');
S.init(); S.reset();
S.add('weights', { date: '2026-10-01', kg: 80.5 });
S.add('weights', { date: '2026-10-03', kg: 80.0 });
S.add('weights', { date: '2026-10-04', kg: 79.8 });
let w = History.weightOf(History.range('week', '2026-10-01'));
eq('起点 80.5', w.start, 80.5);
eq('终点 79.8', w.end, 79.8);
eq('变化 -0.7', w.delta, -0.7);
eq('最低', w.min, 79.8);
eq('最高', w.max, 80.5);
eq('次数 3', w.count, 3);

S.reset();
S.add('weights', { date: '2026-08-01', kg: 85 });
w = History.weightOf(History.range('week', '2026-10-01'));
eq('本期没称 → count 0', w.count, 0);
eq('但给出最近一次的值', w.current, 85);
eq('变化为 null（不是 0）', w.delta, null);

S.reset();
eq('从来没称过 → null', History.weightOf(History.range('week', '2026-10-01')), null);

/* ═══════════════ 八、汇总 ═══════════════ */
console.log('\n═══ summarize ═══');
S.init(); S.reset();
S.settings.body = Object.assign({}, S.settings.body, { weight: 80, dailyKcal: 1800 });
S.save();
for (let i = 1; i <= 4; i++) {
  const d = '2026-10-0' + i;
  S.add('sleep', { date: d, bedtime: '23:20', wake: '07:10', hours: 7.8, quality: 4 });
  S.add('meals', { date: d, type: 'lunch', items: [{ name: '米饭', grams: 200 },
    { name: '鸡胸肉', grams: 150 }] });
  S.add('txns', { date: d, type: 'expense', amount: 25, category: '餐饮', counterparty: '食堂' });
}
S.add('weights', { date: '2026-10-02', kg: 79.5 });
S.add('tasks', { title: '长期A', kind: 'longterm', cat: 'cv', createdAt: '2026-09-01T00:00:00Z' });
S.add('tasks', { title: '截止B', kind: 'deadline', cat: 'study', due: '2026-10-02',
  createdAt: '2026-10-01T00:00:00Z' });

const s = History.summarize('week', '2026-10-01');
ok('有 range', !!s.range && s.range.unit === 'week');
eq('unitName', s.unitName, '周');
ok('有 healthScore', typeof s.healthScore === 'number', String(s.healthScore));
ok('有 coverage', typeof s.coverage === 'number', String(s.coverage));
ok('有 money/sleep/diet/weight/longterm', !!(s.money && s.sleep && s.diet && s.weight && s.longterm));
ok('有 targets', !!(s.targets && s.targets.kcalTarget));
eq('目标热量来自设置', s.targets.kcalTarget, 1800);
ok('蛋白目标按体重 1.6g/kg = 128', s.targets.proteinTarget === 128, String(s.targets.proteinTarget));
eq('长期任务只有 1 条', s.longterm.existedCount, 1);
eq('普通任务完成 0', s.tasks.completed, 0);

console.log('\n═══ 空库不能炸 ═══');
S.reset();
const empty = History.summarize('month', '2026-10-15');
ok('空库能算出结果', !!empty);
eq('收入 0', empty.money.income, 0);
eq('作息 score null', empty.sleep.score, null);
eq('饮食 score null', empty.diet.score, null);
eq('健康度 null', empty.healthScore, null);
eq('覆盖率 0', empty.coverage, 0);
eq('体重 null', empty.weight, null);

/* ═══════════════ 九、趋势与对比 ═══════════════ */
console.log('\n═══ series ═══');
S.init(); S.reset();
S.add('txns', { date: '2026-10-01', type: 'expense', amount: 100 });
S.add('txns', { date: '2026-09-24', type: 'expense', amount: 50 });
S.add('txns', { date: '2026-09-17', type: 'expense', amount: 20 });
const ser = History.series('week', '2026-10-01', 3);
eq('返回 3 期', ser.length, 3);
eq('按时间顺序（最早在前）', ser[0].expense, 20);
eq('最后一期是本期', ser[2].expense, 100);
ok('每期有标签', ser.every(x => x.label && x.short));
ok('每期有 key（可排序）', ser.every(x => x.key));

S.reset();
const ser2 = History.series('month', '2026-10-15', 4);
eq('空数据也给 4 期', ser2.length, 4);
ok('空数据期 expense 为 0', ser2.every(x => x.expense === 0));
ok('空数据期 healthScore 为 null', ser2.every(x => x.healthScore === null));

console.log('\n═══ compare ═══');
S.init(); S.reset();
S.add('txns', { date: '2026-10-01', type: 'expense', amount: 100 });
S.add('txns', { date: '2026-09-24', type: 'expense', amount: 60 });
const cmp = History.compare('week', '2026-10-01');
eq('本期支出 100', cmp.cur.money.expense, 100);
eq('上期支出 60', cmp.prev.money.expense, 60);
eq('差值 +40', cmp.delta.expense, 40);

S.reset();
const cmp2 = History.compare('week', '2026-10-01');
eq('空数据差值也是 0', cmp2.delta.expense, 0);
eq('空数据健康度差值为 null', cmp2.delta.healthScore, null);

console.log('\n═══ 回归：3 月往前翻不能跳过 2 月 ═══');
eq('10月往前是9月', History.shift('month', '2026-10-31', -1), '2026-09-01');
eq('3月往前是2月', History.shift('month', '2026-03-31', -1), '2026-02-01');
eq('1月往前是上年12月', History.shift('month', '2026-01-31', -1), '2025-12-01');
eq('12月往后是次年1月', History.shift('month', '2026-12-31', 1), '2027-01-01');

console.log('\n══════════════');
console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);