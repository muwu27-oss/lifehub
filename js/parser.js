/* ═══════════════════════════════════════════════
   parser.js — 一键导入解析引擎
   把群消息 / 通知 / 课表文本 → 结构化任务
   设计原则：宁可少解析，不要解析错。低置信度标出来让用户确认。
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const P = {};

  /* ═══════════ 1. 分类词典 ═══════════
     命中 cv 词典 → 计算机视觉/具身智能
     命中 study 词典 → 一般通用学习
     否则 → 其他日常                                     */

  const CV_WORDS = [
    // 核心方向
    '计算机视觉', '机器视觉', '机器人视觉', '具身智能', 'embodied', 'cv', 'vision',
    // 你 Obsidian 蓝图里的节点关键词
    'opencv', 'yolo', '目标检测', '目标跟踪', '目标分割', '关键点', '语义分割',
    '相机标定', '标定', '内参', '畸变', 'pnp', 'aruco', 'apriltag', '位姿估计', '姿态估计',
    '三维视觉', '3d视觉', '点云', '深度图', '立体视觉', 'slam', '视觉里程计', 'vo',
    '光流', '特征匹配', 'orb', 'sift', 'homography', '单应', '对极几何', 'ransac',
    'gmc', '运动估计', '卡尔曼', 'kalman', '匈牙利', 'iou', 'deepsort', 'bytetrack',
    '神经网络', '深度学习', '卷积', 'cnn', 'transformer', 'vit', 'clip', 'vlm', 'vla',
    '扩散模型', 'diffusion', '强化学习', 'ppo', '策略网络', '模仿学习', 'imitation',
    'ros', 'ros2', 'rviz', 'gazebo', 'isaac', '导航', 'nav2', 'costmap', 'amcl',
    '传感器融合', '多传感器', '激光雷达', 'lidar', '深度相机', 'realsense', 't265', 'd435',
    '机械臂', '抓取', '手眼标定', '运动学', '正运动学', '逆运动学', '足式机器人', '四足',
    'robocon', 'robomaster', 'ican', 'nuwa', '数据集', '模型部署', 'tensorrt', 'onnx',
    '推理加速', '量化', '剪枝', '鲁棒性', '数据增强', '迁移学习', '微调', '训练',
    // 工具链
    'pytorch', 'tensorflow', 'paddle', 'numpy', 'python视觉', 'cuda'
  ];

  const STUDY_WORDS = [
    '课程', '上课', '课表', '第几节', '第1节', '第2节', '第3节', '第4节', '第5节',
    '高等数学', '高数', '线性代数', '线代', '概率论', '数理统计', '离散数学', '复变函数',
    '大学物理', '物理', '电路', '模电', '数电', '信号与系统', '自动控制', '控制理论',
    '数据结构', '算法', '操作系统', '计算机网络', '数据库', '编译原理', '软件工程',
    '英语', '四级', '六级', 'cet', '马原', '毛概', '思修', '近代史', '思政', '形式与政策',
    '体育', '军训', '实验课', '实验报告', '课程设计', '大作业', '期末', '期中', '补考', '缓考',
    '考试', '测验', '小测', '随堂', '卷面', '复习', '预习', '作业', '习题', '练习册',
    '论文', '文献', '开题', '答辩', '毕设', '毕业论文', '讲座', '报告会', '选课', '绩点',
    '学分', '课设', '上机', '机房', '实验室', '小组作业', 'presentation', 'pre'
  ];

  const LIFE_WORDS = [
    '吃饭', '聚餐', '约饭', '看电影', '取快递', '快递', '缴费', '水费', '电费', '话费',
    '充卡', '洗澡', '理发', '剪头', '买', '采购', '超市', '医院', '看病', '挂号', '体检',
    '疫苗', '报销', '办证', '身份证', '银行卡', '开会', '例会', '社团', '志愿', '兼职',
    '面试', '实习', '回家', '车票', '机票', '火车', '搬', '打扫', '洗衣', '遛弯', '跑步',
    '健身', '打球', '游泳', '运动', '睡觉', '起床', '生日', '纪念日', '礼物', '节日'
  ];

  /** 领域词的加权：一个"具身智能"应压过"论文+文献"两个通用词 */
  const CV_WEIGHT = 2.5;

  function countHits(text, words) {
    const t = text.toLowerCase();
    let score = 0, hits = [];
    words.forEach(w => {
      const lw = w.toLowerCase();
      if (lw.length <= 2) {
        // 短词（如 cv）要求词边界，避免误伤
        const re = new RegExp(`(^|[^a-z0-9])${lw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
        if (re.test(t)) { score += 2; hits.push(w); }
      } else if (t.includes(lw)) {
        score += lw.length >= 4 ? 2 : 1;
        hits.push(w);
      }
    });
    return { score, hits };
  }

  /** 判定分类，返回 {cat, score, hits, confident} */
  P.classify = function (text) {
    const cv = countHits(text, CV_WORDS);
    const st = countHits(text, STUDY_WORDS);
    const lf = countHits(text, LIFE_WORDS);

    const ranked = [
      { cat: 'cv', ...cv },
      { cat: 'study', ...st },
      { cat: 'life', ...lf }
    ].sort((a, b) => b.score - a.score);

    const best = ranked[0];

    // 领域词（CV/具身智能）优先：它是"学科方向"，比"论文/作业"这类
    // 通用学业词更能决定一条任务真正归属哪里。
    // 「具身智能论文」应归 CV，而不是被「论文」拉去通用学习。
    if (cv.score > 0 && cv.score * CV_WEIGHT >= best.score) {
      return { cat: 'cv', ...cv, confident: cv.score >= 2, reason: '命中：' + cv.hits.slice(0, 4).join('、') };
    }
    if (best.score === 0) {
      return { cat: 'life', score: 0, hits: [], confident: false, reason: '无关键词命中，归入日常' };
    }
    return { cat: best.cat, ...best, confident: best.score >= 2, reason: '命中：' + best.hits.slice(0, 4).join('、') };
  };

  /* ═══════════ 2. 时间解析 ═══════════ */

  const CN_NUM = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15, 十六: 16, 十七: 17, 十八: 18, 十九: 19, 二十: 20, 二十一: 21, 二十二: 22, 二十三: 23, 二十四: 24, 三十: 30, 三十一: 31 };
  const WEEKDAY = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };

  function cn2num(s) {
    if (s == null) return NaN;
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    return CN_NUM[s] !== undefined ? CN_NUM[s] : NaN;
  }

  /**
   * 从文本中提取日期。返回 {date:"YYYY-MM-DD", hasTime, time:"HH:mm", confidence, raw}
   */
  P.extractDate = function (text, baseDate) {
    const base = baseDate ? U.parse(baseDate) : U.today();
    const t = U.norm(text);
    let m;

    /* ── 绝对日期：2026-03-05 / 2026/3/5 / 3月5日 / 3-5 ── */
    if ((m = t.match(/(20\d{2})[-\/年](\d{1,2})[-\/月](\d{1,2})/))) {
      const d = new Date(+m[1], +m[2] - 1, +m[3]);
      return withTime(t, d, 'high', m[0]);
    }
    /* 「9-10日」「9~10号」= 本月 9 到 10 号，不是 9月10日。
       这种带「日/号」后缀的区间要先于下面的「月-日」规则处理。 */
    if ((m = t.match(/(\d{1,2})\s*[-~到至]\s*(\d{1,2})\s*[日号]/))) {
      const dd = +m[1];
      if (dd >= 1 && dd <= 31) {
        let y = base.getFullYear();
        const d = new Date(y, base.getMonth(), dd);
        /* 这个月已经过了 → 说的应该是下个月 */
        if (U.diffDays(base, d) < 0) d.setMonth(d.getMonth() + 1);
        return withTime(t, d, 'high', m[0]);
      }
    }
    /* 单独一个「15日」「15号」= 本月的 15 号（已过则算下个月）。
       要放在「N月N日」之后，避免把「3月5日」的 5日 单独截走。 */
    if ((m = t.match(/(?:^|[^\d月])(\d{1,2})\s*[日号](?![一二三四五六七八九十])/))) {
      const dd = +m[1];
      if (dd >= 1 && dd <= 31) {
        const d = new Date(base.getFullYear(), base.getMonth(), dd);
        if (U.diffDays(base, d) < 0) d.setMonth(d.getMonth() + 1);
        return withTime(t, d, 'medium', m[0]);
      }
    }
    if ((m = t.match(/(\d{1,2})月(\d{1,2})[日号]?/))) {
      const mm = +m[1], dd = +m[2];
      if (mm < 1 || mm > 12 || dd < 1 || dd > 31) { /* 非法，落到后面的规则 */ }
      else {
        let y = base.getFullYear();
        const d = new Date(y, mm - 1, dd);
        // 已过去超过 30 天 → 用户在说下一年的这个日子
        if (U.diffDays(base, d) < -30) d.setFullYear(y + 1);
        return withTime(t, d, 'high', m[0]);
      }
    }
    /* 裸写的 3-5 / 3/5（月-日）。
       坑：「第3-4节」「3-4周」也会命中，被误当成 3月4日。
       所以先用「节/周/次/讲/章」做否定后缀，再排除「第」前缀。 */
    if ((m = t.match(/(?:^|[^\d第])(\d{1,2})[-\/](\d{1,2})(?![-\/\d])(?!\s*[节周次讲章])/))) {
      const mm = +m[1], dd = +m[2];
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        let y = base.getFullYear();
        const d = new Date(y, mm - 1, dd);
        if (U.diffDays(base, d) < -30) d.setFullYear(y + 1);
        return withTime(t, d, 'medium', m[0]);
      }
    }

    /* ── 相对日 ── */
    if (/今天|今日|今晚/.test(t)) return withTime(t, base, 'high', '今天');
    if (/明天|明日|明晚/.test(t)) return withTime(t, U.addDays(base, 1), 'high', '明天');
    if (/后天/.test(t)) return withTime(t, U.addDays(base, 2), 'high', '后天');
    if (/大后天/.test(t)) return withTime(t, U.addDays(base, 3), 'high', '大后天');
    if ((m = t.match(/(\d{1,2})\s*天[后以]?后?/))) {
      return withTime(t, U.addDays(base, +m[1]), 'medium', m[0]);
    }
    if (/下周|下个?星期|下礼拜/.test(t)) {
      const wm = t.match(/(?:下周|下个?星期|下礼拜)([一二三四五六日天])/);
      const target = wm ? WEEKDAY[wm[1]] : 1;
      let d = U.startOfWeek(base); d = U.addDays(d, 7 + ((target + 6) % 7));
      return withTime(t, d, 'high', '下周' + (wm ? wm[1] : ''));
    }
    if (/这周|本周|周内/.test(t)) {
      const wm = t.match(/(?:这周|本周)([一二三四五六日天])/);
      if (wm) {
        let d = U.startOfWeek(base); d = U.addDays(d, (WEEKDAY[wm[1]] + 6) % 7);
        if (d < base) d = U.addDays(d, 7);
        return withTime(t, d, 'high', '本周' + wm[1]);
      }
    }
    if ((m = t.match(/(?:周|星期|礼拜)([一二三四五六日天])/))) {
      const target = WEEKDAY[m[1]];
      let d = U.startOfWeek(base);
      d = U.addDays(d, (target + 6) % 7);
      if (U.diffDays(base, d) < 0) d = U.addDays(d, 7);   // 已过则算下周
      return withTime(t, d, 'medium', m[0]);
    }
    if (/月底|月末/.test(t)) {
      const d = new Date(base.getFullYear(), base.getMonth() + 1, 0);
      return withTime(t, d > base ? d : new Date(base.getFullYear(), base.getMonth() + 2, 0), 'medium', '月底');
    }
    if (/月初/.test(t)) {
      const d = new Date(base.getFullYear(), base.getMonth() + 1, 1);
      return withTime(t, d, 'medium', '月初');
    }

    return null;
  };

  /** 在已定日期基础上补时间信息 */
  function withTime(text, date, confidence, raw) {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    let hasTime = false, rawTime = '';

    // 24 小时制：19:00 / 19：00 / 19点30 / 19点
    // 注意：中文里「晚上 8:00」是 20:00，所以 H:MM 也要受时段词修正，
    // 只有当没有时段词、或数字本身已是 13~23 时才直接采用。
    const period0 = text.match(/(上午|早上|早晨|中午|下午|傍晚|晚上|夜里|凌晨|今晚|明晚)/);
    let m = text.match(/(\d{1,2})[:：](\d{2})/);
    if (m && +m[1] <= 23 && +m[2] <= 59) {
      let h = +m[1];
      if (period0) h = applyPeriod(h, period0[1]);
      d.setHours(h, +m[2]); hasTime = true; rawTime = m[0];
    } else if ((m = text.match(/(\d{1,2})\s*[点時时]\s*(\d{1,2})?\s*分?/))) {
      let h = +m[1];
      if (period0) h = applyPeriod(h, period0[1]);
      if (h <= 23) { d.setHours(h, m[2] ? +m[2] : 0); hasTime = true; rawTime = m[0]; }
    } else {
      const period = text.match(/(上午|早上|早晨|中午|下午|傍晚|晚上|夜里|凌晨)/);
      if (period) {
        const h = { 上午: 9, 早上: 8, 早晨: 8, 中午: 12, 下午: 14, 傍晚: 18, 晚上: 19, 夜里: 21, 凌晨: 1 }[period[1]];
        d.setHours(h, 0); hasTime = true; rawTime = period[1];
      }
    }

    /* 把用到的时段词也记进 raw，供标题清理时一并移除 */
    const rawPeriod = period0 ? period0[1] : '';
    return {
      date: U.ymd(d), hasTime,
      time: hasTime ? `${U.pad(d.getHours())}:${U.pad(d.getMinutes())}` : '',
      confidence,
      raw: (raw + (rawPeriod && raw.indexOf(rawPeriod) < 0 ? ' ' + rawPeriod : '') + (rawTime ? ' ' + rawTime : '')).trim()
    };
  }

  /** 按时段词把 12 小时制的小时数修正为 24 小时制 */
  function applyPeriod(h, p) {
    if (/下午|傍晚|晚上|夜里|今晚|明晚/.test(p)) {
      if (h < 12) return h + 12;          // 晚上8点 → 20
      if (h === 12) return 12;            // 下午12点 → 12
      return h;
    }
    if (/中午/.test(p)) {
      if (h === 12) return 12;
      return h <= 2 ? h + 12 : h;         // 中午1点 → 13
    }
    if (/凌晨/.test(p)) return h === 12 ? 0 : h;
    // 上午 / 早上 / 早晨：12 点归零
    if (/上午|早上|早晨/.test(p) && h === 12) return 0;
    return h;
  }

  /* ═══════════ 3. 截止 / DDL 识别 ═══════════ */

  const DDL_PATTERNS = [
    /(?:截止|截至|deadline|ddl|due|最晚|务必于|之前|前)\s*(?:时间)?\s*[:：]?\s*/i,
    /(?:前|之前)\s*(?:提交|交|完成|上交|上传|发)/,
    /(?:提交|交|上交|上传|完成)\s*(?:截止|时间|日期)/
  ];

  P.hasDeadline = function (text) {
    return DDL_PATTERNS.some(re => re.test(text));
  };

  /* ═══════════ 4. 优先级 ═══════════ */

  const URGENT_WORDS = ['紧急', '急', '马上', '立刻', '今天必须', '务必', '重要', 'deadline', 'ddl', '截止'];
  const LOW_WORDS = ['有空', '随意', '可选', '不急', '顺手', '顺便'];

  P.guessPriority = function (text) {
    const t = text.toLowerCase();
    if (URGENT_WORDS.some(w => t.includes(w))) return 3;
    if (LOW_WORDS.some(w => t.includes(w))) return 0;
    return 1;
  };

  /* ═══════════ 5. 时间点/地点/金额提取 ═══════════ */

  P.extractLocation = function (text0) {
    // 先把「周次」表达整段挖掉，否则 "报告厅 3-14周" 里的 3 会被当成房间号
    const text = String(text0).replace(/第?\s*\d{1,2}\s*[-~到至]\s*\d{1,2}\s*周/g, ' ')
                               .replace(/第?\s*\d{1,2}\s*周/g, ' ')
                               .replace(/第?\s*\d{1,2}\s*[-~到至]\s*\d{1,2}\s*节/g, ' ')
                               .replace(/第?\s*\d{1,2}\s*节/g, ' ');

    // 1) 带明确地点后缀 + 房间号：实验楼C301 / 三教101
    let m = text.match(/([\u4e00-\u9fa5A-Za-z]{1,6}?(?:楼|馆|厅|苑|园|中心)\s*[A-Za-z]?\d{1,4}[A-Za-z]?)/);
    if (m) return m[1].trim();
    // 2) 楼/室/厅（可带房间号）
    m = text.match(/([\u4e00-\u9fa5]{2,4}(?:楼|室|厅|馆|教室|会议室|报告厅))\s*([A-Za-z]?\d{0,4})/);
    if (m) return (m[1] + (m[2] ? ' ' + m[2] : '')).trim();
    // 3) 纯房间号：A101 / B203 / 教三101
    m = text.match(/(?:^|[\s，,、])((?:教[一二三四五六]|[A-Z])?\s?\d{3,4}[A-Za-z]?)(?=[\s，,、]|$)/);
    if (m) return m[1].trim();
    // 4) 中文房间名（无数字）
    m = text.match(/(大礼堂|报告厅|体育馆|图书馆|实验室|机房|会议室|操场|田径场|游泳馆)/);
    if (m) return m[1];
    /* 5) 显式标注「在/于/地点/教室 + X」。
       注意：「将于3月5日截止」里的「于3月5日」也会命中这条，
       会把日期当成地点，所以候选值必须排除日期/时间形态。 */
    m = text.match(/(?:在|于|地点|地址|教室)\s*[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9\-]{2,14})/);
    if (m) {
      const cand = m[1].trim();
      if (!isDateLike(cand)) return cand;
    }
    return '';
  };

  /**
   * 判断一个候选串是不是「日期/时间」而不是地点。
   * 用来防止 extractLocation 把「3月5日」「18:00」「明天」当成教室。
   */
  function isDateLike(s) {
    const t = String(s).trim();
    if (!t) return false;
    if (/^\d{1,4}\s*[-\/年]\s*\d{1,2}/.test(t)) return true;          // 3月5日 / 2026-03-05
    if (/^\d{1,2}\s*[月日号]/.test(t)) return true;                    // 3月 / 5日
    if (/^\d{1,2}\s*[:：]\s*\d{2}/.test(t)) return true;               // 18:00
    if (/^(?:今天|今日|今晚|明天|明日|明晚|后天|大后天|本周|这周|下周|下个?星期|下礼拜|周[一二三四五六日天]|星期[一二三四五六日天]|礼拜[一二三四五六日天]|月底|月末|月初|上午|早上|中午|下午|傍晚|晚上|夜里|凌晨)/.test(t)) return true;
    if (/^\d{1,2}\s*[点時时]/.test(t)) return true;                    // 2点
    if (/^第?\s*\d{1,2}\s*[周节]/.test(t)) return true;                // 第3周 / 3节
    if (/^\d{1,2}\s*[-~到至]\s*\d{1,2}\s*[周节]/.test(t)) return true;
    return false;
  }
  P.isDateLike = isDateLike;

  P.extractAmount = function (text) {
    const m = text.match(/([¥￥]|rmb|人民币)?\s*(\d+(?:\.\d{1,2})?)\s*(元|块|rmb|¥|￥)?/i);
    // 只在明显是金额语境下采用，避免抓到时间数字
    if (m && /[¥￥]|元|块|rmb|花了|买了|支付|消费|收了|收入/i.test(text)) {
      return parseFloat(m[2]);
    }
    return null;
  };

  /* ═══════════ 6. 课程表解析 ═══════════ */

  /** "第3-4节" "3、4节" → [3,4]；"第1节" → [1] */
  P.extractPeriods = function (text) {
    const out = [];
    let m;
    const rangeRe = /第?\s*(\d{1,2})\s*[-~到至]\s*(\d{1,2})\s*节/g;
    while ((m = rangeRe.exec(text))) {
      for (let i = +m[1]; i <= +m[2] && i <= 12; i++) out.push(i);
    }
    if (!out.length) {
      const singleRe = /第?\s*(\d{1,2})\s*节/g;
      while ((m = singleRe.exec(text))) out.push(+m[1]);
    }
    if (!out.length) {
      const cnRe = /第([一二三四五六七八九十]{1,3})节/g;
      while ((m = cnRe.exec(text))) { const n = cn2num(m[1]); if (n) out.push(n); }
    }
    // 没有明确节次时，按 上午/下午/晚上 推断一个默认节次区间
    if (!out.length) {
      if (/上午|早上|早晨/.test(text)) out.push(1, 2);
      else if (/中午/.test(text)) out.push(3, 4);
      else if (/下午/.test(text)) out.push(5, 6);
      else if (/傍晚|晚上|夜里|晚自习/.test(text)) out.push(9, 10);
    }
    return [...new Set(out)].sort((a, b) => a - b);
  };

  /** "第5周" "5-8周" "第3周" */
  P.extractWeeks = function (text) {
    let m = text.match(/第?\s*(\d{1,2})\s*[-~到至]\s*(\d{1,2})\s*周/);
    if (m) return { from: +m[1], to: +m[2], raw: m[0] };
    m = text.match(/第?\s*(\d{1,2})\s*周/);
    if (m) return { from: +m[1], to: +m[1], raw: m[0] };
    return null;
  };

  /* ═══════════ 7. 单行解析 ═══════════ */

  /** 清理标题：去掉日期时间等已提取的噪音 */
  function cleanTitle(line, dateInfo, locInfo) {
    let s = line
      .replace(/^[\s\-*·•>]+/, '')
      .replace(/^\[?[0-9]{1,2}[:：][0-9]{2}\]?\s*/, '')
      .replace(/^【[^】]*】\s*/, '')
      .replace(/^\d+[.、)）]\s*/, '')
      .trim();

    /* ① 先剥掉「通知体」的套话。
       这类句子在群里非常常见，剥掉之后剩下的才是真正的任务名：
         「请大家于本周五前提交实验报告」 → 「提交实验报告」
         「本轮选课将于3月5日18:00截止，请务必在此之前完成」 → 「选课」
         「请务必在此之前完成」 → 空
       注意顺序：长模式在前，避免短模式先吃掉一半。 */
    s = s
      /* 「请务必在此之前完成」整句 */
      .replace(/[，,、]?\s*请\s*务必\s*在?此?之?前?\s*(?:完成|提交|处理|办理|操作)\s*[。.!！]?/g, ' ')
      /* 「请大家/同学们/各位……(于/在)……前?完成|提交|注意」里的招呼语 */
      .replace(/请\s*(?:大家|同学们|各位|同学|注意|务必|及时|尽快|抓紧)?\s*(?=[，,、]|$)/g, ' ')
      /* 「请大家于」这种「请X于」的组合 */
      .replace(/请[^，,、。；;]{0,6}?(?=[于在])/g, ' ')
      /* 「本轮…将于…截止」：把「将于/截止」的悬空骨架去掉 */
      .replace(/(?:将?于|在|到)\s*(?=[，,、。；;]|$)/g, ' ')
      .replace(/[，,、]?\s*(?:截止|截至|到期)\s*(?:时间|日期)?\s*[。.!！]?/g, ' ')
      /* 通知类前缀 */
      .replace(/^【[^】]*】\s*/, ' ')
      .replace(/^(?:重要)?通知[:：]?\s*/, ' ')
      .replace(/^(?:提醒|温馨提示|公告)[:：]?\s*/, ' ')
      /* 称呼语开头：「各位同学：本轮选课…」「同学们，…」 */
      .replace(/^(?:各位|所有|全体)?\s*(?:同学|同学们|同事|大家|老师们)\s*[:：，,、]?\s*/, ' ');

    if (dateInfo && dateInfo.raw) {
      /* 去掉日期片段前，先处理「每周三」这种情况。
         extractDate 只认得出「周三」，剥掉后标题会剩一个孤立的「每」
         （`每周三交作业` → `每 交作业`）。所以先把「每周几」整体删掉。 */
      const wd = dateInfo.raw.match(/(周|星期|礼拜)[一二三四五六日天]/);
      if (wd) {
        s = s.replace(new RegExp('每\\s*' + wd[1] + '[一二三四五六日天]'), ' ');
      }

      // 只在标题里去掉日期片段，不动正文含义
      dateInfo.raw.split(/\s+/).forEach(part => {
        if (part.length >= 2) s = s.replace(part, ' ');
      });
      /* 日期片段里常带「前/之内/以前」，剥掉后可能剩个孤立的「前」 */
      s = s.replace(/[，,、]?\s*(?:之?前|之内|以内|以前|截止|截至)\s*(?=[，,、。；;]|$)/g, ' ');

      /* 兜底：如果剥完只剩一个孤立的「每」，说明上面没配对，直接去掉 */
      s = s.replace(/^\s*每\s*(?=[^\s])/, '');
    }
    /* 地点已经单独抽到 location 字段，标题里就不必重复了 */
    if (locInfo) {
      s = s.replace(locInfo, ' ');
      /* 「地点A301」「教室A301」这类没有分隔符的写法，
         抽取时只拿走了 A301，标签词「地点/教室」还留在标题里，
         配合下面这组规则一起清掉。 */
    }
    /* 无论地点是否抽取成功，都清掉「地点/教室」这类标签词本身 */
    s = s.replace(/[，,、]?\s*(?:地点|地址|教室|课室|会议室|报告厅|实验室|机房)\s*[:：]?\s*(?=[，,、。；;\s]|$)/g, ' ');
    /* 残留的孤立时段词：日期片段里记的是「今晚」，正文里写的可能是「晚上」，
       两者不同名所以按片段替换漏掉了，这里统一扫一遍。 */
    s = s.replace(/(?:^|\s)(上午|早上|早晨|中午|下午|傍晚|晚上|夜里|凌晨|今晚|明晚)(?=\s|$)/g, ' ')
         /* 地点被抽走后剩下的引导词：「…补考 在 A301 教室」→「…补考 在 教室」→「…补考」 */
         .replace(/(?:^|\s)(?:在|于)\s*(?=\s|$)/g, ' ')
         .replace(/(?:^|\s)(?:教室|课室|会议室|报告厅|实验室|机房|地点|地址)(?=\s|$)/g, ' ');
    s = s.replace(/(?:截止|截至|deadline|ddl|due)\s*[:：]?\s*$/i, '')
         .replace(/^[前之]\s*(?=提交|交|完成|上交|上传|发)/, '')
         .replace(/(?:之)?前\s*(?=提交|交|完成|上交|上传|发)/, '')
         /* 日期被抽走后留下的悬空句式：
            「本轮选课将于 截止、请务必在此之前完成。」→「本轮选课」
            这类「将于/在/截止」原位置变成碎片，读起来不成句。 */
         .replace(/(?:将?于|在)\s*(?=[、，,。；;]|$)/g, '')
         .replace(/[、，,]\s*(?:请务必|务必|请)\s*在?此?之?前?\s*完成\s*[。.!]?/g, '')
         .replace(/[、，,]\s*(?:请务必|务必|请)\s*[^、，,。；;]{0,12}(?:完成|截止|注意|周知)\s*[。.!]?/g, '')
         /* 结尾残留的「截止」「到期」等单字碎片 */
         .replace(/[、，,]\s*(?:截止|截至|到期)\s*[。.!]?\s*$/g, '')
         /* 残留的地点引导词与空括号 */
         .replace(/(?:地点|地址|教室)\s*[:：]\s*/g, ' ')
         .replace(/[（(]\s*[)）]/g, ' ')
         /* 中文逗号统一成顿号，读起来更像任务名 */
         .replace(/[，,]\s*/g, '、')
         .replace(/\s{2,}/g, ' ')
         .replace(/^[,，、:：\-\s]+|[,，、:：\-\s]+$/g, '')
         .trim();
    return s || line.trim();
  }

  /**
   * 解析单条文本行
   * @returns {object|null} 任务草案
   */
  P.parseLine = function (line, baseDate) {
    const raw = line.trim();
    if (!raw || raw.length < 2) return null;
    if (/^[#\-\s]*$/.test(raw)) return null;

    const dateInfo = P.extractDate(raw, baseDate);
    const cls = P.classify(raw);
    const hasDdl = P.hasDeadline(raw);
    const prio = P.guessPriority(raw);
    const loc = P.extractLocation(raw);
    const periods = P.extractPeriods(raw);
    const weeks = P.extractWeeks(raw);
    const title = cleanTitle(raw, dateInfo, loc);

    if (!title || title.length < 2) return null;

    /* 置信度：有明确日期 + 分类命中 → 高 */
    let conf = 0;
    if (dateInfo) conf += dateInfo.confidence === 'high' ? 2 : 1;
    if (cls.confident) conf += 2;
    if (hasDdl) conf += 1;
    if (raw.length >= 6) conf += 1;

    const task = {
      title,
      raw,
      cat: cls.cat,
      catReason: cls.reason,
      priority: prio,
      note: '',
      source: 'import',
      done: false
    };

    /* 带「每天/每日/每周」字样的，自动标成日常活动。
       用户说过「我特别说明为是日常活动的，才会每天晚六点提醒」——
       在这里的「特别说明」最常见的写法就是「每天 xxx」，
       自动认出来省得每条都手点。认错了也能在预览页点「设为日常」取消。 */
    if (isDailyTask(raw)) {
      task.kind = 'daily';
      /* 标题里的「每天」是冗余的——类型已经是日常了。
         同时重新分类一次：去掉「每天」后剩下的内容才是真正要判断的。 */
      const stripped = stripLeadingTimeWords(task.title);
      if (stripped.length >= 2) {
        task.title = stripped;
        const cls2 = P.classify(stripped);
        if (cls2.confident || cls2.score > cls.score) {
          task.cat = cls2.cat;
          task.catReason = cls2.reason;
        }
      }
    }

    /* 组织时间字段 */
    if (dateInfo) {
      if (hasDdl) {
        task.due = dateInfo.hasTime ? `${dateInfo.date}T${dateInfo.time}` : dateInfo.date;
      } else if (dateInfo.hasTime) {
        task.start = `${dateInfo.date}T${dateInfo.time}`;
        task.due = task.start;
        task.duration = periods.length ? periods.length * 45 : 60;
      } else {
        task.due = dateInfo.date;
      }
      task.dateConfidence = dateInfo.confidence;
    }

    if (loc) task.location = loc;
    if (periods.length) task.periods = periods;
    if (weeks) task.weeks = weeks;

    task.confidence = conf >= 4 ? 'high' : conf >= 2 ? 'medium' : 'low';
    task._keep = true;
    return task;
  };

  /* ═══════════ 8. 整段文本解析 ═══════════ */

  /** 纯噪音行：整行都是寒暄语或裸链接 */
  function isNoise(t) {
    if (/^(以上|如下|收到|好的|好嘞|谢谢|多谢|辛苦了|嗯+|哦+|哈哈+|嘿嘿|表情|图片|链接|撤回|拍了拍|加入了群聊|邀请|@所有人|公告|通知)\s*[。.!！~、,，]*$/.test(t)) return true;
    if (/^https?:\/\/\S+$/.test(t)) return true;
    if (/^\[(图片|表情|动画表情|视频|文件|链接)\]$/.test(t)) return true;
    return false;
  }

  /**
   * 判断一行是否是**新条目**的起点。
   * 关键：一行如果自带完整的时间信息（日期+时刻，或明确的日期词），
   * 它就属于新条目——否则会被错误地粘到上一条尾巴上。
   */
  function isEntryStart(t) {
    // 编号 / 符号开头
    if (/^(\d+[.、)）]|[-*·•>▪◦]|【|\[\d{1,2}[:：]\d{2}\])/.test(t)) return true;
    // 行首就是日期词
    if (/^(今天|今日|今晚|明天|明日|明晚|后天|大后天|下周|下个?星期|下礼拜|本周|这周|周[一二三四五六日天]|星期[一二三四五六日天]|礼拜[一二三四五六日天]|月底|月末|月初|\d{1,2}月\d{1,2}[日号]|\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\d{1,2}[-\/]\d{1,2})/.test(t)) return true;
    // 行内含明确时刻（18:00 / 下午2点 / 晚上7点）→ 视为独立条目
    if (/\d{1,2}[:：]\d{2}/.test(t)) return true;
    if (/(上午|早上|早晨|中午|下午|傍晚|晚上|夜里|凌晨|今晚|明晚)\s*\d{1,2}\s*[点時时]/.test(t)) return true;
    return false;
  }

  /**
   * 判断一行是否像「一个新的独立任务」。
   *
   * 场景：群里粘贴的待办常常是「一行一件事」且没有编号，例如：
   *     周六 上午10点 取快递
   *     复习一下线性代数的特征值
   *     看完 ROS2 tf2 坐标变换的视频
   * 后两行没有任何日期/时刻标记，早期版本会把它们并进「取快递」，
   * 变成一条莫名其妙的长任务。这里用「动作动词开头」来区分独立任务。
   */
  /* 频率前缀：这些词开头的行，本身就是一条独立任务，
     而且往往代表「日常活动」（每天要做的）。
     踩过的坑：`每天 背 50 个考研单词` 因为以「每天」开头、
     动词不在行首，被当成上一行的续行吞掉了。 */
  const FREQ_PREFIX = /^(每天|每日|每周|每星期|每月|天天|日常|坚持)/;

  const ACTION_VERBS = /^(复习|预习|看完|读完|看完|背|写|做|交|提交|完成|整理|准备|参加|报名|预约|取|拿|买|去|联系|回复|查|看|学|练|刷|打印|下载|上传|发|填|核对|确认|更新|修改|检查|过一遍|听完|看完这|做完这)/;

  /** 去掉标题开头的时间状语（每天 / 下周三 / 上午 之类）
   *  这些信息已经记在 due/start 或 kind 里了，留在标题里只是噪音。
   *  但注意别把「上午 10 点取快递」的「取快递」也削掉——只削时间词。 */
  function stripLeadingTimeWords(s) {
    let out = String(s || '');
    /* 先把「每周三 / 每周二」这类「每+周/星期/礼拜+星期几」整体去掉。
       否则 /^每周/ 会先匹配掉「每周」，留下一个孤零零的「三」
       （踩过的坑：`每周三交作业` 被削成 `每 交作业`）。 */
    out = out.replace(/^每(周|星期|礼拜)[一二三四五六日天]\s*/, '');
    out = out.replace(/^(每天|每日|天天|日常)\s*/, '');
    return out.trim();
  }

  function looksLikeNewTask(t) {
    const s = t.trim();
    if (s.length < 3 || s.length > 44) return false;   // 太短无意义，太长多半是续行说明
    if (FREQ_PREFIX.test(s)) return true;
    /* 允许「每天 背单词」这种频率词 + 动词的组合 */
    const stripped = s.replace(FREQ_PREFIX, '').trim();
    return ACTION_VERBS.test(stripped);
  }

  P.looksLikeNewTask = looksLikeNewTask;

  /** 是不是「每天都要做」的日常活动（决定 reminder 类型） */
  function isDailyTask(t) {
    return FREQ_PREFIX.test(String(t || '').trim());
  }

  P.isDailyTask = isDailyTask;

  P.isNoise = isNoise;
  P.isEntryStart = isEntryStart;

  /**
   * 主入口：把一大段粘贴文本解析成任务列表
   * @param {string} text
   * @param {object} opts { baseDate, splitMode }
   */
  P.parse = function (text, opts = {}) {
    const baseDate = opts.baseDate || U.ymd(U.today());
    const norm = U.norm(text);
    const tasks = [];
    const seen = new Set();

    // 按行切分，但把真正的续行合并到上一条
    const norm2 = U.norm(text);
    const lines = norm2.split('\n');
    const blocks = [];
    let cur = '';
    for (const ln of lines) {
      const trimmed = ln.trim();
      if (!trimmed) { if (cur) { blocks.push(cur); cur = ''; } continue; }
      // 纯噪音行（寒暄 / 裸链接）直接丢掉，不并入上一条
      if (isNoise(trimmed)) continue;

      // 新条目的起点：编号、符号开头、该行自带独立时间信息，
      // 或者是个以动词开头的短句（群里常见的「一行一件事」写法）
      const isNew = isEntryStart(trimmed) || looksLikeNewTask(trimmed);
      if (isNew && cur) { blocks.push(cur); cur = trimmed; }
      else if (!cur) cur = trimmed;
      else cur += ' ' + trimmed;
    }
    if (cur) blocks.push(cur);

    blocks.forEach(block => {
      // 一个 block 可能含多个以「；」或「。」分隔的条目
      const parts = block.split(/[；;]\s*(?=[^\s])/).filter(s => s.trim().length > 1);
      (parts.length > 1 ? parts : [block]).forEach(part => {
        // 过滤纯噪音（要求整行都是寒暄语，避免误杀正常任务）
        if (/^(以上|如下|收到|好的|好嘞|谢谢|多谢|嗯+|哈哈+|表情|图片|链接|撤回|拍了拍|加入了群聊|邀请|@所有人)\s*[。.!！~]*$/.test(part.trim())) return;
        if (/^https?:\/\/\S+$/.test(part.trim())) return;
        // 有效字符（去掉空白与标点）不足 2 个则丢弃
        if (part.replace(/[\s\p{P}]/gu, '').length < 2) return;

        const t = P.parseLine(part, baseDate);
        if (!t) return;
        // 去重：标题 + 日期相同视为重复
        const sig = t.title + '|' + (t.due || t.start || '');
        if (seen.has(sig)) return;
        seen.add(sig);
        tasks.push(t);
      });
    });

    // 合并跨行的课表（同一课程多处出现）
    return { tasks, stats: P.summarize(tasks, text) };
  };

  P.summarize = function (tasks, rawText) {
    const byCat = { study: 0, cv: 0, life: 0 };
    tasks.forEach(t => byCat[t.cat] = (byCat[t.cat] || 0) + 1);
    return {
      total: tasks.length,
      byCat,
      withDate: tasks.filter(t => t.due || t.start).length,
      highConf: tasks.filter(t => t.confidence === 'high').length,
      lowConf: tasks.filter(t => t.confidence === 'low').length,
      rawLines: U.norm(rawText).split('\n').filter(l => l.trim()).length
    };
  };

  /* ═══════════ 9. 课表专用解析 ═══════════ */

  /**
   * 解析课程表文本（每行一门课）
   * 例： "周一 第1-2节 高等数学 A101 1-16周"
   */
  P.parseSchedule = function (text, opts = {}) {
    const baseDate = opts.baseDate || U.ymd(U.today());
    const out = [];
    U.norm(text).split('\n').forEach(line => {
      const raw = line.trim();
      if (raw.length < 3) return;
      const wm = raw.match(/(?:周|星期|礼拜)([一二三四五六日天])/);
      if (!wm) return;
      const periods = P.extractPeriods(raw);
      if (!periods.length) return;
      const weeks = P.extractWeeks(raw);
      const loc = P.extractLocation(raw);
      const cls = P.classify(raw);

      // 课程名：去掉星期/节次/周次/地点/时段词后的剩余
      let name = raw
        .replace(/(?:周|星期|礼拜)[一二三四五六日天]/g, ' ')
        .replace(/第?\s*\d{1,2}\s*[-~到至]?\s*\d{0,2}\s*节/g, ' ')
        .replace(/第?\s*\d{1,2}\s*[-~到至]\s*\d{1,2}\s*周/g, ' ')
        .replace(/第?\s*\d{1,2}\s*周/g, ' ')
        .replace(/(上午|早上|早晨|中午|下午|傍晚|晚上|夜里|晚自习)/g, ' ')
        .replace(/\s{2,}/g, ' ').trim();

      // 再剥掉地点串（放在最后做，避免上面的规则误伤）
      if (loc) {
        // loc 可能是 "报告厅 3" 这种带空格的组合，逐段剥离
        loc.split(/\s+/).forEach(part => { if (part.length >= 2) name = name.split(part).join(' '); });
      }
      name = name.replace(/([\u4e00-\u9fa5A-Za-z]{1,6}?(?:楼|馆|厅|苑|园|中心)\s*[A-Za-z]?\d{1,4}[A-Za-z]?)/g, ' ')
                 .replace(/(?:^|[\s，,、])((?:教[一二三四五六]|[A-Z])?\s?\d{3,4}[A-Za-z]?)(?=[\s，,、]|$)/g, ' ')
                 .replace(/(大礼堂|报告厅|体育馆|图书馆|实验室|机房|会议室|操场|田径场|游泳馆)/g, ' ')
                 .replace(/\s{2,}/g, ' ').trim();
      if (name.length < 2) name = raw;

      // 节次 → 时间映射（按常见大学作息，可在设置里改）
      const startHour = periodToTime(periods[0]);

      out.push({
        title: name,
        cat: cls.cat === 'life' ? 'study' : cls.cat,
        catReason: cls.reason,
        weekday: WEEKDAY[wm[1]],
        periods,
        weeks,
        location: loc,
        startTime: startHour,
        raw,
        priority: 1,
        source: 'schedule',
        dateConfidence: 'high',
        confidence: 'high',
        _keep: true
      });
    });
    return { tasks: out, stats: P.summarize(out, text) };
  };

  /** 节次 → {hour, minute}，按常见高校作息 */
  const PERIOD_TIMES = [
    null,
    { h: 8,  m: 0 },  { h: 8,  m: 55 },   // 1-2
    { h: 10, m: 0 },  { h: 10, m: 55 },   // 3-4
    { h: 14, m: 0 },  { h: 14, m: 55 },   // 5-6
    { h: 16, m: 0 },  { h: 16, m: 55 },   // 7-8
    { h: 19, m: 0 },  { h: 19, m: 55 },   // 9-10
    { h: 20, m: 50 }, { h: 21, m: 40 }    // 11-12
  ];
  function periodToTime(p) {
    const t = PERIOD_TIMES[p] || { h: 8, m: 0 };
    return { hour: t.h, minute: t.m };
  }
  P.periodToTime = periodToTime;
  P.PERIOD_TIMES = PERIOD_TIMES;

  /* ═══════════ 10. 课表 → 具体日期任务（展开周次） ═══════════ */

  /**
   * 把课程草案展开为未来 N 周的具体任务
   * @param {array} courses parseSchedule 的输出
   * @param {object} opts { termStart:"YYYY-MM-DD", weeks:20 }
   */
  P.expandSchedule = function (courses, opts = {}) {
    const termStart = U.parse(opts.termStart || U.ymd(U.startOfWeek(U.today())));
    const maxWeeks = opts.weeks || 20;
    const today = U.today();
    const out = [];

    courses.forEach(c => {
      if (c.weekday == null) return;
      const wFrom = c.weeks ? c.weeks.from : 1;
      const wTo = Math.min(c.weeks ? c.weeks.to : maxWeeks, maxWeeks);
      for (let w = wFrom; w <= wTo; w++) {
        // 学期第 w 周的该星期几
        const d = U.addDays(termStart, (w - 1) * 7 + ((c.weekday + 6) % 7));
        if (d < today) continue;
        const ds = U.ymd(d);
        const time = c.startTime || { hour: 8, minute: 0 };
        const start = new Date(d); start.setHours(time.hour, time.minute, 0, 0);
        out.push({
          title: c.title,
          cat: c.cat === 'life' ? 'study' : c.cat,
          start: `${ds}T${U.pad(time.hour)}:${U.pad(time.minute)}`,
          due: `${ds}T${U.pad(time.hour)}:${U.pad(time.minute)}`,
          duration: (c.periods ? c.periods.length : 2) * 45,
          location: c.location || '',
          note: `第${w}周 · 第${(c.periods || []).join(',')}节`,
          priority: 1,
          repeat: '',
          source: 'schedule',
          week: w,
          done: false,
          confidence: 'high',
          _keep: true
        });
      }
    });
    return out;
  };

  /* ═══════════ 11. 格式化输出（给 DSH / AI） ═══════════ */

  P.toMarkdown = function (tasks) {
    const groups = U.groupBy(tasks, t => t.cat || 'life');
    let md = '';
    Object.keys(S.CATS).forEach(c => {
      const list = groups[c];
      if (!list || !list.length) return;
      md += `\n### ${S.CATS[c].name}（${list.length}）\n\n`;
      list.sort((a, b) => (a.due || a.start || '9').localeCompare(b.due || b.start || '9'));
      list.forEach(t => {
        const when = t.due || t.start ? U.friendly(t.due || t.start) + (String(t.due || t.start).includes('T') ? ' ' + U.hm(t.due || t.start) : '') : '无日期';
        md += `- [ ] **${t.title}** — ${when}`;
        if (t.location) md += ` @ ${t.location}`;
        if (t.note) md += `（${t.note}）`;
        md += '\n';
      });
    });
    return md.trim();
  };

  global.Parser = P;
})(window);