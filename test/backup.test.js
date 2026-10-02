/**
 * 备份与恢复测试 —— 「换设备」这条路
 * ═══════════════════════════════
 *
 * 为什么单独给这块写一整套测试：
 * 备份是**只有出事那天才会用到**的功能。平时它永远显示「已导出」，
 * 看上去一切正常；等用户真的换手机、导入之后才发现少了东西，
 * 那时候原始数据可能已经没了。
 *
 * 真实踩过的坑：load() 里认 10 个集合，importAll() 里只合并 7 个，
 * 两份清单各自演化、悄悄对不上 —— 于是换设备时
 * customFoods / imports / aiLogs 三条**静默丢失**：
 * 自己存的食物没了，「导入记录」没了（连带撤销导入也没了）。
 *
 * 所以这里最重要的是最后那段**通用断言**：
 * 它不认识任何具体集合名字，而是拿 exportAll() 的实际内容和
 * 恢复后的结果逐个比对。以后谁加了新集合却忘了登记，
 * 这段会直接红 —— 不依赖任何人记得来改这份测试。
 */
const { load } = require('./harness');
load('js/utils.js', 'js/store.js');

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== '' ? '  ' + extra : '')); }
}
function eq(name, got, want) {
  ok(name, got === want, '得到 ' + JSON.stringify(got) + '，期望 ' + JSON.stringify(want));
}

S.init();
const today = U.today();
const d = n => U.ymd(U.addDays(today, n));

/** 造一份「像真实用户那样」的数据：每个集合都塞一点 */
function seedFull() {
  S.reset();
  S.add('tasks', { title: '交CV大作业', kind: 'deadline', due: d(3), cat: 'cv' });
  S.add('tasks', { title: '背单词', kind: 'daily' });
  S.add('tasks', { title: '看论文', kind: 'longterm' });
  S.add('reviews', { date: U.ymd(today), text: '今天状态还行' });
  S.add('meals', {
    date: U.ymd(today), slot: 'lunch', state: 'eaten',
    items: [{ name: '米饭', kcal: 200 }, { name: '鸡胸', kcal: 165 }]
  });
  S.add('meals', { date: U.ymd(today), slot: 'breakfast', state: 'skipped' });
  S.add('sleep', { date: U.ymd(today), bed: '23:30', wake: '07:10' });
  S.add('weights', { date: U.ymd(today), kg: 88.5 });
  S.add('weights', { date: d(-7), kg: 89.2 });
  S.add('txns', { date: U.ymd(today), amount: 32, type: 'expense', category: 'life', purpose: '午饭' });
  S.add('txns', { date: U.ymd(today), amount: 750, type: 'income', category: 'life', purpose: '生活费' });
  S.add('txnRules', { keyword: '张三', direction: 'income', category: 'life', purpose: '生活费' });
  S.add('customFoods', { name: '自制蛋炒饭', kcal: 520, p: 18, c: 62, f: 16 });
  S.add('customFoods', { name: '楼下牛肉面', kcal: 610 });
  S.add('aiLogs', { at: new Date().toISOString(), kind: 'food', tokensIn: 800, tokensOut: 300 });
  /* 导入记录要按**真实流程**造：先有那几笔账，再对它们 recordImport。
     直接塞一个裸对象 {n:3} 是假的 —— recordImport 根本不认 n，
     它从 txns 里数，会得到 count:0。测试一旦造假，就只是在测幻觉。 */
  S.add('txns', { date: d(-1), amount: 18, type: 'expense', source: 'bill-photo', category: 'life', purpose: '午饭' });
  S.add('txns', { date: d(-1), amount: 25, type: 'expense', source: 'bill-photo', category: 'life', purpose: '打车' });
  S.recordImport({
    txns: S.all('txns').filter(t => t.source === 'bill-photo'),
    via: '截图识别', images: 2
  });
  S.settings.ai.apiKey = 'sk-假key-换设备要带过去';
  S.settings.body.dailyKcal = 1800;
  S.settings.body.targetWeight = 80;
  S.settings.money.monthlyIncome = 1500;
  S.settings.money.stipendAmount = 750;
  return JSON.parse(JSON.stringify(S.exportAll()));
}

