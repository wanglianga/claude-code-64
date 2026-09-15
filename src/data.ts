import type { Campus, Department, Escort, ExamDef } from './types';

export const CAMPUSES: Campus[] = [
  {
    id: 'main',
    name: '总院（滨海路院区）',
    distanceKm: 0,
    shuttleInfo: '院内班车 20 分钟一班，整点/整点 20 分发车，车程约 15 分钟',
  },
  {
    id: 'east',
    name: '东院区（海港新城院区）',
    distanceKm: 8.5,
    shuttleInfo: '总院东门 ↔ 东院门诊部，工作日 07:00-18:00 循环发车',
  },
];

export const DEPARTMENTS: Department[] = [
  {
    id: 'cardio',
    name: '心血管内科',
    campusId: 'main',
    building: '门诊 2 号楼',
    floor: '4 层',
    room: '2408 诊室',
    morningPeak: '08:30-10:00 为周一高峰',
    avgWait: 45,
  },
  {
    id: 'digest',
    name: '消化内科',
    campusId: 'main',
    building: '门诊 2 号楼',
    floor: '5 层',
    room: '2512 诊室',
    morningPeak: '空腹抽血患者集中在 08:00-09:30',
    avgWait: 35,
  },
  {
    id: 'ortho',
    name: '骨科',
    campusId: 'main',
    building: '门诊 3 号楼',
    floor: '2 层',
    room: '3206 诊室',
    morningPeak: '09:00-10:30 复诊患者较多',
    avgWait: 40,
  },
  {
    id: 'neuro',
    name: '神经内科',
    campusId: 'main',
    building: '门诊 1 号楼',
    floor: '6 层',
    room: '1603 诊室',
    morningPeak: '上午号源紧张，下午相对宽松',
    avgWait: 55,
  },
  {
    id: 'resp',
    name: '呼吸与危重症医学科',
    campusId: 'east',
    building: '东院门诊楼',
    floor: '3 层',
    room: 'D3310 诊室',
    morningPeak: '换季时段 08:30-11:00 持续高峰',
    avgWait: 50,
  },
];

/** 检查检验目录：地点、是否空腹、报告出具时间、费用、排队时长、所在院区 */
export const EXAMS: ExamDef[] = [
  {
    id: 'blood-routine',
    name: '血常规+CRP',
    short: '血常规',
    building: '门诊 1 号楼',
    location: '2 层 检验科 2 号采血区',
    needFasting: false,
    reportHours: 1,
    fee: 35,
    campusId: 'main',
    queueMinutes: 20,
    category: '抽血',
  },
  {
    id: 'blood-routine-east',
    name: '血常规+CRP（东院检验科）',
    short: '血常规',
    building: '东院门诊楼',
    location: '2 层 检验科采血区',
    needFasting: false,
    reportHours: 1,
    fee: 35,
    campusId: 'east',
    queueMinutes: 18,
    category: '抽血',
  },
  {
    id: 'blood-biochem',
    name: '生化全套（肝肾功能/血脂/血糖）',
    short: '生化全套',
    building: '门诊 1 号楼',
    location: '2 层 检验科 1 号空腹采血区',
    needFasting: true,
    reportHours: 4,
    fee: 210,
    campusId: 'main',
    queueMinutes: 30,
    category: '抽血',
  },
  {
    id: 'coag',
    name: '凝血功能',
    short: '凝血',
    building: '门诊 1 号楼',
    location: '2 层 检验科 1 号空腹采血区',
    needFasting: true,
    reportHours: 4,
    fee: 90,
    campusId: 'main',
    queueMinutes: 25,
    category: '抽血',
  },
  {
    id: 'ct',
    name: '胸部/腹部 CT 平扫',
    short: 'CT',
    building: '医技楼',
    location: 'B1 层 CT 3 室',
    needFasting: false,
    reportHours: 24,
    fee: 320,
    campusId: 'main',
    queueMinutes: 55,
    category: '影像',
  },
  {
    id: 'mri',
    name: '核磁共振 MRI',
    short: 'MRI',
    building: '医技楼',
    location: '1 层 MR 2 室',
    needFasting: false,
    reportHours: 48,
    fee: 680,
    campusId: 'main',
    queueMinutes: 90,
    category: '影像',
  },
  {
    id: 'xray',
    name: '数字化 X 线摄影（DR）',
    short: 'X光',
    building: '医技楼',
    location: '1 层放射 1 室',
    needFasting: false,
    reportHours: 2,
    fee: 80,
    campusId: 'main',
    queueMinutes: 25,
    category: '影像',
  },
  {
    id: 'ecg',
    name: '常规心电图',
    short: '心电图',
    building: '门诊 2 号楼',
    location: '3 层 功能检查科 5 室',
    needFasting: false,
    reportHours: 0.5,
    fee: 30,
    campusId: 'main',
    queueMinutes: 15,
    category: '功能',
  },
  {
    id: 'us',
    name: '腹部彩超（需空腹）',
    short: '腹部彩超',
    building: '门诊 2 号楼',
    location: '3 层 超声 8 室',
    needFasting: true,
    reportHours: 1,
    fee: 120,
    campusId: 'main',
    queueMinutes: 40,
    category: '影像',
  },
  {
    id: 'pulm-ct',
    name: '高分辨率胸部 CT（HRCT）',
    short: 'HRCT',
    building: '东院医技楼',
    location: '1 层 CT 1 室',
    needFasting: false,
    reportHours: 24,
    fee: 350,
    campusId: 'east',
    queueMinutes: 35,
    category: '影像',
  },
  {
    id: 'pulm-test',
    name: '肺功能检查',
    short: '肺功能',
    building: '东院门诊楼',
    location: '4 层 呼吸检查中心',
    needFasting: false,
    reportHours: 1,
    fee: 160,
    campusId: 'east',
    queueMinutes: 30,
    category: '功能',
  },
];

