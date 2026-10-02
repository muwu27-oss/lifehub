/* ═══════════════════════════════════════════════
   diet.test.js — 饮食记录与「没吃」状态
   ═══════════════════════════════════════════════
   背景：用户发现「没吃早饭」和「忘了记早饭」在数据里长得一样，
   都是没有记录。但这两件事的结论完全相反：
     · 真没吃  → 要提醒补蛋白、别拖到中午暴食
     · 忘了记  → 只是数据缺失，不该瞎猜
   所以引入第三种状态 skipped。
*/
const { load } = require('./harness');
load('js/utils.js', 'js/store.js', 'js/nutrition.js');

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + ' ' + extra); }
}

/* 注意：S.init() 是幂等的（见 store.js 的注释），
   重复调用不会重新载入，所以节与节之间必须用 S.reset() 清数据。 */
S.init();
const T = U.ymd(U.today());

console.log('=== 1. 三种状态 ===');
ok('没记录时是 none', S.mealStatus(T, 'breakfast') === 'none');
S.setMealSkipped(T, 'breakfast', true);
ok('标记后是 skipped', S.mealStatus(T, 'breakfast') === 'skipped');
ok('其他餐不受影响', S.mealStatus(T, 'lunch') === 'none');

console.log('\n=== 2. 撤销 ===');
S.setMealSkipped(T, 'breakfast', false);
ok('撤销后回到 none', S.mealStatus(T, 'breakfast') === 'none');
ok('撤销后 meals 里没有残留', S.mealsOn(T).length === 0, S.mealsOn(T).length + ' 条');

console.log('\n=== 3. 重复标记不产生重复记录 ===');
S.setMealSkipped(T, 'breakfast', true);
S.setMealSkipped(T, 'breakfast', true);
S.setMealSkipped(T, 'breakfast', true);
ok('重复标记只有一条', S.mealsOn(T).filter(m => m.skipped).length === 1,
   S.mealsOn(T).filter(m => m.skipped).length + ' 条');

console.log('\n=== 4. 有真实记录时状态是 eaten ===');
S.setMealSkipped(T, 'breakfast', false);
S.add('meals', { date: T, type: 'breakfast', items: [{ name: '鸡蛋', grams: 110 }] });
ok('有记录 → eaten', S.mealStatus(T, 'breakfast') === 'eaten');

console.log('\n=== 5. 「没吃」不计入营养，只计数 ===');
S.reset();
S.setMealSkipped(T, 'breakfast', true);
const totSkip = Nutrition.dayTotals(S.mealsOn(T));
ok('skipped 计数为 1', totSkip.skipped === 1, totSkip.skipped);
ok('热量仍为 0', totSkip.kcal === 0, totSkip.kcal);
ok('条目数为 0', totSkip.items === 0, totSkip.items);

S.add('meals', { date: T, type: 'lunch', items: [{ name: '米饭', grams: 200 }] });
const tot2 = Nutrition.dayTotals(S.mealsOn(T));
ok('加了午餐后热量 > 0', tot2.kcal > 0, tot2.kcal);
ok('skipped 仍是 1', tot2.skipped === 1, tot2.skipped);

console.log('\n=== 6. 没标没吃时 skipped 为 0 ===');
S.reset();
S.add('meals', { date: T, type: 'lunch', items: [{ name: '米饭', grams: 200 }] });
ok('skipped = 0', Nutrition.dayTotals(S.mealsOn(T)).skipped === 0);

console.log('\n=== 7. 给 AI 的报告要区分「没吃」和「未记录」===');
S.reset();
S.setMealSkipped(T, 'breakfast', true);
S.add('meals', { date: T, type: 'lunch', items: [{ name: '米饭', grams: 200 }] });
const prompt = Nutrition.toPrompt(T, S.mealsOn(T), Nutrition.dayTotals(S.mealsOn(T)), null, S.settings.body, []);
ok('早餐报成「明确没吃」', /早餐：明确没吃/.test(prompt), prompt.match(/- 早餐[^\n]*/)?.[0]);
ok('晚餐报成「未记录」', /晚餐：未记录/.test(prompt), prompt.match(/- 晚餐[^\n]*/)?.[0]);
ok('两者不混淆', !/早餐：未记录/.test(prompt));

console.log('\n=== 8. 不同日期的「没吃」互不影响 ===');
S.reset();
const T2 = U.ymd(U.addDays(U.today(), -1));
S.setMealSkipped(T, 'breakfast', true);
ok('今天 skipped', S.mealStatus(T, 'breakfast') === 'skipped');
ok('昨天仍是 none', S.mealStatus(T2, 'breakfast') === 'none');

console.log('\n══════════════');
console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
