#!/usr/bin/env node
/**
 * 收入窗口 + 固定生活费识别
 *
 * 背景（用户规则，别改）：
 *   · 每月生活费 1500，分两次各 750 到账 —— 750 是敏感数字
 *   · 金额 = 750（±容差）的收入 = 固定生活费；其余 = 额外收入
 *   · 收入窗口错位：10 月收入 = 9/30 ~ 10/30（生活费常在上月底提前到账）
 *   · 收入和支出用同一个窗口（曾经支出是自然月，对不上账）
 *   · 设置里的「每月收入」只做参考，不参与总收入计算
 */
const { load } = require('./harness');
load('js/utils.js', 'js/store.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function eq(name, got, want) {
  ok(name, got === want, `得到 ${JSON.stringify(got)}，期望 ${JSON.stringify(want)}`);
}

function fresh(cfg) {
  S.init(); S.reset();
  S.settings.money.monthlyIncome = 1500;
  S.settings.money.stipendAmount = 750;
  S.settings.money.stipendTolerance = 0.5;
  S.settings.money.incomeWindowShift = cfg && cfg.shift === false ? false : true;
  if (cfg && cfg.amount !== undefined) S.settings.money.stipendAmount = cfg.amount;
  if (cfg && cfg.tol !== undefined) S.settings.money.stipendTolerance = cfg.tol;
}

console.log('\n═══ 收入窗口（错位）═══');
fresh();
eq('10月窗口起点 = 9/30', S.incomeWindow('2026-10').start, '2026-09-30');
eq('10月窗口终点 = 10/30', S.incomeWindow('2026-10').end, '2026-10-30');
eq('11月窗口起点 = 10/31', S.incomeWindow('2026-11').start, '2026-10-31');
eq('11月窗口终点 = 11/29', S.incomeWindow('2026-11').end, '2026-11-29');
ok('标记为已错位', S.incomeWindow('2026-10').shifted === true);

console.log('\n═══ 跨境与月末边界（容易写错的地方）═══');
eq('1月窗口起点落在上一年 12/31', S.incomeWindow('2026-01').start, '2025-12-31');
eq('1月窗口终点 = 1/30', S.incomeWindow('2026-01').end, '2026-01-30');
eq('3月窗口起点 = 2/28（平年）', S.incomeWindow('2026-03').start, '2026-02-28');
eq('3月窗口终点 = 3/30', S.incomeWindow('2026-03').end, '2026-03-30');
eq('闰年 2028-03 起点 = 2/29', S.incomeWindow('2028-03').start, '2028-02-29');

console.log('\n═══ 关掉错位就是自然月 ═══');
fresh({ shift: false });
eq('10月起点 = 10/1', S.incomeWindow('2026-10').start, '2026-10-01');
eq('10月终点 = 10/31', S.incomeWindow('2026-10').end, '2026-10-31');
ok('标记为未错位', S.incomeWindow('2026-10').shifted === false);

console.log('\n═══ 750 识别（含容差）═══');
fresh();
ok('正好 750 → 生活费', S.isStipendAmount(750) === true);
ok('749.5 → 生活费（容差内）', S.isStipendAmount(749.5) === true);
ok('750.5 → 生活费（容差内）', S.isStipendAmount(750.5) === true);
ok('749 → 不算（超容差）', S.isStipendAmount(749) === false);
ok('751 → 不算（超容差）', S.isStipendAmount(751) === false);
ok('750.49 → 算（刚好在内）', S.isStipendAmount(750.49) === true);
ok('750.51 → 不算（刚好在外）', S.isStipendAmount(750.51) === false);
ok('200 → 不算', S.isStipendAmount(200) === false);
ok('1500 → 不算（那是两笔合起来）', S.isStipendAmount(1500) === false);

console.log('\n═══ 容差可调 ═══');
fresh({ tol: 0 });
ok('容差 0 时 749.5 不算', S.isStipendAmount(749.5) === false);
ok('容差 0 时 750 算', S.isStipendAmount(750) === true);
fresh({ tol: 5 });
ok('容差 5 时 745 也算', S.isStipendAmount(745) === true);
ok('容差 5 时 755 也算', S.isStipendAmount(755) === true);
ok('容差 5 时 744 不算', S.isStipendAmount(744) === false);

console.log('\n═══ 金额阈值可改（万一以后不是 750）═══');
fresh({ amount: 1000, tol: 1 });
ok('改成 1000 后 1000 算生活费', S.isStipendAmount(1000) === true);
ok('改成 1000 后 750 不算', S.isStipendAmount(750) === false);

console.log('\n═══ 窗口归属：钱落在哪个月 ═══');
fresh();
const add = (d, amt, type) => S.add('txns', { date: d, type: type || 'income', amount: amt, counterparty: '测试' });
add('2026-09-29', 750);   // 9 月窗口内 → 算 9 月
add('2026-09-30', 750);   // 10 月窗口起点 → 算 10 月
add('2026-10-15', 750);   // 10 月中间
add('2026-10-30', 750);   // 10 月窗口终点
add('2026-10-31', 750);   // 11 月窗口起点 → 不算 10 月

