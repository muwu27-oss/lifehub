#!/usr/bin/env node
/**
 * 食物 AI 查询 + 拍照识别 + 自定义食物库
 *
 * 背景：
 *   内置食物库只有 84 条，学生日常吃的东西远不止这些。
 *   原来库里没有的食物只能走「150 kcal/100g」通用估算，误差能到两三倍。
 *   现在补两条路：
 *     ① 纯文本用 AI 查任意食物（不限库）
 *     ② 拍照片让 AI 认出盘子里有什么、各多少克
 *   查过的食物会记进本地库（customFoods），下次直接搜到、不再花 token。
 *
 * 这里不联网，用假的聊天函数喂固定 JSON，验证解析/规整/入库/计算链路。
 */
const { load } = require('./harness');
load('js/utils.js', 'js/store.js', 'js/nutrition.js', 'js/ai.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
const eq = (name, got, want) =>
  ok(name, got === want, `得到 ${JSON.stringify(got)}，期望 ${JSON.stringify(want)}`);

/* ── 假的 AI.chat：按 prompt 内容返回预置 JSON ── */
let lastPrompt = '', lastOpts = {}, lastMessages = null, reply = '', shouldThrow = null;
AI.chat = async function (messages, opts) {
  lastOpts = opts || {};
  lastMessages = messages;
  const u = messages[messages.length - 1];
  lastPrompt = typeof u.content === 'string'
    ? u.content
    : (u.content || []).map(c => c.text || '').join(' ');
  if (shouldThrow) throw new Error(shouldThrow);
  return typeof reply === 'function' ? reply() : reply;
};
AI.isReady = () => true;
AI.visionModel = () => 'qwen-vl-max';
AI.cfg = () => ({ model: 'qwen-plus', visionModel: 'qwen-vl-max' });
AI.log = () => {};

/* ═══ 文本查询 ═══ */
console.log('\n═══ 纯文本查任意食物 ═══');
S.init(); S.reset();

reply = JSON.stringify({
  foods: [
    { name: '宫保鸡丁', kcal: 180, protein: 12.5, fat: 11.0, carb: 8.2, fiber: 1.2, unit: '份', gram: 250, note: '川菜，油偏多' },
    { name: '花生米', kcal: 574, protein: 24.8, fat: 44.3, carb: 21.7, fiber: 5.5, unit: '把', gram: 30 }
  ]
});

(async () => {
  const foods = await AI.lookupFood('宫保鸡丁');
  eq('返回 2 个候选', foods.length, 2);
  eq('第一个名字正确', foods[0].n, '宫保鸡丁');
  eq('热量规整到 k 字段', foods[0].k, 180);
  eq('蛋白规整到 p 字段', foods[0].p, 12.5);
  eq('脂肪规整到 f 字段', foods[0].f, 11);
  eq('碳水规整到 c 字段', foods[0].c, 8.2);
  eq('纤维规整到 fib', foods[0].fib, 1.2);
  eq('份量 gram 保留', foods[0].gram, 250);
  ok('标记为 AI 来源', foods[0].ai === true);
  ok('保留 note', /油偏多/.test(foods[0].note));
  ok('用了 JSON 模式', lastOpts.json === true);
  ok('prompt 里带上了食物名', lastPrompt.includes('宫保鸡丁'));

  console.log('\n═══ 容错：AI 返回包了 ```json 和废话 ═══');
  S.reset();
  reply = '好的，这是结果：\n```json\n{"foods":[{"name":"奶茶","kcal":65,"protein":1.2,"fat":2.1,"carb":10.5,"fiber":0,"unit":"杯","gram":500}]}\n```\n希望有帮助！';
  const f2 = await AI.lookupFood('奶茶');
  eq('从代码块里抠出 JSON', f2[0].n, '奶茶');
  eq('数值正确', f2[0].k, 65);

  console.log('\n═══ 容错：AI 直接返回数组 ═══');
  S.reset();
  reply = JSON.stringify([{ name: '烤冷面', kcal: 200, protein: 6, fat: 8, carb: 26, fiber: 1, unit: '份', gram: 200 }]);
  const f3 = await AI.lookupFood('烤冷面');
  eq('数组也能解析', f3[0].n, '烤冷面');

  console.log('\n═══ 脏数据要能兜住 ═══');
  S.reset();
  reply = JSON.stringify({
    foods: [
      { name: '怪东西', kcal: 'abc', protein: null, fat: -5, carb: undefined, fiber: 1 },
      { kcal: 100 },              // 没名字 → 丢掉
      null,
      { name: '正常', kcal: 100, protein: 5, fat: 2, carb: 10, fiber: 1, unit: '份', gram: 100 }
    ]
  });
  const f4 = await AI.lookupFood('怪东西');
  eq('丢掉没名字的条目', f4.length, 2);
  eq('非数字热量归 0', f4[0].k, 0);
  eq('null 蛋白归 0', f4[0].p, 0);
  eq('负数脂肪归 0（不出现负营养）', f4[0].f, 0);
  ok('正常的条目没被污染', f4[1].k === 100 && f4[1].p === 5);

  console.log('\n═══ prompt 里说清了是「每 100g」 ═══');
  S.reset();
  reply = JSON.stringify({ foods: [{ name: 'x', kcal: 100, unit: '份', gram: 100 }] });
  await AI.lookupFood('随便');
  ok('注明每 100g', lastPrompt.includes('每 100g') || lastPrompt.includes('每100g'));
  ok('要求只输出 JSON', lastPrompt.includes('只输出 JSON'));

  console.log('\n═══ 错误路径 ═══');
  S.reset();
  shouldThrow = '网络炸了';
  let err = null;
  try { await AI.lookupFood('测试'); } catch (e) { err = e.message; }
  ok('网络错误会抛出来', err === '网络炸了', String(err));
  shouldThrow = null;

  S.reset();
  err = null;
  try { await AI.lookupFood(''); } catch (e) { err = e.message; }
  ok('空查询直接拒绝', /先输入/.test(err || ''), String(err));

  S.reset();
  err = null;
  try { await AI.lookupFood('x'.repeat(100)); } catch (e) { err = e.message; }
  ok('超长查询拒绝（防止乱花 token）', /太长/.test(err || ''), String(err));

  S.reset();
  reply = JSON.stringify({ foods: [] });
  err = null;
  try { await AI.lookupFood('不存在的东西'); } catch (e) { err = e.message; }
  ok('AI 返回空列表时报错', /没查到/.test(err || ''), String(err));

  S.reset();
  reply = '这不是 JSON，完全不搭边';
  err = null;
  try { await AI.lookupFood('乱返回'); } catch (e) { err = e.message; }
  ok('非 JSON 返回报错且提示可读', /不是合法 JSON/.test(err || ''), String(err));

  /* ═══ 拍照识别 ═══ */
  console.log('\n═══ 拍照识别食物 ═══');
  S.reset();
  reply = JSON.stringify({
    items: [
      { name: '米饭', grams: 200, kcal: 116, protein: 2.6, fat: 0.3, carb: 25.9, fiber: 0.3, confidence: 'high' },
      { name: '红烧肉', grams: 120, kcal: 480, protein: 13, fat: 45, carb: 5, fiber: 0, confidence: 'medium' }
    ],
    note: '这餐偏油，蛋白还行'
  });
  const photo = await AI.readFoodPhoto('data:image/jpeg;base64,AAAA');
  eq('识别出 2 项', photo.items.length, 2);
  eq('第一项名字', photo.items[0].n, '米饭');
  eq('照片份量记在 photoGrams', photo.items[0].photoGrams, 200);
  ok('整体说明带出来', /偏油/.test(photo.note));
  ok('用了视觉模型', lastOpts.model === 'qwen-vl-max', String(lastOpts.model));
  /* 图片必须以 image_url 结构发出，否则多模态模型根本看不到图 */
  const parts = (lastMessages[1].content || []);
  ok('消息里带图片块', Array.isArray(parts) && parts.some(c => c.type === 'image_url'));
  ok('图片是 data URL', parts.some(c => c.type === 'image_url' && /^data:image\//.test(c.image_url.url)));
  ok('同时带了文字说明', parts.some(c => c.type === 'text' && c.text.length > 50));

  console.log('\n═══ 照片没给克数时回退到默认份量 ═══');
  S.reset();
  reply = JSON.stringify({ items: [{ name: '青菜', kcal: 20, protein: 1.5, fat: 0.2, carb: 2.7, fiber: 1.2, unit: '份', gram: 150 }] });
  const p2 = await AI.readFoodPhoto('data:image/jpeg;base64,AAAA');
  eq('无 grams 时用 gram 兜底', p2.items[0].photoGrams, 150);

  console.log('\n═══ 拍照的错误路径 ═══');
  S.reset();
  err = null;
  try { await AI.readFoodPhoto('不是图片'); } catch (e) { err = e.message; }
  ok('非法图片格式被拒', /格式不对/.test(err || ''), String(err));

  S.reset();
  reply = JSON.stringify({ items: [] });
  err = null;
  try { await AI.readFoodPhoto('data:image/jpeg;base64,AAAA'); } catch (e) { err = e.message; }
  ok('没认出食物时给可读提示', /没从照片里认出/.test(err || ''), String(err));

  /* ═══ 本地库：学习与检索 ═══ */
  console.log('\n═══ AI 结果沉淀进本地库 ═══');
  S.init(); S.reset();
  eq('初始自定义库为空', Nutrition.customFoods().length, 0);

  Nutrition.learn({ n: '蜜雪冰城柠檬水', k: 38, p: 0.1, f: 0, c: 9.5, fib: 0, unit: '大杯', gram: 700 });
  eq('学进去 1 条', Nutrition.customFoods().length, 1);
  ok('能搜到', Nutrition.search('蜜雪').some(f => f.n === '蜜雪冰城柠檬水'));
  ok('按部分关键词也能搜到', Nutrition.search('柠檬水').some(f => f.n === '蜜雪冰城柠檬水'));
  eq('find 能命中', (Nutrition.find('蜜雪冰城柠檬水') || {}).n, '蜜雪冰城柠檬水');
  ok('学到的条目带 ai 标记', Nutrition.search('蜜雪')[0].ai === true);

  Nutrition.learn({ n: '蜜雪冰城柠檬水', k: 38 });
  eq('同名不重复存', Nutrition.customFoods().length, 1);

  const before = Nutrition.customFoods().length;
  Nutrition.learn({ n: '米饭', k: 999 });
  eq('内置库已有的不覆盖', Nutrition.customFoods().length, before);
  eq('内置米饭营养值没被改', Math.round((Nutrition.find('米饭') || {}).k), 116);

  console.log('\n═══ 计算优先用 AI 值（不走通用估算）═══');
  S.reset();
  const r = Nutrition.calc({ name: '某外卖', grams: 300, nut: { k: 200, p: 10, f: 8, c: 20, fib: 2 } });
  eq('热量 = 200 × 3', Math.round(r.kcal), 600);
  eq('蛋白 = 10 × 3', Math.round(r.p), 30);
  ok('标记为 ai', r.ai === true);
  ok('不再标 unknown', r.unknown === false);

  console.log('\n═══ 没 AI 值时仍按老路走（不能改坏）═══');
  S.reset();
  const base = Nutrition.calc({ name: '米饭', grams: 200 });
  eq('本地库命中', Math.round(base.kcal), 232);
  ok('不是 unknown', base.unknown === false);
  const unk = Nutrition.calc({ name: '完全没听过的东西', grams: 100 });
  eq('未知仍走通用估算 150kcal', Math.round(unk.kcal), 150);
  ok('未知标记 unknown', unk.unknown === true);

  console.log('\n═══ 一天汇总把 AI 食物算进去 ═══');
  S.reset();
  const t = Nutrition.dayTotals([
    { type: 'lunch', items: [
      { name: '某外卖', grams: 300, nut: { k: 200, p: 10, f: 8, c: 20, fib: 2 } },
      { name: '米饭', grams: 200 }
    ]}
  ]);
  eq('热量 = 600 + 232', Math.round(t.kcal), 832);
  eq('条目数 = 2', t.items, 2);

  console.log('\n═══ 未注册集合要报明确错误（踩过的坑）═══');
  ok('S.add 未知集合会抛错', (() => {
    try { S.add('不存在的集合', { a: 1 }); return false; }
    catch (e) { return /未知集合/.test(e.message); }
  })());

  console.log('\n══════════════');
  console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();