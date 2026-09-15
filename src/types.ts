// ============ 领域类型定义 ============

export type Role = 'family' | 'escort' | 'desk';

export type OrderStatus =
  | 'draft' // 已提交预约，等待接单
  | 'accepted' // 陪诊员已接单
  | 'ongoing' // 患者到院，行程执行中
  | 'completed' // 就诊结束，档案已归档
  | 'cancelled'; // 取消（如停诊改约）

/** 行动能力 */
export type MobilityLevel = 'self' | 'slow' | 'cane' | 'wheelchair' | 'bedridden';

/** 行程阶段（患者到院后的实际进度） */
export type StageKey =
  | 'signin' // 签到
  | 'wait' // 候诊
  | 'consult' // 医生问诊开单
  | 'pay' // 缴费
  | 'blood' // 抽血
  | 'image' // 影像检查
  | 'revisit' // 回诊
  | 'pharmacy' // 取药
  | 'done'; // 结束

/** 异常事件类型：空腹 / 排队过长 / 行动不便 / 医生停诊 / 检查单缺项 / 家属追问 */
export type IncidentType =
  | 'fasting'
  | 'longQueue'
  | 'mobility'
  | 'doctorStop'
  | 'missingItem'
  | 'familyAsk'
  | 'crossCampus'
  | 'shiftChange'
  | 'emotion'
  | 'custom';

export type IncidentStatus = 'open' | 'resolved';

export interface Incident {
  id: string;
  type: IncidentType;
  title: string;
  detail: string;
  status: IncidentStatus;
  createdAt: string; // ISO
  resolvedAt?: string;
  /** 处置选项（陪诊员选择后同步家属） */
  options: string[];
  chosenOption?: string;
  /** 该异常引发的费用变化（元） */
  feeDelta: number;
  feeReason?: string;
  /** 需要家属远程授权 */
  needAuthorization: boolean;
  authorized?: boolean;
  authorizedBy?: string;
  authorizedAt?: string;
}

export interface ChatMessage {
  id: string;
  from: Role | 'system';
  author: string;
  text: string;
  ts: string; // ISO
  kind: 'chat' | 'status' | 'fee' | 'auth' | 'report' | 'system';
}

/** 检查单条目 */
export interface ExamOrderItem {
  id: string;
  examId: string; // 对应 exam catalog
  name: string;
  /** 是否已缴费/已执行等状态在 stage log 体现，这里记录是否医生已开 */
  ordered: boolean;
  /** 缺项标记：现场发现检查单缺少必要项 */
  missing?: boolean;
  note?: string;
}

/** 跨院区检查 */
export interface CrossCampusTrip {
  targetCampusId: string;
  examNames: string[];
  transport: 'ambulance' | 'taxi' | 'hospitalShuttle' | 'walk';
  transportFee: number;
  reportMutualRecognized: boolean; // 报告互认
  departTime?: string;
  expectedReturnTime?: string; // 预计返院时间
  actualReturnTime?: string;
  extraEscortFee: number;
  status: 'planned' | 'enroute' | 'checking' | 'returned';
  note: string;
}

/** 陪诊员换班 */
export interface ShiftHandover {
  fromEscortId: string;
  toEscortId: string;
  time: string;
  reason: string;
  acknowledgedByFamily: boolean;
  checklist: string; // 交接事项
}

export interface StageState {
  key: StageKey;
  label: string;
  status: 'pending' | 'active' | 'done' | 'skipped';
  location: string; // 楼栋/楼层/房间
  startedAt?: string;
  completedAt?: string;
  waitMinutes?: number; // 可能的排队时长
  /** 顺序调整后重算的取号票号 / 呼叫时间 */
  ticketNo?: string;
  callTime?: string;
  note?: string;
}

export interface FeeItem {
  id: string;
  label: string;
  amount: number;
  at: string;
  category: 'registration' | 'exam' | 'medicine' | 'transport' | 'escort' | 'other';
}

export interface ServiceArchive {
  diagnosis: string; // 诊断结果
  medicationGuide: string; // 用药说明
  revisitDate: string; // 复查时间
  invoiceHandled: boolean; // 发票
  invoiceNumber?: string;
  reportPickup: string; // 检查报告领取方式
  reportReadyAt: string; // 报告出具时间
  rating: number; // 1-5
  ratingTags: string[];
  ratingComment: string;
  archived: boolean;
}

/** 家属远程授权项 */
export interface AuthorizationRequest {
  id: string;
  /** 关联的异常事件（缺项/排队等），授权通过后据此解锁处置 */
  incidentId?: string;
  /** 关联的空腹加项冲突 */
  fastingAddonId?: string;
  title: string;
  detail: string;
  feeDelta: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt?: string;
  responder?: string;
}

/** 医生临时加开空腹抽血/胃镜：进食核查结果 */
export interface FastingCheck {
  eaten: boolean; // 是否已进食
  lastMealTime?: string; // 末次进食时间 HH:mm
  /** 距末次进食时长（小时，由陪诊员填写/选择） */
  fastingHours?: number;
  /** 患者基础病风险（糖尿病/低血糖史等，来自病历） */
  riskNote: string;
}

/** 检查顺序调整后重算的票据/时间 */
export interface RecomputedTicket {
  stageKey: StageKey;
  label: string;
  /** 重算后的取号号段/票号 */
  ticketNo: string;
  /** 取号/预约时间 */
  callTime: string;
  /** 预计排队分钟 */
  waitMinutes: number;
  /** 该项目本次费用（用于缴费重算） */
  fee: number;
  note?: string;
}

