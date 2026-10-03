/**
 * 日记模块的**真浏览器**测试
 * ═══════════════════════════════════════════════
 *
 * 这个文件测的是「用户点得到吗」，不是「函数调得起来吗」。
 * 上面那些函数级的断言在 test/diary.test.js 里，跑在 Node 上。
 * 这里只问一件事：**在真的浏览器里，那一串点击能不能走通。**
 *
 * 重点是两处最容易出假绿的地方：
 *   ① 长按入口。必须真的派发 pointerdown → 等过 1200ms → pointerup。
 *      直接调 App.go('diary') 完全测不到「按不出来」这种 bug。
 *   ② 加密要跑完。用 CDP 走真实时间，不用 --virtual-time-budget ——
 *      那个模式下 WebCrypto 的 Promise 永远不 resolve，
 *      量到的红是假的（见 test/cdp.js 顶部注释）。
 */
const { open } = require('./cdp');

/* 一定要用**不带动作**的 harness 页。
   踩过的坑：原来看的是 harness-today-diary-entry.html，
   而那个页会自己把 'diary-entry' 这个动作跑一遍（pointerdown → 等 1400ms → pointerup），
   于是它在我的测试旁边**同时按了一次长按** —— 我量到的每一个结果都被它搅了：
   一会儿像是长按不生效，一会儿又像是生效了（其实是它按的）。 */
const PAGE = 'http://127.0.0.1:8777/harness-today.html';
const SECRET = '今天和家里吵架了，其实我知道是我不对';
const PW = '测试密码abc123';

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== '' ? '  ' + extra : '')); }
}
function eq(name, got, want) {
  ok(name, got === want, '得到 ' + JSON.stringify(got) + '，期望 ' + JSON.stringify(want));
}

/* 页内小工具：轮询等一个条件成立 */
const HELPERS = `
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  function waitForVal(fn, tries){
    return new Promise(function(res){
      (function tick(n){
        var v = false;
        try { v = fn(); } catch(e) {}
        if (v) return res(true);
        if (n <= 0) return res(false);
        setTimeout(function(){ tick(n-1); }, 60);
      })(tries == null ? 100 : tries);
    });
  }
  function btnByText(root, txt){
    return [].slice.call(root.querySelectorAll('button')).filter(function(b){
      return b.textContent.indexOf(txt) >= 0; })[0];
  }
  function redText(){
    var v = document.getElementById('view-diary');
    var red = [].slice.call(v.querySelectorAll('div')).filter(function(d){
      return d.style && d.style.color && d.style.color.indexOf('danger') >= 0 && d.textContent.trim();
    })[0];
    return red ? red.textContent : '(界面上没有报错)';
  }
  /* 必须用 PointerEvent，不能用裸 Event('pointerdown')。
     裸 Event 在真实时间下**不会**触发长按那条路（虚拟时间下会，
     所以以前用 --dump-dom 测是绿的，换到真实时间就红）。
     用 PointerEvent 也更贴近真手指 —— 真手指产生的就是 PointerEvent。 */
  function down(el){
    el.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, pointerType:'touch'}));
  }
  function up(el){
    el.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, pointerType:'touch'}));
  }
  function longPress(tab){
    down(tab);
    return sleep(1400).then(function(){ up(tab); return sleep(350); });
  }
`;

