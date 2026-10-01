const { load } = require('./harness');
load('js/utils.js','js/store.js','js/parser.js');
S.init();

let pass=0, fail=0;
function ok(name, cond, extra='') { if(cond){pass++;console.log('  ✓ '+name);} else {fail++;console.log('  ✗ '+name+' '+extra);} }

const sample = `
【教务处】关于2026年春季学期选课的通知
各位同学：本轮选课将于3月5日 18:00 截止，请务必在此之前完成。
下周三下午2点 高等数学期末补考 在 A301 教室
明天晚上7点 组会汇报，线上腾讯会议
本周五 第3-4节 数据结构实验课 实验楼B203
3月20日前提交计算机视觉课程大作业，用YOLO做目标检测
周六 上午10点 取快递
记得买牙膏和洗衣液
下周一 交具身智能论文的文献综述
今天 晚上 8:00 跑步 5 公里
今晚把ROS2的tf2坐标变换看完，这是项目2需要的
收到
好的
http://example.com/abc
`;
const r = Parser.parse(sample);
console.log('\n=== 解析结果 ===');
r.tasks.forEach(t=>console.log(`  [${t.cat.padEnd(5)}] ${t.title}\n          due=${t.due||t.start||'-'} conf=${t.confidence} prio=${t.priority}${t.location?' @'+t.location:''}`));
console.log('  统计:', JSON.stringify(r.stats));

console.log('\n=== 断言 ===');
const byTitle = s => r.tasks.find(t=>t.title.includes(s));
ok('解析出条目数 ≥ 9', r.tasks.length>=9, `实际 ${r.tasks.length}`);
ok('过滤掉寒暄/URL', !r.tasks.some(t=>/^收到$|^好的$|example\.com/.test(t.title)));
ok('"下周三...补考" 归入 study', byTitle('补考')?.cat==='study', byTitle('补考')?.cat);
ok('"下周三...补考" 有时间 14:00', (byTitle('补考')?.start||'').includes('14:00'), byTitle('补考')?.start);
ok('"YOLO大作业" 归入 cv', byTitle('YOLO')?.cat==='cv', byTitle('YOLO')?.cat);
ok('"具身智能综述" 归入 cv', byTitle('具身智能')?.cat==='cv', byTitle('具身智能')?.cat);
ok('"ROS2 tf2" 归入 cv', byTitle('ROS2')?.cat==='cv', byTitle('ROS2')?.cat);
ok('"数据结实验课" 归入 study', byTitle('数据结构')?.cat==='study', byTitle('数据结构')?.cat);
ok('"取快递" 归入 life', byTitle('取快递')?.cat==='life', byTitle('取快递')?.cat);
ok('"买牙膏" 归入 life', byTitle('牙膏')?.cat==='life', byTitle('牙膏')?.cat);
/* 「各位同学：本轮选课将于3月5日 18:00 截止，请务必在此之前完成。」
   期望：识别出一条「选课」任务并带上 3/5 18:00 这个截止时间；
   通知体的套话（各位同学 / 请务必在此之前完成 / 截止）应当被剥掉，
   否则标题会变成「本轮选课将于 截止、请务必在此完成」这种残句。 */
const xuan = r.tasks.find(t => /选课/.test(t.title));
ok('选课通知解析出任务', !!xuan, JSON.stringify(r.tasks.map(t=>t.title)));
ok('选课任务带 due 日期', !!(xuan && xuan.due), xuan && xuan.due);
ok('选课 due 是 3月5日 18:00', !!(xuan && xuan.due && /-03-05T18:00$/.test(xuan.due)), xuan && xuan.due);
ok('标题里没有通知套话', !!(xuan && !/各位同学|请务必|在此之前|截止/.test(xuan.title)),
   xuan && xuan.title);
ok('提取到地点 A301', byTitle('补考')?.location?.includes('A301'), byTitle('补考')?.location);
ok('地点标签词不进标题', !/地点|教室/.test(byTitle('补考')?.title || ''), byTitle('补考')?.title);

/* ═══════════ 日期消歧回归 ═══════════
   这些是实际调试中踩到的坑，加进来防止以后改坏。 */
console.log('\n=== 日期消歧（易错点） ===');
const base = U.ymd(U.today());
function dOf(txt) {
  const t = Parser.parse(txt).tasks[0];
  return t ? String(t.due || t.start || '').slice(0, 10) : '';
}
const thisMonth = U.today().getMonth();
const y = U.today().getFullYear();

