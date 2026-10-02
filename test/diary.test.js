/**
 * 日记模块测试 —— 加密、换设备、区间、小结解析
 * ═══════════════════════════════════
 *
 * 这个模块最不能出错的地方，是**加密**和**换设备**：
 *
 *   ① 明文一个字都不能漏进存储。漏了，加密就是白做的，
 *      而且用户永远不会发现 —— 他以为锁上了。
 *   ② 换设备要能解开。备份里必须同时带走密文和加密参数
 *      （salt / verifier / iterations）。少带一样，
 *      恢复出来的就是一堆**看着完好、实际永远解不开**的记录。
 *      这比直接丢了更糟：用户不会发现，直到某天去翻那篇日记。
 *   ③ 两套不同密码的日记不能被合并。混在一起 = 两把钥匙开一把锁。
 *
 * 所以这里的断言集中在「密钥学上对不对」，而不是「函数跑不跑得动」。
 */
const { load } = require('./harness');
load('js/utils.js', 'js/store.js', 'js/ai.js', 'js/crypto.js', 'js/diary.js');

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== '' ? '  ' + extra : '')); }
}
function eq(name, got, want) {
  ok(name, got === want, '得到 ' + JSON.stringify(got) + '，期望 ' + JSON.stringify(want));
}

/** 把存储里所有内容摊成一个大字符串，用来查有没有明文泄漏 */
function dumpAll() {
  return JSON.stringify(S.exportAll());
}