export type FastingAddonStatus =
  | 'checking' // 已发起，待陪诊员核查进食
  | 'awaitingFamily' // 已出方案，待家属选择
  | 'wait' // 继续等待（当日空腹完成）
  | 'reschedule' // 改日检查
  | 'othersFirst'; // 先完成其他项目

/** 医生临时加开空腹项目（抽血/胃镜）冲突处置 */
export interface FastingAddonConflict {
  id: string;
  examId: string; // 加开项目（可能是胃镜等扩展项）
  examName: string;
  kind: 'blood' | 'gastroscopy';
  raisedAt: string;
  check?: FastingCheck; // 进食核查
  status: FastingAddonStatus;
  /** 三个方案的家属可见说明 */
  planWait: string;
  planReschedule: string;
  planOthersFirst: string;
  /** 进食核查后生成的三个重算方案（持久化，家属端可见） */
  plans?: AddonPlanView[];
  chosenPlan?: 'wait' | 'reschedule' | 'othersFirst';
  decidedBy?: string;
  decidedAt?: string;
  /** 顺序调整后重算的缴费/取号/回诊 */
  recomputed?: RecomputedSchedule;
  /** 回诊是否受影响，需要先联系医生助理确认 */
  revisitImpacted: boolean;
  assistantConfirmed: boolean;
  assistantNote?: string;
  /** 改约的可选时间 */
  rescheduleOptions: string[];
  rescheduleDate?: string;
}

/** 缴费 / 取号 / 回诊 重算结果 */
export interface RecomputedSchedule {
  /** 需要新增/补缴的费用明细 */
  extraFees: { label: string; amount: number }[];
  extraFeeTotal: number;
  /** 重算后各环节取号票 */
  tickets: RecomputedTicket[];
  /** 重算后的回诊时间；null 表示当日无回诊/不受影响 */
  revisitTime?: string;
  /** 原回诊时间 */
  originalRevisitTime?: string;
  note: string;
}

/** 空腹加项三方案视图（持久化，供家属端查看） */
export interface AddonPlanView {
  key: 'wait' | 'reschedule' | 'othersFirst';
  feasible: boolean;
  title: string;
  text: string;
  feeDelta: number;
  schedule: RecomputedSchedule;
  revisitImpacted: boolean;
  rescheduleDate?: string;
}

/** 预约表单（患者/家属提交） */
export interface BookingForm {
  departmentId: string;
  patientName: string;
  patientAge: number;
  patientGender: '男' | '女';
  contactName: string; // 家属
  contactPhone: string;
  mobility: MobilityLevel;
  medicalHistory: string; // 既往病历
  examSheetText: string; // 检查单原文
  examIds: string[]; // 结构化勾选的检查项
  needWheelchair: boolean;
  fasting: boolean; // 是否空腹
  demands: string; // 陪诊诉求
  appointmentDate: string; // YYYY-MM-DD
  preferredSlot: 'morning' | 'afternoon';
  crossCampusExpected: boolean; // 预判可能跨院区
}

export interface TimeSlotAdvice {
  arriveTime: string; // 建议到院时间
  registerTime: string; // 挂号时间
  slotStart: string; // 出诊时段开始
  reason: string[];
  crowdedness: '低' | '中' | '高';
}

export interface MaterialItem {
  name: string;
  required: boolean;
  reason: string;
  prepared?: boolean;
}

export interface Escort {
  id: string;
  name: string;
  title: string; // 星级/资历
  rating: number;
  ordersThisMonth: number;
  phone: string;
  shift: '早班 07:30-14:00' | '晚班 13:30-20:00';
  strongDepartments: string[];
}

export interface EscortOrder {
  id: string;
  code: string; // 业务编号
  status: OrderStatus;
  form: BookingForm;
  escortId?: string;
  createdAt: string;
  acceptedAt?: string;
  arrivedAt?: string; // 患者到院时间
  completedAt?: string;
  cancelReason?: string;

  // 生成的方案
  advice: TimeSlotAdvice;
  materials: MaterialItem[];
  stages: StageState[];
  activeStageIndex: number;

  // 执行信息
  building: string;
  room: string;
  payWindow: string;
  bloodLocation: string;
  imageLocation: string;
  pharmacyPoint: string;
  routeSteps: string[]; // 院内复杂路线
  registrationTime: string;

  fees: FeeItem[];
  incidents: Incident[];
  messages: ChatMessage[];
  exams: ExamOrderItem[];
  crossCampus?: CrossCampusTrip;
  handover?: ShiftHandover;
  authorizations: AuthorizationRequest[];
  /** 医生临时加开的空腹项目冲突处置（可能多个） */
  fastingAddons: FastingAddonConflict[];
  emotionNote?: string; // 情绪安抚记录
  archive?: ServiceArchive;
}

export interface Department {
  id: string;
  name: string;
  campusId: string;
  building: string;
  room: string;
  floor: string;
  morningPeak: string; // 高峰描述
  avgWait: number; // 平均候诊分钟
}

export interface ExamDef {
  id: string;
  name: string;
  short: string;
  building: string;
  location: string;
  needFasting: boolean;
  reportHours: number; // 报告出具小时数
  fee: number;
  campusId: string;
  queueMinutes: number;
  category: '抽血' | '影像' | '功能' | '标本' | '内镜';
}

export interface Campus {
  id: string;
  name: string;
  distanceKm: number;
  shuttleInfo: string;
}
