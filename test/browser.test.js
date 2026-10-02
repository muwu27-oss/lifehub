/**
 * 真浏览器渲染测试
 * ─────────────────
 * 为什么需要这个：jsdom 不执行 CSS，所以「页面被 CSS 藏起来」这类 bug
 * jsdom 测不出来。实际踩过的坑：App.go() 只从所有 .view 上移除 active，
 * 却没有给当前视图加回 active，导致 .view{display:none} 把整页藏掉，
 * 真机上打开就是一片空白。
 *
 * 依赖：需要一个 chrome-headless-shell 和一个跑着的本地服务器。
 *   node test/browser.test.js            # 服务器已在 8777 运行时
 * 若缺环境会自动跳过（不算失败），不阻塞其它测试。
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME_BIN ||
  '/home/muwu27/.cache/browsers/chrome-headless-shell/linux-154.0.8037.92/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.LIFEHUB_URL || 'http://127.0.0.1:8777';

/* 环境不全就跳过，避免在别的机器上跑测试时直接红 */
const hasChrome = fs.existsSync(CHROME);
let hasServer = false;
try {
  execFileSync('curl', ['-s', '-m', '2', '-o', '/dev/null', BASE + '/index.html']);
  hasServer = true;
} catch (e) { hasServer = false; }

if (!hasChrome || !hasServer) {
  console.log('跳过浏览器测试：' + (!hasChrome ? '找不到 chrome-headless-shell' : '本地服务器未运行'));
  console.log('  启动服务器：cd ~/lifehub && python3 -m http.server 8777 --bind 127.0.0.1');
  process.exit(0);
}

let pass=0, fail=0;
function ok(name,cond,extra=''){ if(cond){pass++;console.log('  ✓ '+name);} else {fail++;console.log('  ✗ '+name+' '+extra);} }

/* 取渲染后的 DOM。
   连续起多个 headless Chrome 时偶发空白返回（资源竞争），
   所以失败要重试——不重试会让测试看起来在报假错。 */
