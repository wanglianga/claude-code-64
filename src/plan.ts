import { DEPARTMENTS, EXAMS, CAMPUSES } from './data';
import type {
  BookingForm,
  CrossCampusTrip,
  EscortOrder,
  ExamOrderItem,
  FeeItem,
  MaterialItem,
  StageState,
  TimeSlotAdvice,
} from './types';

let seq = 0;
export function uid(prefix = 'id'): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function fmtTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${fmtTime(iso)}`;
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addMinutes(hhmm: string, m: number): string {
  const [h, min] = hhmm.split(':').map(Number);
  const total = h * 60 + min + m;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * 分时到院建议算法：
 * - 空腹项目 → 赶最早一批（07:30 前到院，08:00 前完成空腹抽血/超声）
 * - 轮椅/卧床 → 提前 15 分钟（无障碍通道与轮椅借用耗时）
 * - 高峰科室 → 号源时段前 40 分钟到院；普通提前 30 分钟
 * - 多个检查 + 排队时长 → 进一步提前
 * - 下午号 → 13:30 前到院
 */
export function buildAdvice(form: BookingForm): TimeSlotAdvice {
  const dept = DEPARTMENTS.find((d) => d.id === form.departmentId)!;
  const selected = EXAMS.filter((e) => form.examIds.includes(e.id));
  const fastingExams = selected.filter((e) => e.needFasting);
  const totalQueue = selected.reduce((s, e) => s + e.queueMinutes, 0);
  const reason: string[] = [];

  let arrive: string;
  let register: string;
  let slotStart: string;
  let crowdedness: TimeSlotAdvice['crowdedness'] = '中';

  if (form.preferredSlot === 'morning') {
    slotStart = '09:00';
    arrive = '08:00';
    if (fastingExams.length > 0 || form.fasting) {
      arrive = '07:20';
      reason.push(`含空腹项目（${fastingExams.map((e) => e.short).join('、') || '已告知空腹'}），建议赶 08:00 前第一批采血，空腹等待每延长 1 小时低血糖风险上升`);
    }
    if (['wheelchair', 'bedridden', 'cane'].includes(form.mobility)) {
      arrive = addMinutes(arrive, -10);
      reason.push('患者行动不便，预留无障碍坡道、轮椅借用与电梯排队时间（+10 分钟）');
    }
    if (dept.avgWait >= 50) {
      arrive = addMinutes(arrive, -10);
      crowdedness = '高';
      reason.push(`${dept.name}上午高峰明显（${dept.morningPeak}，平均候诊 ${dept.avgWait} 分钟），再提前 10 分钟到院`);
    }
    if (totalQueue >= 120) {
      arrive = addMinutes(arrive, -10);
      reason.push(`所选检查累计排队约 ${totalQueue} 分钟，影像类检查建议到院后先预约排号`);
    }
    register = addMinutes(arrive, 10);
    reason.push(`到院后先在 ${dept.building}一层自助机/窗口挂号取号，约 10 分钟`);
  } else {
    slotStart = '14:00';
    arrive = '13:20';
    register = '13:30';
    crowdedness = dept.avgWait >= 50 ? '中' : '低';
    reason.push('下午号源相对宽松，建议 13:20 到院完成挂号与签到，避开 13:30 午休结束窗口排队');
    if (form.fasting || fastingExams.length > 0) {
      reason.push('⚠ 下午号与空腹要求冲突：空腹项目请改上午完成，或由医生评估是否改为非空腹替代检查（系统已在材料清单中标注）');
    }
  }

  if (selected.some((e) => e.campusId !== dept.campusId)) {
    reason.push('部分检查位于其他院区，已生成跨院区行程（交通、报告互认、预计返院时间见方案）');
  }

  return {
    arriveTime: arrive,
    registerTime: register,
    slotStart,
    reason,
    crowdedness,
  };
}

/** 材料清单：根据行动能力、空腹、检查单、既往病历生成 */
export function buildMaterials(form: BookingForm): MaterialItem[] {
  const items: MaterialItem[] = [
    { name: '患者本人身份证 / 医保卡（电子医保凭证）', required: true, reason: '挂号、签到、医保结算必需' },
    { name: '既往病历本与出院小结', required: !!form.medicalHistory, reason: form.medicalHistory ? '患者有既往病史，供医生快速判断' : '建议携带，便于医生参考' },
    { name: '既往检查报告 / 影像胶片或光盘', required: !!form.medicalHistory, reason: '避免重复检查，影响报告互认' },
    { name: '当前长期服用药品清单或药盒', required: true, reason: '医生开单与药师审方需要核对用药' },
    { name: '检查申请单（纸质/电子）', required: true, reason: '签到与缴费后核销' },
  ];

  if (form.fasting || EXAMS.filter((e) => form.examIds.includes(e.id)).some((e) => e.needFasting)) {
    items.push({ name: '空腹禁食 8 小时（可少量携带温水）', required: true, reason: '生化/凝血/腹部彩超要求空腹' });
    items.push({ name: '随身糖果/饼干（抽完血后即时补充）', required: false, reason: '防止空腹低血糖，完成空腹项目后立即进食' });
  }
  if (form.needWheelchair || ['wheelchair', 'bedridden'].includes(form.mobility)) {
    items.push({ name: '提前在门诊大厅「无障碍服务台」借用轮椅', required: true, reason: '高峰时段轮椅紧张，到院第一件事办理' });
  }
  if (['cane', 'slow'].includes(form.mobility)) {
    items.push({ name: '助行器 / 拐杖 / 成人护理垫', required: false, reason: '长距离移动与排队候诊时使用' });
  }
  if (form.examIds.includes('mri')) {
    items.push({ name: '去除金属饰品、磁卡，植入物证明（心脏支架/钢板等）', required: true, reason: 'MRI 安全筛查必需' });
  }
  items.push({ name: '家属授权联系人电话保持畅通', required: true, reason: '异常处置、费用变化与远程授权需要家属即时确认' });
  items.push({ name: '微信/支付宝/现金或银行卡（预缴金）', required: true, reason: '挂号、检查、药费分段缴纳' });

  return items.map((m) => ({ ...m, prepared: false }));
}

const STAGE_META: { key: StageState['key']; label: string }[] = [
  { key: 'signin', label: '签到报到' },
  { key: 'wait', label: '候诊' },
  { key: 'consult', label: '医生问诊·开单' },
  { key: 'pay', label: '缴费' },
  { key: 'blood', label: '抽血/检验' },
  { key: 'image', label: '影像检查' },
  { key: 'revisit', label: '回诊看结果' },
  { key: 'pharmacy', label: '取药' },
  { key: 'done', label: '就诊结束' },
];

/** 根据科室/检查生成院内执行点与路线 */
export function buildExecutionPlan(form: BookingForm) {
  const dept = DEPARTMENTS.find((d) => d.id === form.departmentId)!;
  const selected = EXAMS.filter((e) => form.examIds.includes(e.id));
  const hasBlood = selected.some((e) => e.category === '抽血');
  const hasImage = selected.some((e) => e.category === '影像');
  const blood = selected.find((e) => e.category === '抽血');
  const image = selected.find((e) => e.category === '影像');

  const payWindow = `${dept.building} 1 层「人工收费 3 号窗」（东侧自助机人少时可自助缴费）`;
  const bloodLocation = blood ? `${blood.building} ${blood.location}` : '本次无抽血项目';
  const imageLocation = image ? `${image.building} ${image.location}` : '本次无影像项目';
  const pharmacyPoint = `${dept.building} 1 层 中心药房 2 号取药窗（先在窗口旁报到机扫码排队）`;

  const routeSteps = [
    `门诊正门 → 无障碍坡道（右侧）→ ${dept.building} 1 层大厅`,
    `1 层大厅挂号收费区取号 → 乘 ${dept.building === '医技楼' ? '2 号直梯' : '中部 3 号直梯（低速医梯，停靠全楼层）'} 到 ${dept.floor}`,
    `${dept.floor} ${dept.room} 门口报到机扫码签到，在候诊 2 区等待叫号`,
    `开单后返回 1 层 ${payWindow} 缴费`,
    hasBlood ? `经 2 号楼连廊（2 层空中连廊，遮雨）到门诊 1 号楼 ${blood?.location ?? ''} 采血` : '本次跳过采血环节',
    hasImage ? `出 1 号楼沿地面指示线西行约 260 米到医技楼 ${image?.location ?? ''}（行动不便者走 2 层连廊转医梯直达 B1/1 层）` : '本次跳过影像环节',
    `报告出具后返回 ${dept.room} 回诊（可先在公众号查看电子报告）`,
    `回诊结束回 ${dept.building} 1 层中心药房取药后离院`,
  ];

  return { dept, selected, hasBlood, hasImage, payWindow, bloodLocation, imageLocation, pharmacyPoint, routeSteps };
}

/** 初始阶段状态（无对应项目的阶段标记 skipped） */
export function buildStages(form: BookingForm): StageState[] {
  const plan = buildExecutionPlan(form);
  return STAGE_META.map((m) => {
    let location = '';
    let waitMinutes: number | undefined;
    switch (m.key) {
      case 'signin':
        location = `${plan.dept.building} ${plan.dept.floor} 报到机`;
        waitMinutes = 5;
        break;
      case 'wait':
        location = `${plan.dept.room} 候诊区`;
        waitMinutes = plan.dept.avgWait;
        break;
      case 'consult':
        location = plan.dept.room;
        waitMinutes = 8;
        break;
      case 'pay':
        location = plan.payWindow;
        waitMinutes = 12;
        break;
      case 'blood':
        location = plan.bloodLocation;
        waitMinutes = plan.selected.find((e) => e.category === '抽血')?.queueMinutes ?? 0;
        break;
      case 'image':
        location = plan.imageLocation;
        waitMinutes = plan.selected.find((e) => e.category === '影像')?.queueMinutes ?? 0;
        break;
      case 'revisit':
        location = plan.dept.room;
        waitMinutes = 20;
        break;
      case 'pharmacy':
        location = plan.pharmacyPoint;
        waitMinutes = 15;
        break;
      case 'done':
        location = '离院';
        break;
    }
    const skipped =
      (m.key === 'blood' && !plan.hasBlood) ||
      (m.key === 'image' && !plan.hasImage);
    return { ...m, location, status: skipped ? 'skipped' : 'pending', waitMinutes };
  });
}

/** 初始费用（挂号 + 检查 + 陪诊基础服务费） */
export function buildInitialFees(form: BookingForm): FeeItem[] {
  const dept = DEPARTMENTS.find((d) => d.id === form.departmentId)!;
  const fees: FeeItem[] = [
    { id: uid('fee'), label: `${dept.name} 普通门诊挂号费`, amount: 25, at: nowISO(), category: 'registration' },
  ];
  EXAMS.filter((e) => form.examIds.includes(e.id)).forEach((e) => {
    fees.push({ id: uid('fee'), label: e.name, amount: e.fee, at: nowISO(), category: 'exam' });
  });
  let escortFee = 199; // 基础半天陪诊
  if (['wheelchair', 'bedridden'].includes(form.mobility)) escortFee += 60;
  if (form.needWheelchair) escortFee += 20;
  if (form.crossCampusExpected || EXAMS.some((e) => form.examIds.includes(e.id) && e.campusId !== dept.campusId)) escortFee += 80;
  fees.push({ id: uid('fee'), label: '陪诊基础服务费（半天）', amount: escortFee, at: nowISO(), category: 'escort' });
  return fees;
}

export function buildExamItems(form: BookingForm): ExamOrderItem[] {
  return EXAMS.filter((e) => form.examIds.includes(e.id)).map((e) => ({
    id: uid('exam'),
    examId: e.id,
    name: e.name,
    ordered: true,
  }));
}

/** 根据表单一次性构建订单方案 */
export function buildOrderSkeleton(form: BookingForm, id: string, code: string): EscortOrder {
  const exec = buildExecutionPlan(form);
  return {
    id,
    code,
    status: 'draft',
    form,
    createdAt: nowISO(),
    advice: buildAdvice(form),
    materials: buildMaterials(form),
    stages: buildStages(form),
    activeStageIndex: 0,
    building: exec.dept.building,
    room: `${exec.dept.floor} ${exec.dept.room}`,
    payWindow: exec.payWindow,
    bloodLocation: exec.bloodLocation,
    imageLocation: exec.imageLocation,
    pharmacyPoint: exec.pharmacyPoint,
    routeSteps: exec.routeSteps,
    registrationTime: '',
    fees: buildInitialFees(form),
    incidents: [],
    messages: [],
    exams: buildExamItems(form),
    authorizations: [],
  };
}

/** 报告出具时间（取最晚的检查报告） */
export function reportReadyText(order: EscortOrder): string {
  const selected = EXAMS.filter((e) => order.form.examIds.includes(e.id));
  if (selected.length === 0) return '本次无检查，门诊病历即时可查';
  const maxH = Math.max(...selected.map((e) => e.reportHours));
  const base = order.completedAt ? new Date(order.completedAt) : new Date();
  const d = new Date(base.getTime() + maxH * 3600_000);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 后`;
}