/** 模拟「换到一台新设备」：导出 → 清空 → 导入 */
function roundTrip() {
  const backup = seedFull();
  S.reset();                              // 新设备：空库
  S.importAll(JSON.parse(JSON.stringify(backup)), 'merge');
  return { backup, restored: JSON.parse(JSON.stringify(S.exportAll())) };
}

/* ═══════════════ 1. 通用往返：不认名字，只看数据 ═══════════════ */
console.log('\n=== 1. 每个集合都要能原样回来 ===');

{
  const { backup, restored } = roundTrip();

  /* 这一条是整套测试的核心：遍历备份里**所有**数组集合，逐个比条数。
     它不认识任何具体集合名 —— 以后加了新集合忘了登记，这里立刻红。 */
  const arrayKeys = Object.keys(backup).filter(k => Array.isArray(backup[k]));
  ok('备份里有多个集合', arrayKeys.length >= 10, '只有 ' + arrayKeys.length + ' 个');

  const lost = arrayKeys.filter(k => backup[k].length !== (restored[k] || []).length);
  ok('所有集合的条数都一致（一个都没丢）',
     lost.length === 0,
     '丢了的：' + lost.map(k => `${k} ${backup[k].length}→${(restored[k] || []).length}`).join(', '));

  /* 顺带点名这三个 —— 它们就是当初被丢掉的那三个，
     单独写出来是为了让失败信息一眼能看出是什么东西没了 */
  ['customFoods', 'imports', 'aiLogs'].forEach(k => {
    eq(`${k} 恢复了`, (restored[k] || []).length, backup[k].length);
  });
}

/* ═══════════════ 2. 恢复的必须是「内容」，不只是条数 ═══════════════ */
console.log('\n=== 2. 内容本身要对 ===');

{
  const { restored } = roundTrip();

  const food = restored.customFoods.find(f => f.name === '自制蛋炒饭');
  ok('自定义食物还在', !!food);
  eq('自定义食物的热量没错', food && food.kcal, 520);

  const t = restored.tasks.find(x => x.title === '交CV大作业');
  ok('任务还在', !!t);
  eq('任务的截止日没错', t && t.due, d(3));
  eq('任务的分类没错', t && t.cat, 'cv');
  eq('任务的类型没错', t && S.kindOf(t), 'deadline');

  /* 长期任务也要原样回来 —— 用户明确区分了三种类型，
     如果 kind 在往返中被改写，长期任务会变成有截止日的任务 */
  const lt = restored.tasks.find(x => x.title === '看论文');
  eq('长期任务仍是 longterm', lt && S.kindOf(lt), 'longterm');
  const dl = restored.tasks.find(x => x.title === '背单词');
  eq('日常活动仍是 daily', dl && S.kindOf(dl), 'daily');

  const meal = restored.meals.find(m => m.slot === 'lunch');
  eq('饮食条目数没错', meal && meal.items.length, 2);
  const skipped = restored.meals.find(m => m.slot === 'breakfast');
  eq('「没吃」的状态没被改成别的', skipped && skipped.state, 'skipped');

  eq('体重记录条数', restored.weights.length, 2);
  const firstW = restored.weights.find(w => w.kg === 88.5);
  ok('体重数值没错', !!firstW);

  const law = restored.txnRules.find(r => r.keyword === '张三');
  ok('账本规则还在', !!law);
  eq('规则的流向没错', law && law.direction, 'income');
  eq('规则的用途没错', law && law.purpose, '生活费');

  /* 750 那笔要仍然是生活费口径 —— 这是用户明确的规则 */
  const stipend = restored.txns.find(x => x.amount === 750);
  ok('750 那笔还在', !!stipend);
  ok('750 仍被认作固定生活费', S.isStipendAmount(750));

  const imp = restored.imports[0];
  ok('导入记录还在（撤销导入靠它）', !!imp);
  eq('导入记录的条数没错', imp && imp.count, 2);
  eq('导入方式没错', imp && imp.via, '截图识别');
  eq('用了几张截图也没错', imp && imp.images, 2);
  /* ids 是「整批撤销」的依据，必须原样穿过备份文件 */
  ok('导入记录里的 ids 也一起回来了',
     Array.isArray(imp && imp.ids) && imp.ids.length === 2,
     'ids = ' + JSON.stringify(imp && imp.ids));
  ok('meta.lastImport 也带过来了', !!restored.meta.lastImport);
}

/* ═══════════════ 2b. 换设备之后，「撤销导入」还得能用 ═══════════════ */
console.log('\n=== 2b. 换设备后整批撤销仍然有效 ===');