export const ESCORTS: Escort[] = [
  {
    id: 'e01',
    name: '李秀兰',
    title: '金牌陪诊 · 5 年',
    rating: 4.9,
    ordersThisMonth: 86,
    phone: '138-0000-1101',
    shift: '早班 07:30-14:00',
    strongDepartments: ['cardio', 'digest', 'ortho'],
  },
  {
    id: 'e02',
    name: '王建国',
    title: '资深陪诊 · 3 年',
    rating: 4.7,
    ordersThisMonth: 64,
    phone: '138-0000-2202',
    shift: '早班 07:30-14:00',
    strongDepartments: ['neuro', 'ortho'],
  },
  {
    id: 'e03',
    name: '陈晓萌',
    title: '骨干陪诊 · 2 年',
    rating: 4.8,
    ordersThisMonth: 72,
    phone: '138-0000-3303',
    shift: '晚班 13:30-20:00',
    strongDepartments: ['resp', 'digest', 'cardio'],
  },
];

/** 演示账号 */
export const DEMO_ACCOUNTS = [
  { role: 'family' as const, username: 'family', password: '123456', label: '患者家属（张女士）' },
  { role: 'escort' as const, username: 'escort', password: '123456', label: '陪诊员（李秀兰）', escortId: 'e01' },
  { role: 'escort' as const, username: 'escort2', password: '123456', label: '陪诊员（陈晓萌 · 换班接替）', escortId: 'e03' },
  { role: 'desk' as const, username: 'desk', password: '123456', label: '服务台管理员' },
];

export const MOBILITY_LABELS: Record<string, string> = {
  self: '可自主行走',
  slow: '行走缓慢、易疲劳',
  cane: '需拄拐/搀扶',
  wheelchair: '需轮椅代步',
  bedridden: '卧床/平车推送',
};

export const RATING_TAGS = ['路线熟悉', '沟通及时', '耐心安抚', '动作麻利', '费用透明', '主动同步进度'];

/**
 * 医生临时加开项目目录（现场开单，不在患者预约的原始检查单内）
 * 均为空腹要求项目：用于演示「临时加空腹抽血 / 胃镜」冲突
 */
export interface AddonDef {
  id: string;
  name: string;
  kind: 'blood' | 'gastroscopy';
  building: string;
  location: string;
  needFasting: boolean;
  fastingHoursRequired: number; // 要求禁食小时数
  reportHours: number;
  fee: number;
  queueMinutes: number;
  /** 完成检查后到能回诊的额外耗时（出报告/苏醒观察等） */
  turnaroundMinutes: number;
}

export const ADDON_EXAMS: AddonDef[] = [
  {
    id: 'addon-fasting-glucose',
    name: '空腹血糖 + 糖化血红蛋白（医生临时加抽）',
    kind: 'blood',
    building: '门诊 1 号楼',
    location: '2 层 检验科 1 号空腹采血区',
    needFasting: true,
    fastingHoursRequired: 8,
    reportHours: 4,
    fee: 60,
    queueMinutes: 25,
    turnaroundMinutes: 60,
  },
  {
    id: 'addon-gastroscopy',
    name: '无痛胃镜（医生临时预约加做）',
    kind: 'gastroscopy',
    building: '内镜中心楼',
    location: '3 层 内镜 2 室（含麻醉评估与术后苏醒观察）',
    needFasting: true,
    fastingHoursRequired: 8,
    reportHours: 24,
    fee: 650,
    queueMinutes: 40,
    turnaroundMinutes: 120,
  },
];