/** 跨院区方案 */
export function buildCrossCampus(targetCampusId: string, examNames: string[], transport: CrossCampusTrip['transport']): CrossCampusTrip {
  const campus = CAMPUSES.find((c) => c.id === targetCampusId)!;
  const feeTable: Record<CrossCampusTrip['transport'], number> = {
    hospitalShuttle: 0,
    taxi: Math.round(campus.distanceKm * 4) + 15,
    ambulance: 200,
    walk: 0,
  };
  const extraEscortFee = 120; // 跨院区陪诊加收
  const travelMin = transport === 'hospitalShuttle' ? 30 : transport === 'taxi' ? 20 : transport === 'ambulance' ? 25 : 60;
  const depart = new Date(Date.now() + 20 * 60_000);
  const back = new Date(depart.getTime() + (travelMin * 2 + 75) * 60_000);
  const f = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return {
    targetCampusId,
    examNames,
    transport,
    transportFee: feeTable[transport],
    reportMutualRecognized: true,
    extraEscortFee,
    status: 'planned',
    note: `${campus.name}距总院 ${campus.distanceKm} km；${campus.shuttleInfo}；单程约 ${travelMin} 分钟，检查约 60 分钟，预计往返 ${travelMin * 2 + 75} 分钟`,
    departTime: `${depart.getMonth() + 1}月${depart.getDate()}日 ${f(depart)}`,
    expectedReturnTime: `${back.getMonth() + 1}月${back.getDate()}日 ${f(back)}`,
  };
}
