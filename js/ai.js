/* ═══════════════════════════════════════════════
   ai.js — 直连大模型（OpenAI 兼容协议）
   支持：阿里云百炼 DashScope / DeepSeek / 任意 OpenAI 兼容端点
   Key 只存在手机本地 localStorage，不上传任何第三方。
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const A = {};

  /* 预设服务商（用户可自填 baseURL 覆盖） */
  A.PRESETS = {
    dashscope: {
      name: '阿里云百炼 · 千问',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      /* 百炼的真实模型名（compatible-mode 也认这些名字）：
         qwen-max / qwen-plus 是通用对话模型，qwen-vl-max 能读图（识别课表要用它） */
      models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-vl-max'],
      visionModels: ['qwen-vl-max', 'qwen-vl-plus'],
      keyURL: 'https://bailian.console.aliyun.com/?apiKey=1',
      note: '国内直连、支持读图的模型，推荐用这个'
    },
    deepseek: {
      name: 'DeepSeek 官方',
      baseURL: 'https://api.deepseek.com/v1',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      keyURL: 'https://platform.deepseek.com/api_keys'
    },
    moonshot: {
      name: '月之暗面 Kimi',
      baseURL: 'https://api.moonshot.cn/v1',
      models: ['moonshot-v1-32k', 'kimi-latest'],
      keyURL: 'https://platform.moonshot.cn/console/api-keys'
    },
    zhipu: {
      name: '智谱 GLM',
      baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      models: ['glm-4-plus', 'glm-4-flash'],
      visionModels: ['glm-4v-plus', 'glm-4v'],
      keyURL: 'https://open.bigmodel.cn/usercenter/apikeys'
    },
    custom: { name: '自定义（OpenAI 兼容）', baseURL: '', models: [], keyURL: '' }
  };

  A.cfg = () => S.settings.ai;

  A.isReady = function () {
    const c = A.cfg();
    return !!(c.enabled && c.apiKey && c.baseURL && c.model);
  };

  /* ═══════════ 核心调用 ═══════════ */

  /**
   * @param {array} messages [{role:'system'|'user'|'assistant', content}]
   * @param {object} opts { temperature, maxTokens, onDelta, timeoutMs, json }
   */
  A.chat = async function (messages, opts = {}) {
    const c = A.cfg();
    if (!c.apiKey) throw new Error('还没填 API Key，请到「设置 → AI」里配置');
    if (!c.baseURL) throw new Error('还没填接口地址');

    const url = c.baseURL.replace(/\/+$/, '') + '/chat/completions';
    const body = {
      model: opts.model || c.model,
      messages,
      temperature: opts.temperature != null ? opts.temperature : (c.temperature || 0.6),
      stream: !!opts.onDelta
    };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    if (opts.json) body.response_format = { type: 'json_object' };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 120000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + c.apiKey
        },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });

      if (!res.ok) {
        let detail = '';
        try {
          const j = await res.json();
          detail = j.error?.message || j.message || JSON.stringify(j).slice(0, 300);
        } catch (e) {
          detail = await res.text().catch(() => '');
        }
        throw new Error(`接口返回 ${res.status}：${String(detail).slice(0, 300) || res.statusText}`);
      }

      /* 流式 */
      if (opts.onDelta) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '', full = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            const t = line.trim();
            if (!t || !t.startsWith('data:')) continue;
            const payload = t.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const j = JSON.parse(payload);
              const delta = j.choices?.[0]?.delta?.content
                         || j.choices?.[0]?.message?.content || '';
              if (delta) { full += delta; opts.onDelta(delta, full); }
            } catch (e) { /* 忽略不完整帧 */ }
          }
        }
        return full;
      }

      /* 非流式 */
      const j = await res.json();
      const content = j.choices?.[0]?.message?.content;
      if (content == null) throw new Error('接口返回内容为空：' + JSON.stringify(j).slice(0, 200));
      return content;

    } catch (e) {
      if (e.name === 'AbortError') throw new Error('请求超时，检查网络或换个模型');
      if (e instanceof TypeError) throw new Error('网络请求失败：可能是跨域被拦或网络不通。' + e.message);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };

  /** 测试连通性 */
  A.test = async function () {
    const out = await A.chat([
      { role: 'user', content: '回复"连接成功"四个字，不要别的。' }
    ], { maxTokens: 20, temperature: 0 });
    return out.trim();
  };

  /* ═══════════ 提示词构建 ═══════════ */

  const SYS_BASE = `你是一个务实的学习生活管理助手，服务对象是一名中国大学生（男生，正在减脂，方向是计算机视觉与具身智能，参加机器人比赛）。

你的原则：
1. 说人话，不要客套话和免责声明。
2. 给具体可执行的建议，不要"要保持良好习惯"这种废话。
3. 指出问题时要说清"为什么"和"怎么改"，用最短的话。
4. 数据不足时明确说"数据不足"，不要编。
5. 用 Markdown 组织，善用短列表，控制篇幅。`;

  /* ── 日程评价 ── */
  A.promptScheduleReview = function (range, tasks, stats) {
    const L = [];
    L.push(`# 请求：评价我的日程安排（${range}）`);
    L.push('');
    L.push('## 我当前的日程 / 待办');
    L.push('');

    const cats = { study: [], cv: [], life: [] };
    tasks.forEach(t => (cats[t.cat] || cats.life).push(t));

    Object.keys(S.CATS).forEach(c => {
      if (!cats[c].length) return;
      L.push(`### ${S.CATS[c].name}（${cats[c].length} 项）`);
      cats[c].sort((a, b) => (a.due || a.start || '9').localeCompare(b.due || b.start || '9'));
      cats[c].forEach(t => {
        const when = t.due || t.start;
        let s = `- ${t.done ? '[已完成] ' : ''}${t.title}`;
        if (when) s += ` — ${U.friendly(when)}${String(when).includes('T') ? ' ' + U.hm(when) : ''}`;
        else s += ' — 无日期';
        s += `（${(S.PRIORITY[t.priority] || S.PRIORITY[1]).name}）`;
        if (t.note) s += ` 备注:${t.note}`;
        L.push(s);
      });
      L.push('');
    });

    L.push('## 统计');
    L.push(`- 总计 ${tasks.length} 项，已完成 ${tasks.filter(t => t.done).length} 项`);
    L.push(`- 逾期 ${stats.overdue} 项，未来 7 天到期 ${stats.soon} 项`);
    const catLine = Object.keys(S.CATS).map(c => `${S.CATS[c].short} ${cats[c].length}`).join(' / ');
    L.push(`- 分类分布：${catLine}`);
    L.push('');
    L.push('## 请你做的事');
    L.push('1. 指出这个安排里**最不合理的 2~3 处**（比如任务堆叠、优先级错配、明显排不下）');
    L.push('2. 我当前在「计算机视觉 / 具身智能」这条主线上，判断我的学习任务是否偏离主线');
    L.push('3. 给出本周应该优先做的 3 件事，并说明理由');
    L.push('4. 如果有任务明显该砍掉或推迟，直接说');
    return L.join('\n');
  };

  /* ── 从自然语言生成日程 ── */
  A.promptGenerateSchedule = function (userText, existingTitles) {
    const today = U.ymd(U.today());
    const L = [];
    L.push('你是日程解析器。把用户的自然语言描述转成**严格的 JSON**，不要输出任何解释文字。');
    L.push('');
    L.push(`今天是 ${today}（${U.dowName(U.today())}）。`);
    L.push('');
    L.push('输出格式（必须是合法 JSON 对象，不要用 markdown 代码块包裹）：');
    L.push(`{
  "tasks": [
    {
      "title": "任务标题（简洁，去掉时间词）",
      "cat": "study | cv | life",
      "start": "YYYY-MM-DDTHH:mm 或 YYYY-MM-DD 或 null",
      "due": "YYYY-MM-DDTHH:mm 或 YYYY-MM-DD 或 null",
      "duration": 分钟数或 null,
      "priority": 0到3的整数,
      "note": "补充说明或空字符串",
      "location": "地点或空字符串"
    }
  ]
}`);
    L.push('');
    L.push('分类规则：');
    L.push('- cv：计算机视觉、机器人、具身智能、ROS、SLAM、深度学习、目标检测跟踪、机器人比赛相关');
    L.push('- study：学校课程、作业、考试、论文、通用学科');
    L.push('- life：生活琐事、吃饭、取快递、运动、社交、杂项');
    L.push('');
    L.push('时间规则：');
    L.push('- "下午3点" → 15:00；"晚上7点" → 19:00；没提时间就只填日期');
    L.push('- 只有日期没有时刻时，格式用 YYYY-MM-DD');
    L.push('- 截止类任务填 due，开始类任务填 start');
    L.push('');
    if (existingTitles && existingTitles.length) {
      L.push('我已经有的任务（避免重复生成）：' + existingTitles.slice(0, 40).join('、'));
      L.push('');
    }
    L.push('用户描述：');
    L.push('"""');
    L.push(userText);
    L.push('"""');
    return L.join('\n');
  };

  /** 解析 AI 返回的 JSON（容错：去掉代码块围栏） */
  A.parseTasksJSON = function (text) {
    let s = String(text).trim();
    // 去掉 ```json ... ``` 围栏
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) s = fence[1].trim();
    // 截取第一个 { 到最后一个 }
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    let obj;
    try { obj = JSON.parse(s); }
    catch (e) { throw new Error('AI 返回的不是合法 JSON：' + s.slice(0, 200)); }
    const arr = Array.isArray(obj) ? obj : (obj.tasks || []);
    if (!Array.isArray(arr)) throw new Error('AI 返回结构里没有 tasks 数组');

    return arr.map(t => {
      const title = String(t.title || '').trim();
      /* AI 可能返回不存在的分类（或干脆不返回），
         这种情况用本地分类器按标题猜一个，比一律塞进「日常」准得多。 */
      const cat = ['study', 'cv', 'life'].includes(t.cat)
        ? t.cat
        : Parser.classify(title).cat;
      return {
        title: String(t.title || '').trim(),
        cat,
        start: normDate(t.start),
        due: normDate(t.due),
        duration: Number(t.duration) || 60,
        priority: U.clamp(parseInt(t.priority, 10) || 1, 0, 3),
        note: String(t.note || ''),
        location: String(t.location || ''),
        source: 'ai',
        done: false,
        confidence: 'high',
        _keep: true
      };
    }).filter(t => t.title.length >= 1);
  };

  function normDate(v) {
    if (!v || v === 'null') return null;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 16);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return null;
  }

  /* ── DSH 上下文（让 AI 知道用户的学习体系） ── */
  A.promptBlueprintReview = function (blueprint, progress) {
    const L = [];
    L.push('# 请求：评价我的计算机视觉 / 具身智能学习进度');
    L.push('');
    L.push('## 我的知识库结构（Obsidian）');
    L.push(blueprint.summary || '');
    L.push('');
    L.push('## 我当前所在的阶段');
    L.push(blueprint.stage || '');
    L.push('');
    L.push('## 各模块进度');
    Object.keys(progress || {}).forEach(k => {
      L.push(`- ${k}：${progress[k]}`);
    });
    L.push('');
    L.push('## 请你做的事');
    L.push('1. 判断我当前投入是否偏离主线（我应优先机器人视觉 + Robocon，纯 CV 理论深入是第四优先级）');
    L.push('2. 指出进度表里哪些 🔴 是**现在就该补的前置**，哪些是可以继续搁置的远期');
    L.push('3. 给一个未来 2 周的具体学习顺序');
    return L.join('\n');
  };

  /* ── 饮食作息评价 ── */
  A.promptBodyReview = function (reportText) {
    return SYS_BASE + '\n\n---\n\n' + reportText;
  };

  /* ── 通用：直接把一段文本丢给 AI ── */
  A.run = async function (userPrompt, opts = {}) {
    return A.chat([
      { role: 'system', content: opts.system || SYS_BASE },
      { role: 'user', content: userPrompt }
    ], opts);
  };

  /* ── 记录历史 ── */
  A.log = function (kind, prompt, output, model) {
    S.add('aiLogs', {
      kind, model: model || A.cfg().model,
      input: String(prompt).slice(0, 4000),
      output: String(output).slice(0, 8000),
      at: new Date().toISOString()
    });
    // 只保留最近 40 条，避免撑爆存储
    const logs = S.all('aiLogs');
    if (logs.length > 40) {
      logs.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
      const keep = logs.slice(0, 40);
      S.db.aiLogs = keep;
      S.save();
    }
  };

  /* ═══════════ 课表图片识别（多模态 OCR） ═══════════ */

  /** 视觉模型：默认跟随用户配置，但允许单独指定（OCR 要用能看图的模型） */
  A.visionModel = function () {
    const c = A.cfg();
    return c.visionModel || (c.baseURL && /dashscope/.test(c.baseURL) ? 'qwen-vl-max' : c.model);
  };

  const TIMETABLE_PROMPT = [
    '这是一张大学课程表截图。请把里面的课程提取成 JSON。',
    '',
    '要求：',
    '1. 只输出 JSON，不要任何解释文字',
    '2. 每门课一个对象，字段如下：',
    '   - name: 课程名称（去掉老师姓名、教室等）',
    '   - weekday: 星期几，1=周一 … 7=周日',
    '   - startPeriod: 开始节次（数字，如 1）',
    '   - endPeriod: 结束节次（数字，如 2）',
    '   - location: 教室/地点，没有就空字符串',
    '   - weeks: 上课周次数组，如 [1,2,3,...]。看不清或没写就给空数组 []',
    '3. 同一门课在不同星期/不同节次出现，要拆成多条',
    '4. 如果表格里的时间是具体时刻（如 08:00-09:40）而不是节次，',
    '   请把 startPeriod/endPeriod 换成 startTime/endTime（"08:00" 格式）',
    '',
    '输出格式：',
    '{"courses":[{"name":"高等数学","weekday":1,"startPeriod":1,"endPeriod":2,"location":"A101","weeks":[]}]}'
  ].join('\n');

  /**
   * 识别课表图片
   * @param {string} dataUrl 图片的 data:image/...;base64,... 形式
   * @returns {Promise<Array>} 课程数组，已换算成 {name,weekday,start:{h,m},end:{h,m},weeks,location}
   */
  A.readTimetable = async function (dataUrl) {
    if (!A.isReady()) throw new Error('还没配置 API Key');
    if (!dataUrl || !/^data:image\//.test(dataUrl)) throw new Error('图片格式不对');

    const out = await A.chat([
      { role: 'system', content: '你是一个精确的课程表 OCR 助手，只输出 JSON。' },
      {
        role: 'user',
        content: [
          { type: 'text', text: TIMETABLE_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ], {
      model: A.visionModel(),
      temperature: 0.1,
      json: true,
      timeoutMs: 180000
    });

    /* 解析 JSON */
    let s = String(out).trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) s = fence[1].trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);

    let obj;
    try { obj = JSON.parse(s); }
    catch (e) { throw new Error('AI 返回的不是合法 JSON：' + s.slice(0, 150)); }

    const arr = Array.isArray(obj) ? obj : (obj.courses || []);
    if (!Array.isArray(arr) || !arr.length) throw new Error('没识别出课程');

    A.log('timetable', TIMETABLE_PROMPT, out, A.visionModel());

    return arr.map(c => {
      const wd = U.clamp(parseInt(c.weekday, 10) || 1, 1, 7);
      let start, end;

      if (c.startTime && c.endTime) {
        /* 直接给了时刻 */
        const sm = String(c.startTime).match(/(\d{1,2}):(\d{2})/);
        const em = String(c.endTime).match(/(\d{1,2}):(\d{2})/);
        start = sm ? { h: +sm[1], m: +sm[2] } : { h: 8, m: 0 };
        end = em ? { h: +em[1], m: +em[2] } : { h: 9, m: 40 };
      } else {
        /* 给了节次 → 用高校常用作息换算 */
        const sp = parseInt(c.startPeriod, 10) || 1;
        const ep = parseInt(c.endPeriod, 10) || sp;
        const sT = Parser.periodToTime ? Parser.periodToTime(sp) : { hour: 8, minute: 0 };
        const eT = Parser.periodToTime ? Parser.periodToTime(ep) : { hour: 9, minute: 40 };
        start = { h: sT.hour, m: sT.minute };
        /* 一节课通常 45 分钟，节次结束时间 = 该节开始 + 45 分 */
        end = { h: eT.hour, m: eT.minute + 45 };
        if (end.m >= 60) { end.h += Math.floor(end.m / 60); end.m %= 60; }
      }

      return {
        name: String(c.name || '').trim() || '未命名课程',
        weekday: wd,
        start, end,
        weeks: Array.isArray(c.weeks) ? c.weeks.map(Number).filter(n => n > 0) : [],
        location: String(c.location || '').trim()
      };
    }).filter(c => c.name && c.name !== '未命名课程');
  };

  /* ═══════════ 食物识别与营养查询 ═══════════
     内置食物库只有一百来条，学生日常吃的东西远不止这些。
     概念不匹配、地方菜、外卖、零食、饮料基本都不在库里，
     原来只能退化成「150 kcal/100g」的通用估算——误差能到两三倍。
     所以这里接 AI 补两条路：
       ① 纯文本查任意食物（不限于库）
       ② 拍照片识别盘子里有什么、各多少克
     ═══════════════════════════════════════════ */

  /* 统一要求 AI 返回「每 100g」的营养值 + 一个常见份量。
     统一成每 100g 是关键：这样跟本地库同构，
     后续换算法、换份量都不用动渲染代码。 */
  const FOOD_TEXT_PROMPT = [
    '你是中国食物成分表。用户会给你一个食物名称，可能是：',
    '家常菜、地方小吃、外卖菜品、餐厅菜、包装食品、饮料、零食，',
    '或者带品牌/规格的描述（如「蜜雪冰城柠檬水」「卫龙辣条大包装」）。',
    '',
    '请给出该食物每 100g 的营养成分，以及一个最常见的食用份量。',
    '如果名称里含份量信息（如「大杯」「两份」），按描述调整 gram。',
    '如果是液体，unit 用「杯」或「瓶」；如果是主食，用「碗」或「个」。',
    '',
    '要求：',
    '- 数值为该食物【每 100g】的含量，不是每份',
    '- kcal 单位千卡，protein/fat/carb/fiber 单位克',
    '- gram 是「一份」大概多少克（整数）',
    '- 拿不准时按同类食物的常见值给，不要留空、不要给 null',
    '- 给 1~4 个最可能匹配的候选，最可能的排第一',
    '',
    '只输出 JSON：',
    '{"foods":[{"name":"名称","kcal":116,"protein":2.6,"fat":0.3,',
    '"carb":25.9,"fiber":0.3,"unit":"碗","gram":200,"note":"一句话说明"}]}'
  ].join('\n');

  const FOOD_PHOTO_PROMPT = [
    '你是营养师，正在看一张食物照片。请识别照片里所有能吃的东西，并估算份量。',
    '',
    '要求：',
    '- 逐个列出食物，包括主食、菜、饮品、调料（油多的菜要单独说明）',
    '- grams 是你估计的【实际摄入重量】，不是包装规格',
    '- 同时给出该食物【每 100g】的营养值',
    '- 照片里看不清或判断不了的，宁可少列也不要编',
    '- 如果是包装食品，尽量说出品牌/口味',
    '- 参考常见餐盘、筷子、手的比例来估算重量',
    '',
    '只输出 JSON：',
    '{"items":[{"name":"米饭","grams":200,"kcal":116,"protein":2.6,"fat":0.3,',
    '"carb":25.9,"fiber":0.3,"confidence":"high"}],',
    '"note":"整体说明，比如这餐偏油、蛋白不足"}'
  ].join('\n');

  /** 从 AI 返回里抠出 JSON（容忍 ```json 包裹和前后废话）。
   *  注意要同时认数组：AI 常直接返回 [{...}]，
   *  如果只按 { 到 } 去找，会把数组里的第一个对象抠出来当整份结果。 */
  function parseJsonObject(raw) {
    let s = String(raw == null ? '' : raw).trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) s = fence[1].trim();

    const curly = s.indexOf('{'), bracket = s.indexOf('[');
    let a, b;
    if (bracket >= 0 && (curly < 0 || bracket < curly)) {
      a = bracket; b = s.lastIndexOf(']');            // 数组优先
    } else {
      a = curly; b = s.lastIndexOf('}');
    }
    if (a >= 0 && b > a) s = s.slice(a, b + 1);

    try {
      const v = JSON.parse(s);
      return v;
    } catch (e) {
      /* 上面挑错了括号就换另一种再试一次 */
      const a2 = curly, b2 = s.lastIndexOf('}');
      if (a2 >= 0 && b2 > a2) {
        try { return JSON.parse(s.slice(a2, b2 + 1)); } catch (e2) { /* 落到下面报错 */ }
      }
      throw new Error('AI 返回的不是合法 JSON：' + String(raw).slice(0, 150));
    }
  }

  /** 把 AI 返回的食物对象规整成内部结构（每 100g） */
  function normFood(o) {
    if (!o || !o.name) return null;
    const num = v => {
      const n = Number(v);
      return isFinite(n) && n >= 0 ? n : 0;
    };
    const gram = num(o.gram) || num(o.grams) || 100;
    return {
      n: String(o.name).trim().slice(0, 40),
      k: num(o.kcal),
      p: num(o.protein),
      f: num(o.fat),
      c: num(o.carb),
      fib: num(o.fiber),
      unit: String(o.unit || '份').slice(0, 6),
      gram: Math.round(gram),
      tag: 'AI',
      ai: true,
      note: o.note ? String(o.note).slice(0, 80) : '',
      confidence: o.confidence ? String(o.confidence).slice(0, 10) : ''
    };
  }

  /**
   * 用 AI 查食物的营养（不限于内置库）
   * @param {string} query 食物名，越具体越准
   * @returns {Promise<Array>} 内部食物结构数组
   */
  A.lookupFood = async function (query) {
    if (!A.isReady()) throw new Error('还没配置 API Key（设置 → AI）');
    const q = String(query || '').trim();
    if (!q) throw new Error('先输入食物名');
    if (q.length > 60) throw new Error('食物名太长了');

    const out = await A.chat([
      { role: 'system', content: '你是一个精确的中国食物营养数据库，只输出 JSON。' },
      { role: 'user', content: FOOD_TEXT_PROMPT + '\n\n食物名称：' + q }
    ], { temperature: 0.1, json: true, timeoutMs: 60000 });

    const obj = parseJsonObject(out);
    const arr = Array.isArray(obj) ? obj : (obj.foods || obj.items || []);
    const foods = (Array.isArray(arr) ? arr : []).map(normFood).filter(Boolean);
    if (!foods.length) throw new Error('没查到「' + q + '」的营养数据');

    A.log('food-text', q, out);
    return foods;
  };

  /**
   * 拍照识别食物
   * @param {string} dataUrl data:image/...;base64,...
   * @returns {Promise<{items:Array, note:string}>}
   */
  A.readFoodPhoto = async function (dataUrl) {
    if (!A.isReady()) throw new Error('还没配置 API Key（设置 → AI）');
    if (!dataUrl || !/^data:image\//.test(dataUrl)) throw new Error('图片格式不对');

    const out = await A.chat([
      { role: 'system', content: '你是营养师，只输出 JSON。' },
      {
        role: 'user',
        content: [
          { type: 'text', text: FOOD_PHOTO_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ], {
      model: A.visionModel(),
      temperature: 0.2,
      json: true,
      timeoutMs: 120000
    });

    const obj = parseJsonObject(out);
    const arr = Array.isArray(obj) ? obj : (obj.items || obj.foods || []);
    const items = (Array.isArray(arr) ? arr : []).map(o => {
      const f = normFood(o);
      if (!f) return null;
      /* 照片识别额外给「这盘大概多少克」，覆盖掉默认份量 */
      const g = Number(o.grams);
      f.photoGrams = isFinite(g) && g > 0 ? Math.round(g) : f.gram;
      return f;
    }).filter(Boolean);

    if (!items.length) throw new Error('没从照片里认出食物，换个角度或拍清楚点再试');

    A.log('food-photo', '(图片)', out, A.visionModel());
    return { items, note: obj.note ? String(obj.note).slice(0, 200) : '' };
  };

  /* ═══════════ 账单截图识别 ═══════════
     微信不允许第三方读它的数据库，导 CSV 要走
     「钱包→账单→常见问题→下载账单→填邮箱→解压→粘贴」七八步。
     截个图让 AI 读，能省掉中间的全部。
     局限：账单页分页加载，一屏 8~10 条，要截几次。
     ═══════════════════════════════════════ */

  const BILL_PHOTO_PROMPT = [
    '你在读一张微信支付或支付宝的账单截图。请把所有能看清的交易记录抽出来。',
    '',
    '规则：',
    '- 只抽确实看得见的记录，看不清的不要猜',
    '- 收入（+、已收钱、收款、退款）填 type:"income"；支出填 type:"expense"',
    '- amount 只填数字，不带符号和货币符号，永远是正数',
    '- date 尽量补成 YYYY-MM-DD；图上只写「10月2日」就看截图里的年份，没有就用今年',
    '- time 填 HH:MM，看不清填空字符串',
    '- counterparty 是对方姓名或商户名；product 是商品/说明',
    '- category 从这些里选一个：餐饮、交通、购物、日用、学习、娱乐、医疗、住房、通讯、人情、数码、运动、其他',
    '- 账单页的分页栏、广告、按钮文字不要当记录',
    '',
    '只输出 JSON：',
    '{"txns":[{"date":"2026-10-02","time":"12:30","type":"expense","amount":32.00,'
    + '"counterparty":"美团外卖","product":"午餐","category":"餐饮","status":"支付成功",'
    + '"note":""}],"note":"比如：只认出了 5 条，最后一条金额被截断"}'
  ].join('\n');

  /**
   * 识别账单截图 → 流水数组
   * @param {string} dataUrl data:image/...;base64,...
   * @returns {Promise<{txns:Array, note:string, skipped:number}>}
   */
  A.readBillPhoto = async function (dataUrl) {
    if (!A.isReady()) throw new Error('还没配置 API Key（设置 → AI）');
    if (!dataUrl || !/^data:image\//.test(dataUrl)) throw new Error('图片格式不对');

    const out = await A.chat([
      { role: 'system', content: '你是账单 OCR 助手，只输出 JSON。' },
      {
        role: 'user',
        content: [
          { type: 'text', text: BILL_PHOTO_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ], {
      model: A.visionModel(),
      temperature: 0.1,
      json: true,
      timeoutMs: 120000
    });

    const obj = parseJsonObject(out);
    const arr = Array.isArray(obj) ? obj : (obj.txns || obj.items || []);

    const VALID_CATS = ['餐饮', '交通', '购物', '日用', '学习', '娱乐', '医疗',
      '住房', '通讯', '人情', '数码', '运动', '其他'];

    let skipped = 0;
    const txns = [];
    (Array.isArray(arr) ? arr : []).forEach(o => {
      if (!o) { skipped++; return; }
      const amt = Number(String(o.amount == null ? '' : o.amount).replace(/[^\d.\-]/g, ''));
      const date = String(o.date || '').trim();
      if (!isFinite(amt) || !amt || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; return; }

      let type = String(o.type || '').toLowerCase();
      if (type !== 'income' && type !== 'expense') {
        /* 从状态词猜方向 */
        const st = String(o.status || '');
        type = /已收钱|已到账|收款|退款|收入/.test(st) ? 'income' : 'expense';
      }
      let cat = String(o.category || '').trim();
      if (VALID_CATS.indexOf(cat) < 0) cat = '其他';

      txns.push({
        id: '', date,
        time: /^\d{1,2}:\d{2}$/.test(String(o.time || '').trim()) ? String(o.time).trim() : '',
        type, amount: Math.abs(amt),
        counterparty: String(o.counterparty || '').slice(0, 40),
        product: String(o.product || '').slice(0, 60),
        bizType: '', method: '',
        status: String(o.status || '').slice(0, 20),
        tradeNo: '', merchantNo: '',
        note: String(o.note || '').slice(0, 80),
        category: cat,
        raw: JSON.stringify(o).slice(0, 300),
        source: 'bill-photo'
      });
    });

    if (!txns.length) throw new Error('没从截图里认出交易记录，换个清晰的截图再试');

    A.log('bill-photo', '(图片)', out, A.visionModel());
    return {
      txns,
      skipped,
      note: obj.note ? String(obj.note).slice(0, 200) : ''
    };
  };

  global.AI = A;
})(window);