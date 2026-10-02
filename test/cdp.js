/**
 * test/cdp.js —— 极简 CDP 客户端，用**真实的浏览器时间**跑异步代码
 * ═══════════════════════════════════════════════
 *
 * 为什么不继续用 `--dump-dom --virtual-time-budget`：
 * 那个模式下虚拟时间会被瞬间推到预算末尾，而 WebCrypto 的 Promise
 * **永远不会 resolve**（把迭代次数降到 1 也一样红，所以跟算得久不久无关,
 * 是虚拟时间根本不给密码学线程留时间）。
 * 结果就是「设密码 → 解锁」这条路在浏览器里永远跑不完：
 * 量到的是假红。而它看着又像真红 —— 会自己变红的测试比没有测试更糟。
 *
 * Node 22 自带 fetch 和 WebSocket，所以这里不需要装任何依赖。
 */
const { spawn } = require('child_process');
const fs = require('fs');

const CHROME = process.env.CHROME
  || '/home/muwu27/.cache/browsers/chrome-headless-shell/linux-154.0.8037.92/chrome-headless-shell-linux64/chrome-headless-shell';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(fn, { tries = 150, gap = 100, what = '条件' } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { const v = await fn(); if (v) return v; } catch (e) { last = e; }
    await sleep(gap);
  }
  throw new Error('等待超时：' + what + (last ? '（' + last.message + '）' : ''));
}

/** 起一个浏览器，打开 url，返回一个能 evaluate 的会话 */
async function open(url, opts = {}) {
  const port = opts.port || (9400 + Math.floor(Math.random() * 500));
  const proc = spawn(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-dev-shm-usage',
    '--remote-allow-origins=*',          /* 否则 WebSocket 握手会被拒 */
    '--remote-debugging-port=' + port,
    url
  ], { stdio: 'ignore' });

  let target = null;
  try {
    target = await waitFor(async () => {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await r.json();
      return list.find(t => t.type === 'page' && t.webSocketDebuggerUrl) || null;
    }, { what: '浏览器调试端口就绪' });
  } catch (e) {
    try { proc.kill('SIGKILL'); } catch (err) {}
    throw e;
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('CDP WebSocket 连不上'));
  });

  let id = 0;
  const pending = new Map();
  ws.onmessage = ev => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message));
      else res(msg.result);
    }
  };

  function send(method, params) {
    return new Promise((res, rej) => {
      const myId = ++id;
      pending.set(myId, { res, rej });
      ws.send(JSON.stringify({ id: myId, method, params }));
      setTimeout(() => {
        if (pending.has(myId)) { pending.delete(myId); rej(new Error(method + ' 超时')); }
      }, opts.timeoutMs || 120000);
    });
  }

  const session = {
    port,
    /** 在页面里跑一段表达式。awaitPromise 让它能直接用 await。 */
    async evaluate(expression) {
      const r = await send('Runtime.evaluate', {
        expression, awaitPromise: true, returnByValue: true
      });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error('页面里抛错：'
          + ((d.exception && (d.exception.description || d.exception.value)) || d.text));
      }
      return r.result && r.result.value;
    },
    /** 等页面里某个表达式变成真值 */
    waitFor(expr, o) { return waitFor(() => session.evaluate(expr), o); },
    /** 截图存盘。captureBeyondViewport 让整页都进来，不受窗口高度限制。 */
    async screenshot(file) {
      await send('Page.enable', {});
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    },
    close() {
      try { ws.close(); } catch (e) {}
      try { proc.kill('SIGKILL'); } catch (e) {}
    }
  };

  /* 等应用真的起来了再返回 —— 不然第一条 evaluate 会打在空页面上 */
  await session.waitFor('document.readyState === "complete"', { what: '页面加载完成' });
  await session.waitFor('typeof App !== "undefined" && !!document.querySelector(".tab[data-view=\\"today\\"]")',
    { what: '应用脚本就绪' });
  /* 还要等 harness 自己那串启动收尾。
     它 boot 完之后会延后 300+500ms 再 App.go(VIEW) ——
     如果我在那之前就 App.go('diary')，稍后它会把页面**拽回 today**，
     于是「设完密码人却在今日」，我量到的每个状态都是错的。
     harness 在收尾时会把标题设成 READY-<视图>-<真实激活的视图>，
     用它当握手信号，比 sleep 一个猜出来的毫秒数可靠得多。 */
  await session.waitFor('document.title.indexOf("READY-") === 0',
    { what: 'harness 启动收尾完成（标题变成 READY-…）' });

  return session;
}

module.exports = { open, waitFor, sleep, CHROME };