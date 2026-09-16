import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AuthorizationRequest,
  BookingForm,
  ChatMessage,
  CrossCampusTrip,
  EscortOrder,
  FeeItem,
  Incident,
  IncidentType,
  Role,
  ServiceArchive,
  StageKey,
  TransferStatus,
} from './types';
import { ADDON_EXAMS, CAMPUSES, ESCORTS } from './data';
import { buildAddonPlans, buildFastingCheck, createFastingAddon, buildOrderSkeleton, nowISO, reportReadyText, todayStr, uid } from './plan';
import { buildTransfer, transferFeeTotal, type TransferInput } from './transfer';

// ============ 异常处置模板：当前状态 → 下一步选项 → 费用变化 → 是否需家属授权 ============
export interface IncidentTemplate {
  type: IncidentType;
  title: string;
  detailHint: string;
  options: string[];
  feeDelta: number;
  feeReason: string;
  needAuthorization: boolean;
  authTitle?: string;
}

export const INCIDENT_TEMPLATES: Record<IncidentType, IncidentTemplate> = {
  fasting: {
    type: 'fasting',
    title: '空腹等待过久 / 低血糖风险',
    detailHint: '如：患者 07:20 到院，CT 排队 90 分钟，空腹已超 10 小时，出现头晕出虚汗',
    options: [
      '立即暂停排队，陪同到休息区口服糖水/糖果，与检查科室沟通后优先安排',
      '与医生沟通改为无需空腹的替代检查，重新开单缴费',
      '坚持排队完成检查（家属需知情，签署知情记录）',
    ],
    feeDelta: 0,
    feeReason: '替代检查可能产生差价，多退少补；紧急糖块由陪诊物资包免费提供',
    needAuthorization: false,
  },
  longQueue: {
    type: 'longQueue',
    title: '检查排队时间过长',
    detailHint: '如：MRI 当前排队 120 分钟，可能影响 10:00 回诊',
    options: [
      '先取 MRI 号 → 先做其他检查/先回诊，按号段临近再返回（错峰）',
      '改约当日下午同一项目（总院），下午继续陪诊',
      '协调转至排队较短的东院区同项目（检查报告互认）',
    ],
    feeDelta: 80,
    feeReason: '选择跨院区或下午续陪：加收跨区/延时陪诊费 80-120 元；改约本身免费',
    needAuthorization: true,
    authTitle: '排队处置方案与可能加收陪诊费，需家属确认',
  },
  mobility: {
    type: 'mobility',
    title: '患者行动不便 / 通道受阻',
    detailHint: '如：患者轮椅无法通过 B1 常规通道，医梯排队 15 分钟',
    options: [
      '启用无障碍专用电梯优先通行（出示陪诊工单）',
      '加叫院内转运平车/志愿者协助推送',
      '调整检查顺序，先做同楼层项目减少往返',
    ],
    feeDelta: 40,
    feeReason: '院内转运平车服务 40 元/次；无障碍电梯免费',
    needAuthorization: true,
    authTitle: '是否付费叫院内转运平车（40 元）？',
  },
  doctorStop: {
    type: 'doctorStop',
    title: '医生临时停诊',
    detailHint: '如：诊室通知医生会诊，上午停诊，号源可转同级医师或改约',
    options: [
      '转当日同科同级医师接诊（科室已协调加号）',
      '免费改约最近号源，陪诊费按实际服务时长结算或改期使用',
      '转互联网医院线上复诊 + 仅完成已开检查',
    ],
    feeDelta: -199,
    feeReason: '改约情形下未发生的半天陪诊费原路退回 199 元（已发生部分按实结算）',
    needAuthorization: true,
    authTitle: '医生停诊处置与退费方案，需家属选择确认',
  },
  missingItem: {
    type: 'missingItem',
    title: '检查单缺项',
    detailHint: '如：医生开了生化但漏开凝血，检验科要求补单',
    options: [
      '返回诊室请医生补开检查单 → 重新缴费后检查',
      '家属线上确认后，陪诊员代办补单与缴费',
      '本次缺项改约下次门诊一并检查',
    ],
    feeDelta: 90,
    feeReason: '补开项目按医院定价收取（示例：凝血 90 元），陪诊代办不加收服务费',
    needAuthorization: true,
    authTitle: '补开检查项目需补缴检查费，请家属确认项目与金额',
  },
  familyAsk: {
    type: 'familyAsk',
    title: '家属远程追问',
    detailHint: '如：家属询问患者现在位置、检查结果何时出、还要多久',
    options: [
      '立即发送当前阶段定位、排队叫号与预计完成时间',
      '拍摄检查回执/处方（隐去敏感信息）同步家属',
      '检查完成后电话回拨家属统一说明',
    ],
    feeDelta: 0,
    feeReason: '进度同步为陪诊服务内容，不另收费',
    needAuthorization: false,
  },
  crossCampus: {
    type: 'crossCampus',
    title: '需跨院区检查',
    detailHint: '如：东院有 HRCT 号源且排队短，总院建议转去东院完成',
    options: [
      '乘医院免费班车前往（车程约 30 分钟，需等班次）',
      '打车前往（约 20 分钟，车费按表）',
      '患者行动不便，叫院内救护转运车（200 元）',
    ],
    feeDelta: 120,
    feeReason: '跨院区陪诊加收 120 元 + 实际交通费；检查报告两院互认不重复收费',
    needAuthorization: true,
    authTitle: '跨院区交通方式与加收费用，需家属远程授权',
  },
  shiftChange: {
    type: 'shiftChange',
    title: '陪诊员换班交接',
    detailHint: '如：早班 14:00 结束，患者下午仍需 MRI 与回诊',
    options: ['交接给同班晚班陪诊员继续服务', '加班续陪 1 小时（加班费 60 元）'],
    feeDelta: 0,
    feeReason: '同机构换班不额外收费；加班续陪 60 元/小时',
    needAuthorization: true,
    authTitle: '陪诊员换班：请家属确认接替人员或加班方案',
  },
  emotion: {
    type: 'emotion',
    title: '患者情绪紧张/烦躁',
    detailHint: '如：老人进入 MRI 室前抗拒，担心辐射与封闭空间',
    options: [
      '暂停检查流程，陪诊员就地安抚、讲解流程（MRI 无辐射）',
      '联系家属视频连线共同安抚后再做',
      '请检查科室安排家属/陪诊员穿隔离衣陪同进入',
    ],
    feeDelta: 0,
    feeReason: '情绪安抚为陪诊标准服务，不另收费',
    needAuthorization: false,
  },
  custom: {
    type: 'custom',
    title: '其他现场情况',
    detailHint: '描述现场发生的情况',
    options: ['按现场最稳妥方案先行处置，随后同步家属', '先暂停等待家属意见'],
    feeDelta: 0,
    feeReason: '按实际发生费用结算并同步',
    needAuthorization: false,
  },
};

// ============ 会话 ============
interface Session {
  role: Role;
  username: string;
  escortId?: string;
}

// ============ Store ============
interface AppState {
  session: Session | null;
  orders: EscortOrder[];
  initialized: boolean;

  login: (username: string, password: string) => string | null;
  logout: () => void;
  seedDemo: () => void;

  submitBooking: (form: BookingForm) => string;
  acceptOrder: (orderId: string, escortId: string) => void;
  patientArrive: (orderId: string, registrationTime: string) => void;