const FLOW = `(async () => {
  ${HELPERS}
  const out = {};
  const tab = () => document.querySelector('.tab[data-view="today"]');
  const view = () => document.getElementById('view-diary');

  /* ── 1. 轻点「今天」不能进日记 ── */
  App.go('today');
  down(tab());
  await sleep(150);
  up(tab());
  tab().dispatchEvent(new MouseEvent('click', {bubbles:true}));
  await sleep(300);
  out.tapView = App.current;

  /* ── 2. 长按「今天」进日记 ── */
  await longPress(tab());
  out.longView = App.current;
  out.longTitle = (document.getElementById('pageTitle')||{}).textContent || '';
  out.diaryExists = !!view();
  out.setupShown = view().textContent.indexOf('先设个密码') >= 0;
  /* 底部「今天」要保持高亮：日记是隐藏模块，
     全标签失去选中态会让人以为界面坏了。 */
  out.activeTabs = [].slice.call(document.querySelectorAll('.tab.active'))
    .map(function(x){ return x.dataset.view; }).join(',');

  /* ── 3. 长按后浏览器补发的那次 click 必须被吃掉 ──
     不然会「先进日记，立刻又被弹回今天」。 */
  await longPress(tab());
  tab().dispatchEvent(new MouseEvent('click', {bubbles:true}));
  await sleep(350);
  out.afterLongClick = App.current;

  /* ── 4. 两次密码不一致时必须拦住 ── */
  {
    const ins = [].slice.call(document.querySelectorAll('#view-diary input[type=password]'));
    out.pwInputs = ins.length;
    ins[0].value = window.__PW; ins[0].dispatchEvent(new Event('input',{bubbles:true}));
    ins[1].value = '不一样的密码'; ins[1].dispatchEvent(new Event('input',{bubbles:true}));
    btnByText(view(), '设好了').click();
    await sleep(600);
    out.mismatchMsg = /不一样/.test(view().textContent);
    out.mismatchLocked = !Diary.hasPassword();
    ins[1].value = window.__PW; ins[1].dispatchEvent(new Event('input',{bubbles:true}));
  }

  /* ── 5. 太短的密码也要拦住 ── */
  {
    const ins = [].slice.call(document.querySelectorAll('#view-diary input[type=password]'));
    ins[0].value = 'abc'; ins[0].dispatchEvent(new Event('input',{bubbles:true}));
    ins[1].value = 'abc'; ins[1].dispatchEvent(new Event('input',{bubbles:true}));
    btnByText(view(), '设好了').click();
    await sleep(600);
    out.shortMsg = /至少 6 位/.test(view().textContent);
    out.shortLocked = !Diary.hasPassword();
    ins[0].value = window.__PW; ins[0].dispatchEvent(new Event('input',{bubbles:true}));
    ins[1].value = window.__PW; ins[1].dispatchEvent(new Event('input',{bubbles:true}));
  }

  /* ── 6. 真设密码：等加密跑完（CDP 下是真实时间） ── */
  btnByText(view(), '设好了').click();
  out.unlocked = await waitForVal(function(){ return Diary.isUnlocked(); }, 150);
  out.iterations = S.settings.diary.iterations;
  out.saltLen = String(S.settings.diary.salt||'').length;
  out.hasVerifier = !!(S.settings.diary.verifier && S.settings.diary.verifier.ct);
  out.hasPassword = Diary.hasPassword();
  out.setupMsg = redText();
  out.setupBtnText = (btnByText(view(), '设好了') || {textContent:'(按钮没了)'}).textContent;
  out.tabs = [].slice.call(document.querySelectorAll('#view-diary .seg button'))
    .map(function(b){ return b.textContent; }).join(',');

  /* ── 7. 写一篇，验证真的加密了 ── */
  try {
  await Diary.saveEntry('2026-10-02', window.__SECRET, 4);
  const list = await Diary.entries();
  out.savedCount = list.length;
  out.textOk = !!(list[0] && list[0].text === window.__SECRET);
  out.moodOk = !!(list[0] && list[0].mood === 4);
  const raw = JSON.stringify(S.exportAll());
  out.leak = raw.indexOf('和家里吵架') >= 0;
  const rec = S.all('diaryEntries')[0] || {};
  out.hasCt = !!rec.ct;
  out.hasIv = !!rec.iv;
  out.ivLen = String(rec.iv||'').length;

  /* 重新渲染，看列表里真的显示出来没有 */
  Views.diary();
  await waitForVal(function(){
    return view().textContent.indexOf('和家里吵架') >= 0; }, 40);
  out.listShows = view().textContent.indexOf('和家里吵架') >= 0;
  /* 注意这里要写 \\/ ：模板字符串里 \/ 会直接变成 /，
     页面收到 /心情 4/10/ 就成了「非法的正则标志」。
     要让页面拿到 \/ 必须在 Node 源码里写 \\/ 。 */
  out.moodShown = /心情 4\\/10/.test(view().textContent);

  /* ── 8. 上锁 → 界面上不能还留着内容 ── */
  Diary.lock();
  Views.diary();
  await sleep(300);
  out.lockedScreen = view().textContent.indexOf('已加密') >= 0;
  out.lockedHidesContent = view().textContent.indexOf('和家里吵架') < 0;

  /* ── 9. 错密码 ── */
  {
    const inp = view().querySelector('input[type=password]');
    inp.value = '完全不对的密码'; inp.dispatchEvent(new Event('input',{bubbles:true}));
    btnByText(view(), '解锁').click();
    out.wrongMsg = await waitForVal(function(){
      return /密码不对/.test(view().textContent); }, 60);
    out.stillLocked = !Diary.isUnlocked();
  }

  /* ── 10. 对密码 ── */
  {
    const inp = view().querySelector('input[type=password]');
    inp.value = window.__PW; inp.dispatchEvent(new Event('input',{bubbles:true}));
    btnByText(view(), '解锁').click();
    out.reUnlocked = await waitForVal(function(){ return Diary.isUnlocked(); }, 150);
    const back = await Diary.entries();
    out.contentBack = !!(back[0] && back[0].text === window.__SECRET);
  }

  } catch (e) { out.lateError = String(e.message || e); }
  return out;
})()`;

