/* ═══════════════════════════════════════════════
   blueprint.js — 计算机视觉 / 具身智能学习蓝图
   对齐用户的 Obsidian 知识库：
     ~/0_main_learn/计算机机器人视觉学习库/
   模块编号、状态、当前阶段均来自该库的真实内容，
   不是凭空造的学习计划。
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const B = {};

  /* ───── 方向总图（来自 00_总目录「总路线（学科地图）」） ───── */
  B.ROADMAP = [
    { layer: '计算机科学基础',   nodes: ['01', '02', '03'],                 status: 'ok' },
    { layer: '计算机视觉',       nodes: ['04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15'], status: 'doing' },
    { layer: '机器人学',         nodes: ['17', '19', '20', '25', '29', '30'], status: 'todo' },
    { layer: '3D 视觉',          nodes: ['14', '15'],                        status: 'doing' },
    { layer: '机器人感知',       nodes: ['15', '16', '17', '18', '23', '26'], status: 'todo' },
    { layer: 'Robot Learning',   nodes: ['27', '29'],                        status: 'future' },
    { layer: 'VLM / VLA / Policy', nodes: ['27'],                            status: 'future' },
    { layer: '具身智能',         nodes: ['27', '29', '30'],                  status: 'future' }
  ];

  /* ───── 30 个知识节点（编号 / 名称 / 状态 / 优先级） ─────
     优先级依据 README 的四级优先：
       1 = 机器人视觉 + Robocon + 当前 Project
       2 = ROS2 + 3D Vision + 定位 + 视觉几何
       3 = SLAM + 传感器融合
       4 = 纯计算机视觉理论深入
     状态标记来自 90_学习仪表盘。                                  */
  B.MODULES = [
    { id: '01', name: '计算机与编程基础',       status: '🟢 Python / 🟡 Linux / 🔴 Git', prio: 1, group: '基础' },
    { id: '02', name: '数学基础',             status: '🔵 按需补',      prio: 3, group: '基础' },
    { id: '03', name: 'NumPy 与科学计算',      status: '🟢 需复习',      prio: 1, group: '基础' },
    { id: '04', name: 'OpenCV 与图像处理',     status: '🟢 基础 / 🔴 滤波边缘', prio: 1, group: '视觉' },
    { id: '05', name: '传统计算机视觉',         status: '🟡 特征光流 / 🔴 匹配', prio: 1, group: '视觉' },
    { id: '06', name: '相机模型与标定',         status: '🟡 完成一次',     prio: 1, group: '视觉' },
    { id: '07', name: '机器人视觉几何',         status: '🔵',            prio: 2, group: '几何' },
    { id: '08', name: '深度学习基础',           status: '🔴 原理',        prio: 2, group: '学习' },
    { id: '09', name: '目标检测',              status: '🟢 + 🟡 调优',   prio: 1, group: '视觉' },
    { id: '10', name: '目标分割与关键点',       status: '🔴 远期',        prio: 4, group: '视觉' },
    { id: '11', name: '目标跟踪',              status: '🟢 单球 / 🟡 多球', prio: 1, group: '视觉' },
    { id: '12', name: 'GMC 与运动估计',        status: '🟢 理论 + 源码',  prio: 1, group: '视觉' },
    { id: '13', name: '多目标视觉',            status: '🟡 进行中',      prio: 1, group: '视觉' },
    { id: '14', name: '3D 视觉',               status: '🔴',            prio: 2, group: '三维' },
    { id: '15', name: '视觉定位与姿态估计',      status: '🟡 PnP 离线 / 🔵 rvec', prio: 2, group: '三维' },
    { id: '16', name: 'SLAM 与 Visual Odometry', status: '🔴',          prio: 3, group: '三维' },
    { id: '17', name: '视觉与机器人坐标系',      status: '🔴 TF2 / 手眼',  prio: 2, group: '机器人' },
    { id: '18', name: '多传感器融合',           status: '🔴',            prio: 3, group: '机器人' },
    { id: '19', name: 'ROS2 与机器人视觉工程',   status: '🟡 复习重启 / 阶段一', prio: 2, group: '机器人' },
    { id: '20', name: '摄像头与视觉系统工程',     status: '🟢 实操 / 🔴 原理', prio: 1, group: '工程' },
    { id: '21', name: '数据集与模型工程',        status: '🟡 实践 / 🔴 方法', prio: 2, group: '工程' },
    { id: '22', name: '模型部署与实时计算',      status: '🟡 有实测 / 🔴 部署', prio: 2, group: '工程' },
    { id: '23', name: '视觉鲁棒性与工程优化',     status: '🟡 有案例 / 🔴 方法论', prio: 3, group: '工程' },
    { id: '24', name: '机器人视觉项目',          status: '🟡 Project 1',   prio: 1, group: '项目' },
    { id: '25', name: '2027 ABU Robocon',      status: '🔴 备赛准备',    prio: 1, group: '项目' },
    { id: '26', name: '视觉与雷达共同知识',       status: '🟡 部分',        prio: 3, group: '机器人' },
    { id: '27', name: '具身智能视觉',           status: '🔴 远期地图',    prio: 4, group: '远期' },
    { id: '28', name: 'RC 经验',               status: '🟢 已归档',      prio: 4, group: '归档' },
    { id: '29', name: '足式机器人与强化学习控制',  status: '🔵 资料已归档',   prio: 3, group: '远期' },
    { id: '30', name: '机器人导航与机械臂抓取',   status: '🔵 资料已归档',   prio: 3, group: '远期' }
  ];

  /* ───── 当前阶段（来自 90_学习仪表盘） ───── */
  B.STAGE = {
    current: 2,
    title: '阶段 2：Project 1 稳定化（单球 → 多球）+ 机器人视觉基础',
    position: '计算机科学基础 → 计算机视觉 → 3D 视觉 / 机器人感知',
    phases: [
      { n: 1, name: 'Detection / Tracking / GMC 理论跑通，参数调优完成', state: 'done' },
      { n: 2, name: '双球晃动稳定化、推理尺寸与参数定版', state: 'doing' },
      { n: 3, name: '3D 定位 —— Project 2 核心完成；ROS2 节点化仍待做', state: 'doing' },
      { n: 4, name: 'Robocon 综合系统', state: 'todo' }
    ]
  };

  /* ───── 当前项目（来自 90_学习仪表盘） ───── */
  B.PROJECTS = [
    {
      id: 'p1', name: 'Project 1 · 剧烈晃动球视觉', status: 'doing',
      desc: '剧烈晃动下稳定识别固定颜色球，输出二维图像坐标 (u, v)',
      config: 'match_thresh=0.95 / fuse_score=True / track_buffer=30 / gmc=sparseOptFlow / IMGSZ=960 / ReID=False',
      note: '双球场景进行中',
      modules: ['09', '11', '12', '13']
    },
    {
      id: 'p2', name: 'Project 2 · ArUco / PnP 空间定位', status: 'mostly',
      desc: 'AprilTag 检测 + PnP，得到 Tag 相对相机的位姿 / 距离',
      note: '核心功能基本完成；真机验证 + 坐标变换待做',
      modules: ['06', '15', '07']
    },
    {
      id: 'p3', name: 'Project 3 · iCAN 具身智能', status: 'todo',
      desc: '2026 iCAN「金视线杯」AI 具身智能应用设计挑战赛全栈：运动—感知—建图—导航—抓取—集成',
      note: '14 项训练任务已归档；PPO / Nav2 / SLAM 均未实跑',
      modules: ['19', '29', '30', '16']
    }
  ];

  /* ───── 间隔复习节奏（来自 96_复习计划） ───── */
  B.REVIEW_INTERVALS = [1, 3, 7, 14, 30];

  /* ───── 建议的学习任务模板 ───── */
  B.SUGGESTIONS = [
    { module: '13', title: '多目标跟踪：双球场景稳定化实验', detail: '调 track_buffer / match_thresh，记录六组参数对比', prio: 1 },
    { module: '09', title: 'YOLO 推理尺寸原理与定版', detail: 'IMGSZ 960 的依据，跑一次尺寸对比实验', prio: 1 },
    { module: '15', title: 'PnP 的 rvec 含义梳理', detail: 'rvec/Rodrigues 转换，写进费曼自测', prio: 2 },
    { module: '17', title: 'TF2 坐标变换上手', detail: '图像(u,v) → 相机 → 末端 → 基座 四坐标系打通', prio: 2 },
    { module: '19', title: 'ROS2 最小包结构复习', detail: 'Workspace / Package / Node，通信模型 Topic/Service/Action', prio: 2 },
    { module: '16', title: '2D SLAM：Gmapping vs Karto', detail: '概念辨析 + 点云转 PGM', prio: 3 },
    { module: '14', title: '3D 视觉基础：深度图与点云', detail: '从 RGB-D 到点云的流程', prio: 2 }
  ];

  /* ───── 查询 ───── */
  B.module = id => B.MODULES.find(m => m.id === String(id).padStart(2, '0')) || null;
  B.byGroup = () => U.groupBy(B.MODULES, m => m.group);
  B.byPrio = p => B.MODULES.filter(m => m.prio === p);

  /** 状态标记 → 数值进度（0~1），用于可视化 */
  B.statusScore = function (status) {
    const s = status || '';
    if (/🟢/.test(s) && !/🟡|🔴/.test(s)) return 1;
    if (/🟢/.test(s)) return 0.75;
    if (/🟡/.test(s) && !/🔴/.test(s)) return 0.5;
    if (/🟡/.test(s)) return 0.4;
    if (/🔵/.test(s)) return 0.25;
    if (/🔴/.test(s)) return 0.05;
    return 0.1;
  };

  /** 整体进度 */
  B.overall = function () {
    const total = B.MODULES.length;
    const score = U.sum(B.MODULES, m => B.statusScore(m.status));
    const byGroupMap = {};
    B.byGroup() && Object.keys(B.byGroup()).forEach(g => {
      const list = B.byGroup()[g];
      byGroupMap[g] = {
        total: list.length,
        score: U.round(U.sum(list, m => B.statusScore(m.status)) / list.length * 100, 0),
        modules: list
      };
    });
    return {
      total,
      pct: U.round(score / total * 100, 0),
      done: B.MODULES.filter(m => B.statusScore(m.status) >= 0.95).length,
      doing: B.MODULES.filter(m => { const s = B.statusScore(m.status); return s >= 0.3 && s < 0.95; }).length,
      todo: B.MODULES.filter(m => B.statusScore(m.status) < 0.3).length,
      groups: byGroupMap
    };
  };

  /** 优先级分布 */
  B.prioStats = function () {
    const out = {};
    [1, 2, 3, 4].forEach(p => {
      const list = B.byPrio(p);
      out[p] = {
        total: list.length,
        done: list.filter(m => B.statusScore(m.status) >= 0.75).length,
        names: list.map(m => m.name)
      };
    });
    return out;
  };

  /* ───── 复习排期 ───── */

  /** 为一个知识点生成 1/3/7/14/30 天复习条目 */
  B.makeReviewPlan = function (title, learnedDate, link) {
    const base = U.parse(learnedDate || U.ymd(U.today()));
    return B.REVIEW_INTERVALS.map((days, i) => ({
      title,
      link: link || '',
      round: i + 1,
      interval: days,
      learnedDate: U.ymd(base),
      nextDate: U.ymd(U.addDays(base, days)),
      done: false,
      retired: false
    }));
  };

  /** 复习通过 → 推进到下一轮 */
  B.advanceReview = function (review) {
    const idx = B.REVIEW_INTERVALS.indexOf(review.interval);
    if (idx < 0 || idx >= B.REVIEW_INTERVALS.length - 1) {
      return { retired: true, nextDate: null };
    }
    return { retired: false, nextDate: U.ymd(U.addDays(new Date(), B.REVIEW_INTERVALS[idx + 1])) };
  };

  /** 生成"今天该复习什么" */
  B.todayReviews = function () {
    return S.dueReviews(U.ymd(U.today()));
  };

  /* ───── 蓝图摘要（给 AI 用） ───── */
  B.summaryText = function () {
    const L = [];
    L.push('知识库：计算机机器人视觉学习库（Obsidian）');
    L.push('结构：01~23 知识体系 / 24 项目 / 25~30 路线 / 90~98 学习管理');
    L.push('');
    L.push('四级优先级：');
    L.push('1. 机器人视觉 + Robocon + 当前 Project 1');
    L.push('2. ROS2 + 3D Vision + 定位 + 视觉几何');
    L.push('3. SLAM + Sensor Fusion');
    L.push('4. 纯计算机视觉理论深入');
    L.push('');
    L.push('方向总图：计算机科学基础 →（计算机视觉 / 机器人学）→ 3D 视觉 / 机器人感知 → Robot Learning → VLM/VLA/Policy → 具身智能');
    L.push('');
    L.push('明确约束：所有远期内容（27 具身智能）标记为 🔴，不允许看起来像"现在必须学"。');
    return L.join('\n');
  };

  B.stageText = function () {
    const L = [];
    L.push(B.STAGE.title);
    L.push('方向位置：' + B.STAGE.position);
    B.STAGE.phases.forEach(p => {
      const mark = p.state === 'done' ? '✅' : p.state === 'doing' ? '🟡' : '🔴';
      L.push(`${mark} 阶段 ${p.n}：${p.name}`);
    });
    L.push('');
    L.push('当前项目：');
    B.PROJECTS.forEach(p => {
      L.push(`- ${p.name}（${p.status === 'done' ? '完成' : p.status === 'doing' ? '进行中' : p.status === 'mostly' ? '基本完成' : '未开始'}）：${p.desc}${p.note ? ' —— ' + p.note : ''}`);
    });
    return L.join('\n');
  };

  B.progressText = function () {
    const L = [];
    B.MODULES.forEach(m => L.push(`${m.id} ${m.name}：${m.status}`));
    return L.join('\n');
  };

  B.progressMap = function () {
    const out = {};
    B.MODULES.forEach(m => out[`${m.id} ${m.name}`] = m.status);
    return out;
  };

  /* ───── 把建议转成任务草案 ───── */
  B.suggestionsToTasks = function () {
    return B.SUGGESTIONS.map(s => {
      const m = B.module(s.module);
      return {
        title: s.title,
        cat: 'cv',
        priority: s.prio,
        note: `${s.detail}${m ? `（对应 ${m.id} ${m.name}）` : ''}`,
        source: 'blueprint',
        done: false,
        confidence: 'high',
        _keep: true
      };
    });
  };

  global.Blueprint = B;
})(window);