function dom(url, tries){
  tries = tries || 3;
  for (let i = 0; i < tries; i++){
    let out = '';
    try {
      out = execFileSync(CHROME,['--headless','--disable-gpu','--no-sandbox','--dump-dom',
        '--virtual-time-budget=7000',url],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
    } catch(e){ out = ''; }
    if (out && out.length > 500) return out;
    if (i < tries-1) execFileSync('sleep',['1']);
  }
  return '';
}

/* harness 测试页是截图/验证用的带数据页面，先确保它们存在 */
try {
  execFileSync('python3', [path.join(__dirname, '..', 'shots', 'make_harness.py')],
    { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
} catch (e) {
  console.log('提示：生成 harness 页面失败（' + e.message + '），部分用例可能失败');
}

console.log('=== 真浏览器渲染验证（Chrome headless）===');

/* 0. harness 模板先做语法检查。
   踩过的坑：改测试数据时漏了一个字符串拼接 + 号，
   整个 harness 脚本语法错误 → 所有页面都渲染不出东西，
   表现成「大量莫名其妙的断言失败」。先查语法能省很多时间。 */
try {
  const hsrc = require('fs').readFileSync(path.join(__dirname,'..','shots','harness.html'),'utf8');
  const m = hsrc.match(/<script>([\s\S]*?)<\/script>/);
  new Function(m[1]);
  ok('harness 模板语法正确', true);
} catch (e) {
  ok('harness 模板语法正确', false, e.message);
}

/* 1. 首页必须真的有可见内容 */
const home = dom('http://127.0.0.1:8777/index.html');
ok('首页 section 带 active 类（否则 CSS 会藏掉整页）',
   /<section class="view active" id="view-today"/.test(home));
ok('今日视图渲染出圆环', /class="ring"/.test(home));
ok('今日视图渲染出内容', home.length > 5000, home.length+' 字节');
ok('浮层默认隐藏', /id="scrim" hidden/.test(home) || /scrim"[^>]*hidden/.test(home));
const tabCount = (home.match(/data-view="[a-z]+"/g)||[]).length;
ok('底部导航回到 5 个 tab', tabCount === 5, tabCount + ' 个');
ok('顶栏有「回顾」按钮', /id="btnHistory"/.test(home));
/* 底栏列数不能写死：写死 repeat(5,1fr) 时第 6 个 tab 会被挤到第二行、被裁掉 */
const appCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'app.css'), 'utf8');
const tabbarCss = (appCss.match(/\.tabbar\s*\{[^}]*\}/) || [''])[0];
ok('底栏列数自适应 tab 数量', /grid-auto-flow:\s*column/.test(tabbarCss), tabbarCss.slice(0,80));
ok('底栏没有写死列数', !/grid-template-columns:\s*repeat\(/.test(tabbarCss));
ok('标题正确', /<title>LifeHub/.test(home));

/* 2. 各视图都能渲染出内容（不是空白） */
const views=[['plan','视图'],['import','一键导入'],['body','饮食作息'],['money','账本'],['learn','学习蓝图']];
views.forEach(([v,expect])=>{
  const d=dom('http://127.0.0.1:8777/harness-'+v+'.html');
  ok(v+' 视图渲染成功', d.includes(expect), '未找到「'+expect+'」');
  ok(v+' 视图 section 激活', new RegExp('<section class="view active" id="view-'+v+'"').test(d));
});

/* 3. 导入流程真的跑通了 */
const imp=dom('http://127.0.0.1:8777/harness-import-parse-scroll.html');
ok('解析出任务预览', /归档 \d+ 条/.test(imp), '未找到归档按钮');
ok('显示排期建议', /建议 \d{4}-\d{2}-\d{2}/.test(imp) || /建议 (今天|明天)/.test(imp));
ok('显示避开课表提示', /避开/.test(imp));
ok('推荐时间格式合法（没有 08:37.5）', !/\d{2}:\d{2}\.\d/.test(imp), (imp.match(/\d{2}:\d{2}\.\d/g)||[]).join(','));

/* 4. 操作手册页（帮助页） */
const help=dom('http://127.0.0.1:8777/harness-help.html');
ok('帮助页渲染成功', help.includes('操作手册'));
ok('帮助页 section 激活', /<section class="view active" id="view-help"/.test(help));
ok('帮助页有内容', help.length > 8000, help.length+' 字节');

/* 所有小节标题都得在（漏一个就说明某节构建失败） */
['第一次用：装到手机桌面','每天怎么用','三种任务，三种提醒（核心）',
 '一键导入：把群消息变成任务','让提醒真的响（最容易踩坑）','长期任务栏怎么用',
 '饮食作息与减脂','账本：导入账单（三种方式）','学习蓝图','AI 功能怎么开',
 '数据备份与安全','常见问题','技术细节（不看也行）'
].forEach(t=>ok('有小节「'+t.slice(0,10)+'…」', help.includes(t), '缺失'));

/* 折叠节默认只开第一节：其他节内容不该出现 */
const helpExp=dom('http://127.0.0.1:8777/harness-help-expand.html');
ok('展开后内容变多', helpExp.length > help.length, help.length+' → '+helpExp.length);
ok('展开后有 FAQ 的 28 个问题',
   (helpExp.match(/Q：/g)||[]).length === 28, (helpExp.match(/Q：/g)||[]).length+' 条');

/* 行内标记必须被解析，不能留字面的星号
   （踩过的坑：表格里满屏 **顶部圆环**） */
ok('没有字面的 ** 符号', !/\*\*/.test(helpExp), (helpExp.match(/\*\*[^*]{0,12}\*\*/g)||[]).slice(0,3).join(' | '));
/* ⚠ 「没有 ** 」这条断言自己能骗人：mdInline 返回的是节点数组，
   一旦被当成 innerHTML 字符串化，** 确实没了，但页面上冒出
   字面的「[object HTMLElement]」—— 断言照样绿。所以必须单独守。 */
ok('页面里没有 [object …]', !/\[object /.test(helpExp),
   (helpExp.match(/.{40}\[object [^\]]*\].{20}/)||[])[0] || '');
ok('粗体用 strong 标签渲染', (helpExp.match(/<strong>/g)||[]).length >= 10,
   (helpExp.match(/<strong>/g)||[]).length+' 个');

/* 帮助页的跳转按钮得真能跳 */
ok('帮助页有跳转按钮', /去「今日」看看|去导入|去「计划」页导出/.test(helpExp));

/* 顶栏问号按钮存在 */
ok('顶栏有操作手册按钮', /id="btnHelp"/.test(home));

/* 5. 饮食：AI 查食物 / 拍照入口 */
const mealAi=dom('http://127.0.0.1:8777/harness-body-meal-ai.html');
ok('餐次编辑面板打开', mealAi.includes('午餐') && mealAi.includes('吃什么'));
ok('有拍照按钮', mealAi.includes('📷') && mealAi.includes('拍照'));
ok('有 AI 查询入口', mealAi.includes('用 AI 查'), '未找到 AI 入口');
ok('有通用估算的退路', mealAi.includes('通用估算'), 'AI 挂了会卡住用户');
ok('搜索框能回显输入', mealAi.includes('宫保鸡丁'));

/* 5b. 账本：三种导入方式 */
const impBill=dom('http://127.0.0.1:8777/harness-money-import.html');
ok('导入面板打开', impBill.includes('导入账单'));
ok('有截图识别入口', impBill.includes('截图识别'), '用户要的就是这个');
ok('截图识别标了推荐', impBill.includes('推荐'));
ok('有粘贴文字入口', impBill.includes('粘贴文字'));
ok('粘贴文字标了省钱', impBill.includes('省钱'));
ok('有 CSV 入口', impBill.includes('导入 CSV'));
ok('有剪贴板按钮', impBill.includes('剪贴板'), '无头浏览器剪贴板 API 可能不可用');
ok('说明了截图识别的局限', /分页|翻页|当前屏/.test(impBill) || impBill.includes('截图识别'));

const impText=dom('http://127.0.0.1:8777/harness-money-import-text.html');
ok('粘贴文字页有操作说明', impText.includes('长按') && impText.includes('复制'));
ok('粘贴文字页有输入框', impText.includes('textarea') || impText.includes('粘贴'));
ok('粘贴文字页有解析按钮', impText.includes('解析'));
ok('粘贴文字页能返回', impText.includes('返回'));

const impCsv=dom('http://127.0.0.1:8777/harness-money-import-csv.html');
ok('CSV 页保留官方导出路径', impCsv.includes('下载账单') && impCsv.includes('邮箱'));
ok('CSV 页有选择文件', impCsv.includes('选择 CSV 文件'));

/* 6. 账本：分类规则与批量整理 */
const rules=dom('http://127.0.0.1:8777/harness-money-rules.html');
ok('规则页渲染', rules.includes('分类规则'));
ok('规则页 section 激活', /<section class="view active" id="view-money"/.test(rules));
ok('显示张三的规则', rules.includes('张三'));
ok('显示收入方向', rules.includes('收入'), '');
ok('显示支出方向', rules.includes('支出'), '');
ok('显示规则用途', rules.includes('每月家用') && rules.includes('固定支出'));
ok('有回填按钮', (rules.match(/回填/g)||[]).length >= 2, (rules.match(/回填/g)||[]).length+' 个');
ok('有手动加规则入口', rules.includes('手动加一条规则'));

const batch=dom('http://127.0.0.1:8777/harness-money-batch.html');
ok('批量模式有计数器', /已选 \d+ 笔/.test(batch), '未找到计数');
ok('批量模式有全选', batch.includes('全选本月'));
ok('明细显示用途', batch.includes('每月家用'));

/* 分类不能是数字下标（踩过的坑） */
const money=dom('http://127.0.0.1:8777/harness-money.html');
ok('账本页有内容', money.length > 5000, money.length+' 字节');
ok('分类不是数字下标', !/>\s*\d+\s*<\/button>/.test(money) || money.includes('餐饮'));

/* 7. 回顾：周 / 月 / 年 + 空库 */
/* 只取当前激活视图的内容再断言。
   否则会误判：App.go 只清空目标视图，之前渲染过的 today 视图虽然
   被 CSS 藏起来了，内容却还留在 DOM 里 —— 拿整页去搜「长期任务里
   不该出现的截止日任务」就会搜到 today 的那份。 */
function viewHtml(html, id) {
  const m = html.match(new RegExp(
    '<section class="view active" id="view-' + id + '"[^>]*>([\\s\\S]*?)(?=<section class="view|</main>)'));
  return m ? m[1] : '';
}

const histW = dom('http://127.0.0.1:8777/harness-history-week.html');
const hw = viewHtml(histW, 'history');
ok('回顾周视图渲染成功', hw.includes('健康度'), '未找到健康度');
ok('回顾 section 激活', /<section class="view active" id="view-history"/.test(histW));
ok('有周/月/年三个切换', hw.includes('>周<') && hw.includes('>月<') && hw.includes('>年<'));
ok('显示周区间标签', /第 \d+ 周/.test(hw), '未找到周号');
ok('显示区间日期范围', /\d+月\d+日\s*~\s*\d+月\d+日/.test(hw),
   (hw.match(/\d+月\d+日[^<]{0,12}/) || [])[0] || '没找到日期范围');
ok('显示记录覆盖率', /记录覆盖率 \d+%/.test(hw), '不显示覆盖率就等于拿 1 天当满分');
ok('有和上一周比', hw.includes('和上一周比'));
/* 踩过的坑：上期数值反查失败，整列显示成「—」还照常渲染。 */
ok('「上期」有真实数值（不是一列 —）',
   (hw.match(/上期\s*—/g) || []).length < 3,
   (hw.match(/上期\s*—/g) || []).length + ' 行没取到值');
ok('有作息板块', hw.includes('平均时长'));
ok('有饮食板块', hw.includes('日均热量'));
ok('有账本板块', hw.includes('日均支出'));
ok('有长期任务板块', /只[看管]长期/.test(hw));
ok('长期任务里不出现有截止日的任务', !/交具身智能论文综述|多目标跟踪双球实验/.test(hw),
   '用户在日程回顾里只想要长期任务');
ok('长期任务里出现真正该有的长期任务', hw.includes('读完《视觉SLAM十四讲》'), '长期任务没列出来');
ok('有趋势板块', hw.includes('各期支出') || hw.includes('健康度趋势'));

const histM = dom('http://127.0.0.1:8777/harness-history-month.html');
const hm = viewHtml(histM, 'history');
ok('回顾月视图渲染成功', /年 \d+ 月/.test(hm), '未找到月份标签');
ok('月视图 section 激活', /<section class="view active" id="view-history"/.test(histM));
ok('月视图有和上一月比', hm.includes('和上一月比'));
ok('月视图显示天数', hm.includes('31 天'));
ok('月视图同样只看长期任务', !/交具身智能论文综述/.test(hm));

const histY = dom('http://127.0.0.1:8777/harness-history-year.html');
const hy = viewHtml(histY, 'history');
ok('回顾年视图渲染成功', /全年/.test(hy), '未找到「全年」');
ok('年视图 section 激活', /<section class="view active" id="view-history"/.test(histY));
ok('年视图有和上一年比', hy.includes('和上一年比'));
ok('年视图显示 365 天', hy.includes('365 天'));

/* 空库：必须说「没有记录」，不能用 0 分冒充
   （0 分和「那天没记」是完全不同的意思） */
const histE = dom('http://127.0.0.1:8777/harness-history-empty.html');
const he = viewHtml(histE, 'history');
ok('空库不崩', /<section class="view active" id="view-history"/.test(histE), '空数据渲染失败');
ok('空库提示没有作息记录', he.includes('没有作息记录'), '应提示没记录');
ok('空库提示没有饮食记录', he.includes('没有饮食记录'), '应提示没记录');
ok('空库健康度显示 —', he.includes('健康度') && he.includes('—'), '不能显示 0 分');
ok('空库不显示 0 分的健康度', !/>0<\/div><div[^>]*>健康度/.test(he), '0 分会被误读成「很差」');

/* ⚠ 回归：分数圆环不能有两个数字重叠
   真实 bug —— 我用 Charts.progress 画 canvas（它自己会在圆心写「74%」），
   又在上面叠了一个写「74」的 div，两个数字直接糊成一团黑；
   而且它的入参是 0~100，我传了 value/100，圆弧等于没画、圆心写着「1%」。
   现在改用 App.ring（SVG + 单一 .ring-text），这里守住它别再退回去。 */
const ringCard = (hw.match(/<div class="ring"[\s\S]{0,600}?<\/div><\/div>/) || [''])[0];
ok('健康度用的是 App.ring（SVG）', /<svg/.test(ringCard) && /class="ring-text"/.test(ringCard));
ok('健康度圆环里没有 canvas', !/<canvas/.test(ringCard),
   'canvas 圆心自带数字，再叠一层就会重叠');
ok('健康度圆环只有一个数字', (ringCard.match(/ring-num/g) || []).length === 1,
   '数到 ' + (ringCard.match(/ring-num/g) || []).length + ' 个');
ok('圆环数字是分数本身（不是百分比符号叠分数）',
   />74<\/div>/.test(ringCard), '期望中心是 74，实到 ' +
   ((ringCard.match(/class="ring-num"[^>]*>([^<]*)/) || [])[1] || '?'));
ok('圆环里没有多余的 %', !/ring-num[^>]*>\d+%/.test(ringCard),
   '分数不该带 %，否则和标签语义冲突');
/* 74 分要有 74% 的弧度，不是 0.74% */
const dash = (ringCard.match(/stroke-dashoffset="([\d.]+)"/g) || []);
ok('圆弧按 0~100 的比例画', dash.length === 2, '圆弧数量 ' + dash.length);

/* ═══ 账本：截图识别一次最多 5 张 ═══ */
const impPick = dom('http://127.0.0.1:8777/harness-money-import.html');
ok('导入入口写清可以多选', /最多 5 张/.test(impPick), '没写清张数');
ok('入口显示导入记录', /导入记录/.test(impPick), '没显示导入留痕');
ok('导入记录里有时间（精确到分钟）', /今天 \d{2}:\d{2}|昨天 \d{2}:\d{2}|\d{2}-\d{2} \d{2}:\d{2}/.test(impPick),
   '留痕没有时间');
ok('导入记录里有覆盖到的日期', /已覆盖到 \d{4}-\d{2}-\d{2}/.test(impPick), '留痕没写覆盖范围');
ok('剪贴板按钮还在（没被留痕卡片挤掉）', /从剪贴板粘贴/.test(impPick), '剪贴板入口丢了');

const impPhoto = dom('http://127.0.0.1:8777/harness-money-import-photo.html');
ok('截图页渲染成功', /截图/.test(impPhoto));
ok('截图页提示上次截到哪儿', /已经覆盖到|复盖到/.test(impPhoto), '没提示上次覆盖范围');
ok('截图页说明多选张数', /最多 5 张/.test(impPhoto));
ok('截图页有选择图片按钮', /选择图片/.test(impPhoto));

/* 文件框必须带 multiple，否则手机上只能选一张 */
/* ⚠ 真实点按「导入账单」必须落在主入口（三个方式都在）
   踩过的坑：onclick 直接挂了 openWeChatImport，它第一个形参收到 MouseEvent，
   mode 变成事件对象 → 匹配不上任何分支 → 一路掉到 CSV 页。
   表现就是用户说的「图片识别怎么又没了」。
   注意：必须走真按钮的点击路径，直接调函数是测不出来的。 */
const impReal = dom('http://127.0.0.1:8777/harness-money-import-real.html');
ok('点「导入账单」落在主入口', /截图识别/.test(impReal), '主入口上没看到截图识别');
ok('主入口同时有粘贴文字', /粘贴文字/.test(impReal));
ok('主入口同时有 CSV', /导入 CSV 文件/.test(impReal));
ok('没有被丢到 CSV 页', !/官方导出路径/.test(impReal),
   '说明 render 收到了意外值并掉进了 CSV 分支');

/* 真点两下也要能走到截图页（用户实际路径） */
const impToPhoto = dom('http://127.0.0.1:8777/harness-money-import-to-photo.html');
ok('点「导入账单 → 截图识别」能到截图页', /选择图片/.test(impToPhoto),
   '两下点击没能进入截图页');
ok('截图页提示上次覆盖范围', /已经覆盖到/.test(impToPhoto));

/* ═══ 删除得起：按钮不能被长表单埋掉 ═══
   用户原话：「已经导入的明细居然无法删除。导错了怎么办」。
   「删除」本来就在，但在表单最底下，手机上要滑三屏才看得到。
   现在放进 .sheet-foot 固定底栏，永远贴在底部。 */
const editSheet = dom('http://127.0.0.1:8777/harness-money-edit.html');
const editFoot = (editSheet.match(/<div class="sheet-foot">[\s\S]*?<\/div><\/div><\/div>/) || [''])[0];
ok('单笔编辑有固定底栏', /sheet-foot/.test(editSheet), '没有固定底栏，删除按钮又被埋了');
ok('固定底栏里有删除', /删除/.test(editFoot), '底栏里看不到删除');
ok('固定底栏里有更新', /更新/.test(editFoot), '底栏里看不到更新');
ok('删除按钮不在滚动区里',
   !/<div class="sheet-body">[\s\S]*删除[\s\S]*<\/div><div class="sheet-foot">/.test(editSheet),
   '删除还在 sheet-body 里，得滚动才看得到');

const batchSheet = dom('http://127.0.0.1:8777/harness-money-batch.html');
ok('批量整理有固定底栏', /sheet-foot/.test(batchSheet));
ok('批量整理底栏有删除', /删除 3 笔/.test(batchSheet), '批量面板没有删除入口');

/* 导入记录每行要有「撤销」——导错一整批时不用一笔一笔删 */
ok('导入记录有撤销按钮', /撤销/.test(impPick), '没有整批撤销的入口');

/* 设置页要能看到版本号，并且有强制更新入口 ——
   手机上「改了没生效」时，这是唯一的自救办法。 */
const settingsSheet = dom('http://127.0.0.1:8777/harness-today-settings.html');
ok('设置里有「版本与更新」一节', /版本与更新/.test(settingsSheet), '设置里没有版本一节');
ok('设置里显示当前版本号', /当前版本/.test(settingsSheet) && /v\d+/.test(settingsSheet));
ok('设置里有强制更新按钮', /检查更新/.test(settingsSheet), '没有自救入口');

const moneySrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'money.js'), 'utf8');
/* 这就是上面那个 bug 的字面成因，直接守住。
   要先去掉注释 —— 否则这条断言会被我自己写的说明文字绊倒（栽过两次）。 */
