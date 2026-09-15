import type {
  TransferMode,
  TransferSegment,
  WheelchairTransfer,
} from './types';
import { uid, nowISO } from './plan';

/** 路线库未配置某起终点组合时抛出：调用方必须阻止创建，禁止回退到其他院区路线 */
export class TransferRouteNotConfiguredError extends Error {
  constructor(public from: string, public to: string, public campus: string) {
    super(`院内无障碍路线库未配置「${from} → ${to}」（${campus}），请先在路线库补充该组合的无障碍路线、电梯位置、距离与拥堵提示，暂不能创建转运`);
    this.name = 'TransferRouteNotConfiguredError';
  }
}

export interface LocationDef {
  label: string;
  campusId: string;
  campusName: string;
}

/** 院内关键楼栋点位（必须绑定院区，防止跨院区误用路线） */
export const LOCATIONS: Record<string, LocationDef> = {
  outpatient1: { label: '门诊 1 号楼大厅', campusId: 'main', campusName: '总院' },
  outpatient2: { label: '门诊 2 号楼候诊区', campusId: 'main', campusName: '总院' },
  outpatient3: { label: '门诊 3 号楼', campusId: 'main', campusName: '总院' },
  medimaging: { label: '医技楼（影像中心）', campusId: 'main', campusName: '总院' },
  endoscopy: { label: '内镜中心楼', campusId: 'main', campusName: '总院' },
  lab: { label: '门诊 1 号楼 2 层检验科', campusId: 'main', campusName: '总院' },
  eastOutpatient: { label: '东院门诊楼', campusId: 'east', campusName: '东院区' },
  eastImaging: { label: '东院医技楼', campusId: 'east', campusName: '东院区' },
  eastLab: { label: '东院门诊楼 2 层检验科', campusId: 'east', campusName: '东院区' },
};

export const ORIGIN_KEYS = ['outpatient1', 'outpatient2', 'outpatient3', 'eastOutpatient'];

interface RouteDef {
  from: string;
  to: string;
  campusId: string;
  distanceMeters: number;
  /** 无障碍路线（轮椅/平车可走） */
  accessible: string[];
  elevators: { name: string; location: string; note: string }[];
  /** 拥堵时的备选路线/提示 */
  congestedHint: string;
}

/**
 * 院内楼栋间无障碍路线库。
 * 每个院区单独配置；不存在的组合不得回退到其他院区路线。
 */
