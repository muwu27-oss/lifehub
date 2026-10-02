/* ═══════════════════════════════════════════════
   crypto.js — 日记的密码加密（WebCrypto）
   ═══════════════════════════════════════════════

   日记是唯一一个「连本机存储都不该明文放」的模块，
   所以这里做的是**真加密**，不是糊一层界面锁：

     password ──PBKDF2-SHA256(20 万次, 随机 salt)──▶ 密钥
     明文 ──AES-256-GCM(每条一个随机 IV)──▶ 密文

   存进 localStorage 和导出备份里的都是密文 + salt + verifier，
   拿不到密码就解不开。

   ⚠️ 必须诚实的两件事（也写进了模块内置说明书）：
   ① 这是**客户端加密**，密码强度就是你数据的强度。
      对方如果专门针对你、又拿到了密文，理论上可以离线暴力破解。
      设一个不像生日的密码，比什么加密算法都重要。
   ② **忘记密码 = 数据永久找不回来。** 没有后门、没有找回流程，
      因为能找回就意味着有第三个人能解开。

   ⚠️ crypto.subtle 只在**安全上下文**（https / localhost）可用。
   GitHub Pages 是 https，正常；但用 file:// 直接打开页面就会不可用，
   所以 C.available() 必须检测，不能假设它一定在。
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const C = {};

  /* 迭代次数。OWASP 对 PBKDF2-SHA256 的建议值。
     手机上大概 0.3~1.5 秒，用户能接受（只在解锁时算一次）；
     调低会让暴力破解变便宜，所以不要为了「快」随便降。 */
  C.ITERATIONS = 200000;

  /* 解锁时拿它试解密：解得开就说明密码对。
     为什么不直接存「密码的哈希」：那样等于多给攻击者一份可比对的目标。
     存一段用真密钥加密的已知明文，只有真密钥能解开，信息量更少。 */
  const VERIFY_TEXT = 'lifehub-diary-verify-v1';

  /* ───────── 环境检测 ───────── */

  C.available = function () {
    try {
      return !!(global.crypto && global.crypto.subtle &&
        typeof global.crypto.subtle.deriveKey === 'function' &&
        global.crypto.getRandomValues);
    } catch (e) { return false; }
  };

  /** 为什么用不了 —— 直接给用户看的原因，不要只说「不支持」 */
  C.whyUnavailable = function () {
    if (!global.crypto || !global.crypto.subtle) {
      if (!global.isSecureContext && global.location &&
        !/^https:$/.test(global.location.protocol) &&
        !/^https?:$/.test('')) {
        return '当前页面不是 https，浏览器不允许加密运算。用线上网址打开即可。';
      }
      return '这个浏览器不支持 WebCrypto，换 Chrome / Edge / 新版 Safari 试试。';
    }
    if (!global.crypto.getRandomValues) return '这个浏览器取不到安全随机数。';
    return '当前环境不支持加密。';
  };

  /* ───────── 编解码 ───────── */

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function bytesToB64(bytes) {
    let s = '';
    /* 分块，避免 chunk 太大时 apply 参数溢出 */
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(s);
  }

  function b64ToBytes(b64) {
    const s = atob(String(b64 || ''));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  C.bytesToB64 = bytesToB64;
  C.b64ToBytes = b64ToBytes;

  /* ───────── 随机 ───────── */

  C.randomBytes = function (n) {
    const b = new Uint8Array(n);
    global.crypto.getRandomValues(b);
    return b;
  };

  /** 新盐：16 字节。每个日记库一份，跟着备份一起走 */
  C.newSalt = function () { return bytesToB64(C.randomBytes(16)); };

  /** AES-GCM 的 IV：12 字节。**每条记录都要新生成一个**。
   *  GCM 下重用 IV 会直接泄露明文关系，这是硬性要求，不是优化。 */
  C.newIV = function () { return C.randomBytes(12); };

  /* ───────── 密钥派生 ───────── */

  /**
   * 从密码派生密钥。
   * @param {string} password
   * @param {string} saltB64   base64 的盐
   * @param {number} [iterations]
   * @returns {Promise<CryptoKey>}
   */
  C.derive = async function (password, saltB64, iterations) {
    if (!C.available()) throw new Error(C.whyUnavailable());
    if (!password) throw new Error('密码不能为空');
    if (!saltB64) throw new Error('缺少加密参数（salt）');

    const base = await global.crypto.subtle.importKey(
      'raw', enc.encode(String(password)), { name: 'PBKDF2' }, false, ['deriveKey']
    );
    return global.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: b64ToBytes(saltB64),
        iterations: Number(iterations) || C.ITERATIONS,
        hash: 'SHA-256'
      },
      base,
      { name: 'AES-GCM', length: 256 },
      false,                       // 不可导出：密钥出不了 crypto 层
      ['encrypt', 'decrypt']
    );
  };

  /* ───────── 加解密 ───────── */

  /**
   * 加密一段文本。
   * @returns {Promise<{iv:string, ct:string}>} 都是 base64
   */
  C.encrypt = async function (key, text) {
    const iv = C.newIV();
    const buf = await global.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, key, enc.encode(String(text == null ? '' : text))
    );
    return { iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(buf)) };
  };

  /**
   * 解密。
   * 密码错时 AES-GCM 会**认证失败**并抛异常 —— 这正是我们要的：
   * 不需要比对哈希，解不开就是密码不对（或被改过）。
   */
  C.decrypt = async function (key, iv, ct) {
    if (!iv || !ct) throw new Error('密文不完整');
    const buf = await global.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(iv) }, key, b64ToBytes(ct)
    );
    return dec.decode(buf);
  };

  /** 加密一个对象（JSON 序列化后加密） */
  C.encryptJSON = async function (key, obj) {
    return C.encrypt(key, JSON.stringify(obj == null ? {} : obj));
  };

  /** 解密回对象。解不开或不是 JSON 都抛错，由调用方决定怎么兜。 */
  C.decryptJSON = async function (key, iv, ct) {
    const text = await C.decrypt(key, iv, ct);
    try { return JSON.parse(text); }
    catch (e) { throw new Error('内容已损坏（解密成功但不是合法数据）'); }
  };

  /* ───────── 密码校验块 ───────── */

  /** 造一个校验块：用它验证「密码对不对」 */
  C.makeVerifier = async function (key) {
    return C.encrypt(key, VERIFY_TEXT);
  };

  /** 密码对不对。任何异常都算「不对」，不要把异常抛给界面。 */
  C.checkVerifier = async function (key, iv, ct) {
    try {
      const t = await C.decrypt(key, iv, ct);
      return t === VERIFY_TEXT;
    } catch (e) {
      return false;
    }
  };

  global.Crypto = C;
})(window);