{
  seedFull();
  const backup = JSON.parse(JSON.stringify(S.exportAll()));
  const recId = backup.imports[0].id;
  const batchCount = backup.txns.filter(t => t.source === 'bill-photo').length;
  ok('备份里确实有那批截图导入的账', batchCount === 2, batchCount + ' 笔');

  S.reset();
  S.importAll(JSON.parse(JSON.stringify(backup)), 'merge');

  const rec = S.all('imports').find(r => r.id === recId);
  ok('新设备上能找到这条导入记录', !!rec);
  eq('importAlive 认得出那 2 笔还在', S.importAlive(rec), 2);

  const removed = S.undoImport(recId);
  eq('撤销移除了 2 笔', removed, 2);
  eq('那批账确实没了', S.all('txns').filter(t => t.source === 'bill-photo').length, 0);
  /* 手记的账不能被误伤 */
  ok('手工记的账没被误删', S.all('txns').some(t => t.amount === 32));
  ok('750 那笔生活费也没被误删', S.all('txns').some(t => t.amount === 750));
}

/* ═══════════════ 3. 设置要跟着走 ═══════════════ */
console.log('\n=== 3. 设置要跟着走 ===');

{
  const { restored } = roundTrip();
  eq('API key 带过来了', restored.settings.ai.apiKey, 'sk-假key-换设备要带过去');
  eq('每日热量目标带过来了', restored.settings.body.dailyKcal, 1800);
  eq('目标体重带过来了', restored.settings.body.targetWeight, 80);
  eq('每月收入设置带过来了', restored.settings.money.monthlyIncome, 1500);
  eq('生活费金额带过来了', restored.settings.money.stipendAmount, 750);
  /* 深合并：备份里没提到的设置项不能被冲成 undefined */
  ok('其余设置项没被清空',
     typeof restored.settings.ai.model === 'string' && restored.settings.ai.model.length > 0,
     'model 变成 ' + JSON.stringify(restored.settings.ai.model));
}

/* ═══════════════ 4. 合并语义：不能覆盖现有数据 ═══════════════ */
console.log('\n=== 4. 合并不能吃掉现有数据 ===');

{
  /* 场景：同一台设备上导两次，或者导进一台已经有数据的设备 */
  const backup = seedFull();
  S.reset();
  S.add('tasks', { id: 'keep_me', title: '本机原有的任务' });
  S.add('txns', { id: 'keep_txn', date: U.ymd(today), amount: 99, type: 'expense' });

  const r = S.importAll(backup, 'merge');
  ok('本机原有任务没被删', !!S.all('tasks').find(t => t.id === 'keep_me'));
  ok('本机原有账目没被删', !!S.all('txns').find(t => t.id === 'keep_txn'));
  ok('备份里的任务也进来了', !!S.all('tasks').find(t => t.title === '交CV大作业'));
  ok('返回了每个集合的导入条数', r.counts && typeof r.counts.tasks === 'number');

  /* 再导一次同一份备份：同 id 的不能重复进来 */
  const nBefore = S.all('tasks').length;
  const r2 = S.importAll(backup, 'merge');
  eq('重复导入同一份备份不会翻倍', S.all('tasks').length, nBefore);
  eq('第二次导入 tasks 计入 0 条', r2.counts.tasks, 0);
  eq('重复导入后账目也没翻倍',
     S.all('txns').filter(t => t.amount === 750).length, 1);
}

/* ═══════════════ 5. 脏数据别把 App 弄崩 ═══════════════ */
console.log('\n=== 5. 异常输入要能兜住 ===');

