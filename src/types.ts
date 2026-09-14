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
  title: string;
  detail: string;
  feeDelta: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt?: string;
  responder?: string;
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
  category: '抽血' | '影像' | '功能' | '标本';
}

export interface Campus {
  id: string;
  name: string;
  distanceKm: number;
  shuttleInfo: string;
}
