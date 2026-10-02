/* ═══════════════════════════════════════════════
   wechat.js — 微信支付账单（官方 CSV 导出）解析
   来源：微信 → 我 → 服务 → 钱包 → 账单 → 下载账单 → 用于个人对账
   设计原则：
     1. 格式随微信版本变化，尽量宽容（前导说明行、字段增减、引号包裹都吃）
     2. 宁可少解析、不要解析错：跳过的行全部记进 warnings
     3. 纯本地解析，账单内容不出手机
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const W = {};

  /* ═══════════ 分类词库 ═══════════
     顺序即优先级：越靠前的分类越"专"，
     先匹配上就定分类（如"苹果电脑配件"应落数码而不是购物）。 */

  const CATEGORY_WORDS = [
    ['餐饮', [
      '餐', '饭', '早点', '早餐', '午餐', '晚餐', '夜宵', '宵夜', '食堂', '餐厅', '饭店',
      '小吃', '烧烤', '火锅', '麻辣烫', '快餐', '外卖', '饿了么', '美团', '美团外卖',
      '肯德基', 'kfc', '麦当劳', 'mcdonald', '汉堡王', '德克士', '华莱士', '塔斯汀', '必胜客',
      '星巴克', 'starbucks', '瑞幸', 'luckin', '库迪', 'cotti', '蜜雪冰城', '喜茶', '奈雪',
      '古茗', '茶百道', '沪上阿姨', '书亦', '霸王茶姬', '一点点', 'coco', '茶颜悦色', '益禾堂',
      '奶茶', '咖啡', '饮品', '饮料', '可乐', '矿泉水', '面包', '蛋糕', '甜品', '烘焙',
      '米线', '米粉', '面条', '拉面', '沙县', '黄焖鸡', '水饺', '饺子', '包子', '煎饼',
      '便利店', '全家', 'family', '罗森', 'lawson', '7-11', '711', '便利蜂', '美宜佳',
      '超市', '永辉', '沃尔玛', '山姆', '盒马', '大润发', '华润万家', '菜市场', '水果', '生鲜',
      '零食', '坚果', '辣条', '卤味', '周黑鸭', '绝味', '海底捞', '西贝', '老乡鸡', '乡村基',
      '真功夫', '吉野家', '萨莉亚', '南城香', '杨国福', '张亮', '螺蛳粉', '烤鱼', '小龙虾',
      '聚餐', '请客', '吃'
    ]],

    ['交通', [
      '地铁', '公交', '轻轨', '轨道交通', '地铁乘车码', '乘车码', '公交卡', '交通卡',
      '滴滴', 'didi', '高德', '花小猪', '曹操出行', 't3出行', '首汽', '出租车', '打车',
      '网约车', '顺风车', '哈啰', '哈罗', '青桔', '美团单车', '共享单车', '单车', '摩拜',
      '12306', '铁路', '火车票', '高铁', '动车', '车票', '机票', '航空', '航班', '机场',
      '南航', '国航', '东航', '春秋航空', '海航', '长途汽车', '客运', '大巴', '轮渡', '船票',
      '加油', '中石化', '中石油', '壳牌', '充电桩', '停车', '停车费', '高速', 'etc', '过路费',
      '过桥费', '违章', '罚款', '车费', '交通', '车管所', '年检', '驾照'
    ]],

    ['购物', [
      // 注意：京东/天猫这类综合电商同时卖数码，放在这里会抢走「京东买树莓派」，
      // 因此综合电商关键词交给「数码」块先判（数码在词表里排在购物之前）。
      '淘宝', 'taobao', '天猫', 'tmall', '拼多多', 'pdd', '唯品会', '苏宁',
      '国美', '抖音商城', '微店', '闲鱼', '得物', '小红书', 'nice', '唯品',
      '服饰', '衣服', '服装', '上衣', '裤子', '裙', '外套', '羽绒服', '内衣', '袜子', '鞋',
      '帽子', '围巾', '手套', '背包', '箱包', '配饰', '饰品', '化妆品', '护肤', '彩妆',
      '口红', '面膜', '洗面奶', '香水', '洗发水', '沐浴露', '日化', '优衣库', 'uniqlo',
      'zara', 'hm', 'h&m', '无印良品', 'muji', '名创优品', 'miniso', '宜家', 'ikea',
      '商场', '百货', '专柜', '旗舰店', '下单', '代购', '海淘', '网购'
      // 已移除过于宽泛的裸词「买」「购」「小店」：它们会把「买药」「购书」
      // 这类本该属于医疗/学习的记录抢到购物，也会让陌生商户一律落购物。
    ]],

    ['日用', [
      '日用', '纸巾', '抽纸', '卷纸', '卫生纸', '湿巾', '垃圾袋', '洗衣液', '洗衣粉',
      '洗洁精', '清洁', '洁厕', '拖把', '扫把', '收纳', '水杯', '保温杯', '餐具', '碗',
      '筷子', '锅', '刀具', '雨伞', '雨衣', '电池', '灯泡', '插座', '五金', '水龙头',
      '牙膏', '牙刷', '毛巾', '浴巾', '拖鞋', '剃须', '卫生巾', '避孕', '驱蚊', '花露水',
      '理发', '剪头', '洗澡', '洗衣', '快递', '菜鸟', '驿站', '洗照片'
    ]],

    ['学习', [
      '书', '图书', '书店', '当当', 'dangdang', '博库', '文轩', '中国图书', '教材', '教科书',
      '教辅', '习题', '真题', '试卷', '讲义', '笔记', '笔记本本', '文献', '论文', '知网',
      'cnki', '万方', '维普', 'sci', 'ei检索', '期刊', '订阅', '打印', '复印', '论文打印',
      '文具', '钢笔', '签字笔', '中性笔', '铅笔', '橡皮', '尺子', '笔袋', '便利贴',
      '课程', '网课', '培训', '辅导', '补习', '考研', '考公', '考编', '雅思', '托福',
      'gre', 'gmat', '四六级', '六级', '四级', '考试', '报名费', '报名', '学杂费', '学费',
      '住宿费', '考试费', '证书', '考证', '驾校', '慕课', 'mooc', '中国大学', '得到',
      '学习', '讲座', '会议', '注册费', '会务费', '学院', '大学', '学校', '教务处'
    ]],

    ['娱乐', [
      '电影', '影城', '影院', '电影票', '猫眼', '淘票票', '演出', '话剧', '戏剧', '音乐会',
      '演唱会', 'livehouse', '展览', '博物馆', '美术馆', '景区', '门票', '旅游', '旅行',
      '酒店', '民宿', '携程', 'ctrip', '去哪儿', '飞猪', '同程', 'airbnb', '青旅',
      'ktv', '歌厅', '酒吧', '酒馆', 'live', '网吧', '网咖', '电玩', '桌游', '剧本杀',
      '密室', '麻将', '棋牌', '游戏', '手游', '点券', 'steam', 'epic', 'switch',
      'psn', '王者荣耀', '和平精英', '原神', '崩坏', 'b站', '哔哩哔哩', 'bilibili', '大会员',
      '腾讯视频', '爱奇艺', '优酷', '芒果tv', '网易云', 'qq音乐', 'spotify', 'vip会员',
      '订阅', '直播', '打赏', '娱乐', '玩乐', 'ktv'
      // 已移除裸词「充值」「会员」：会抢走「话费充值」（通讯）与各类 App 会员费，
      // 这两类更该由「通讯」或用户自训练规则判定。
    ]],

    ['医疗', [
      '医院', '门诊', '挂号', '急诊', '住院', '手术', '体检', '检查费', '化验', '拍片',
      'ct', '核磁', 'b超', '彩超', 'x光', '牙科', '口腔', '牙医', '拔牙', '洗牙', '正畸',
      '眼科', '配镜', '眼镜', '隐形眼镜', '药房', '药店', '大药房', '药品', '买药', '药',
      '感冒', '退烧', '消炎', '维生素', '钙片', '益生菌', '中药', '诊所', '社区医院',
      '卫生服务', '疫苗', '接种', 'hpv', '医保', '自费', '康复', '理疗', '推拿', '中医',
      '心理', '咨询费', '救护'
    ]],

    ['住房', [
      '房租', '租金', '押金', '中介费', '公寓', '房东', '物业', '物业费', '水费', '电费',
      '燃气', '天然气', '暖气', '取暖', '供暖', '热水', '宿舍', '住宿费', '床位',
      '酒店式公寓', '链家', '贝壳', '自如', '蛋壳', '维修', '装修', '建材', '家电',
      '空调', '冰箱', '洗衣机', '热水器', '家具', '床垫', '书桌', '床帘', '宿舍用品',
      '搬家', '保洁', '家政', '垃圾费', '房屋'
    ]],

    ['通讯', [
      '话费', '手机费', '充值话费', '中国移动', '中国联通', '中国电信', '移动', '联通',
      '电信', '流量', '宽带', '光纤', 'wifi', '校园网', '网费', '家庭宽带',
      '手机卡', 'sim', '套餐', '来电显示', '国际漫游', '邮费', '快递费', '顺丰', 'ems',
      '话费充值', '通信'
    ]],

    /* 「借还钱」＝ 转账 / 还款 / 垫付这类**过手**的钱，不是消费。
       这里原来叫「人情」。改名是用户要求的：AI 读账本时会把「人情」
       理解成「人情往来（送礼）」，而它实际上主要是还钱 —— 是实打实的误判。
       注意「红包」故意留在这里（不挪去人情往来）：
       用户说过真人情红包他手动改，默认按还钱算才对。 */
    ['借还钱', [
      '转账', '红包', '发红包', '收红包', '微信红包', '群收款', '收款', '代付', '拼单',
      '生活费', '借款', '还款', '还钱', 'AA', 'aa收款', '帮付', '垫付'
    ]],

    /* 真正的送礼落这里。用户说真人情红包他会手动改过来，
       所以这个分类首先是给他留的**手动选项**；
       但它也认那些一眼就是送礼的词（礼金/礼物/节日），能自动判对就别让他手点。 */
    ['人情往来', [
      '礼金', '随礼', '份子', '红包礼', '礼物', '礼品', '生日', '情人节', '七夕',
      '中秋', '春节', '过年', '元旦', '圣诞', '母亲节', '父亲节', '教师节', '纪念日',
      '孝敬', '赡养', '捐款', '公益', '众筹', '慰问', '人情'
    ]],

    ['数码', [
      // 综合电商（京东/天猫/淘宝）既卖数码也卖百货，这里只放「数码味」最强的京东；
      // 其余电商关键词留在购物，由商品名里的硬件词（硬盘/内存/开发板…）来纠偏。
      '京东', 'jd', 'jd.com',
      '电脑', '笔记本', '联想', 'lenovo', 'thinkpad', 'thinkbook', '小新', '拯救者',
      '戴尔', 'dell', '惠普', 'hp', '华硕', 'asus', '宏碁', 'acer', '机械革命', '神舟',
      '雷蛇', 'razer', '外星人', 'alienware', '微软', 'surface', '苹果', 'apple', 'macbook',
      'imac', 'mac', 'ipad', '平板', '小米', '华为', 'huawei', '荣耀', 'honor', 'oppo',
      'vivo', '一加', 'oneplus', 'realme', '三星', 'samsung', '红米', 'redmi',
      '配件', '电脑配件', '硬件', '硬盘', '固态', 'ssd', '机械硬盘', '内存', '内存条',
      '显卡', 'gpu', '主板', 'cpu', '处理器', '散热', '风扇', '水冷', '电源', '机箱',
      '显示器', '屏幕', '键鼠', '键盘', '鼠标', '鼠标垫', 'usb', 'typec', '数据线',
      '充电线', '充电器', '充电头', '移动电源', '充电宝', '耳机', '蓝牙耳机', '音箱',
      '麦克风', '摄像头', '相机', '单反', '微单', '镜头', '云台', '三脚架', '相机包',
      '树莓派', 'raspberry', '香橙派', 'jetson', '英伟达', 'nvidia', 'arduino', 'stm32',
      'esp32', '开发板', '单片机', '传感器', '雷达', '激光雷达', 'lidar', '陀螺仪',
      '舵机', '电机', '步进', '驱动板', '电路板', 'pcb', '焊接', '电烙铁', '万用表',
      '示波器', '3d打印', '打印机', '耗材', '无人机', '大疆', 'dji', '电子', '数码',
      'kindle', '硬盘盒', '扩展坞', '转换器', '网线', '路由器', '交换机', 'nas',
      '硒鼓', '墨盒', '碳粉', '机柜', '线材', '电机驱动'
    ]],

    ['运动', [
      '健身', '健身房', '私教', '撸铁', '瑜伽', '普拉提', 'keep', '运动', '体育馆',
      '球场', '球馆', '篮球', '足球', '羽毛球', '乒乓球', '网球', '排球', '台球',
      '球赛', '球票', '球',
      '游泳', '泳池', '泳镜', '泳衣', '跑步', '跑鞋', '马拉松', '田径', '骑行',
      '自行车', '山地车', '滑板', '轮滑', '攀岩', '爬山', '徒步', '露营', '户外',
      '蛋白粉', '肌酸', '氮泵', '补给', '能量胶', '运动饮料', '护具', '护腕', '护膝',
      '球拍', '球鞋', '球衣', '运动装备', '跳绳', '哑铃', '杠铃', '弹力带', '筋膜枪',
      '赛事', '报名费赛事', '体测', '体质'
    ]]
  ];

  /* 匹配优先级（与词表声明顺序解耦）：
     越"专"的分类越先判，宽泛的购物/娱乐/餐饮垫底。
     例：「京东 树莓派开发板」应判数码而不是购物；
        「中国移动 话费充值」应判通讯而不是娱乐。 */
  const CATEGORY_ORDER = [
    '医疗', '学习', '交通', '住房', '通讯', '数码', '运动', '日用',
    '借还钱', '人情往来', '餐饮', '娱乐', '购物'
  ];

  /** 按名字取词表 */
  function wordsOf(cat) {
    for (let i = 0; i < CATEGORY_WORDS.length; i++) {
      if (CATEGORY_WORDS[i][0] === cat) return CATEGORY_WORDS[i][1];
    }
    return [];
  }

  /* 负向词：出现这些词时，对应关键词不算命中。
     例：裸词「球」不该把「气球」「地球仪」判成运动。 */
  const NEGATIVE_WORDS = {
    '球': ['气球', '地球', '眼球', '雪球', '球鞋党'],
    '药': ['火药', '炸药'],
    '书': ['文书', '说明书', '秘书处', '判决书'],
    '鞋': ['鞋柜'],
    '锅': ['背锅', '火锅底料']
  };

  /** 关键词是否命中（含负向词排除） */
  function hitKeyword(hay, w) {
    let from = 0;
    for (;;) {
      const at = hay.indexOf(w, from);
      if (at < 0) return false;
      const negs = NEGATIVE_WORDS[w];
      if (!negs) return true;
      // 取命中点周围的窗口，检查是否落在负向词内部
      const win = hay.slice(Math.max(0, at - 2), Math.min(hay.length, at + w.length + 2));
      let bad = false;
      for (let i = 0; i < negs.length; i++) {
        if (win.indexOf(negs[i]) >= 0) { bad = true; break; }
      }
      if (!bad) return true;
      from = at + 1;   // 该处被排除，继续往后找
    }
  }

  /** 所有分类名（UI 下拉用） */
  const CATEGORY_LIST = CATEGORY_WORDS.map(p => p[0]).concat(['其他'])
    .filter((c, i, a) => a.indexOf(c) === i);

  /* ═══════════ 1. CSV 解析（逐字符状态机） ═══════════
     微信导出的字段里商品名可能带逗号并被双引号包裹，
     所以必须按 RFC4180 规则扫，不能 split(',')。 */

  /**
   * 把整段文本切成「一行的字段数组」。
   * @param {string} text
   * @returns {string[][]}
   */
  function parseRows(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    const n = text.length;

    function endField() { row.push(field); field = ''; }
    function endRow() {
      endField();
      // 整行皆空则丢弃（微信文件末尾常有空行）
      if (!(row.length === 1 && row[0] === '')) rows.push(row);
      row = [];
    }

    while (i < n) {
      const ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; } // 转义的双引号
          inQuotes = false; i++; continue;
        }
        field += ch; i++; continue;
      }

      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { endField(); i++; continue; }
      if (ch === '\r') { endRow(); i += (text[i + 1] === '\n' ? 2 : 1); continue; }
      if (ch === '\n') { endRow(); i++; continue; }

      field += ch; i++;
    }

    // 收尾：最后一行可能没有换行符
    if (field !== '' || row.length) endRow();

    return rows.map(r => r.map(c => c.trim()));
  }

  /* ═══════════ 2. 字段识别 / 归一化 ═══════════ */

  /** 表头列名 → 内部字段名。微信各版本列名不一致，这里做归一化映射 */
  const HEADER_MAP = {
    '交易时间': 'time', '交易创建时间': 'time', '时间': 'time', '交易日期': 'time',
    '交易类型': 'bizType', '类型': 'bizType', '业务类型': 'bizType',
    '交易对方': 'counterparty', '对方': 'counterparty', '商户名称': 'counterparty',
    '商品': 'product', '商品名称': 'product', '商品说明': 'product', '备注说明': 'product',
    '收/支': 'direction', '收支': 'direction', '收支类型': 'direction', '资金方向': 'direction',
    '金额(元)': 'amount', '金额（元）': 'amount', '金额': 'amount', '交易金额': 'amount',
    '金额(元) ': 'amount',
    '支付方式': 'method', '付款方式': 'method',
    '当前状态': 'status', '交易状态': 'status', '状态': 'status',
    '交易单号': 'tradeNo', '微信支付单号': 'tradeNo', '交易订单号': 'tradeNo',
    '商户单号': 'merchantNo', '商户订单号': 'merchantNo', '商家单号': 'merchantNo',
    '备注': 'note', '交易备注': 'note'
  };

  /** 去空白 + 去全角空格，用于表头比对 */
  function keyOf(s) {
    return String(s == null ? '' : s)
      .replace(/\uFEFF/g, '')
      .replace(/[\s\u3000]/g, '');
  }

  /** 判断某行是否是真正的 CSV 表头 */
  function headerScore(cells) {
    const keys = cells.map(keyOf);
    let hit = 0;
    keys.forEach(k => { if (HEADER_MAP[k]) hit++; });
    const hasTime = keys.indexOf('交易时间') >= 0 || keys.indexOf('时间') >= 0 || keys.indexOf('交易创建时间') >= 0;
    const hasDir = keys.indexOf('收/支') >= 0 || keys.indexOf('收支') >= 0 || keys.indexOf('收支类型') >= 0;
    return (hasTime && hasDir) ? hit + 100 : 0; // 必备两列才认表头
  }

  /** 在「金额」列名候选里挑下标（金额列名形式最多，单独放宽匹配） */
  function findAmountIndex(headerKeys) {
    const exact = pickIndex(headerKeys, ['金额(元)', '金额（元）', '金额', '交易金额', '发生额']);
    if (exact >= 0) return exact;
    return headerKeys.findIndex(k => k.indexOf('金额') >= 0);
  }

  /** 在「备注」列名候选里挑下标 */
  function findNoteIndex(headerKeys) {
    const exact = pickIndex(headerKeys, ['备注', '交易备注', '备注说明']);
    if (exact >= 0) return exact;
    return headerKeys.findIndex(k => k.indexOf('备注') >= 0);
  }

  /** 在若干候选列名里挑第一个存在的下标 */
  function pickIndex(headerKeys, names) {
    for (let i = 0; i < names.length; i++) {
      const idx = headerKeys.indexOf(names[i]);
      if (idx >= 0) return idx;
    }
    return -1;
  }

  /** 金额：去 ¥ ￥ $ 空格、去千分位逗号；无法解析返回 NaN */
  function parseAmount(raw) {
    if (raw == null) return NaN;
    let s = U.norm(String(raw));
    // 去掉货币符号与单位（含 "元"、"人民币"）
    s = s.replace(/[¥￥$€£\s]/g, '').replace(/元|人民币|cny|rmb/gi, '');
    // 负数括号形式：(12.00)
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (s.charAt(0) === '-') { neg = true; s = s.slice(1); }
    s = s.replace(/,/g, '');           // 千分位
    if (!/^\d*\.?\d+$/.test(s)) return NaN;
    const v = Number(s);
    if (!isFinite(v)) return NaN;
    return neg ? -v : v;
  }

  /** "2026-09-01 08:12:33" / "2026/09/01 8:12" / "20260901" → {date, time} */
  function parseDateTime(raw) {
    const s = U.norm(String(raw == null ? '' : raw)).trim();
    let m = s.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})\D*?(\d{1,2})[:时](\d{1,2})(?:[:分](\d{1,2}))?/);
    if (m) {
      return {
        date: `${m[1]}-${U.pad(+m[2])}-${U.pad(+m[3])}`,
        time: `${U.pad(+m[4])}:${U.pad(+m[5])}`
      };
    }
    m = s.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
    if (m) return { date: `${m[1]}-${U.pad(+m[2])}-${U.pad(+m[3])}`, time: '00:00' };
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: '00:00' };
    return null;
  }

  /** 收/支 原文 → 内部 type */
  function parseDirection(raw) {
    const s = U.norm(String(raw == null ? '' : raw)).replace(/\s/g, '');
    if (!s || s === '/' || s === '-' || s === '—' || s === '／') return 'neutral';
    if (/收入|收款|已收|入账|转入|贷/.test(s)) return 'income';
    if (/支出|付款|支取|已付|转出|借/.test(s)) return 'expense';
    return 'neutral';
  }

  /**
   * 金额列错位补救：微信个别版本金额未加引号但又带千分位逗号
   * （如 ¥1,500.00 会被切成 "¥1" 与 "500.00" 两格），
   * 这里把后面看起来像小数尾巴的格子并回来。
   */
  function mergeAmountCells(cells, idx) {
    let a = cells[idx];
    for (let k = 1; k <= 2; k++) {
      const nx = cells[idx + k];
      if (nx == null) break;
      if (!/^\d{1,2}(\.\d{1,2})?$/.test(nx)) break;   // 只并 "500" / "500.00" 这类尾巴
      if (!/,/.test(a) && !/\./.test(a)) break;        // 前一段必须已含逗号或小数点，否则不是被切开的
      const merged = a + nx;
      if (!isFinite(parseAmount(merged))) break;
      a = merged;
    }
    return a;
  }

  /**
   * 列错位识别：把本行按表头猜测「被撑宽」的位置并压回原位。
   * 仅在字段数多于表头、且存在唯一可行解时启用（宁可不做，不可做错）。
   * @returns {string[]|null} 压回后的字段数组
   */
  function alignRow(cells, headerKeys, amountIdx, directionIdx) {
    const extra = cells.length - headerKeys.length;
    if (extra <= 0 || extra > 3 || amountIdx < 0) return null;

    // 只在「金额列及之前」的范围内寻找被逗号撑开的格
    let solutions = null;
    const limitLo = Math.max(1, amountIdx - 3);
    const limitHi = amountIdx + 3;
    for (let i = limitLo; i <= limitHi && i < cells.length - 1; i++) {
      for (let take = 2; take <= Math.min(3, cells.length - i); take++) {
        const merged = cells.slice(i, i + take).join(',');
        if (!isFinite(parseAmount(merged))) continue;
        const rebuilt = cells.slice(0, i).concat([merged], cells.slice(i + take));
        if (rebuilt.length !== headerKeys.length) continue;
        if (directionIdx < 0 || parseDirection(rebuilt[directionIdx]) !== 'neutral' ||
            parseDirection(cells[directionIdx]) === 'neutral') {
          (solutions = solutions || []).push(rebuilt);
          if (solutions.length > 1) return null;   // 多个解 = 不确定，放弃
        }
      }
    }
    return solutions && solutions.length === 1 ? solutions[0] : null;
  }

  /** 无意义的占位符统一成空串（微信用 "/" 表示"无"） */
  function clean(s) {
    const v = String(s == null ? '' : s).trim();
    if (v === '/' || v === '-' || v === '—' || v === '／' || v === 'N/A' || v === '无') return '';
    return v;
  }

  /* ═══════════ 3. 自动分类 ═══════════ */

  /**
   * 规则匹配：把候选规则（用户自训练）先跑一遍。
   *
   * 规则可以只写关键词，也可以锁定「流向」和「分类」：
   *   { keyword:'张三', direction:'income',  category:'生活费' }
   *   { keyword:'李四', direction:'expense', category:'其他消费' }
   * 同一个人既可能转钱给我、我也可能转给他，所以流向必须能区分，
   * 否则一条规则会把两个方向的账都吃掉。
   *
   * 匹配优先级（分数越高越优先）：
   *   流向锁定 +40，有分类 +10，关键词越长 +长度
   * 这样「张三」和「张三 生活费」同时存在时，更具体的赢。
   *
   * @param {object} txn
   * @param {Array} rules
   * @returns {{category:string, rule:object, direction:string}|null}
   */
  W.matchRule = function (txn, rules) {
    if (!txn || !Array.isArray(rules) || !rules.length) return null;
    const hay = U.norm(
      [txn.counterparty, txn.product, txn.note].filter(Boolean).join(' ')
    ).toLowerCase();
    if (!hay) return null;

    let best = null, bestScore = -1;
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      if (!r || !r.keyword) continue;
      const kw = U.norm(String(r.keyword)).toLowerCase().trim();
      if (!kw || hay.indexOf(kw) < 0) continue;

      /* 规则锁定了流向就要求一致；没锁就两个方向都吃 */
      if (r.direction && r.direction !== 'both' && r.direction !== txn.type) continue;

      let score = kw.length;
      if (r.direction && r.direction !== 'both') score += 40;
      if (r.category) score += 10;

      if (score > bestScore) {
        bestScore = score;
        best = { category: r.category || null, rule: r, direction: r.direction || 'both' };
      }
    }
    return best;
  };

  /**
   * 兼容旧接口：只要分类名。
   * @deprecated 新代码用 matchRule，能拿到命中的规则和流向。
   */
  W.applyRules = function (txn, rules) {
    const m = W.matchRule(txn, rules);
    return m ? m.category : null;
  };

  /**
   * 规则式中文商家 / 商品关键词分类。
   * @param {object} txn
   * @returns {string} 分类名
   */
  W.categorize = function (txn) {
    if (!txn) return '其他';

    // 商户名 / 商品名 / 备注 一起看；备注权重最低，只在前两者都没命中时才有机会
    const main = U.norm([txn.counterparty, txn.product].filter(Boolean).join(' ')).toLowerCase();
    const note = U.norm(String(txn.note || '')).toLowerCase();
    const biz = U.norm(String(txn.bizType || '')).toLowerCase();
    const hayAll = (main + ' ' + note + ' ' + biz).trim();
    if (!hayAll) return '其他';

    // 按优先级扫描：首个命中的分类胜出。
    // 先扫「商户名+商品名」，全部落空后再把备注纳入，避免备注里的泛词抢分类。
    for (let pass = 0; pass < 2; pass++) {
      const hay = pass === 0 ? (main + ' ' + biz).trim() : hayAll;
      if (!hay) continue;
      for (let c = 0; c < CATEGORY_ORDER.length; c++) {
        const cat = CATEGORY_ORDER[c];
        const words = wordsOf(cat);
        for (let i = 0; i < words.length; i++) {
          const w = U.norm(words[i]).toLowerCase();
          if (w && hitKeyword(hay, w)) return cat;
        }
      }
    }
    return '其他';
  };

  /* ═══════════ 4. 解析主入口 ═══════════ */

  /**
   * 解析微信账单 CSV 文本。
   * @param {string} text 已解码为 UTF-8 的账单全文
   * @returns {{txns:Array, meta:object, warnings:string[]}}
   */
  /** 给一笔流水定分类、套规则、生成稳定 id。
   *  CSV 导入和 AI 识别都要走这里，否则两条路的分类口径会不一致。 */
  W.finalizeTxn = function (txn) {
    /* 所有账单导入路径都从这里过，所以在这儿兜住 source：
       各解析器（CSV→wechat / 文字→bill-text / 截图→bill-photo）自己会设，
       万一漏了，至少不能留空 —— 留空就跟「手记」分不清了，
       而「撤销这次导入」要靠 source 区分导入的和手记的。 */
    if (!txn.source) txn.source = 'bill';
    txn.category = txn.category || '其他';
    txn.autoCategory = W.categorize(txn);

    const hit = W.matchRule(txn, typeof S !== 'undefined' && S.all ? S.all('txnRules') : []);
    /* 用户规则优先于内置词库，其次才用 AI 给的分类 */
    if (hit && hit.category) txn.category = hit.category;
    else if (!txn.category || txn.category === '其他') txn.category = txn.autoCategory;

    if (hit) {
      txn.ruleHit = hit.category || '';
      txn.ruleId = hit.rule.id || '';
      txn.ruleKeyword = hit.rule.keyword || '';
    }

    /* 稳定 id：优先单号，保证重复导入同一份文件 id 也一致 */
    if (!txn.id) {
      txn.id = 'wx_' + (txn.tradeNo
        ? U.hash(txn.tradeNo)
        : U.hash([txn.date, txn.time, txn.amount, txn.counterparty, txn.merchantNo].join('|')));
    }
    return txn;
  };

  W.parseCSV = function (text) {
    const out = { txns: [], meta: {}, warnings: [] };

    if (text == null) return out;
    let src = String(text);
    if (!src.trim()) {
      out.warnings.push('文件内容为空');
      return out;
    }

    // 1) 去掉 BOM（调用方已解码成 UTF-8，这里只清掉残留 BOM）
    src = src.replace(/^\uFEFF/, '').replace(/\uFEFF/g, '');
    src = src.replace(/\r\n?/g, '\n');

    const rows = parseRows(src);
    if (!rows.length) {
      out.warnings.push('未能识别任何行');
      return out;
    }

    // 2) 读前导说明行：昵称 / 起止时间 / 导出类型
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (headerScore(rows[i]) > 0) { headerIdx = i; break; }
    }
    if (headerIdx < 0) {
      out.warnings.push('未找到表头行（应包含「交易时间」与「收/支」），文件可能不是微信账单导出');
      return out;
    }

    const preamble = rows.slice(0, headerIdx);
    preamble.forEach(cells => {
      const line = cells.join(' ').replace(/\s+/g, ' ').trim();
      if (!line) return;
      // 注意：起始时间与终止时间常在同一行，必须各自独立匹配，不能 return 短路
      let m = line.match(/微信昵称[：:]\s*\[?\s*([^\]\[]+?)\s*\]?\s*$/);
      if (m) out.meta.nickname = m[1].trim();
      m = line.match(/起始时间[：:]\s*\[?\s*([\d\-/:.\s]+?)\s*\]?\s*(?:终止时间|结束时间|$)/);
      if (m) out.meta.startTime = m[1].trim();
      m = line.match(/(?:终止时间|结束时间)[：:]\s*\[?\s*([\d\-/:.\s]+?)\s*\]?\s*$/);
      if (m) out.meta.endTime = m[1].trim();
      m = line.match(/导出类型[：:]\s*\[?\s*([^\]\[]+?)\s*\]?\s*$/);
      if (m) out.meta.exportType = m[1].trim();
      // 有些版本写成「账单时间：2026-09-01 至 2026-09-30」
      if (!out.meta.startTime) {
        m = line.match(/账单时间[：:]\s*\[?\s*([\d\-/:.\s]+?)\s*\]?\s*(?:至|-|~|到)/);
        if (m) out.meta.startTime = m[1].trim();
      }
      if (!out.meta.endTime) {
        m = line.match(/(?:至|-|~|到)\s*\[?\s*([\d\-/:.\s]{8,})\s*\]?\s*$/);
        if (m) out.meta.endTime = m[1].trim();
      }
    });
    out.meta.headerLine = headerIdx;

    // 3) 建立列名 → 下标映射
    const headerKeys = rows[headerIdx].map(keyOf);
    const col = {
      time: pickIndex(headerKeys, ['交易时间', '交易创建时间', '时间', '交易日期']),
      bizType: pickIndex(headerKeys, ['交易类型', '类型', '业务类型']),
      counterparty: pickIndex(headerKeys, ['交易对方', '对方', '商户名称']),
      product: pickIndex(headerKeys, ['商品', '商品名称', '商品说明']),
      direction: pickIndex(headerKeys, ['收/支', '收支', '收支类型', '资金方向']),
      amount: findAmountIndex(headerKeys),
      method: pickIndex(headerKeys, ['支付方式', '付款方式']),
      status: pickIndex(headerKeys, ['当前状态', '交易状态', '状态']),
      tradeNo: pickIndex(headerKeys, ['交易单号', '微信支付单号', '交易订单号']),
      merchantNo: pickIndex(headerKeys, ['商户单号', '商户订单号', '商家单号']),
      note: findNoteIndex(headerKeys)
    };

    if (col.time < 0 || col.amount < 0) {
      out.warnings.push('表头缺少「交易时间」或「金额」列，无法解析');
      return out;
    }

    // 4) 逐行解析
    const skippedNoDate = [];
    const skippedAmount = [];
    const colMismatch = [];
    const shiftedRows = [];
    let neutralCount = 0;

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const cells = rows[r];
      if (!cells.length) continue;

      // 整行拼起来是空的（分隔线等）→ 静默跳过
      const joined = cells.join('').replace(/\s/g, '');
      if (!joined) continue;
      // 微信有时会在末尾加统计行，如「共 30 笔记录」
      if (/^[-=—]+$/.test(joined) || /^共\d+笔/.test(joined) || /^微信支付账单明细/.test(joined)) continue;

      const cell = i => (i >= 0 && i < cells.length ? cells[i] : '');

      // 行内字段数异常 → 先尝试压回（金额里的逗号会把一格撑成两格），
      // 撑宽的行会让其后所有列整体右移，必须纠正后再取值。
      let use = cells;
      if (cells.length > headerKeys.length) {
        const aligned = alignRow(cells, headerKeys, col.amount, col.direction);
        if (aligned) { use = aligned; shiftedRows.push(r + 1); }
        else colMismatch.push(r + 1);
      } else if (cells.length < headerKeys.length) {
        colMismatch.push(r + 1);
      }
      const c = i => (i >= 0 && i < use.length ? use[i] : '');

      // 起始时间列可能是 "2026-09-01 08:12:33"，也可能是拆开的日期+时间两列；
      // 若只有日期没有时间，尝试合并下一列。
      let timeRaw = c(col.time);
      if (!/\d{1,2}[:时]\d{1,2}/.test(timeRaw) && /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(timeRaw)) {
        const nxt = c(col.time + 1);
        if (/^\d{1,2}[:时]\d{1,2}/.test(nxt)) timeRaw = timeRaw + ' ' + nxt;
      }
      const dt = parseDateTime(timeRaw);
      if (!dt) { skippedNoDate.push(r + 1); continue; }

      // 金额格可能仍被逗号切开（未压回成功的行），再做一次局部合并
      const amt = parseAmount(mergeAmountCells(use, col.amount));
      if (!isFinite(amt)) { skippedAmount.push(r + 1); continue; }

      const dir = parseDirection(c(col.direction));
      if (dir === 'neutral') neutralCount++;

      const txn = {
        id: '',
        date: dt.date,
        time: dt.time,
        type: dir,
        amount: Math.abs(amt),           // 内部统一存正数，方向看 type
        counterparty: clean(c(col.counterparty)),
        product: clean(c(col.product)),
        bizType: clean(c(col.bizType)),
        method: clean(c(col.method)),
        status: clean(c(col.status)),
        tradeNo: clean(c(col.tradeNo)),
        merchantNo: clean(c(col.merchantNo)),
        note: clean(c(col.note)),
        category: '其他',
        raw: use.join(','),
        source: 'wechat'
      };

      // 5) 分类：先用户规则，再内置词库
      const hit = W.matchRule(txn, typeof S !== 'undefined' && S.all ? S.all('txnRules') : []);
      txn.category = (hit && hit.category) || W.categorize(txn);
      txn.autoCategory = W.categorize(txn);
      /* 记下是哪条规则判的，方便在列表里告诉用户「这条为什么是生活费」，
         也方便他点进去改——比对着「其他」发懵强。 */
      if (hit) {
        txn.ruleHit = hit.category || '';
        txn.ruleId = hit.rule.id || '';
        txn.ruleKeyword = hit.rule.keyword || '';
      }

      // 6) 稳定 id：优先单号，保证重复导入同一份文件 id 也一致
      txn.id = 'wx_' + (txn.tradeNo
        ? U.hash(txn.tradeNo)
        : U.hash([txn.date, txn.time, txn.amount, txn.counterparty, txn.merchantNo].join('|')));

      out.txns.push(txn);
    }

    // 7) 汇总提示（中文、可读）
    if (skippedNoDate.length) {
      out.warnings.push(`跳过 ${skippedNoDate.length} 行无法解析日期的记录（第 ${fmtLines(skippedNoDate)} 行）`);
    }
    if (skippedAmount.length) {
      out.warnings.push(`跳过 ${skippedAmount.length} 行金额异常的记录（第 ${fmtLines(skippedAmount)} 行）`);
    }
    if (colMismatch.length) {
      out.warnings.push(`${colMismatch.length} 行字段数与表头不一致，已按列名尽量对齐（第 ${fmtLines(colMismatch)} 行）`);
    }
    if (shiftedRows.length) {
      out.warnings.push(`${shiftedRows.length} 行因金额含千分位逗号被撑宽，已自动纠正列位置（第 ${fmtLines(shiftedRows)} 行）`);
    }
    if (neutralCount) {
      out.warnings.push(`其中 ${neutralCount} 笔为「/」（不计入收支，已标记为 neutral）`);
    }
    if (!out.txns.length) {
      out.warnings.push('表头已识别，但没有解析出任何有效交易记录');
    } else if (!out.meta.startTime) {
      out.warnings.push('未在前导说明中找到起止时间，账单范围未知');
    }

    return out;
  };

  /** 行号列表 → "3, 5, 9"（超过 8 个折叠） */
  function fmtLines(arr) {
    const head = arr.slice(0, 8).join(', ');
    return arr.length > 8 ? head + ' 等' : head;
  }

  /* ═══════════ 5. 统计汇总 ═══════════ */

  /**
   * 汇总统计。
   * @param {Array} txns
   */
  W.summary = function (txns) {
    const list = Array.isArray(txns) ? txns.filter(Boolean) : [];
    const income = U.round(U.sum(list.filter(t => t.type === 'income'), t => t.amount), 2);
    const expense = U.round(U.sum(list.filter(t => t.type === 'expense'), t => t.amount), 2);

    /* 支出按分类 */
    const exp = list.filter(t => t.type === 'expense');
    const catMap = U.groupBy(exp, t => t.category || '其他');
    const byCategory = Object.keys(catMap).map(category => {
      const arr = catMap[category];
      const amount = U.round(U.sum(arr, t => t.amount), 2);
      return {
        category,
        amount,
        count: arr.length,
        pct: expense > 0 ? U.round(amount / expense * 100, 1) : 0
      };
    }).sort((a, b) => b.amount - a.amount || b.count - a.count);

    /* 按月份 */
    const monMap = U.groupBy(list, t => String(t.date || '').slice(0, 7) || '未知');
    const byMonth = Object.keys(monMap)
      .filter(m => m !== '未知')
      .sort()
      .map(month => {
        const arr = monMap[month];
        return {
          month,
          income: U.round(U.sum(arr.filter(t => t.type === 'income'), t => t.amount), 2),
          expense: U.round(U.sum(arr.filter(t => t.type === 'expense'), t => t.amount), 2),
          count: arr.length
        };
      });

    /* 按支付方式（含收入支出全部） */
    const methodMap = U.groupBy(list, t => t.method || '未知');
    const byMethod = Object.keys(methodMap).map(method => {
      const arr = methodMap[method];
      return {
        method,
        amount: U.round(U.sum(arr, t => t.amount), 2),
        count: arr.length,
        expense: U.round(U.sum(arr.filter(t => t.type === 'expense'), t => t.amount), 2),
        income: U.round(U.sum(arr.filter(t => t.type === 'income'), t => t.amount), 2)
      };
    }).sort((a, b) => b.count - a.count || b.amount - a.amount);

    /* 最大 10 笔支出 */
    const top = exp.slice()
      .sort((a, b) => b.amount - a.amount || (a.date + a.time).localeCompare(b.date + b.time))
      .slice(0, 10);

    return {
      income,
      expense,
      net: U.round(income - expense, 2),
      count: list.length,
      expenseCount: exp.length,
      incomeCount: list.filter(t => t.type === 'income').length,
      neutralCount: list.filter(t => t.type === 'neutral').length,
      avgExpense: exp.length ? U.round(expense / exp.length, 2) : 0,
      byCategory,
      byMonth,
      byMethod,
      top
    };
  };

  /* ═══════════ 6. 规则建议（训练分类器） ═══════════ */

  /**
   * 从一笔已编辑的交易里学出一条规则。
   *
   * 用户改完一笔账，我们要记住「下次遇到类似的也这么分」。
   * 关键词优先用「对方」（人/商户最稳定），没有才退回商品。
   * 流向默认锁定成这笔的方向——因为他改的是这个方向的账，
   * 另一个方向未必适用（张三转给我=生活费，我转给张三≠生活费）。
   *
   * @param {object} txn 已编辑好的交易
   * @returns {object|null} 规则对象（未去重）
   */
  W.ruleFromTxn = function (txn) {
    if (!txn) return null;
    const kw = keywordOf(txn);
    if (!kw) return null;
    return {
      keyword: kw,
      direction: txn.type === 'income' ? 'income' : 'expense',
      category: txn.category || '',
      purpose: txn.purpose || ''
    };
  };

  /** 归一化关键词：去掉单号、纯数字、金额等噪声 */
  function keywordOf(t) {
    const cand = [t.counterparty, t.product, t.note];
    for (let i = 0; i < cand.length; i++) {
      let s = clean(cand[i]);
      if (!s) continue;
      // 去掉括号补充说明（如 "中国银行(1234)"）
      s = s.replace(/[（(][^）)]*[）)]/g, '').trim();
      if (!s) continue;
      if (/^[\d.,:/\-\s]+$/.test(s)) continue;   // 纯数字/单号
      if (s.length < 2) continue;                // 单字太泛，会误伤
      if (s.length > 20) s = s.slice(0, 20);     // 太长的商品名不适合当关键词
      return s;
    }
    return '';
  }

  /**
   * 对落到「其他」的交易提出关键词规则建议。
   * @param {Array} txns
   * @returns {Array<{keyword:string, category:string, count:number, sample:object}>}
   */
  W.suggestRules = function (txns) {
    const list = Array.isArray(txns) ? txns.filter(Boolean) : [];
    /* 收入也要建议——「某人转给我的是生活费」正是用户要的场景，
       原来只筛 expense，收入永远进不了建议列表。 */
    const others = list.filter(t => (t.category || '其他') === '其他');
    if (!others.length) return [];

    // 已存在的规则不再重复建议
    let existing = [];
    try { existing = (typeof S !== 'undefined' && S.all) ? S.all('txnRules') || [] : []; } catch (e) { existing = []; }
    const have = {};
    existing.forEach(r => { if (r && r.keyword) have[U.norm(String(r.keyword)).toLowerCase()] = true; });

    const map = {};
    others.forEach(t => {
      const kw = keywordOf(t);
      if (!kw) return;
      const k = U.norm(kw).toLowerCase();
      if (have[k]) return;
      if (!map[k]) map[k] = { keyword: kw, category: '其他', count: 0, sample: t, type: t.type };
      map[k].count++;
    });

    return Object.keys(map)
      .map(k => map[k])
      .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
      .slice(0, 30);
  };

  /* ═══════════ 7. 去重 ═══════════ */

  /** 生成去重键：有单号用单号，否则用「日期+时间+金额+对方」 */
  function dedupeKey(t) {
    if (!t) return '';
    const tradeNo = clean(t.tradeNo);
    if (tradeNo) return 'n:' + tradeNo;
    return 'k:' + [t.date || '', t.time || '', (Number(t.amount) || 0).toFixed(2), U.norm(t.counterparty || '')].join('|');
  }

  /**
   * 把新解析的记录与已有记录比对，避免重复导入同一个月导致重复计账。
   * @param {Array} existing S.all('txns')
   * @param {Array} incoming 新解析出的 txns
   * @returns {{fresh:Array, dupes:Array}}
   */
  W.dedupe = function (existing, incoming) {
    const have = {};
    const haveId = {};
    (Array.isArray(existing) ? existing : []).forEach(t => {
      if (!t) return;
      const k = dedupeKey(t);
      if (k) have[k] = true;
      if (t.id) haveId[t.id] = true;
    });

    const fresh = [], dupes = [];
    const seenInBatch = {};
    (Array.isArray(incoming) ? incoming : []).forEach(t => {
      if (!t) return;
      const k = dedupeKey(t);
      const isDup = (k && (have[k] || seenInBatch[k])) || (t.id && haveId[t.id]);
      if (isDup) { dupes.push(t); return; }
      if (k) seenInBatch[k] = true;   // 同一批文件内部的重复也要挡掉
      fresh.push(t);
    });

    return { fresh, dupes };
  };

  /* ═══════════ 8. 便捷方法 ═══════════ */

  /** 分类清单（供 UI 下拉） */
  W.CATEGORIES = CATEGORY_LIST.slice();

  /**
   * 一步到位：解析 → 去重 → 返回可直接入库的结果。
   * @param {string} text
   * @param {Array} existing S.all('txns')
   */
  W.importText = function (text, existing) {
    const parsed = W.parseCSV(text);
    const dd = W.dedupe(existing || [], parsed.txns);
    return {
      meta: parsed.meta,
      warnings: parsed.warnings,
      fresh: dd.fresh,
      dupes: dd.dupes,
      summary: W.summary(dd.fresh)
    };
  };

  /* ═══════════ 账单页「复制文字」解析 ═══════════
     微信/支付宝账单页可以直接长按全选复制，拿到的是这种文本：

       ```
       2026年10月1日 10:00
       转账-来自张三
       +2000.00
       已收钱

       10月2日 12:30
       美团外卖
       -32.00
       支付成功
       ```

     比导 CSV 少 5 步（不用邮箱、不用解压、不用电脑）。
     局限：账单页是分页加载的，只能复制到当前屏附近的内容。
     ═══════════════════════════════════════════ */

  /* 金额：带正负号或「收入/支出」标记。
     微信账单页收入是 +，支出是 -；支付宝有时写「收入 2000.00」。 */
  function parseBillAmount(line) {
    const s = String(line).trim();
    let m = s.match(/^([+\-−])\s*[¥￥]?\s*([\d,]+(?:\.\d{1,2})?)/);
    if (m) {
      const amt = parseAmount(m[2]);
      if (!isFinite(amt)) return null;
      return { amount: Math.abs(amt), type: (m[1] === '+' ? 'income' : 'expense') };
    }
    m = s.match(/^(收入|支出|收款|付款)\s*[¥￥]?\s*([\d,]+(?:\.\d{1,2})?)/);
    if (m) {
      const amt = parseAmount(m[2]);
      if (!isFinite(amt)) return null;
      return { amount: Math.abs(amt), type: /收入|收款/.test(m[1]) ? 'income' : 'expense' };
    }
    /* 光秃秃一个金额：方向交给后面「已收钱/支付成功」判断 */
    m = s.match(/^[¥￥]?\s*([\d,]+\.\d{1,2})$/);
    if (m) {
      const amt = parseAmount(m[1]);
      if (isFinite(amt)) return { amount: Math.abs(amt), type: null };
    }
    return null;
  }

  function parseBillDate(line, fallbackYear) {
    const s = String(line).trim();

    /* ⚠️ 必须先把「纯金额」排除掉。
       踩过的坑：无年份的分隔符里放了 `.`，于是 "-32.00" 被当成
       「32月00日」解析成 2026-32-00；"+2000.00" 变成 2026-00-00。
       金额行永远不该被当日期。 */
    if (/^[+\-−¥￥]/.test(s)) return null;
    if (/^[\d,]+\.\d{1,2}$/.test(s)) return null;
    /* 带货币符号的也排除 */
    if (/[¥￥]/.test(s) && !/[年月日]/.test(s)) return null;

    let m = s.match(/(\d{4})\s*[-/年.]\s*(\d{1,2})\s*[-/月.]\s*(\d{1,2})/);
    if (m) {
      const mo = +m[2], dy = +m[3];
      if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
        return { date: `${m[1]}-${U.pad(mo)}-${U.pad(dy)}`, year: +m[1] };
      }
    }
    /* 中文「10月2日」——只认「月/日」字样，不用 `.` 当分隔符 */
    m = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
    if (m) {
      const mo = +m[1], dy = +m[2];
      if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
        const y = fallbackYear || new Date().getFullYear();
        return { date: `${y}-${U.pad(mo)}-${U.pad(dy)}`, year: y };
      }
    }
    /* 「10/2」这种短写：要求整行基本就是个日期，别把小数当日期 */
    m = s.match(/^(\d{1,2})[-/](\d{1,2})(?![\d.])/);
    if (m) {
      const mo = +m[1], dy = +m[2];
      if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
        const y = fallbackYear || new Date().getFullYear();
        return { date: `${y}-${U.pad(mo)}-${U.pad(dy)}`, year: y };
      }
    }
    if (/^今天/.test(s)) return { date: U.ymd(U.today()), year: null };
    if (/^昨天/.test(s)) return { date: U.ymd(U.addDays(U.today(), -1)), year: null };
    return null;
  }

  function parseBillTime(line) {
    const m = String(line).match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/);
    if (!m) return '';
    return U.pad(Math.min(23, +m[1])) + ':' + U.pad(Math.min(59, +m[2]));
  }

  /** 从一行里猜「对方」：一般是最像商户/人名的中文片段 */
  function guessCounterparty(line) {
    const s = String(line).trim();
    if (!s) return '';
    return s
      /* 去掉类型前缀 */
      .replace(/^(转账|消费|商户消费|扫二维码付款|二维码收款|群收款|红包|微信红包|收款|付款)[-—·\s]*/g, '')
      /* 「来自张三」「转给张三」→ 张三 */
      .replace(/^(来自|转给|给|收到)\s*/g, '')
      .replace(/[-—·]\s*(来自|转给|收款|付款)$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);
  }

  /**
   * 解析「账单页复制的文字」
   * @param {string} text
   * @param {object} [opts] { year: 默认年份 }
   * @returns {{txns:Array, warnings:string[]}}
   */
  W.parseBillText = function (text, opts) {
    const out = { txns: [], warnings: [] };
    if (text == null) return out;
    let src = String(text).replace(/\r\n?/g, '\n').trim();
    if (!src) { out.warnings.push('内容为空'); return out; }

    const lines = src.split('\n').map(l => l.trim()).filter(Boolean);
    const fallbackYear = (opts && opts.year) || null;

    /* 状态词用来定方向（当金额没带符号时）。
       注意「已退款」匹配不到「已全额退款」，所以用「退款」而不是「已退款」。 */
    const INCOME_HINT = /已收钱|已到账|已收款|收款成功|收入|退款/;
    const EXPENSE_HINT = /支付成功|已支付|付款成功|支出|交易成功|已扣款/;

    let cur = null;                 // 正在攒的这一笔
    let lastYear = fallbackYear;
    let pendingDir = null;          // 来自状态行的方向提示

    const flush = () => {
      if (!cur) return;
      if (cur.date && cur.amount != null && cur.type) {
        cur.txn.category = cur.txn.category || '其他';
        out.txns.push(W.finalizeTxn(cur.txn));
      } else if (cur.date && cur.amount != null && !cur.type) {
        out.warnings.push(`有一笔 ${cur.date} ¥${cur.amount} 没认出是收入还是支出，已跳过`);
      }
      cur = null;
      pendingDir = null;
    };

    lines.forEach(line => {
      /* 跳过账单页的装饰性文字 */
      if (/^(全部|筛选|账单|月账单|收支统计|查看|更多|统计|图表|¥?\s*合计)/.test(line)) return;
      if (/^\d{4}年\d{1,2}月$/.test(line)) { lastYear = null; return; }   // 「2026年10月」这种月标题

      const dt = parseBillDate(line, lastYear);
      let amt = parseBillAmount(line);

      /* 一行同时含日期和金额（截图 OCR / 复制单条时很常见） */
      if (dt && !amt) {
        /* 先把日期和时间从行里挖掉再找金额。
           不能直接在整个行里搜金额——日期「2026-10-02」里的
           「-10」「-02」会被当成负数金额。 */
        const rest = line
          .replace(/\d{4}\s*[-/年.]\s*\d{1,2}\s*[-/月.]\s*\d{1,2}\s*日?/, '')
          .replace(/\d{1,2}\s*[:：]\s*\d{1,2}/, '');
        let m2 = rest.match(/([+\-−])\s*[¥￥]?\s*([\d,]+(?:\.\d{1,2})?)/);
        if (m2) {
          const v = parseAmount(m2[2]);
          if (isFinite(v)) {
            amt = { amount: Math.abs(v), type: m2[1] === '+' ? 'income' : 'expense' };
          }
        } else {
          /* 没符号就找一个带小数点的数字，方向交给状态词 */
          m2 = rest.match(/([\d,]+\.\d{1,2})/);
          if (m2) {
            const v = parseAmount(m2[1]);
            if (isFinite(v)) amt = { amount: Math.abs(v), type: null };
          }
        }
      }

      if (dt && amt) {
        flush();
        lastYear = dt.year || lastYear;
        cur = {
          date: dt.date, amount: amt.amount, type: amt.type,
          txn: {
            id: '', date: dt.date, time: parseBillTime(line),
            type: amt.type || '', amount: amt.amount,
            counterparty: '', product: '', bizType: '', method: '',
            status: '', tradeNo: '', merchantNo: '', note: '',
            category: '其他', raw: line, source: 'bill-text'
          }
        };
        return;
      }

      /* 纯日期行：开一笔新的 */
      if (dt) {
        flush();
        lastYear = dt.year || lastYear;
        cur = {
          date: dt.date, amount: null, type: null,
          txn: {
            id: '', date: dt.date, time: parseBillTime(line),
            type: '', amount: 0,
            counterparty: '', product: '', bizType: '', method: '',
            status: '', tradeNo: '', merchantNo: '', note: '',
            category: '其他', raw: line, source: 'bill-text'
          }
        };
        return;
      }

      /* 纯金额行 */
      if (amt) {
        if (!cur) {
          /* 没有日期就先记着，等下一个日期行补上 */
          cur = {
            date: '', amount: amt.amount, type: amt.type,
            txn: { id: '', date: '', time: '', type: amt.type || '', amount: amt.amount,
              counterparty: '', product: '', bizType: '', method: '', status: '',
              tradeNo: '', merchantNo: '', note: '', category: '其他', raw: line, source: 'bill-text' }
          };
        } else {
          cur.amount = amt.amount;
          cur.txn.amount = amt.amount;
          if (amt.type) { cur.type = amt.type; cur.txn.type = amt.type; }
        }
        return;
      }

      /* 状态行：定方向 */
      if (INCOME_HINT.test(line) || EXPENSE_HINT.test(line)) {
        const isIncome = INCOME_HINT.test(line);
        if (cur) {
          if (!cur.type) { cur.type = isIncome ? 'income' : 'expense'; cur.txn.type = cur.type; }
          cur.txn.status = line.slice(0, 20);
        } else {
          pendingDir = isIncome ? 'income' : 'expense';
        }
        return;
      }

      /* 其它文字：当作对方/商品描述 */
      if (cur) {
        const name = guessCounterparty(line);
        if (name && !cur.txn.counterparty) {
          cur.txn.counterparty = name;
          cur.txn.product = name;
        } else if (name && !cur.txn.note) {
          cur.txn.note = name;
        }
      }
    });
    flush();

    if (!out.txns.length) {
      out.warnings.push('没解析出记录。复制账单页时可只选一条记录的文字，或改用截图识别。');
    }
    return out;
  };

  /** 把账单文字导入（含去重） */
  W.importBillText = function (text, existing, opts) {
    const parsed = W.parseBillText(text, opts);
    const dd = W.dedupe(existing || [], parsed.txns);
    return {
      warnings: parsed.warnings,
      fresh: dd.fresh,
      dupes: dd.dupes,
      summary: W.summary(dd.fresh)
    };
  };

  /** 把一批 txn 写入存储（调用方一般直接用 S.bulkAdd） */
  W.save = function (fresh) {
    if (!Array.isArray(fresh) || !fresh.length) return 0;
    try {
      if (typeof S === 'undefined' || !S.bulkAdd) return 0;
      return S.bulkAdd('txns', fresh);
    } catch (e) {
      console.error('[wechat] 保存失败', e);
      return 0;
    }
  };

  global.WeChat = W;
})(window);