  // 阶段推进；返回非空字符串表示被规则拦截（如回诊需先经医生助理确认）
  advanceStage: (orderId: string) => string | null;
  setStageWait: (orderId: string, stageKey: StageKey, minutes: number) => void;
  addStageNote: (orderId: string, stageKey: StageKey, note: string) => void;

  // 材料
  toggleMaterial: (orderId: string, idx: number) => void;

  // 消息 / 状态同步
  postMessage: (orderId: string, text: string, from: Role, author: string, kind?: ChatMessage['kind']) => void;
  postStatusSync: (orderId: string, text: string) => void;

  // 异常
  raiseIncident: (orderId: string, type: IncidentType, detail: string) => void;
  resolveIncident: (orderId: string, incidentId: string, option: string) => void;

  // 家属授权
  decideAuthorization: (orderId: string, authId: string, approve: boolean, responder: string) => void;

  // 费用
  addFee: (orderId: string, label: string, amount: number, category: FeeItem['category']) => void;

  // 跨院区
  planCrossCampus: (orderId: string, trip: CrossCampusTrip) => void;
  updateCrossStatus: (orderId: string, status: CrossCampusTrip['status']) => void;

  // 换班
  handover: (orderId: string, toEscortId: string, reason: string, checklist: string) => void;
  acknowledgeHandover: (orderId: string) => void;

  // 情绪
  recordEmotion: (orderId: string, note: string) => void;

  // 检查单缺项
  markExamMissing: (orderId: string, examItemId: string, note: string) => void;
  clearExamMissing: (orderId: string, examItemId: string) => void;

  // 医生临时加开空腹项目（抽血/胃镜）
  raiseFastingAddon: (orderId: string, examId: string) => void;
  submitFastingCheck: (orderId: string, addonId: string, input: { mealDay: 'today' | 'yesterday' | 'earlier'; lastMealTime: string; riskNote: string }) => void;
  familyChooseAddonPlan: (orderId: string, addonId: string, planKey: 'wait' | 'reschedule' | 'othersFirst', responder: string) => void;
  confirmAddonAssistant: (orderId: string, addonId: string, note: string) => void;

  // 轮椅 / 平车院内转运协同
  createTransfer: (orderId: string, input: TransferInput) => string | null;
  updateTransferStatus: (orderId: string, transferId: string, status: TransferStatus) => string | null;
  requestTransferVolunteer: (orderId: string, transferId: string) => void;
  /** 服务台/志愿台确认卧位医梯（写入时段、来源、确认人），费用随之生效入账 */
  confirmTransferElevator: (orderId: string, transferId: string, input: { slot: string; confirmedBy: string }) => void;
  /** 取消医梯确认：回退为待确认，红冲已入账费用、同步家属；用于取消/路线调整 */
  releaseTransferElevator: (orderId: string, transferId: string, reason: string) => void;
  reorderForTransferCongestion: (orderId: string, transferId: string) => void;

  // 档案 / 完成
  archiveOrder: (orderId: string, archive: ServiceArchive) => void;
  rateOrder: (orderId: string, rating: number, tags: string[], comment: string) => void;
  cancelOrder: (orderId: string, reason: string) => void;

  resetAll: () => void;
}

function orderMsg(text: string, kind: ChatMessage['kind'] = 'system'): ChatMessage {
  return { id: uid('msg'), from: 'system', author: '系统', text, ts: nowISO(), kind };
}

function feeTotal(order: EscortOrder): number {
  return order.fees.reduce((s, f) => s + f.amount, 0);
}