const ROUTES: RouteDef[] = [
  // ============ 总院 ============
  {
    from: 'outpatient1', to: 'medimaging', campusId: 'main', distanceMeters: 260,
    accessible: [
      '门诊 1 号楼 1 层大厅西侧无障碍坡道出正门',
      '沿地面黄色无障碍指引线西行约 260 米（避开门诊大厅自动扶梯）',
      '到达医技楼后走东门「无障碍通道」，乘 2 号医梯直达 B1（CT）/1 层（MR/DR）',
    ],
    elevators: [
      { name: '医技楼 2 号医用电梯', location: '医技楼东门内 10 米', note: '停靠 B1 与全部楼层，可容平车+2 名陪同，高峰 09:00-10:30 需在梯口预约优先' },
    ],
    congestedHint: '地面连廊 09:00-10:30 人流密集，轮椅推行降至约 0.5 m/s；建议改走 2 层空中连廊（遮雨、人少），在 1 号楼乘 3 号医梯上 2 层，连廊直通医技楼 2 层再乘医梯下行。',
  },
  {
    from: 'outpatient2', to: 'medimaging', campusId: 'main', distanceMeters: 320,
    accessible: [
      '门诊 2 号楼中部乘 3 号低速医梯（停靠全楼层）到 2 层',
      '走 2 层空中连廊（遮雨连廊）直达医技楼 2 层',
      '在医技楼换乘 2 号医梯到 B1 CT 室或 1 层 MR/DR 室',
    ],
    elevators: [
      { name: '门诊 2 号楼 3 号医梯', location: '2 号楼中部，候诊区北侧', note: '低速医梯，轮椅平车优先；梯门宽 1.1m' },
      { name: '医技楼 2 号医用电梯', location: '连廊出口即达', note: '可提前电话 8002 预约梯位' },
    ],
    congestedHint: '连廊中午前较空；若 3 号医梯排队超 10 分钟，可呼叫总院志愿服务台（8001）安排志愿者在医技楼端接应平车。',
  },
  {
    from: 'outpatient3', to: 'medimaging', campusId: 'main', distanceMeters: 380,
    accessible: [
      '门诊 3 号楼 1 层乘 1 号无障碍直梯',
      '出楼沿无障碍通道经中心花园北侧缓坡（坡度 1:12）',
      '进入医技楼东门乘 2 号医梯',
    ],
    elevators: [
      { name: '3 号楼 1 号无障碍直梯', location: '骨科诊区东侧', note: '带盲文与语音播报，平车可入' },
      { name: '医技楼 2 号医用电梯', location: '医技楼东门', note: '拥堵时建议预约' },
    ],
    congestedHint: '花园缓坡雨天湿滑需慢行；拥堵时优先联系总院志愿服务台，或把影像检查调整到当日 10:30 后错峰。',
  },
  {
    from: 'outpatient2', to: 'endoscopy', campusId: 'main', distanceMeters: 420,
    accessible: [
      '门诊 2 号楼 1 层无障碍通道出北门',
      '沿连廊步行约 420 米到达内镜中心楼',
      '乘内镜中心专用医梯到 3 层（胃镜需麻醉评估，平车走麻醉复苏区通道）',
    ],
    elevators: [
      { name: '内镜中心专用医梯', location: '内镜楼 1 层东侧', note: '无痛胃镜患者建议平车，需提前 15 分钟预约梯位与复苏位' },
    ],
    congestedHint: '内镜中心上午为高峰，卧位患者务必提前预约医梯与复苏位，否则等待可能超 30 分钟。',
  },
  {
    from: 'outpatient1', to: 'lab', campusId: 'main', distanceMeters: 60,
    accessible: [
      '门诊 1 号楼大厅乘 2 号无障碍电梯上 2 层',
      '出梯左转沿无障碍走廊到检验科采血区',
    ],
    elevators: [
      { name: '门诊 1 号楼 2 号无障碍电梯', location: '大厅东侧，收费窗口旁', note: '距离采血区最近，轮椅优先' },
    ],
    congestedHint: '空腹高峰 07:30-09:00，可在 1 层先取采血号再上楼。',
  },

  // ============ 东院区 ============
  {
    from: 'eastOutpatient', to: 'eastImaging', campusId: 'east', distanceMeters: 180,
    accessible: [
      '东院门诊楼 1 层走西侧无障碍通道（宽 1.8m，无台阶）',
      '经两楼之间的遮雨连廊推行约 180 米（连廊两侧均有无障碍坡道）',
      '到达东院医技楼后从一层无障碍入口进入：CT/DR 在 1 层可直达；如需其他楼层乘 1 号医梯',
    ],
    elevators: [
      { name: '东院医技楼 1 号医用电梯', location: '东院医技楼一层大厅右侧', note: '可容平车，停靠全部楼层；东院志愿者服务台电话 8101，可提前预约接应' },
      { name: '东院门诊楼无障碍直梯', location: '门诊楼大厅西侧无障碍通道旁', note: '下楼至连廊层无需换乘，平车可入' },
    ],
    congestedHint: '东院早高峰 08:30-10:00 连廊抽血人流较多；可联系东院志愿服务台（8101）在医技楼端接应，或把 HRCT 调整到 10:00 后错峰。',
  },
  {
    from: 'eastOutpatient', to: 'eastLab', campusId: 'east', distanceMeters: 40,
    accessible: [
      '东院门诊楼大厅西侧乘无障碍直梯上 2 层',
      '出梯右转沿无障碍走廊约 40 米到东院检验科采血区',
    ],
    elevators: [
      { name: '东院门诊楼无障碍直梯', location: '门诊楼大厅西侧', note: '轮椅平车优先，梯门宽 1.1m' },
    ],
    congestedHint: '东院空腹采血高峰 07:30-09:00，可先在一层自助机取号再上楼。',
  },
];

const SPEED = {
  // 米/分钟（含推行、避让、等电梯折算）
  wheelchair: 38,
  stretcher: 22,
  walkAssist: 30,
};

export function findRoute(from: string, to: string): RouteDef {
  const route = ROUTES.find((r) => r.from === from && r.to === to);
  if (!route) {
    const campus = LOCATIONS[from]?.campusName ?? '未知院区';
    throw new TransferRouteNotConfiguredError(LOCATIONS[from]?.label ?? from, LOCATIONS[to]?.label ?? to, campus);
  }
  return route;
}

export function isRouteConfigured(from: string, to: string): boolean {
  return ROUTES.some((r) => r.from === from && r.to === to);
}

/** 校验起终点必须同院区；跨院区走「跨院区」交通功能而非院内转运 */
export function assertSameCampus(from: string, to: string): void {
  const f = LOCATIONS[from];
  const t = LOCATIONS[to];
  if (f && t && f.campusId !== t.campusId) {
    throw new TransferRouteNotConfiguredError(f.label, t.label, `${f.campusName}↔${t.campusName}（跨院区）`);
  }
}

/** 依据起终点与模式构建一段转运（路线+耗时+拥堵）；路线缺失时抛错，不回退 */
export function buildSegment(
  from: string,
  to: string,
  mode: TransferMode,
  congestion: TransferSegment['congestion'] = '一般',
): TransferSegment {
  assertSameCampus(from, to);
  const def = findRoute(from, to); // 缺失即抛错，绝不使用其他院区路线兜底
  const speed = SPEED[mode];
  const congestFactor = congestion === '拥堵' ? 1.7 : congestion === '一般' ? 1.25 : 1;
  const elevatorWait = mode === 'stretcher' ? 8 : 5;
  const estimatedMinutes = Math.max(3, Math.round((def.distanceMeters / speed) * congestFactor + elevatorWait));
  return {
    id: uid('seg'),
    fromLocation: LOCATIONS[from].label,
    toLocation: LOCATIONS[to].label,
    routeSteps: def.accessible,
    elevators: def.elevators,
    distanceMeters: def.distanceMeters,
    estimatedMinutes,
    congestion,
  };
}