(async function main() {

console.log('\n=== 1. 环境与密码 ===');
ok('这个环境能做加密（Node 也有 WebCrypto）', Crypto.available(), Crypto.whyUnavailable());

S.init();      // 必须先 init：在这之前 db 还是 null，连读设置都会炸
ok('没设过密码时 hasPassword 为 false', !Diary.hasPassword());
await Diary.setup('我的日记密码2026');
ok('设置后 hasPassword 为 true', Diary.hasPassword());
ok('设置后立刻是解锁状态', Diary.isUnlocked());
ok('存储里存了盐', String(S.settings.diary.salt).length >= 16, S.settings.diary.salt);
ok('盐不是明文密码', String(S.settings.diary.salt).indexOf('我的日记密码2026') < 0);
ok('存储了校验块', !!(S.settings.diary.verifier && S.settings.diary.verifier.ct));
eq('迭代次数是 20 万', S.settings.diary.iterations, 200000);

console.log('\n=== 2. 写日记：明文绝不能落进存储 ===');
const SECRET = '今天和家里吵架了，其实我知道是我不对';
await Diary.saveEntry('2026-10-02', SECRET, 4);
await Diary.saveEntry('2026-10-01', '调通了多目标跟踪，挺爽的', 8);

const rec = S.all('diaryEntries')[0];
ok('记录里有密文', !!rec.ct && rec.ct.length > 10, JSON.stringify(rec).slice(0, 60));
ok('记录里有 iv（GCM 每条都必须有）', !!rec.iv);
ok('date 是明文（要按日期筛区间，有意为之）', !!rec.date);
ok('★ 明文没有出现在存储里', dumpAll().indexOf('和家里吵架') < 0, '泄漏了！');
ok('★ 另一个条目的明文也没泄漏', dumpAll().indexOf('多目标跟踪') < 0, '泄漏了！');
ok('密码本身也没落盘', dumpAll().indexOf('我的日记密码2026') < 0, '密码被写进存储了！');

const e2 = await Diary.entries();
eq('读回来 2 条', e2.length, 2);
eq('最新的一条在前', e2[0].date, '2026-10-02');
eq('正文能原样读回来', e2[1].text, '调通了多目标跟踪，挺爽的');
eq('心情能原样读回来', e2[0].mood, 4);

console.log('\n=== 3. 每条必须用不同的 IV ===');
const ivs = S.all('diaryEntries').map(r => r.iv);
ok('两条记录的 IV 不相同', ivs[0] !== ivs[1],
  'GCM 下重用 IV 会直接泄露明文关系，这是硬性要求');
const before = S.all('diaryEntries').find(r => r.date === '2026-10-01').ct;
await Diary.saveEntry('2026-10-01', '调通了多目标跟踪，挺爽的', 8);
const after = S.all('diaryEntries').find(r => r.date === '2026-10-01').ct;
ok('同样的内容重写一次，密文也不同（IV 是随机的）', before !== after,
  '密文相同说明 IV 被复用了');

console.log('\n=== 4. 锁 / 解锁 ===');
await Diary.saveEntry('2026-10-03', '第三条', 6);
Diary.lock();
ok('上锁后 isUnlocked 为 false', !Diary.isUnlocked());
try {
  await Diary.entries();
  ok('上锁后读不到内容', false, '居然读到了');
} catch (e) { ok('上锁后读不到内容（抛错而不是返回空）', /上锁/.test(e.message), e.message); }

try {
  await Diary.unlock('完全不对的密码');
  ok('错密码解不开', false, '错密码竟然开了');
} catch (e) { ok('错密码解不开', e.message === '密码不对', e.message); }

ok('错密码之后仍然是锁着的', !Diary.isUnlocked());
await Diary.unlock('我的日记密码2026');
ok('正确密码能解开', Diary.isUnlocked());
eq('解锁后能读到全部 3 条', (await Diary.entries()).length, 3);

console.log('\n=== 5. 加密参数必须跟着备份走（换设备） ===');
/* 这是本文件最重要的一段：
   备份里如果只有密文、没有 salt/verifier，新设备上那些日记**永远解不开**。 */
const backup = JSON.parse(JSON.stringify(S.exportAll()));
ok('备份里有日记条目', Array.isArray(backup.diaryEntries) && backup.diaryEntries.length === 3);
ok('备份里带了 salt', !!(backup.settings.diary && backup.settings.diary.salt));
ok('备份里带了 verifier', !!(backup.settings.diary.verifier && backup.settings.diary.verifier.ct));
ok('备份里带了迭代次数', !!backup.settings.diary.iterations);
ok('备份里是密文而不是明文', JSON.stringify(backup).indexOf('和家里吵架') < 0, '备份泄漏了明文！');

S.reset(); S.init();
ok('清空后本机没有任何日记', S.all('diaryEntries').length === 0);
ok('清空后 hasPassword 为 false', !Diary.hasPassword());

const r = S.importAll(backup, 'merge');
eq('导入后 3 条日记都回来了', S.all('diaryEntries').length, 3);
eq('导入判定为「整套采纳」', r.diary, 'adopted');
ok('导入后 salt 变成了备份里的', S.settings.diary.salt === backup.settings.diary.salt);
ok('导入后 hasPassword 为 true', Diary.hasPassword());

await Diary.unlock('我的日记密码2026');
ok('★ 用原来的密码能在「新设备」上解开', Diary.isUnlocked());
const restored = await Diary.entries();
eq('★ 解出来的条数对', restored.length, 3);
const found = restored.find(x => x.date === '2026-10-02');
ok('★ 解出来的内容一个字不差', found && found.text === SECRET,
  found ? found.text : '(没找到这条)');
eq('心情也解对了', found && found.mood, 4);
eq('解密失败条数为 0', (await Diary.badCounts()).entries, 0);

console.log('\n=== 6. 两套不同密码不能被合并 ===');
/* 场景：新手机自己先设了密码、也写了日记，然后把旧手机的备份导进来。
   两份 salt 不同 = 两把不同的钥匙。硬合并会得到一堆永远解不开的记录。 */
const oldBackup = JSON.parse(JSON.stringify(S.exportAll()));   // 旧手机（密码 A）
Diary.lock(); S.reset(); S.init();
await Diary.setup('另一台设备的密码B');
await Diary.saveEntry('2026-09-20', '这是B设备自己写的', 5);
const beforeCount = S.all('diaryEntries').length;
const r2 = S.importAll(oldBackup, 'merge');
eq('判定为「密码冲突」', r2.diary, 'conflict');
eq('本机已有的日记一条没多、一条没少', S.all('diaryEntries').length, beforeCount);
ok('本机的 salt 没有被改掉', S.settings.diary.salt !== oldBackup.settings.diary.salt);
ok('备份里的日记没有被塞进来（避免造出打不开的记录）',
  !S.all('diaryEntries').some(x => x.date === '2026-10-02'));
await Diary.unlock('另一台设备的密码B');
ok('本机自己的密码照样能用', Diary.isUnlocked());
eq('本机自己的内容还能读', (await Diary.entries())[0].text, '这是B设备自己写的');

console.log('\n=== 7. 同密码 = 正常合并 ===');
/* 同一个密码导两次（比如换机后又导了一遍），应该合并且不重复 */
const same = JSON.parse(JSON.stringify(S.exportAll()));
const r3 = S.importAll(same, 'merge');
eq('同密码判定为 merged', r3.diary, 'merged');
eq('同密码合并后不重复（id 相同就跳过）', S.all('diaryEntries').length, beforeCount);

console.log('\n=== 8. 区间计算 ===');
const D = Diary;
eq('日的 key', D.keyOf('day', '2026-10-02'), '2026-10-02');
eq('周从周一开始', D.keyOf('week', '2026-10-02'), '2026-09-28');
eq('月的 key', D.keyOf('month', '2026-10-02'), '2026-10');
eq('年的 key', D.keyOf('year', '2026-10-02'), '2026');
eq('周日算上一周（不是新一周）', D.keyOf('week', '2026-10-04'), '2026-09-28');
eq('周一算新一周', D.keyOf('week', '2026-10-05'), '2026-10-05');

const mr = D.range('month', '2026-10');
eq('10 月是 31 天', mr.end, '2026-10-31');
eq('2 月按闰年算（2028 是闰年）', D.range('month', '2028-02').end, '2028-02-29');
eq('2 月按平年算（2026 不是闰年）', D.range('month', '2026-02').end, '2026-02-28');
eq('周区间是 7 天', D.range('week', '2026-09-28').end, '2026-10-04');
eq('年区间到 12-31', D.range('year', '2026').end, '2026-12-31');

eq('月往前一格', D.shift('month', '2026-01', -1), '2025-12');
eq('月往后一格', D.shift('month', '2026-12', 1), '2027-01');
eq('日往前一格', D.shift('day', '2026-03-01', -1), '2026-02-28');
eq('周往前一格跨月', D.shift('week', '2026-10-05', -1), '2026-09-28');
eq('年往前一格', D.shift('year', '2026', -1), '2025');

ok('月标签是人话', /2026年10月/.test(D.label('month', '2026-10')), D.label('month', '2026-10'));
ok('周标签带日期范围', /9\/28/.test(D.label('week', '2026-09-28')), D.label('week', '2026-09-28'));

console.log('\n=== 9. 区间取样（不能把相邻区间的内容混进来） ===');
S.reset(); S.init();
await Diary.setup('区间测试密码123');
await Diary.saveEntry('2026-10-01', '十月一号', 5);
await Diary.saveEntry('2026-10-31', '十月三十一号', 5);
await Diary.saveEntry('2026-11-01', '十一月一号', 5);
await Diary.saveEntry('2026-09-30', '九月三十号', 5);

eq('10 月取到 2 条', (await Diary.entriesIn('month', '2026-10')).length, 2);
eq('11 月取到 1 条', (await Diary.entriesIn('month', '2026-11')).length, 1);
eq('日只取当天', (await Diary.entriesIn('day', '2026-10-01')).length, 1);
/* 注意：种下的四个日期（9/30、10/1、10/31、11/1）**全在 2026 年**，
   所以年区间就是 4 条。这条断言原本写 3，是我自己数错了。 */
eq('年取到全年 4 条', (await Diary.entriesIn('year', '2026')).length, 4);
ok('10-01 不在 11 月的区间里',
  !(await Diary.entriesIn('month', '2026-11')).some(x => x.date === '2026-10-01'));

console.log('\n=== 10. 小结评分解析（AI 爱加围栏和废话） ===');
const raw = '```json\n{"brief":"写了3天","review":"这周还行","mood":7,"emotion":8,'
  + '"energy":99,"body":"不是数字","study":6,"social":5,'
  + '"keywords":["熬夜","比赛","a","b","c","d"],"noticed":["连着三天一点后睡"]}\n```';
const parsed = D.parseDigest(raw);
eq('mood 正常读到', parsed.mood, 7);
eq('超出 10 的被夹到 10', parsed.energy, 10);
eq('不是数字的给默认 5', parsed.body, 5);
eq('关键词最多留 5 个', parsed.keywords.length, 5);
ok('brief 读到了', parsed.brief === '写了3天');
ok('review 读到了', parsed.review === '这周还行');
ok('noticed 读到了', parsed.noticed[0] === '连着三天一点后睡');

const bare = D.parseDigest('前面废话 {"mood":3,"brief":"b","review":"r"} 后面废话');
eq('前后有废话也能抠出 JSON', bare.mood, 3);
let threw = false;
try { D.parseDigest('这根本不是 JSON'); } catch (e) { threw = true; }
ok('完全不是 JSON 时抛错（而不是返回垃圾）', threw);
threw = false;
try { D.parseDigest('{}'); } catch (e) { threw = true; }
ok('空对象也抛错（没内容的小结没有意义）', threw);

console.log('\n=== 11. 趋势：没做过小结的期不能补 0 ===');
S.reset(); S.init();
await Diary.setup('趋势测试密码123');
/* 今天往回数三期是 8 / 9 / 10 月。这里**故意空掉中间那个月（9 月）**，
   才能验证「没有小结的期是 null，不是 0」——
   补 0 会让曲线凭空掉到谷底，看起来像状态崩了。 */
await Diary.saveDigest('month', '2026-08', { brief: 'b', review: 'r', mood: 6, emotion: 6, energy: 6, body: 6, study: 6, social: 6 });
await Diary.saveDigest('month', '2026-10', { brief: 'b', review: 'r', mood: 8, emotion: 8, energy: 8, body: 8, study: 8, social: 8 });
const ser = await Diary.series('month', 'mood', 3);
eq('取 3 期', ser.length, 3);
eq('第一期是 8 月', ser[0].key, '2026-08');
eq('8 月读到了', ser[0].value, 6);
eq('中间的空缺是 9 月', ser[1].key, '2026-09');
ok('★ 中间空缺那期是 null，不是 0（不然曲线会凭空掉下去）',
  ser[1].value === null, '得到 ' + JSON.stringify(ser[1]));
eq('空缺期 has 为 false', ser[1].has, false);
eq('最近一期也读到了', ser[2].value, 8);
const cov = await Diary.coverage('month', 3);
eq('覆盖率：3 期里 2 期有小结', cov.has, 2);
eq('覆盖率百分比', cov.pct, 67);

console.log('\n=== 12. 客观数据汇总 ===');
S.reset(); S.init();
await Diary.setup('客观数据密码123');
S.add('sleep', { date: '2026-10-01', bedtime: '01:20', wake: '08:00', hours: 6.7, quality: '较差' });
S.add('sleep', { date: '2026-10-02', bedtime: '23:30', wake: '07:00', hours: 7.5, quality: '还行' });
eq('01:20 算熬夜（相对晚 6 点 440 分）', D.bedOffset('01:20'), 440);
eq('23:30 不算熬夜（330 分）', D.bedOffset('23:30'), 330);
eq('空值返回 null', D.bedOffset(''), null);
ok('熬夜判定阈值是 00:30', D.bedOffset('00:30') >= 390 && D.bedOffset('00:29') < 390);

const ctx = D.context('month', '2026-10');
ok('客观数据里有作息一节', /作息/.test(ctx));
ok('客观数据里报出了熬夜天数', /1 天是 00:30 之后才睡/.test(ctx), ctx.slice(0, 200));
ok('客观数据里点出了睡眠质量差', /质量差/.test(ctx));

S.settings.diary.useContext = false;
eq('关掉总开关后不带客观数据', D.context('month', '2026-10'), '');
S.settings.diary.useContext = true;
S.settings.diary.useContextParts.sleep = false;
ok('单独关掉「作息」后作息就不出现', !/### 作息/.test(D.context('month', '2026-10')));
S.settings.diary.useContextParts.sleep = true;

console.log('\n=== 13. 提示词里有人设，也有内容 ===');
S.reset(); S.init();
await Diary.setup('提示词密码123');
await Diary.saveEntry('2026-10-01', '今天累', 3);
const msgs = await D.buildChatMessages('month', '2026-10', [], '我最近是不是很废');
eq('第一条是 system', msgs[0].role, 'system');
ok('人设里写明了「不是医生」', /你也不是医生/.test(msgs[0].content));
ok('人设里禁止了咨询师腔', /我理解你的感受/.test(msgs[0].content));
ok('人设里要求「朋友」', /老朋友/.test(msgs[0].content));
ok('没让人设说空话（禁止"你已经很棒了"）', /你已经很棒了/.test(msgs[0].content));
eq('最后一条是 user', msgs[msgs.length - 1].role, 'user');
ok('提示词里带上了日记正文', /今天累/.test(msgs[msgs.length - 1].content));
ok('提示词里带上了区间名', /2026年10月/.test(msgs[msgs.length - 1].content));

const digestPrompt = await D.buildDigestPrompt('month', '2026-10', []);
ok('小结提示词要求输出 JSON', /只输出一个 JSON/.test(digestPrompt));
ok('小结提示词包含六个维度', ['mood', 'emotion', 'energy', 'body', 'study', 'social']
  .every(k => digestPrompt.indexOf('"' + k + '"') >= 0));
ok('小结提示词要求实事求是（没依据给5）', /没有依据就.*5|给 5/.test(digestPrompt));

console.log('\n=== 14. 日记内容绝不能进明文的 aiLogs ===');
S.reset(); S.init();
const logged = AI.log('diary', '这是日记正文不该被记下来', '输出');
eq('AI.log 拒绝记录日记', logged, null);
eq('aiLogs 里一条都没有', S.all('aiLogs').length, 0);
AI.log('food-text', '米饭', '{}');
eq('普通日志照常记录', S.all('aiLogs').length, 1);

console.log('\n=== 15. AI 没配好时要明确说「没配」，而不是报 401 ===');
S.reset(); S.init();
eq('默认没配 → aiReady 为 false', Diary.aiReady(), false);
S.settings.diaryAi.apiKey = 'sk-替换成你的百炼APIKey';
S.settings.diaryAi.enabled = true;
eq('占位 Key 也算没配', Diary.aiReady(), false);
S.settings.diaryAi.apiKey = 'sk-真的key1234567890';
S.settings.diaryAi.baseURL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
S.settings.diaryAi.model = 'qwen3.8-max';
eq('填了真 Key 才算配好', Diary.aiReady(), true);

console.log('\n=== 16. 谈话的保存与读取 ===');
S.reset(); S.init();
await Diary.setup('谈话测试密码123');
const ch = await Diary.saveChat('month', '2026-10',
  [{ role: 'user', content: '我最近很累' }, { role: 'assistant', content: '嗯，我看到了' }],
  { model: 'qwen3.8-max', title: '' });
ok('谈话存下来了', !!ch.id);
ok('谈话内容是密文', dumpAll().indexOf('我最近很累') < 0, '谈话内容泄漏了明文！');
const got = await Diary.chatById(ch.id);
eq('读回 2 条消息', got.messages.length, 2);
eq('第一条内容对', got.messages[0].content, '我最近很累');
eq('按区间能筛到', (await Diary.chats('month', '2026-10')).length, 1);
eq('别的区间筛不到', (await Diary.chats('month', '2026-09')).length, 0);

await Diary.updateChat(ch.id, [
  { role: 'user', content: '我最近很累' },
  { role: 'assistant', content: '嗯，我看到了' },
  { role: 'user', content: '怎么办' },
  { role: 'assistant', content: '先睡一觉' }
], { model: 'qwen3.8-max' });
eq('追加后变成 4 条（继续聊）', (await Diary.chatById(ch.id)).messages.length, 4);
eq('追加不会新增记录', S.all('diaryChats').length, 1);

console.log('\n=== 17. 改密码：全部重新加密，老密码失效 ===');
S.reset(); S.init();
await Diary.setup('旧密码abcdef');
await Diary.saveEntry('2026-10-01', '改密码之前写的内容', 6);
await Diary.saveChat('day', '2026-10-01', [{ role: 'user', content: '改密码前的谈话' }], {});
const saltBefore = S.settings.diary.salt;
await Diary.changePassword('旧密码abcdef', '新密码ghijkl');
ok('盐换过了', S.settings.diary.salt !== saltBefore);
ok('改完仍是解锁状态', Diary.isUnlocked());
eq('日记内容还在', (await Diary.entries())[0].text, '改密码之前写的内容');
eq('谈话内容还在', (await Diary.chats())[0].messages[0].content, '改密码前的谈话');
Diary.lock();
try {
  await Diary.unlock('旧密码abcdef');
  ok('旧密码不能再解锁', false, '旧密码还能开');
} catch (e) { ok('旧密码不能再解锁', e.message === '密码不对', e.message); }
await Diary.unlock('新密码ghijkl');
ok('新密码能解锁', Diary.isUnlocked());
eq('改动后内容仍能解出来', (await Diary.entries())[0].text, '改密码之前写的内容');

console.log('\n=== 18. 清空日记 ===');
Diary.lock();
S.reset(); S.init();
await Diary.setup('清空测试密码123');
await Diary.saveEntry('2026-10-01', '要被清掉的', 5);
Diary.wipe();
eq('条目清空了', S.all('diaryEntries').length, 0);
eq('密码也清了', Diary.hasPassword(), false);
eq('盐也清了', S.settings.diary.salt, '');

console.log('\n=== 19. 密码强度提示 ===');
ok('太短的算弱', Diary.passwordHint('abc').level === 'weak');
ok('生日类偏弱', Diary.passwordHint('20060315').level !== 'strong');
ok('长且混合的算强', Diary.passwordHint('Xk7#mQ2pLw9z').level === 'strong',
  JSON.stringify(Diary.passwordHint('Xk7#mQ2pLw9z')));

console.log('\n─────────────────────────────');
console.log('日记模块: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);

})().catch(e => {
  console.error('测试崩了：', e);
  process.exit(1);
});