const moneyCode = moneySrc
  .replace(/\/\*[\s\S]*?\*\//g, '')      // /* 块注释 */
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');   // // 行注释（避开 http://）
ok('导入入口没有把事件对象当参数', !/onclick:\s*openWeChatImport\b/.test(moneyCode),
   'onclick 直接挂函数会把 MouseEvent 当第一个参数');
ok('注释剥离自身有效', /openWeChatImport/.test(moneyCode), '剥太狠了，代码都没了');
ok('入口对非字符串参数有兜底',
   /typeof initialMode === 'string'/.test(moneySrc));
ok('render 对未知 mode 有兜底', /MODES\.indexOf\(mode\)/.test(moneySrc));
/* 只看真正的那个 input 元素，别被注释里的字样骗了 */
const imgInput = (moneySrc.match(/U\.el\('input',\s*\{[^}]*accept:\s*'image\/\*'[^}]*\}/) || [''])[0];
ok('找得到图片文件框', imgInput.length > 0);
ok('图片文件框允许多选', /multiple:\s*true/.test(imgInput),
   '没有 multiple 就只能选一张');
ok('图片文件框不强开相机', !/capture:/.test(imgInput),
   'capture 会强制开相机且不能多选');
ok('一次最多 5 张有常量约束', /MAX_PHOTOS\s*=\s*5/.test(moneySrc));
ok('超过 5 张会被截断', /slice\(0,\s*MAX_PHOTOS\)/.test(moneySrc), '没有截断逻辑');
ok('单张失败不废掉整批', /一张失败不该把整批废掉|problems\.push/.test(moneySrc));

console.log('\n══════════════');
console.log('结果: '+pass+' 通过, '+fail+' 失败');
process.exit(fail?1:0);