{
  S.reset();
  const good = seedFull();

  ok('传 null 会抛错（而不是静默把库清空）', (() => {
    try { S.importAll(null); return false; } catch (e) { return true; }
  })());
  ok('传字符串会抛错', (() => {
    try { S.importAll('这不是备份'); return false; } catch (e) { return true; }
  })());

  const n = S.all('tasks').length;
  ok('抛错之后原数据没被动过', S.all('tasks').length === n);

  /* 备份里混进 null / 数字这类脏元素，不能把导入整个搞崩 */
  const dirty = { tasks: [null, 42, { title: '正常的' }], txns: 'not-an-array' };
  let threw = false;
  try { S.importAll(dirty, 'merge'); } catch (e) { threw = true; }
  ok('脏元素不会让导入抛异常', !threw);
  ok('脏元素里的正常条目还是进去了',
     !!S.all('tasks').find(t => t.title === '正常的'));
  ok('脏元素被跳过了，没有 null 进库',
     S.all('tasks').every(t => t && typeof t === 'object'));
  ok('不是数组的集合被忽略（没有崩）', Array.isArray(S.all('txns')));

  /* 没有 id 的条目要自动补一个，否则以后没法删/没法去重 */
  S.reset();
  S.importAll({ tasks: [{ title: '无id条目' }] }, 'merge');
  const nt = S.all('tasks').find(t => t.title === '无id条目');
  ok('没有 id 的条目会被补上 id', !!(nt && nt.id));

  /* replace 模式：整体替换 */
  S.reset();
  S.importAll(good, 'replace');
  ok('replace 模式能整体恢复', S.all('tasks').length === good.tasks.length);
  eq('replace 返回 mode', S.importAll(good, 'replace').mode, 'replace');
}

/* ═══════════════ 6. 集合清单不能有两份 ═══════════════ */
console.log('\n=== 6. 集合清单只有一份（防再次漂移）===');

{
  /* 空库里的数组集合，就是「App 认识的全部集合」。
     它们必须和备份往返测试里出现的集合对得上。
     这条断言的目的是：谁往 defaultDB() 里加了新集合却忘了登记到
     COLLECTIONS，这里就会红 —— 而不是等用户换设备时才发现丢了东西。 */
  S.reset();
  const fresh = JSON.parse(JSON.stringify(S.exportAll()));
  const freshCollections = Object.keys(fresh).filter(k => Array.isArray(fresh[k])).sort();

  const { backup, restored } = roundTrip();
  const backupCollections = Object.keys(backup).filter(k => Array.isArray(backup[k])).sort();

  eq('空库的集合清单 = 备份的集合清单',
     JSON.stringify(freshCollections), JSON.stringify(backupCollections));

  const notRestored = freshCollections.filter(k =>
    backup[k].length !== (restored[k] || []).length);
  ok('App 认识的每个集合都能被恢复', notRestored.length === 0,
     '没恢复的：' + notRestored.join(', '));

  /* 备份里要有版本信息，将来格式变了才能识别老备份 */
  ok('备份带 version 字段', 'version' in backup);
  ok('备份带 settings', 'settings' in backup);
  ok('备份带 meta', 'meta' in backup);
}

/* ═══════════════ 7. 备份文件和恢复流程对得上 ═══════════════ */
console.log('\n=== 7. 备份文件本身能读回来 ===');

{
  const backup = seedFull();
  /* 走一遍真实的文件路径：JSON.stringify → 写成文件 → 读回来 → parse */
  const text = JSON.stringify(backup, null, 2);
  ok('备份能被 JSON.parse 直接吃下（不带 BOM）',
     (() => { try { JSON.parse(text); return true; } catch (e) { return false; } })(),
     '第一字符是 ' + JSON.stringify(text[0]));
  ok('备份文件不是空的', text.length > 200, text.length + ' 字节');

  const parsed = JSON.parse(text);
  S.reset();
  S.importAll(parsed, 'merge');
  eq('从文件读回来再导入，任务数一致', S.all('tasks').length, backup.tasks.length);
  eq('从文件读回来再导入，账目数一致', S.all('txns').length, backup.txns.length);
  eq('从文件读回来再导入，自定义食物一致',
     S.all('customFoods').length, backup.customFoods.length);

  /* 老版本导出的备份开头有个隐形 BOM，用户界面里会被剥掉。
     这里确认剥掉之后确实能 parse —— 让旧备份仍然是活的。 */
  const withBom = '\ufeff' + text;
  ok('带 BOM 的老备份剥掉后能 parse',
     (() => { try { JSON.parse(withBom.replace(/^\ufeff/, '')); return true; } catch (e) { return false; } })());
  ok('带 BOM 时直接 parse 会失败（说明这个剥离步骤是必需的）',
     (() => { try { JSON.parse(withBom); return false; } catch (e) { return true; } })());
}

console.log('\n═══════════════════════════════════');
console.log(`结果: ${pass} 通过, ${fail} 失败`);
console.log('═══════════════════════════════════');
process.exit(fail ? 1 : 0);