export function routeCongestedHint(from: string, to: string): string {
  assertSameCampus(from, to);
  return findRoute(from, to).congestedHint;
}

export const CONGESTION_TIP: Record<TransferSegment['congestion'], string> = {
  畅通: '路线畅通，按无障碍指引推行即可',
  一般: '人流中等，已按 1.25 倍折算耗时',
  拥堵: '路线拥堵：系统建议提前联系本院区志愿服务台安排志愿者接应，或把影像检查调整到错峰时段',
};

/** 志愿台/总机按院区区分 */
export const CAMPUS_SERVICE_PHONE: Record<string, string> = {
  main: '8001（总院志愿服务台）',
  east: '8101（东院志愿服务台）',
};

const FEE_TABLE = {
  deposit: { wheelchair: 500, stretcher: 1000, walkAssist: 0 },
  rental: { wheelchair: 0, stretcher: 30, walkAssist: 0 }, // 轮椅免租（押金制），平车 30 元/次
  transfer: { wheelchair: 0, stretcher: 40, walkAssist: 0 }, // 平车转运服务费
};

export interface TransferInput {
  purpose: string;
  from: string;
  to: string;
  mode: TransferMode;
  needSupine: boolean;
  canUseToiletIndependently: boolean;
  familyAccompanying: boolean;
  congestion: TransferSegment['congestion'];
}

/**
 * 构建完整转运方案。
 * 起终点非同院区或路线库缺失时抛 TransferRouteNotConfiguredError，
 * 调用方必须捕获并阻止创建（不得写入转运记录/家属提示/押金/费用）。
 */
export function buildTransfer(input: TransferInput): WheelchairTransfer {
  // 卧位强制平车
  const mode: TransferMode = input.needSupine ? 'stretcher' : input.mode;
  const seg = buildSegment(input.from, input.to, mode, input.congestion); // 缺失组合在此抛错
  const campusId = LOCATIONS[input.from].campusId;
  const servicePhone = CAMPUS_SERVICE_PHONE[campusId] ?? '';

  const deposit = FEE_TABLE.deposit[mode];
  const rentalFee = FEE_TABLE.rental[mode];
  const transportFee = FEE_TABLE.transfer[mode];

  const notes: string[] = [];
  let congestionAction: WheelchairTransfer['congestionAction'] = null;
  if (input.needSupine && mode === 'stretcher') {
    notes.push('患者需卧位：已切换为医用平车，须预约可容平车的医用电梯与检查位；');
  }
  if (!input.canUseToiletIndependently) {
    notes.push('患者无法独立如厕：转运前先陪同如厕/穿戴护理垫，平车配便孔位，检查楼一层有无障碍卫生间；');
  } else {
    notes.push('患者可独立如厕：告知沿途无障碍卫生间位置即可；');
  }
  notes.push(input.familyAccompanying
    ? '家属随行：家属在患者头部一侧协助观察，陪诊员负责推行与路线；'
    : '家属未随行：陪诊员全程不离开患者，上下电梯倒车进入、减速带斜行；');

  if (input.congestion === '拥堵') {
    congestionAction = 'volunteer';
    notes.push(`检测到路线拥堵：${routeCongestedHint(input.from, input.to)}`);
  }

  const modeName = mode === 'wheelchair' ? '轮椅' : mode === 'stretcher' ? '医用平车' : '搀扶步行';
  const campusName = LOCATIONS[input.from].campusName;

  return {
    id: uid('tr'),
    campusId,
    purpose: input.purpose,
    fromLocation: seg.fromLocation,
    toLocation: seg.toLocation,
    mode,
    status: 'planned',
    createdAt: nowISO(),
    needSupine: input.needSupine,
    canUseToiletIndependently: input.canUseToiletIndependently,
    familyAccompanying: input.familyAccompanying,
    deposit,
    rentalFee,
    transportFee,
    volunteerRequested: false,
    elevatorReservation: mode === 'stretcher',
    elevatorReservationTime: mode === 'stretcher' ? '建议提前 15 分钟预约' : undefined,
    segments: [seg],
    note: `【${campusName} · ${modeName}转运 · ${input.purpose}】${seg.fromLocation} → ${seg.toLocation}，距离约 ${seg.distanceMeters} 米，陪诊员预计耗时 ${seg.estimatedMinutes} 分钟（含等电梯），志愿服务台 ${servicePhone}。` + notes.join(''),
    congestionAction,
  };
}

export const transferFeeTotal = (t: WheelchairTransfer) => t.rentalFee + t.transportFee;