const oct = S.monthIncome('2026-10');
eq('10月生活费笔数 = 3（9/30、10/15、10/30）', oct.stipendCount, 3);
eq('10月生活费合计 = 2250', oct.stipend, 2250);
const sep = S.monthIncome('2026-09');
eq('9月生活费笔数 = 1（只有 9/29）', sep.stipendCount, 1);
const nov = S.monthIncome('2026-11');
eq('11月生活费笔数 = 1（10/31 归 11 月）', nov.stipendCount, 1);

console.log('\n═══ 固定生活费 vs 额外收入 ═══');
fresh();
add('2026-10-01', 750);    // 生活费
add('2026-10-20', 200);    // 额外（红包）
add('2026-10-22', 80.5);   // 额外（兼职）
const m = S.monthIncome('2026-10');
eq('生活费 = 750', m.stipend, 750);
eq('额外 = 280.5', m.extra, 280.5);
eq('合计 = 1030.5', m.total, 1030.5);
eq('生活费笔数 = 1', m.stipendCount, 1);
eq('额外笔数 = 2', m.extraCount, 2);

console.log('\n═══ 支出和收入用同一个窗口 ═══');
/* 曾经支出按自然月（10/1~10/31），收入按错位窗口（9/30~10/30），
   两边的日期范围不一样，对账时对不上。现在统一走 S.monthWindow()。 */
fresh();
add('2026-09-30', 100, 'expense');  // 窗口起点 → 算进 10 月
add('2026-10-05', 200, 'expense');
add('2026-10-31', 300, 'expense');  // 超出窗口终点 → 算进 11 月
const s10 = S.monthSummary('2026-10');
eq('10月支出 = 300（9/30 算进来、10/31 不算）', s10.expense, 300);
eq('10月窗口起点就是 9/30', s10.window.start, '2026-09-30');
eq('10月窗口终点就是 10/30', s10.window.end, '2026-10-30');
ok('支出的窗口 = 收入的窗口',
   s10.window.start === S.monthWindow('2026-10').start &&
   s10.window.end === S.monthWindow('2026-10').end);

const s11 = S.monthSummary('2026-11');
eq('10/31 那笔落到 11 月窗口', s11.expense, 300);
eq('11月窗口起点 = 10/31', s11.window.start, '2026-10-31');

/* 关键一致性：列表里看得到的，必须就是算进总额的 */
const listed10 = S.txnsInMonth('2026-10');
eq('10月列表笔数 = 2', listed10.length, 2);
eq('列表笔数和 summary.count 对得上', listed10.length, s10.count);
eq('列表里的支出合计 = summary.expense',
   U.sum(listed10.filter(t => t.type === 'expense'), t => t.amount), s10.expense);
ok('10/31 不在 10 月列表里', !listed10.some(t => t.date === '2026-10-31'));
ok('9/30 在 10 月列表里', listed10.some(t => t.date === '2026-09-30'));

/* 关掉错位：收支都回到自然月 */
S.settings.money.incomeWindowShift = false;
const s10n = S.monthSummary('2026-10');
eq('关掉错位后 10月支出 = 500（9/30 不算、10/31 算）', s10n.expense, 500);
eq('关掉错位后窗口起点 = 10/1', s10n.window.start, '2026-10-01');
eq('关掉错位后窗口终点 = 10/31', s10n.window.end, '2026-10-31');
eq('关掉错位后列表里 2 笔（9/30 被排除）', S.txnsInMonth('2026-10').length, 2);
eq('关掉错位后 10/31 回到 10 月列表',
   S.txnsInMonth('2026-10').some(t => t.date === '2026-10-31'), true);
S.settings.money.incomeWindowShift = true;

console.log('\n═══ 设置值降为参考，不覆盖实收 ═══');
fresh();
add('2026-10-01', 750);
add('2026-10-15', 750);
add('2026-10-18', 300);   // 额外
const s = S.monthSummary('2026-10');
eq('总收入 = 实收 1800（不是设置的 1500）', s.income, 1800);
eq('参考值 = 1500', s.referenceIncome, 1500);
eq('生活费收齐（750×2 = 1500）', s.stipend, 1500);
eq('额外收入 = 300', s.extra, 300);
eq('结余 = 1800', s.balance, 1800);

console.log('\n═══ 参考值为空时不报错 ═══');
fresh();
S.settings.money.monthlyIncome = null;
add('2026-10-01', 750);
const s2 = S.monthSummary('2026-10');
eq('没有参考值也能统计', s2.income, 750);
eq('referenceIncome 为 null', s2.referenceIncome, null);

console.log('\n═══ 边界：没有收入 / 空数据 ═══');
fresh();
const s3 = S.monthSummary('2026-10');
eq('无数据时收入 = 0', s3.income, 0);
eq('无数据时生活费 = 0', s3.stipend, 0);
eq('无数据时笔数 = 0', s3.stipendCount, 0);

console.log('\n═══ 金额为 0 / 负数不误判 ═══');
fresh();
ok('0 不算生活费', S.isStipendAmount(0) === false);
ok('负数不算生活费', S.isStipendAmount(-750) === false);
ok('字符串 "750" 能识别', S.isStipendAmount('750') === true);

console.log('\n═══ 阈值配成 null 时不炸 ═══');
fresh({ amount: null });
ok('阈值为 null 时都不算生活费', S.isStipendAmount(750) === false);
const s4 = S.monthSummary('2026-10');
ok('阈值为 null 时统计仍可用', typeof s4.income === 'number');

console.log('\n══════════════');
console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);