import type {
  TransferMode,
  TransferSegment,
  WheelchairTransfer,
} from './types';
import { uid, nowISO } from './plan';

/** 院内关键楼栋点位 */
export const LOCATIONS: Record<string, string> = {
  outpatient1: '门诊 1 号楼大厅',
  outpatient2: '门诊 2 号楼候诊区',
  outpatient3: '门诊 3 号楼',
  medimaging: '医技楼（影像中心）',
  endoscopy: '内镜中心楼',
  lab: '门诊 1 号楼 2 层检验科',
  eastOutpatient: '东院门诊楼',
  eastImaging: '东院医技楼',
};

interface RouteDef {
  from: string;
  to: string;
  distanceMeters: number;
  /** 无障碍路线（轮椅/平车可走） */
  accessible: string[];
  elevators: { name: string; location: string; note: string }[];
  /** 拥堵时的备选路线/提示 */
  congestedHint: string;
}

/** 院内楼栋间无障碍路线库（含电梯位置） */
const ROUTES: RouteDef[] = [
  {
    from: 'outpatient1', to: 'medimaging', distanceMeters: 260,
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
    from: 'outpatient2', to: 'medimaging', distanceMeters: 320,
    accessible: [
      '门诊 2 号楼中部乘 3 号低速医梯（停靠全楼层）到 2 层',
      '走 2 层空中连廊（遮雨连廊）直达医技楼 2 层',
      '在医技楼换乘 2 号医梯到 B1 CT 室或 1 层 MR/DR 室',
    ],
    elevators: [
      { name: '门诊 2 号楼 3 号医梯', location: '2 号楼中部，候诊区北侧', note: '低速医梯，轮椅平车优先；梯门宽 1.1m' },
      { name: '医技楼 2 号医用电梯', location: '连廊出口即达', note: '可提前电话 8002 预约梯位' },
    ],
    congestedHint: '连廊中午前较空；若 3 号医梯排队超 10 分钟，可呼叫志愿服务台（8001）安排志愿者在医技楼端接应平车。',
  },
  {
    from: 'outpatient3', to: 'medimaging', distanceMeters: 380,
    accessible: [
      '门诊 3 号楼 1 层乘 1 号无障碍直梯',
      '出楼沿无障碍通道经中心花园北侧缓坡（坡度 1:12）',
      '进入医技楼东门乘 2 号医梯',
    ],
    elevators: [
      { name: '3 号楼 1 号无障碍直梯', location: '骨科诊区东侧', note: '带盲文与语音播报，平车可入' },
      { name: '医技楼 2 号医用电梯', location: '医技楼东门', note: '拥堵时建议预约' },
    ],
    congestedHint: '花园缓坡雨天湿滑需慢行；拥堵时优先联系志愿服务台，或把影像检查调整到当日 10:30 后错峰。',
  },
  {
    from: 'outpatient2', to: 'endoscopy', distanceMeters: 420,
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
    from: 'outpatient1', to: 'lab', distanceMeters: 60,
    accessible: [
      '门诊 1 号楼大厅乘 2 号无障碍电梯上 2 层',
      '出梯左转沿无障碍走廊到检验科采血区',
    ],
    elevators: [
      { name: '门诊 1 号楼 2 号无障碍电梯', location: '大厅东侧，收费窗口旁', note: '距离采血区最近，轮椅优先' },
    ],
    congestedHint: '空腹高峰 07:30-09:00，可在 1 层先取采血号再上楼。',
  },
];

const SPEED = {
  // 米/分钟（含推行、避让、等电梯折算）
  wheelchair: 38,
  stretcher: 22,
  walkAssist: 30,
};

/** 依据起终点与模式构建一段转运（路线+耗时+拥堵） */
export function buildSegment(
  from: string,
  to: string,
  mode: TransferMode,
  congestion: TransferSegment['congestion'] = '一般',
): TransferSegment {
  const def = ROUTES.find((r) => r.from === from && r.to === to) ?? ROUTES[0];
  const speed = SPEED[mode];
  const congestFactor = congestion === '拥堵' ? 1.7 : congestion === '一般' ? 1.25 : 1;
  const elevatorWait = mode === 'stretcher' ? 8 : 5;
  const estimatedMinutes = Math.max(3, Math.round((def.distanceMeters / speed) * congestFactor + elevatorWait));
  return {
    id: uid('seg'),
    fromLocation: LOCATIONS[from] ?? from,
    toLocation: LOCATIONS[to] ?? to,
    routeSteps: def.accessible,
    elevators: def.elevators,
    distanceMeters: def.distanceMeters,
    estimatedMinutes,
    congestion,
  };
}

export function routeCongestedHint(from: string, to: string): string {
  return (ROUTES.find((r) => r.from === from && r.to === to) ?? ROUTES[0]).congestedHint;
}

export const CONGESTION_TIP: Record<TransferSegment['congestion'], string> = {
  畅通: '路线畅通，按无障碍指引推行即可',
  一般: '人流中等，已按 1.25 倍折算耗时',
  拥堵: '路线拥堵：系统建议提前联系志愿服务台（拨 8001）安排志愿者接应，或把影像检查调整到错峰时段',
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

/** 构建完整转运方案（含费用、卧位/如厕/随行的现场服务备注） */
export function buildTransfer(input: TransferInput): WheelchairTransfer {
  // 卧位强制平车
  const mode: TransferMode = input.needSupine ? 'stretcher' : input.mode;
  const seg = buildSegment(input.from, input.to, mode, input.congestion);

  const deposit = FEE_TABLE.deposit[mode];
  const rentalFee = FEE_TABLE.rental[mode];
  const transportFee = FEE_TABLE.transfer[mode];

  const notes: string[] = [];
  let congestionAction: WheelchairTransfer['congestionAction'] = null;
  if (input.needSupine && mode === 'stretcher') {
    notes.push('患者需卧位：已切换为医用平车，须预约可容平车的医用电梯与检查位；');
  }
  if (!input.canUseToiletIndependently) {
    notes.push('患者无法独立如厕：转运前先陪同如厕/穿戴护理垫，平车配便孔位，影像楼 B1 有无障碍卫生间（CT 室旁 20 米）；');
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

  return {
    id: uid('tr'),
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
    note: `【${modeName}转运 · ${input.purpose}】${seg.fromLocation} → ${seg.toLocation}，距离约 ${seg.distanceMeters} 米，陪诊员预计耗时 ${seg.estimatedMinutes} 分钟（含等电梯）。` + notes.join(''),
    congestionAction,
  };
}

export const transferFeeTotal = (t: WheelchairTransfer) => t.rentalFee + t.transportFee;