// ============ 种子数据：一条已接单待到院 + 一条执行中（含异常/跨院区演示） ============
function seedOrders(): EscortOrder[] {
  const today = todayStr();

  // 订单 1：明日消化内科，空腹 + 轮椅，待接单/待到院演示接单流程
  const form1: BookingForm = {
    departmentId: 'digest',
    patientName: '刘桂芳',
    patientAge: 72,
    patientGender: '女',
    contactName: '张女士（儿媳）',
    contactPhone: '139-0000-8899',
    mobility: 'wheelchair',
    medicalHistory: '高血压 12 年、2 型糖尿病、去年胆囊切除术后复查',
    examSheetText: '生化全套、凝血、腹部彩超',
    examIds: ['blood-biochem', 'coag', 'us'],
    needWheelchair: true,
    fasting: true,
    demands: '老人第一次独自到总院，行动不便需全程轮椅推送；怕饿，抽完血请立即提醒吃早餐；家属中午前需要看到全部检查结果。',
    appointmentDate: today,
    preferredSlot: 'morning',
    crossCampusExpected: false,
  };
  const o1 = buildOrderSkeleton(form1, 'seed-o1', 'PE20260913001');
  o1.messages.push(orderMsg('预约已提交：系统已生成分时到院建议（07:20 到院）与材料清单，等待陪诊员接单。'));

  // 订单 2：今天呼吸科（东院），已接单+患者到院执行中，演示执行台/异常/家属同步
  const form2: BookingForm = {
    departmentId: 'resp',
    patientName: '赵德海',
    patientAge: 68,
    patientGender: '男',
    contactName: '赵先生（儿子，远程）',
    contactPhone: '137-0000-6677',
    mobility: 'slow',
    medicalHistory: '慢阻肺 5 年、长期吸烟史、去年肺炎住院',
    examSheetText: 'HRCT、肺功能、血常规',
    examIds: ['pulm-ct', 'pulm-test', 'blood-routine-east'],
    needWheelchair: false,
    fasting: false,
    demands: '儿子在外地远程跟进；老人耳背，需要陪诊员转述医嘱；检查结束后帮忙确认报告领取方式。',
    appointmentDate: today,
    preferredSlot: 'morning',
    crossCampusExpected: false,
  };
  const o2 = buildOrderSkeleton(form2, 'seed-o2', 'PE20260913002');
  o2.status = 'ongoing';
  o2.escortId = 'e01';
  o2.acceptedAt = nowISO();
  o2.arrivedAt = new Date(Date.now() - 95 * 60_000).toISOString();
  o2.registrationTime = '07:40';
  // 推进到缴费阶段：签到/候诊/问诊已完成
  (['signin', 'wait', 'consult'] as StageKey[]).forEach((k) => {
    const st = o2.stages.find((s) => s.key === k)!;
    st.status = 'done';
    st.startedAt = o2.arrivedAt;
    st.completedAt = new Date(Date.now() - 40 * 60_000).toISOString();
  });
  const payStage = o2.stages.find((s) => s.key === 'pay')!;
  payStage.status = 'active';
  payStage.startedAt = new Date(Date.now() - 10 * 60_000).toISOString();
  o2.activeStageIndex = o2.stages.findIndex((s) => s.key === 'pay');
  o2.messages.push(orderMsg('陪诊员李秀兰已接单，07:35 已在东院门诊门口接到患者。'));
  o2.messages.push(orderMsg('患者已到院并完成签到、候诊；08:35 医生问诊完毕，已开 HRCT、肺功能、血常规。'));
  o2.messages.push({
    id: uid('msg'), from: 'escort', author: '李秀兰',
    text: '【进度同步】当前在 1 层收费处排队（约 12 分钟）。赵叔状态平稳。血常规在东院即可做，HRCT 也在东院，预计无需跨院。',
    ts: new Date(Date.now() - 8 * 60_000).toISOString(), kind: 'status',
  });
  o2.messages.push({
    id: uid('msg'), from: 'family', author: '赵先生',
    text: '收到。费用明细麻烦拍照同步，我这边随时可以授权。',
    ts: new Date(Date.now() - 6 * 60_000).toISOString(), kind: 'chat',
  });
  // 一个进行中的异常：排队过长（HRCT），等待家属授权
  const tpl = INCIDENT_TEMPLATES.longQueue;
  const incident: Incident = {
    id: uid('inc'),
    type: 'longQueue',
    title: tpl.title,
    detail: '东院 HRCT 临时机器故障一台，当前排队约 90 分钟，可能拖到下午；总院同项目排队 55 分钟但需跨院区。',
    status: 'open',
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    options: tpl.options,
    feeDelta: tpl.feeDelta,
    feeReason: tpl.feeReason,
    needAuthorization: true,
  };
  o2.incidents.push(incident);
  const auth: AuthorizationRequest = {
    id: uid('auth'),
    incidentId: incident.id,
    title: tpl.authTitle!,
    detail: `选项：A 错峰先做肺功能/血常规再回来做 HRCT（不加收）；B 转总院 HRCT，跨院区陪诊+车费约加收 ${120 + 49} 元，报告互认；预计返院时间 11:40。`,
    feeDelta: 169,
    status: 'pending',
    createdAt: incident.createdAt,
  };
  o2.authorizations.push(auth);
  o2.messages.push(orderMsg('⚠ 发起异常处置【检查排队时间过长】，已向家属推送方案对比与远程授权请求。', 'auth'));

  // 订单 3：已完成归档，供档案/复诊提醒/质量评估演示
  const form3: BookingForm = {
    departmentId: 'cardio',
    patientName: '周文博',
    patientAge: 55,
    patientGender: '男',
    contactName: '周太太',
    contactPhone: '136-0000-5544',
    mobility: 'self',
    medicalHistory: '冠心病支架术后 2 年',
    examSheetText: '心电图、血常规',
    examIds: ['ecg', 'blood-routine'],
    needWheelchair: false,
    fasting: false,
    demands: '术后常规复查，需要医嘱解读与用药提醒',
    appointmentDate: today,
    preferredSlot: 'morning',
    crossCampusExpected: false,
  };
  const o3 = buildOrderSkeleton(form3, 'seed-o3', 'PE20260912009');
  o3.status = 'completed';
  o3.escortId = 'e01';
  o3.acceptedAt = nowISO();
  o3.arrivedAt = new Date(Date.now() - 26 * 3600_000).toISOString();
  o3.completedAt = new Date(Date.now() - 25 * 3600_000).toISOString();
  o3.registrationTime = '08:10';
  o3.stages.forEach((s) => { if (s.key !== 'done') { s.status = 'done'; } else { s.status = 'done'; s.completedAt = o3.completedAt; } });
  o3.archive = {
    diagnosis: '冠状动脉支架术后状态稳定；心电图未见新发缺血改变；轻度血脂异常。',
    medicationGuide: '阿司匹林肠溶片 100mg 每日一次（早餐后）；阿托伐他汀 20mg 每晚一次；注意有无牙龈出血/黑便，及时复诊。',
    revisitDate: (() => { const d = new Date(); d.setMonth(d.getMonth() + 3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(),
    invoiceHandled: true,
    invoiceNumber: 'INV20260912-88231',
    reportPickup: '电子报告：公众号「检验检查」中查询下载；纸质报告可于门诊 1 号楼 2 层自助打印机扫码打印（30 天内）',
    reportReadyAt: reportReadyText(o3),
    rating: 5,
    ratingTags: ['路线熟悉', '沟通及时', '主动同步进度', '费用透明'],
    ratingComment: '李姐对心内科路线非常熟，全程几乎没排队，医嘱逐条讲给我们听，非常安心。',
    archived: true,
  };

  return [o1, o2, o3];
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      session: null,
      orders: [],
      initialized: false,

      login: (username, password) => {
        // 账号定义在 data.ts DEMO_ACCOUNTS；为避免循环依赖直接内联校验
        const accounts: Record<string, { pwd: string; session: Session }> = {
          family: { pwd: '123456', session: { role: 'family', username: 'family' } },
          escort: { pwd: '123456', session: { role: 'escort', username: 'escort', escortId: 'e01' } },
          escort2: { pwd: '123456', session: { role: 'escort', username: 'escort2', escortId: 'e03' } },
          desk: { pwd: '123456', session: { role: 'desk', username: 'desk' } },
        };
        const acc = accounts[username.trim()];
        if (!acc || acc.pwd !== password) return '用户名或密码错误（演示账号见登录页）';
        set({ session: acc.session });
        return null;
      },
      logout: () => set({ session: null }),

      seedDemo: () => {
        if (get().orders.length === 0) {
          set({ orders: seedOrders(), initialized: true });
        } else {
          set({ initialized: true });
        }
      },

      submitBooking: (form) => {
        const id = uid('order');
        const code = `PE${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}${String(get().orders.length + 1).padStart(3, '0')}`;
        const order = buildOrderSkeleton(form, id, code);
        order.messages.push(orderMsg('预约已提交：系统已根据科室高峰、空腹要求、行动能力与检查排队生成分时到院建议与材料清单，等待陪诊员接单。'));
        set((s) => ({ orders: [order, ...s.orders] }));
        return id;
      },

      acceptOrder: (orderId, escortId) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId || o.status !== 'draft') return o;
            const escort = ESCORTS.find((e) => e.id === escortId)!;
            const next = {
              ...o,
              status: 'accepted' as const,
              escortId,
              acceptedAt: nowISO(),
              registrationTime: o.advice.registerTime,
            };
            next.messages = [...o.messages, orderMsg(`陪诊员${escort.name}（${escort.title}）已接单。请按建议时间 ${o.advice.arriveTime} 到院，陪诊员将提前 10 分钟在门诊正门无障碍坡道处等候。`)];
            return next;
          }),
        }));
      },

      patientArrive: (orderId, registrationTime) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId || (o.status !== 'accepted' && o.status !== 'draft')) return o;
            const next: EscortOrder = {
              ...o,
              status: 'ongoing',
              arrivedAt: nowISO(),
              registrationTime: registrationTime || o.advice.registerTime,
            };
            const first = next.stages.find((st) => st.status === 'pending');
            if (first) {
              first.status = 'active';
              first.startedAt = nowISO();
              next.activeStageIndex = next.stages.indexOf(first);
            }
            next.messages = [
              ...o.messages,
              orderMsg(`患者已到院（${registrationTime || o.advice.registerTime} 完成挂号），陪诊行程开始。系统按「签到→候诊→开单→缴费→抽血→影像→回诊→取药」引导现场执行。`),
            ];
            return next;
          }),
        }));
      },

      advanceStage: (orderId) => {
        let blocked: string | null = null;
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId || o.status !== 'ongoing') return o;
            const stages = o.stages.map((st) => ({ ...st }));
            const idx = stages.findIndex((st) => st.status === 'active');
            if (idx === -1) return o;
            // 空腹加项选了「改日检查」：当日回诊因加项报告未出，自动顺延跳过
            const deferredAddon = o.fastingAddons.find((a) => a.status === 'reschedule');
            // 下一个可进入环节
            const rawNext = stages.findIndex((st, i) => i > idx && st.status !== 'skipped');
            let nextIdx = rawNext;
            if (nextIdx !== -1 && stages[nextIdx].key === 'revisit' && deferredAddon) {
              stages[nextIdx].status = 'skipped';
              stages[nextIdx].note = `空腹加项（${deferredAddon.examName}）改约${deferredAddon.rescheduleDate ?? ''}，当日回诊顺延至报告出具后`;
              const after = stages.findIndex((st, i) => i > nextIdx && st.status !== 'skipped');
              nextIdx = after;
            }
            // 进入回诊前：若任一已选方案影响回诊且未经医生助理确认 → 拦截
            const impactedPending = o.fastingAddons.filter((a) => a.revisitImpacted && a.recomputed && !a.assistantConfirmed
              && (a.status === 'wait' || a.status === 'othersFirst'));
            if (nextIdx !== -1 && stages[nextIdx].key === 'revisit' && impactedPending.length > 0) {
              blocked = `回诊时间因空腹加项顺序调整而改变（${impactedPending.map((a) => a.recomputed!.revisitTime).join('、')}），请先在「空腹加项」中联系医生助理确认后，再进入回诊环节。`;
              return o;
            }
            stages[idx].status = 'done';
            stages[idx].completedAt = nowISO();
            if (nextIdx !== -1) {
              stages[nextIdx].status = 'active';
              stages[nextIdx].startedAt = nowISO();
            }
            const messages = [...o.messages, orderMsg(`【进度同步】已完成「${stages[idx].label}」${nextIdx !== -1 ? `，进入「${stages[nextIdx].label}」——${stages[nextIdx].location}` : '，全部行程环节已完成'}`, 'status')];
            return { ...o, stages, activeStageIndex: nextIdx === -1 ? stages.length - 1 : nextIdx, messages };
          }),
        }));
        return blocked;
      },

      setStageWait: (orderId, stageKey, minutes) => {
        set((s) => ({
          orders: s.orders.map((o) => o.id !== orderId ? o : {
            ...o,
            stages: o.stages.map((st) => st.key === stageKey ? { ...st, waitMinutes: minutes } : st),
          }),
        }));
      },

      addStageNote: (orderId, stageKey, note) => {
        set((s) => ({
          orders: s.orders.map((o) => o.id !== orderId ? o : {
            ...o,
            stages: o.stages.map((st) => st.key === stageKey ? { ...st, note } : st),
          }),
        }));
      },

      toggleMaterial: (orderId, idx) => {
        set((s) => ({
          orders: s.orders.map((o) => o.id !== orderId ? o : {
            ...o,
            materials: o.materials.map((m, i) => i === idx ? { ...m, prepared: !m.prepared } : m),
          }),
        }));
      },

      postMessage: (orderId, text, from, author, kind = 'chat') => {
        set((s) => ({
          orders: s.orders.map((o) => o.id !== orderId ? o : {
            ...o,
            messages: [...o.messages, { id: uid('msg'), from, author, text, ts: nowISO(), kind }],
          }),
        }));
      },

      postStatusSync: (orderId, text) => {
        const o = get().orders.find((x) => x.id === orderId);
        if (!o) return;
        const active = o.stages[o.activeStageIndex];
        const escort = ESCORTS.find((e) => e.id === o.escortId);
        const full = `【当前状态】${active?.label ?? '—'}（${active?.location ?? ''}）｜排队/等待约 ${active?.waitMinutes ?? '—'} 分钟｜累计费用 ${feeTotal(o).toFixed(0)} 元。${text}`;
        get().postMessage(orderId, full, 'escort', escort?.name ?? '陪诊员', 'status');
      },

      raiseIncident: (orderId, type, detail) => {
        const tpl = INCIDENT_TEMPLATES[type];
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId) return o;
            const incident: Incident = {
              id: uid('inc'), type, title: tpl.title, detail: detail || tpl.detailHint,
              status: 'open', createdAt: nowISO(), options: tpl.options,
              feeDelta: tpl.feeDelta, feeReason: tpl.feeReason, needAuthorization: tpl.needAuthorization,
            };
            const authorizations = [...o.authorizations];
            if (tpl.needAuthorization && tpl.authTitle) {
              authorizations.push({
                id: uid('auth'), incidentId: incident.id, title: tpl.authTitle,
                detail: `${tpl.title}。可选处置：${tpl.options.map((x, i) => `${String.fromCharCode(65 + i)}. ${x}`).join('；')}。费用说明：${tpl.feeReason}`,
                feeDelta: tpl.feeDelta, status: 'pending', createdAt: nowISO(),
              });
              incident.needAuthorization = true;
            }
            return {
              ...o,
              incidents: [incident, ...o.incidents],
              authorizations,
              messages: [...o.messages, orderMsg(`⚠ 陪诊员发起异常处置【${tpl.title}】：${detail || tpl.detailHint}${tpl.needAuthorization ? '。已向家属推送远程授权请求，请家属在「远程同步」中确认。' : '，陪诊员将按规范处置并同步结果。'}`, tpl.needAuthorization ? 'auth' : 'status')],
            };
          }),
        }));
      },

      resolveIncident: (orderId, incidentId, option) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId) return o;
            const inc = o.incidents.find((i) => i.id === incidentId);
            if (!inc) return o;
            // 若需要授权，等待家属决定；授权通过后才允许落实（UI 控制），此处记录选择
            return {
              ...o,
              incidents: o.incidents.map((i) => i.id === incidentId ? { ...i, chosenOption: option, status: i.needAuthorization && !i.authorized ? 'open' : 'resolved', resolvedAt: i.needAuthorization && !i.authorized ? undefined : nowISO() } : i),
              messages: [...o.messages, orderMsg(`【异常处置】「${inc.title}」选定方案：${option}${inc.needAuthorization && !inc.authorized ? '。方案已记录，待家属远程授权后执行。' : '，已现场执行。'}${inc.feeDelta ? ` 费用变化：${inc.feeDelta > 0 ? '+' : ''}${inc.feeDelta} 元（${inc.feeReason}）` : ''}`, inc.feeDelta ? 'fee' : 'status')],
            };
          }),
        }));
      },

      decideAuthorization: (orderId, authId, approve, responder) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId) return o;
            const auth = o.authorizations.find((a) => a.id === authId);
            if (!auth || auth.status !== 'pending') return o;
            const decidedAt = nowISO();
            let fees = o.fees;
            let incidents = o.incidents;
            if (approve && auth.feeDelta > 0) {
              fees = [...o.fees, { id: uid('fee'), label: `异常处置加收（${auth.title}）`, amount: auth.feeDelta, at: decidedAt, category: auth.feeDelta >= 100 && auth.title.includes('跨院') ? 'transport' : 'other' }];
            }
            if (approve && auth.feeDelta < 0) {
              fees = [...o.fees, { id: uid('fee'), label: `停诊/改约退费（${auth.title}）`, amount: auth.feeDelta, at: decidedAt, category: 'escort' }];
            }
            if (approve) {
              incidents = o.incidents.map((i) => (auth.incidentId && i.id === auth.incidentId && i.status === 'open')
                ? { ...i, authorized: true, authorizedBy: responder, authorizedAt: decidedAt, status: 'resolved' as const, resolvedAt: decidedAt }
                : i);
            }
            return {
              ...o,
              fees,
              incidents,
              authorizations: o.authorizations.map((a) => a.id === authId ? { ...a, status: approve ? 'approved' : 'rejected', decidedAt, responder } : a),
              messages: [...o.messages, orderMsg(approve
                ? `✅ 家属${responder}已远程授权：${auth.title}。${auth.feeDelta ? `费用变化 ${auth.feeDelta > 0 ? '+' : ''}${auth.feeDelta} 元，` : ''}陪诊员可立即执行该方案。`
                : `❌ 家属${responder}未同意：${auth.title}。陪诊员将改用备选方案并继续同步。`, approve ? 'auth' : 'status')],
            };
          }),
        }));
      },

      addFee: (orderId, label, amount, category) => {
        set((s) => ({
          orders: s.orders.map((o) => o.id !== orderId ? o : {
            ...o,
            fees: [...o.fees, { id: uid('fee'), label, amount, at: nowISO(), category }],
            messages: [...o.messages, orderMsg(`【费用同步】新增：${label}，${amount} 元。累计 ${(feeTotal(o) + amount).toFixed(0)} 元。`, 'fee')],
          }),
        }));
      },

      planCrossCampus: (orderId, trip) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId) return o;
            const campus = CAMPUSES.find((c) => c.id === trip.targetCampusId)!;
            const fees: FeeItem[] = [...o.fees];
            if (trip.transportFee > 0) fees.push({ id: uid('fee'), label: `跨院区交通费（${campus.name}）`, amount: trip.transportFee, at: nowISO(), category: 'transport' });
            fees.push({ id: uid('fee'), label: '跨院区陪诊加收', amount: trip.extraEscortFee, at: nowISO(), category: 'escort' });
            return {
              ...o,
              crossCampus: trip,
              fees,
              messages: [...o.messages, orderMsg(`【跨院区行程】${trip.examNames.join('、')} 将前往${campus.name}完成；交通：${({ ambulance: '救护转运车', taxi: '出租车', hospitalShuttle: '医院班车', walk: '步行' })[trip.transport]}；报告两院互认不重复收费；预计发车 ${trip.departTime}，预计返院 ${trip.expectedReturnTime}。交通费 ${trip.transportFee} 元 + 跨区陪诊 ${trip.extraEscortFee} 元已计入。`, 'fee')],
            };
          }),
        }));
      },

      updateCrossStatus: (orderId, status) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId || !o.crossCampus) return o;
            const label = { planned: '已规划', enroute: '已出发前往', checking: '正在检查', returned: '已返回' }[status];
            const patch: Partial<EscortOrder> = {
              crossCampus: { ...o.crossCampus, status, actualReturnTime: status === 'returned' ? nowISO() : o.crossCampus.actualReturnTime },
            };
            return { ...o, ...patch, messages: [...o.messages, orderMsg(`【跨院区同步】${label}${CAMPUSES.find((c) => c.id === o.crossCampus!.targetCampusId)?.name ?? ''}${status === 'returned' ? '，行程重新接回总院流程' : ''}`, 'status')] };
          }),
        }));
      },

      handover: (orderId, toEscortId, reason, checklist) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId || !o.escortId) return o;
            const to = ESCORTS.find((e) => e.id === toEscortId)!;
            const handover = {
              fromEscortId: o.escortId, toEscortId, time: nowISO(), reason, checklist,
              acknowledgedByFamily: false,
            };
            return {
              ...o,
              escortId: toEscortId,
              handover,
              messages: [...o.messages, orderMsg(`【陪诊员换班】${ESCORTS.find((e) => e.id === handover.fromEscortId)?.name} → ${to.name}（${to.shift}）。原因：${reason}。交接事项：${checklist}。请家属确认知悉。`, 'auth')],
            };
          }),
        }));
      },

      acknowledgeHandover: (orderId) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId || !o.handover) return o;
            return {
              ...o,
              handover: { ...o.handover, acknowledgedByFamily: true },
              messages: [...o.messages, orderMsg('家属已知悉并确认陪诊员换班安排，服务不中断。')],
            };
          }),
        }));
      },

      recordEmotion: (orderId, note) => {
        set((s) => ({
          orders: s.orders.map((o) => o.id !== orderId ? o : {
            ...o,
            emotionNote: `${o.emotionNote ? o.emotionNote + '\n' : ''}[${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}] ${note}`,
            messages: [...o.messages, orderMsg(`【情绪安抚记录】${note}`, 'status')],
          }),
        }));
      },

      markExamMissing: (orderId, examItemId, note) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId) return o;
            const item = o.exams.find((x) => x.id === examItemId);
            // 缺项异常 + 补单授权
            const tpl = INCIDENT_TEMPLATES.missingItem;
            const inc: Incident = {
              id: uid('inc'), type: 'missingItem', title: tpl.title,
              detail: `检查单缺项：${item?.name ?? '未知项目'}。${note}`, status: 'open', createdAt: nowISO(),
              options: tpl.options, feeDelta: tpl.feeDelta, feeReason: tpl.feeReason, needAuthorization: true,
            };
            const auth: AuthorizationRequest = {
              id: uid('auth'), incidentId: inc.id, title: tpl.authTitle!,
              detail: `检验科/影像科退回：医生漏开「${item?.name ?? ''}」，需补单补缴 ${tpl.feeDelta} 元（医院定价）后才能检查。是否授权陪诊员代办补单缴费？`,
              feeDelta: tpl.feeDelta, status: 'pending', createdAt: nowISO(),
            };
            return {
              ...o,
              exams: o.exams.map((x) => x.id === examItemId ? { ...x, missing: true, note } : x),
              incidents: [inc, ...o.incidents],
              authorizations: [...o.authorizations, auth],
              messages: [...o.messages, orderMsg(`⚠ 检查单缺项：${item?.name}，已发起补单授权（补缴 ${tpl.feeDelta} 元）。`, 'auth')],
            };
          }),
        }));
      },

      clearExamMissing: (orderId, examItemId) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId) return o;
            const item = o.exams.find((x) => x.id === examItemId);
            return {
              ...o,
              exams: o.exams.map((x) => x.id === examItemId ? { ...x, missing: false, note: '医生已补单并完成缴费' } : x),
              messages: [...o.messages, orderMsg(`检查单缺项已闭环：${item?.name} 已由医生补开、补缴完成，可正常检查。`, 'status')],
            };
          }),
        }));
      },

      // —— 医生临时加开空腹抽血 / 胃镜 ——
      raiseFastingAddon: (orderId, examId) => {
        const conflict = createFastingAddon(examId);
        const def = ADDON_EXAMS.find((x) => x.id === examId)!;
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId) return o;
            // 同一加项未闭环时不重复发起
            if (o.fastingAddons.some((a) => a.examId === examId && ['checking', 'awaitingFamily'].includes(a.status))) return o;
            const exams = [...o.exams, { id: uid('exam'), examId, name: def.name, ordered: true, note: '医生临时加开（空腹）' }];
            return {
              ...o,
              fastingAddons: [conflict, ...o.fastingAddons],
              exams,
              messages: [...o.messages, orderMsg(`🍚 医生临时加开【${def.name}】（要求禁食 ${def.fastingHoursRequired} 小时）。陪诊员需立即核查患者是否已进食、当日检查顺序与可改约时间，并向家属同步方案。`, 'auth')],
            };
          }),
        }));
      },

      submitFastingCheck: (orderId, addonId, input) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId) return o;
            const addon = o.fastingAddons.find((a) => a.id === addonId);
            if (!addon) return o;
            // 系统盖戳：以服务端时钟为唯一事实源构建核查结论（陪诊员不能手填空腹时长）
            const check = buildFastingCheck(input);
            if (!check.valid) {
              return {
                ...o,
                messages: [...o.messages, orderMsg(`🍚 空腹核查被拒绝：末次进食时间「${input.lastMealTime}」无效，请重新选择末次进食日期与钟点。`, 'status')],
              };
            }
            const plans = buildAddonPlans(o, addonId, check);
            const def = ADDON_EXAMS.find((x) => x.id === addon.examId)!;
            const anyImpacted = plans.some((p) => p.feasible && p.revisitImpacted);
            const waitPlan = plans.find((p) => p.key === 'wait');
            const eating = `患者末次进食${check.mealDay === 'yesterday' ? '昨日' : check.mealDay === 'earlier' ? '前天或更早' : '今日'} ${check.lastMealTime}，按系统盖戳时间计算已空腹 ${check.fastingHours} 小时（要求 ${def.fastingHoursRequired} 小时）`;
            const feasible = plans.filter((p) => p.feasible).map((p) => p.title).join('；');
            return {
              ...o,
              fastingAddons: o.fastingAddons.map((a) => a.id === addonId
                ? { ...a, check, plans, status: 'awaitingFamily' as const, revisitImpacted: anyImpacted, planWait: plans[0]?.text ?? '', planReschedule: plans[1]?.text ?? '', planOthersFirst: plans[2]?.text ?? '' }
                : a),
              messages: [
                ...o.messages,
                ...(check.adjusted ? [orderMsg(`🍚 时间自动修正：${check.adjustedReason}`, 'status')] : []),
                orderMsg(`🍚 空腹加项核查完成（系统盖戳 ${new Date(check.checkedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}）：${eating}。${check.riskNote ? `风险：${check.riskNote}。` : ''}${waitPlan && !waitPlan.feasible ? `「继续等待」不可行（未达 ${def.fastingHoursRequired} 小时）；` : ''}可行方案：${feasible}。请家属在「空腹加项处置」中选择；三方案的缴费、取号、回诊时间均由同一核查结论整体重算。`, 'auth')],
            };
          }),
        }));
      },

      familyChooseAddonPlan: (orderId, addonId, planKey, responder) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId) return o;
            const addon = o.fastingAddons.find((a) => a.id === addonId);
            if (!addon || !addon.plans) return o;
            const plan = addon.plans.find((p) => p.key === planKey);
            if (!plan || !plan.feasible) return o;
            const now = new Date();
            const todayMd = `${now.getMonth() + 1}月${now.getDate()}日`;
            // 只把当日票写回环节；改约票留在方案卡片
            let stages = o.stages.map((st) => {
              const tk = plan.schedule.tickets.find((t) => t.stageKey === st.key && t.callTime.startsWith(todayMd));
              return tk ? { ...st, ticketNo: tk.ticketNo, callTime: tk.callTime, waitMinutes: tk.waitMinutes, note: tk.note ?? st.note } : st;
            });
            let activeStageIndex = o.activeStageIndex;
            // 改日检查：当日回诊因加项报告未出而顺延（无论回诊当前是待办还是已激活）
            if (planKey === 'reschedule') {
              const revIdx = stages.findIndex((st) => st.key === 'revisit');
              if (revIdx !== -1 && stages[revIdx].status !== 'done' && stages[revIdx].status !== 'skipped') {
                stages = stages.map((st) => st.key === 'revisit'
                  ? {
                    ...st,
                    status: 'skipped' as const,
                    note: `空腹加项（${addon.examName}）改约${plan.rescheduleDate ?? addon.rescheduleOptions[0]}，当日回诊顺延至报告出具后（重算：${plan.schedule.revisitTime}）`,
                    ticketNo: undefined,
                    callTime: plan.schedule.revisitTime,
                  }
                  : st);
                if (activeStageIndex === revIdx) {
                  const nextIdx = stages.findIndex((st, i) => i > revIdx && st.status !== 'skipped');
                  if (nextIdx !== -1) {
                    stages[nextIdx] = { ...stages[nextIdx], status: 'active' as const, startedAt: nowISO() };
                    activeStageIndex = nextIdx;
                  }
                }
              }
            }
            const fees = [...o.fees];
            plan.schedule.extraFees.forEach((f) => {
              fees.push({ id: uid('fee'), label: f.label, amount: f.amount, at: nowISO(), category: f.label.includes('陪诊') ? 'escort' : 'exam' });
            });
            const statusMap = { wait: 'wait' as const, reschedule: 'reschedule' as const, othersFirst: 'othersFirst' as const };
            const chosenTitle = { wait: '继续等待·今日空腹优先', reschedule: '改日检查', othersFirst: '先完成其他项目' }[planKey];
            const resolvedRescheduleDate = planKey === 'reschedule'
              ? (plan.rescheduleDate ?? addon.rescheduleOptions[0])
              : planKey === 'othersFirst' ? (plan.rescheduleDate ?? addon.rescheduleDate) : undefined;
            return {
              ...o,
              stages,
              activeStageIndex,
              fees,
              fastingAddons: o.fastingAddons.map((a) => a.id === addonId
                ? { ...a, chosenPlan: planKey, decidedBy: responder, decidedAt: now.toISOString(), status: statusMap[planKey], recomputed: plan.schedule, rescheduleDate: resolvedRescheduleDate }
                : a),
              messages: [
                ...o.messages,
                orderMsg(`🍚 家属${responder}已选择方案【${chosenTitle}】。缴费/取号/回诊已按新顺序整体重算：${plan.schedule.note}`, 'auth'),
                ...(plan.feeDelta > 0 ? [orderMsg(`【费用同步】空腹加项方案新增费用合计 ${plan.feeDelta} 元，已计入费用清单。`, 'fee')] : []),
                ...(planKey === 'reschedule'
                  ? [orderMsg(`当日回诊已自动顺延至 ${plan.schedule.revisitTime}（改约 ${resolvedRescheduleDate}），改约前一日陪诊员电话提醒禁食。`, 'status')]
                  : plan.revisitImpacted
                    ? [orderMsg(`⚠ 回诊时间受到影响（${plan.schedule.originalRevisitTime} → ${plan.schedule.revisitTime}）。系统已锁定「进入回诊」：陪诊员必须先联系医生助理确认新回诊时段，家属与患者方可前往诊室。`, 'auth')]
                    : [orderMsg(`回诊时间 ${plan.schedule.revisitTime} 与原计划一致，无需医生助理改约。`, 'status')]),
              ],
            };
          }),
        }));
      },

      confirmAddonAssistant: (orderId, addonId, note) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId) return o;
            const addon = o.fastingAddons.find((a) => a.id === addonId);
            if (!addon || !addon.recomputed) return o;
            return {
              ...o,
              fastingAddons: o.fastingAddons.map((a) => a.id === addonId
                ? { ...a, assistantConfirmed: true, assistantNote: note }
                : a),
              messages: [...o.messages, orderMsg(`✅ 陪诊员已联系医生助理确认：新回诊时间 ${addon.recomputed.revisitTime}（${note || '号源已锁定'}）。回诊环节解锁，可按重算后的取号票继续执行。`, 'auth')],
            };
          }),
        }));
      },

      // —— 轮椅 / 平车院内转运协同 ——
      createTransfer: (orderId, input) => {
        let t: ReturnType<typeof buildTransfer>;
        try {
          t = buildTransfer(input); // 路线库缺失/跨院区时在此抛错
        } catch (e) {
          // 绝不回退到其他院区路线：不写转运记录、不写家属提示、不写押金与费用
          const message = e instanceof Error ? e.message : '转运路线配置缺失';
          set((s) => ({
            orders: s.orders.map((o) => o.id !== orderId ? o : {
              ...o,
              messages: [...o.messages, orderMsg(`♿ 转运创建已阻止：${message}`, 'status')],
            }),
          }));
          return message;
        }
        const campusLabel = t.campusId === 'east' ? '东院' : '总院';
        const servicePhone = t.campusId === 'east' ? '8101（东院志愿服务台）' : '8001（总院志愿服务台）';
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId) return o;
            // 费用：轮椅（无需医梯确认）创建即生效；卧位平车待医梯确认后才入账
            const fees = [...o.fees];
            const committedFeeIds: string[] = [];
            if (t.feeCommitted) {
              if (t.rentalFee > 0) { const f = { id: uid('fee'), label: `${t.mode === 'stretcher' ? '医用平车' : '轮椅'}租借费（${t.purpose}）`, amount: t.rentalFee, at: nowISO(), category: 'other' as const }; fees.push(f); committedFeeIds.push(f.id); }
              if (t.transportFee > 0) { const f = { id: uid('fee'), label: `平车转运服务费（${t.purpose}）`, amount: t.transportFee, at: nowISO(), category: 'other' as const }; fees.push(f); committedFeeIds.push(f.id); }
            }
            t.committedFeeIds = committedFeeIds;
            const feeMsgs: ChatMessage[] = [];
            if (t.deposit > 0) feeMsgs.push(orderMsg(`♿ 转运押金：${t.mode === 'stretcher' ? '平车' : '轮椅'}押金 ${t.deposit} 元（归还后原路退回，非消费，不计入应缴）。`, 'fee'));
            if (t.elevator.required && t.elevator.state === 'needed') {
              feeMsgs.push(orderMsg(`🛗 卧位平车医梯资源待确认：已生成${campusLabel}医梯需求（${t.elevator.elevatorName}，${t.elevator.elevatorLocation}，${t.elevator.recommendedSlot}）。请联系${servicePhone}确认时段与检查位；**确认前医梯为待落实状态、平车租借/转运费暂不入账、不可开始转运**。`, 'auth'));
            }
            if (t.feeCommitted && transferFeeTotal(t) > 0) {
              feeMsgs.push(orderMsg(`【费用同步】转运费用：${t.rentalFee ? `租借 ${t.rentalFee} 元` : ''}${t.transportFee ? `转运服务 ${t.transportFee} 元` : ''}，合计实缴 ${transferFeeTotal(t)} 元，已计入费用清单。`, 'fee'));
            } else if (t.elevator.required) {
              feeMsgs.push(orderMsg(`【费用预提示】平车租借 ${t.rentalFee} 元 + 转运服务 ${t.transportFee} 元待医梯确认后入账（未确认前不计入应缴）。`, 'fee'));
            }
            return {
              ...o,
              transfers: [t, ...o.transfers],
              fees,
              messages: [
                ...o.messages,
                orderMsg(`♿ 已生成${campusLabel}转运方案【${t.purpose}】${t.fromLocation} → ${t.toLocation}（${t.mode === 'wheelchair' ? '轮椅' : t.mode === 'stretcher' ? '医用平车' : '搀扶步行'}），预计耗时 ${t.segments[0].estimatedMinutes} 分钟、距离 ${t.segments[0].distanceMeters} 米。${t.needSupine ? '卧位患者已自动切换平车，医梯资源待确认（非已预约）；' : ''}${t.note}`, 'status'),
                ...feeMsgs,
                ...(t.congestionAction === 'volunteer' ? [orderMsg(`⚠ 检测到该路线拥堵：建议提前联系${servicePhone}安排接应，或调整检查顺序错峰。`, 'auth')] : []),
              ],
            };
          }),
        }));
        return null;
      },

      updateTransferStatus: (orderId, transferId, status) => {
        // 卧位医梯未确认前，禁止进入转运途中
        const cur = get().orders.find((o) => o.id === orderId)?.transfers.find((x) => x.id === transferId);
        if (!cur) return '转运记录不存在';
        if (status === 'enroute' && cur.elevator.required && cur.elevator.state !== 'confirmed') {
          return `医梯资源尚未确认（${cur.elevator.elevatorName}），请先由 ${cur.campusId === 'east' ? '东院 8101' : '总院 8001'} 确认预约时段后再开始转运`;
        }
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId) return o;
            const labelMap: Record<TransferStatus, string> = {
              planned: '已规划', elevatorPending: '医梯待确认', elevatorConfirmed: '医梯已确认', volunteerRequested: '已呼叫志愿者', enroute: '转运途中', arrived: '已到达检查点', cancelled: '已取消',
            };
            return {
              ...o,
              transfers: o.transfers.map((t) => t.id === transferId ? { ...t, status } : t),
              messages: [...o.messages, orderMsg(`♿ 转运状态更新：${labelMap[status]}。`, 'status')],
            };
          }),
        }));
        return null;
      },

      requestTransferVolunteer: (orderId, transferId) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId) return o;
            const target = o.transfers.find((t) => t.id === transferId);
            if (!target) return o;
            // 志愿服务台必须与转运记录同一院区，杜绝东院订单误报总院 8001
            const phone = target.campusId === 'east' ? '8101（东院志愿服务台）' : '8001（总院志愿服务台）';
            const building = target.campusId === 'east' ? '东院医技楼' : '影像楼';
            return {
              ...o,
              transfers: o.transfers.map((t) => t.id === transferId ? { ...t, volunteerRequested: true, status: t.status === 'planned' || t.status === 'elevatorConfirmed' ? 'volunteerRequested' : t.status } : t),
              messages: [...o.messages, orderMsg(`📞 已联系${phone}：请求志愿者在${building}端接应${target.elevator.required ? '并协助医梯' : ''}，预计 5 分钟到位；已同步家属。`, 'auth')],
            };
          }),
        }));
      },

      // 服务台/志愿台确认卧位医梯：写入时段/来源/确认人，费用生效入账，状态变可转运
      confirmTransferElevator: (orderId, transferId, input) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId) return o;
            const target = o.transfers.find((t) => t.id === transferId);
            if (!target || !target.elevator.required) return o;
            const source = target.campusId === 'east' ? '东院志愿服务台 8101' : '总院志愿服务台 8001';
            const elevator = {
              ...target.elevator,
              state: 'confirmed' as const,
              confirmedSlot: input.slot,
              confirmedSource: source,
              confirmedBy: input.confirmedBy,
              confirmedAt: nowISO(),
              releasedReason: undefined,
            };
            // 费用在确认时才入账
            const fees = [...o.fees];
            const ids: string[] = [];
            if (target.rentalFee > 0) { const f = { id: uid('fee'), label: `医用平车租借费（${target.purpose}）`, amount: target.rentalFee, at: nowISO(), category: 'other' as const }; fees.push(f); ids.push(f.id); }
            if (target.transportFee > 0) { const f = { id: uid('fee'), label: `平车转运服务费（${target.purpose}）`, amount: target.transportFee, at: nowISO(), category: 'other' as const }; fees.push(f); ids.push(f.id); }
            return {
              ...o,
              fees,
              transfers: o.transfers.map((t) => t.id === transferId
                ? { ...t, elevator, status: 'elevatorConfirmed' as const, feeCommitted: true, committedFeeIds: [...t.committedFeeIds, ...ids] }
                : t),
              messages: [
                ...o.messages,
                orderMsg(`🛗 ${source}已确认${target.campusId === 'east' ? '东院' : '总院'}医梯：${target.elevator.elevatorName}（${target.elevator.elevatorLocation}），预约时段「${input.slot}」，确认人 ${input.confirmedBy}。平车租借/转运费已生效入账，现可按该资源开始转运。`, 'auth'),
                orderMsg(`【费用同步】平车租借 ${target.rentalFee} 元 + 转运服务 ${target.transportFee} 元，合计 ${transferFeeTotal(target)} 元已计入费用清单。`, 'fee'),
              ],
            };
          }),
        }));
      },

      // 取消确认/路线调整：医梯回退为待确认，红冲已入账费用，家属同步
      releaseTransferElevator: (orderId, transferId, reason) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId) return o;
            const target = o.transfers.find((t) => t.id === transferId);
            if (!target || !target.elevator.required) return o;
            const wasConfirmed = target.elevator.state === 'confirmed';
            const source = target.campusId === 'east' ? '东院志愿服务台 8101' : '总院志愿服务台 8001';
            const elevator = {
              ...target.elevator,
              state: 'needed' as const,
              confirmedSlot: undefined,
              confirmedSource: undefined,
              confirmedBy: undefined,
              confirmedAt: undefined,
              releasedReason: reason,
            };
            // 红冲此前因确认而入账的费用（负数冲正）
            const fees = [...o.fees];
            const committedSet = new Set(target.committedFeeIds);
            const reversalFees: FeeItem[] = [];
            if (wasConfirmed) {
              o.fees.filter((f) => committedSet.has(f.id)).forEach((f) => {
                reversalFees.push({ id: uid('fee'), label: `红冲-${f.label}（医梯确认取消：${reason}）`, amount: -f.amount, at: nowISO(), category: 'other' });
              });
            }
            const resetStatus: TransferStatus = target.status === 'arrived' || target.status === 'enroute'
              ? target.status // 已在途/到达的不因资源取消倒改主状态
              : 'elevatorPending';
            return {
              ...o,
              fees: [...fees, ...reversalFees],
              transfers: o.transfers.map((t) => t.id === transferId
                ? { ...t, elevator, status: resetStatus, feeCommitted: false, committedFeeIds: [] }
                : t),
              messages: [
                ...o.messages,
                orderMsg(`🛗 ${source}医梯确认已取消/失效：${target.elevator.elevatorName}，原因「${reason}」。原预约时段、确认人与家属提示一并作废，恢复为待确认；请重新联系确认或调整路线，未重新确认前不可开始转运。`, 'auth'),
                ...(reversalFees.length ? [orderMsg(`【费用红冲】已撤销该转运平车费用 ${Math.abs(reversalFees.reduce((x, f) => x + f.amount, 0))} 元，费用清单已回退；重新确认后再入账。`, 'fee')] : []),
              ],
            };
          }),
        }));
      },

      reorderForTransferCongestion: (orderId, transferId) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId) return o;
            const t = o.transfers.find((x) => x.id === transferId);
            if (!t) return o;
            // 拥堵改序：把影像类环节排队时长按错峰下调，并写入提示
            const stages = o.stages.map((st) => (st.key === 'image' && st.waitMinutes && st.waitMinutes > 30)
              ? { ...st, waitMinutes: Math.round(st.waitMinutes * 0.6), note: `路线/检查厅拥堵，已调整顺序错峰（10:30 后），排队由原预估下调至 ${Math.round(st.waitMinutes * 0.6)} 分钟；转运方案：${t.purpose}` }
              : st);
            return {
              ...o,
              stages,
              transfers: o.transfers.map((x) => x.id === transferId ? { ...x, congestionAction: 'reorder' as const, note: x.note + ' 【已调整检查顺序错峰】' } : x),
              messages: [
                ...o.messages,
                orderMsg('🔀 因转运路线拥堵，已与检查科室沟通把影像项目调整到 10:30 后错峰时段，并相应重排取号顺序；陪诊员先陪患者完成同楼层/近距离项目。', 'auth'),
                ...(t.elevator.required && t.elevator.state === 'confirmed'
                  ? [orderMsg(`🛗 检查时段错峰，原医梯预约「${t.elevator.confirmedSlot}」（${t.elevator.confirmedBy}）请向 ${t.campusId === 'east' ? '东院 8101' : '总院 8001'} 复核是否仍适用；若资源变更需取消原确认后重新确认。`, 'status')]
                  : []),
              ],
            };
          }),
        }));
      },

      archiveOrder: (orderId, archive) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId) return o;
            const stages = o.stages.map((st) => st.status === 'skipped' ? st : { ...st, status: 'done' as const, completedAt: st.completedAt ?? nowISO() });
            const done = stages.find((st) => st.key === 'done');
            if (done) { done.status = 'done'; done.completedAt = nowISO(); }
            return {
              ...o,
              status: 'completed' as const,
              completedAt: nowISO(),
              stages,
              archive,
              messages: [...o.messages, orderMsg(`【服务归档】诊断、用药说明、复查时间（${archive.revisitDate}）、发票与报告领取方式、陪诊评价已进入本次服务档案，将用于复诊提醒与陪诊服务质量评估。`, 'report')],
            };
          }),
        }));
      },

      cancelOrder: (orderId, reason) => {
        set((s) => ({
          orders: s.orders.map((o) => o.id !== orderId ? o : {
            ...o, status: 'cancelled', cancelReason: reason,
            messages: [...o.messages, orderMsg(`订单已取消：${reason}`)],
          }),
        }));
      },

      rateOrder: (orderId, rating, tags, comment) => {
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== orderId || !o.archive) return o;
            const archive: ServiceArchive = { ...o.archive, rating, ratingTags: tags, ratingComment: comment };
            return {
              ...o,
              archive,
              messages: [...o.messages, orderMsg(`【陪诊评价】家属给出 ${rating} 星评价${tags.length ? `（${tags.join('、')}）` : ''}，已计入陪诊员服务质量评估。`, 'report')],
            };
          }),
        }));
      },

      resetAll: () => set({ orders: seedOrders(), initialized: true }),
    }),
    {
      // v4：卧位医梯需求与确认分离（旧结构不兼容，换 key 重新播种）
      name: 'warm-sun-escort-v4',
      version: 4,
      onRehydrateStorage: () => (state) => {
        if (state && state.orders.length === 0) state.orders = seedOrders();
        if (state) state.initialized = true;
      },
    },
  ),
);

export { feeTotal };