ok('「第3-4节」不当成 3月4日', dOf('本周五 第3-4节 数据结构实验课') !== `${y}-03-04`,
   dOf('本周五 第3-4节 数据结构实验课'));
ok('「第3-4周」不当成日期', dOf('第3-4周 有实验') === '', dOf('第3-4周 有实验'));
ok('「3-4节」不当成日期', dOf('3-4节 上课') === '', dOf('3-4节 上课'));
ok('「3-5」仍按 3月5日 解析', /-03-05$/.test(dOf('3-5 交报告')), dOf('3-5 交报告'));
ok('「3月5日」正常', /-03-05$/.test(dOf('3月5日 交表')), dOf('3月5日 交表'));
ok('「9-10日」是本月9号不是9月10日',
   dOf('9-10日 出差').slice(5) === String(thisMonth + 1).padStart(2, '0') + '-09',
   dOf('9-10日 出差'));
ok('「15号」是本月15号', dOf('15号 开会').endsWith('-15'), dOf('15号 开会'));
ok('过去的日期自动顺延', !dOf('1日 交房租') || dOf('1日 交房租') >= base, dOf('1日 交房租'));

/* 地点抽取不能把日期当教室 */
ok('「将于3月5日」不当地点', !/月|日/.test(byTitle('选课')?.location || ''), byTitle('选课')?.location);
ok('「地点A301」无分隔符也能抽',
   Parser.parse('交实验报告，地点A301').tasks[0].location === 'A301',
   Parser.parse('交实验报告，地点A301').tasks[0].location);
ok('地点标签词不进标题',
   Parser.parse('交实验报告，地点A301').tasks[0].title === '交实验报告',
   Parser.parse('交实验报告，地点A301').tasks[0].title);

/* 无标记的多行待办要拆开 */
const multi = Parser.parse('周六 上午10点 取快递\n复习一下线性代数的特征值\n看完 ROS2 tf2 坐标变换的视频').tasks;
ok('无日期标记的多行待办各自成条', multi.length === 3, multi.map(t => t.title).join(' | '));
ok('拆开后标题不粘连', multi.every(t => !/取快递.*复习/.test(t.title)), multi.map(t => t.title).join(' | '));


/* ═══════════ 频率词 / 日常活动识别 ═══════════
   用户规则：带「每天/每日」字样的自动识别为日常活动（每天晚 6 点提醒）。
   踩过的坑：
   ① `每天 背 50 个考研单词` 以「每天」开头、动词不在行首，
      被当成上一行的续行吞掉（三条并成一条）
   ② `每周三交作业` 里 extractDate 只认「周三」，剥掉后剩个孤立的「每」 */
console.log('\n=== 频率词与日常活动 ===');
[
  ['每天 背 50 个考研单词', '背 50 个考研单词', 'daily'],
  ['每日做一套雅思听力', '做一套雅思听力', 'daily'],
  ['天天跑步', '跑步', 'daily'],
  ['每周三交作业', '交作业', 'daily'],
  ['每周二 预习高数', '预习高数', 'daily'],
  ['每周交一次周报', '每周交一次周报', 'daily']
].forEach(([input, wantTitle, wantKind]) => {
  const t = Parser.parse(input).tasks[0];
  ok(`「${input}」标题正确`, t && t.title === wantTitle, t && t.title);
  ok(`「${input}」识别为日常`, t && t.kind === wantKind, t && (t.kind || '未标记'));
});

/* 没有频率词的不该被误标为日常 */
[['复习线性代数', undefined], ['看完 ROS2 教程', undefined]].forEach(([input, wantKind]) => {
  const t = Parser.parse(input).tasks[0];
  ok(`「${input}」不误标日常`, t && t.kind === wantKind, t && t.kind);
});

/* 多行合并的回归：三条独立任务必须拆成三条 */
const multiFreq = Parser.parse([
  '3月20日前提交计算机视觉课程大作业，用YOLO做目标检测',
  '每天 背 50 个考研单词',
  '看完 ROS2 tf2 坐标变换的视频'
].join('\n'));
ok('带频率词的行不会被并进上一条', multiFreq.tasks.length === 3, multiFreq.tasks.length + ' 条');
ok('三条的标题各自独立',
  multiFreq.tasks.every((t, i) => ['提交计算机视觉课程大作业、用YOLO做目标检测', '背 50 个考研单词', '看完 ROS2 tf2 坐标变换的视频'][i] === t.title),
  multiFreq.tasks.map(t => t.title).join(' | '));

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail?1:0);