(async function main() {
  console.log('\n=== 日记模块 · 真浏览器 ===');
  let s;
  try {
    s = await open(PAGE);
  } catch (e) {
    console.log('  ✗ 起不了浏览器：' + e.message);
    console.log('\n日记浏览器测试: 0 通过, 1 失败');
    process.exit(1);
  }

  try {
    await s.evaluate('window.__SECRET = ' + JSON.stringify(SECRET));
    await s.evaluate('window.__PW = ' + JSON.stringify(PW));

    const out = await s.evaluate(FLOW);

    console.log('\n── 入口 ──');
    eq('轻点「今天」不进日记', out.tapView, 'today');
    eq('长按 1.4 秒进日记', out.longView, 'diary');
    eq('标题变成「日记」', out.longTitle, '日记');
    ok('日记视图容器存在', out.diaryExists);
    ok('第一次进来显示「先设个密码」', out.setupShown);
    eq('底部「今天」保持高亮（不让导航看起来坏了）', out.activeTabs, 'today');
    eq('★ 长按后补发的 click 被吃掉，不会被弹回今天', out.afterLongClick, 'diary');

    console.log('\n── 设密码的校验 ──');
    eq('界面上有两个密码框', out.pwInputs, 2);
    ok('两次不一致时明确报错', out.mismatchMsg);
    ok('两次不一致时不会偷偷设上一个', out.mismatchLocked);
    ok('太短的密码被拦住', out.shortMsg);
    ok('太短时也不会设上', out.shortLocked);

    console.log('\n── 真加密 ──');
    ok('★ 点「设好了，进去」后真的解锁了（PBKDF2 在浏览器里跑完）', out.unlocked);
    eq('用的是 20 万次迭代', out.iterations, 200000);
    ok('存了盐', out.saltLen >= 16, '盐长度 ' + out.saltLen);
    ok('存了校验块', out.hasVerifier);
    ok('解锁后出现 5 个子标签', /日记/.test(out.tabs) && /回顾/.test(out.tabs)
      && /谈话/.test(out.tabs) && /设置/.test(out.tabs) && /说明/.test(out.tabs), out.tabs);

    console.log('\n── 存储里必须是密文 ──');
    eq('写入 1 条', out.savedCount, 1);
    ok('内容能原样读回来', out.textOk);
    ok('心情也读回来', out.moodOk);
    ok('记录里有密文', out.hasCt);
    ok('记录里有 iv', out.hasIv);
    eq('iv 是 12 字节（base64 后 16 个字符）', out.ivLen, 16);
    ok('★ 明文没有出现在 localStorage 里', !out.leak, '泄漏了！');
    ok('★ 列表里正常显示了日记内容', out.listShows);
    ok('列表里显示了心情', out.moodShown);

    console.log('\n── 锁 ──');
    ok('上锁后显示解锁界面', out.lockedScreen);
    ok('★ 上锁后界面上不再有日记内容', out.lockedHidesContent);
    ok('错密码提示「密码不对」', out.wrongMsg);
    ok('错密码后仍然是锁着的', out.stillLocked);
    ok('对密码能重新解锁', out.reUnlocked);
    ok('解锁后内容还在', out.contentBack);

    console.log('\n── 刷新页面 = 自动上锁（密钥只在内存里） ──');
    await s.evaluate('location.reload()');
    await s.waitFor('typeof App !== "undefined" && !!document.querySelector(".tab[data-view=\\"today\\"]")',
      { what: '刷新后应用重新起来' });
    const after = await s.evaluate(`(async () => {
      App.go('diary');
      await new Promise(function(r){ setTimeout(r, 400); });
      var v = document.getElementById('view-diary');
      return {
        unlocked: Diary.isUnlocked(),
        hasPassword: Diary.hasPassword(),
        needsPw: v.textContent.indexOf('已加密') >= 0,
        hidesContent: v.textContent.indexOf('和家里吵架') < 0,
        entriesStillStored: S.all('diaryEntries').length
      };
    })()`);
    ok('刷新后是上锁状态（密钥没被持久化）', !after.unlocked);
    ok('但密码还在（数据还在，只是要重新解）', after.hasPassword);
    ok('刷新后要求输密码', after.needsPw);
    ok('刷新后界面不显示内容', after.hidesContent);
    eq('密文记录仍在存储里', after.entriesStillStored, 1);
    ok('★ 上锁的日记确实没进 AI 明文日志',
      await s.evaluate('S.all("aiLogs").filter(function(l){ return l.kind && l.kind.indexOf("diary") === 0; }).length === 0'));

    /* ═══════════ 忘记密码：锁屏上必须真有一条出路 ═══════════
       这是用户真实卡住过的场景：设了密码、然后想不起来了。
       原来唯一的「清空整个日记」按钮藏在「设置」子页里，而那扇门要解锁才开
       —— 对一个忘了密码的人来说，等于**根本没有出口**。
       所以这段放在刷新之后：页面刚加载、日记锁着、一个密码字母都不输，
       看用户能不能自己走出来。 */
    console.log('\n── 忘记密码 → 重置（用户真实卡住的场景） ──');
    const reset = await s.evaluate(`(async () => {
      ${HELPERS}
      const out = {};
      App.go('diary');
      await sleep(400);
      const v = document.getElementById('view-diary');
      out.atLock = v.textContent.indexOf('已加密') >= 0;
      out.entryShown = v.textContent.indexOf('忘记密码') >= 0;
      /* 低调放置：它不能和「解锁」挤在一排，否则知道密码的人会手滑 */
      out.notNextToUnlock = !!(btnByText(v, '解锁') && btnByText(v, '忘记密码') &&
        btnByText(v, '解锁').parentElement !== btnByText(v, '忘记密码').parentElement);

      /* 一个字母都不输，直接点 */
      btnByText(v, '忘记密码').click();
      await sleep(450);
      const sh = document.getElementById('sheetBody');
      out.confirmShown = !!sh && sh.textContent.indexOf('永久删除') >= 0;
      /* 如实报数：这次存储里还有 1 篇 */
      out.confirmCount = /当前有 1 篇日记/.test(sh ? sh.textContent : '');
      /* 安全性质：点一下**不该**立刻删，必须再确认一次 */
      out.stillThere = Diary.hasPassword() && S.all('diaryEntries').length === 1;

      btnByText(sh, '永久删除并重置').click();
      await sleep(800);
      out.wipedPassword = !Diary.hasPassword();
      out.wipedEntries = S.all('diaryEntries').length;
      out.wipedChats = S.all('diaryChats').length;
      out.wipedDigests = S.all('diaryDigests').length;
      out.saltCleared = S.settings.diary.salt === '';
      out.backToSetup = document.getElementById('view-diary').textContent.indexOf('先设个密码') >= 0;
      return out;
    })()`);

    ok('日记确实锁着（否则这段测的不是忘记密码）', reset.atLock);
    ok('★ 锁屏上有「忘记密码」这条出路', reset.entryShown);
    ok('它没有和「解锁」挤在同一排（防手滑）', reset.notNextToUnlock);
    ok('点开有确认框，不是点了就删', reset.confirmShown);
    ok('★ 确认框如实报出会丢多少（当前有 1 篇日记）', reset.confirmCount);
    ok('★ 没确认之前什么都没删', reset.stillThere);
    ok('★ 确认后密码被清掉', reset.wipedPassword);
    eq('确认后日记内容清空', reset.wipedEntries, 0);
    eq('谈话记录也清空', reset.wipedChats, 0);
    eq('小结也清空', reset.wipedDigests, 0);
    ok('盐也清了（不会再拿旧盐去校验）', reset.saltCleared);
    ok('★ 回到「先设个密码」，日记重新可用', reset.backToSetup);
    ok('密码没了就等于没设过', await s.evaluate('Diary.hasPassword()') === false);

  } catch (e) {
    fail++;
    console.log('  ✗ 流程中断：' + e.message);
  } finally {
    if (s) s.close();
  }

  console.log('\n─────────────────────────────');
  console.log('日记浏览器测试: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();