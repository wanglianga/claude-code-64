import { useEffect, useMemo, useState } from 'react';
import { CAMPUSES, DEPARTMENTS, ESCORTS, EXAMS } from '../data';
import { INCIDENT_TEMPLATES, feeTotal, useStore } from '../store';
import { fmtDateTime, buildCrossCampus, reportReadyText } from '../plan';
import type { IncidentType, ServiceArchive } from '../types';
import { ChatPanel, FeeTable, MaterialChecklist, StageStepper, StatusBadge } from '../ui';
import FastingAddonPanel from './FastingAddonPanel';

const INCIDENT_TYPE_LABEL: Record<IncidentType, string> = {
  fasting: '空腹低血糖风险',
  longQueue: '排队时间过长',
  mobility: '行动不便/通道受阻',
  doctorStop: '医生临时停诊',
  missingItem: '检查单缺项',
  familyAsk: '家属远程追问',
  crossCampus: '需跨院区检查',
  shiftChange: '陪诊员换班',
  emotion: '患者情绪安抚',
  custom: '其他现场情况',
};

function plusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function EscortConsole({ orderId, escortId, onBack }: { orderId: string; escortId: string; onBack: () => void }) {
  const order = useStore((s) => s.orders.find((o) => o.id === orderId))!;
  const {
    patientArrive, advanceStage, setStageWait, addStageNote, raiseIncident, resolveIncident,
    postStatusSync, planCrossCampus, updateCrossStatus, handover, recordEmotion,
    markExamMissing, clearExamMissing, archiveOrder, addFee,
  } = useStore();

  const me = ESCORTS.find((e) => e.id === escortId)!;
  const dept = DEPARTMENTS.find((d) => d.id === order.form.departmentId)!;
  const campus = CAMPUSES.find((c) => c.id === dept.campusId)!;

  const [tab, setTab] = useState<'board' | 'fasting' | 'incident' | 'cross' | 'sync' | 'archive'>('board');
  const [regTime, setRegTime] = useState(order.advice.registerTime);
  const [selStage, setSelStage] = useState(order.activeStageIndex);

  // 环节推进后，详情自动跟随到新的活动环节（陪诊员也可点左侧回看已完成环节）
  useEffect(() => {
    if (order.status === 'ongoing') setSelStage(order.activeStageIndex);
  }, [order.activeStageIndex, order.status]);
  const [incType, setIncType] = useState<IncidentType>('longQueue');
  const [incDetail, setIncDetail] = useState('');
  const [syncText, setSyncText] = useState('');
  const [emotion, setEmotion] = useState('');
  const [crossCampusId, setCrossCampusId] = useState(EXAMS.find((e) => e.campusId !== dept.campusId)?.campusId ?? 'east');
  const [crossExams, setCrossExams] = useState<string[]>([]);
  const [crossTransport, setCrossTransport] = useState<'hospitalShuttle' | 'taxi' | 'ambulance' | 'walk'>('hospitalShuttle');
  const [handoverTo, setHandoverTo] = useState(ESCORTS.find((e) => e.id !== escortId)?.id ?? 'e03');
  const [handoverReason, setHandoverReason] = useState('早班 14:00 下班，患者下午仍有检查与回诊');
  const [handoverList, setHandoverList] = useState('');
  const [extraFeeLabel, setExtraFeeLabel] = useState('');
  const [extraFeeAmt, setExtraFeeAmt] = useState(0);
  const [blockMsg, setBlockMsg] = useState<string | null>(null);
  const pendingFasting = order.fastingAddons?.filter((a) => a.status === 'awaitingFamily' || a.status === 'checking').length ?? 0;

  const doAdvance = () => {
    const blocked = advanceStage(order.id);
    setBlockMsg(blocked);
    if (!blocked) setTab('board');
  };

  const [archiveForm, setArchiveForm] = useState<ServiceArchive>({
    diagnosis: '',
    medicationGuide: '',
    revisitDate: plusDays(30),
    invoiceHandled: true,
    invoiceNumber: `INV${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(10000 + Math.random() * 89999)}`,
    reportPickup: '电子报告：医院公众号「检验检查」查询下载；纸质报告可于门诊自助打印机扫码打印（30 天内）',
    reportReadyAt: reportReadyText(order),
    rating: order.archive?.rating ?? 0,
    ratingTags: order.archive?.ratingTags ?? [],
    ratingComment: order.archive?.ratingComment ?? '',
    archived: false,
  });

  const activeStage = order.stages[selStage] ?? order.stages[order.activeStageIndex];
  const openIncidents = order.incidents.filter((i) => i.status === 'open');
  const otherCampusExams = useMemo(() => EXAMS.filter((e) => e.campusId !== dept.campusId), [dept.campusId]);
  const isMine = order.escortId === escortId;

  if (!isMine) {
    return (
      <div>
        <div className="top-back"><button className="btn btn-sm" onClick={onBack}>← 返回</button><h1>非本人订单</h1></div>
        <div className="card">该订单由其他陪诊员跟进，您可在服务台视角查看协作信息。</div>
      </div>
    );
  }

  const submitArchive = () => {
    if (!archiveForm.diagnosis.trim()) { alert('请填写诊断结果'); return; }
    archiveOrder(order.id, { ...archiveForm, reportReadyAt: reportReadyText(order), archived: true });
    setTab('archive');
  };

  const stage = activeStage;

  return (
    <div>
      <div className="top-back">
        <button className="btn btn-sm" onClick={onBack}>← 返回我的订单</button>
        <h1>陪诊执行台 · {order.form.patientName} <span className="code mono small">{order.code}</span></h1>
        <StatusBadge status={order.status} />
        {order.status === 'ongoing' && <span className="badge teal"><span className="pulse" style={{ marginRight: 6 }} />{order.stages[order.activeStageIndex]?.label}</span>}
      </div>

      {/* 接单后信息总览 */}
      <div className="card">
        <h2>📌 本场任务要点（{dept.name} · {campus.name}）</h2>
        <div className="grid grid-3">
          <div><span className="muted small">挂号时间</span><br /><b style={{ fontSize: 16 }}>{order.registrationTime || order.advice.registerTime}</b></div>
          <div><span className="muted small">楼栋 · 诊室</span><br /><b>{order.building} · {order.room}</b></div>
          <div><span className="muted small">患者/行动</span><br /><b>{order.form.patientName}（{order.form.patientAge}）</b><br /><span className="small muted">{order.form.mobility === 'wheelchair' ? '轮椅' : order.form.mobility === 'slow' ? '行走缓慢' : order.form.mobility === 'cane' ? '拄拐' : order.form.mobility === 'bedridden' ? '平车' : '自主行走'}{order.form.needWheelchair ? ' · 已借轮椅' : ''}</span></div>
          <div className="small"><span className="muted">缴费窗口：</span>{order.payWindow}</div>
          <div className="small"><span className="muted">抽血检验：</span>{order.bloodLocation}</div>
          <div className="small"><span className="muted">影像检查：</span>{order.imageLocation}</div>
          <div className="small" style={{ gridColumn: '1 / 3' }}><span className="muted">取药点：</span>{order.pharmacyPoint}</div>
          <div className="small"><span className="muted">家属：</span>{order.form.contactName} {order.form.contactPhone}</div>
        </div>
      </div>

      {/* 到院前：确认到院 */}
      {order.status === 'accepted' && (
        <div className="card">
          <h2>🚪 患者到院确认</h2>
          <div className="callout info">请提前 10 分钟在门诊正门无障碍坡道处等候。建议到院时间 <b>{order.advice.arriveTime}</b>，接到患者并完成挂号后点击下方按钮，系统开始按阶段引导。</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="small">实际挂号时间：<input type="time" className="input" style={{ width: 120, display: 'inline-block' }} value={regTime} onChange={(e) => setRegTime(e.target.value)} /></label>
            <button className="btn btn-primary" onClick={() => patientArrive(order.id, regTime)}>✅ 已接到患者并完成挂号，开始行程</button>
          </div>
          <div className="hr" />
          <MaterialChecklist items={order.materials} orderId={order.id} editable />
        </div>
      )}

      {order.status === 'ongoing' && <StageStepper order={order} />}

      {/* Tabs */}
      <div className="tabs" style={{ marginTop: 14 }}>
        <button className={`tab ${tab === 'board' ? 'on' : ''}`} onClick={() => setTab('board')}>🧭 阶段引导/路线</button>
        <button className={`tab ${tab === 'fasting' ? 'on' : ''}`} onClick={() => setTab('fasting')}>
          🍚 临时空腹加项 {pendingFasting > 0 && <span className="badge red" style={{ marginLeft: 6 }}>{pendingFasting}</span>}
        </button>
        <button className={`tab ${tab === 'incident' ? 'on' : ''}`} onClick={() => setTab('incident')}>
          ⚠ 异常处置 {openIncidents.length > 0 && <span className="badge red" style={{ marginLeft: 6 }}>{openIncidents.length}</span>}
        </button>
        <button className={`tab ${tab === 'cross' ? 'on' : ''}`} onClick={() => setTab('cross')}>🏥 跨院区/换班</button>
        <button className={`tab ${tab === 'sync' ? 'on' : ''}`} onClick={() => setTab('sync')}>💬 家属同步/费用</button>
        <button className={`tab ${tab === 'archive' ? 'on' : ''}`} onClick={() => setTab('archive')}>📁 结束归档</button>
      </div>

      {/* ===== 临时空腹加项 ===== */}
      {tab === 'fasting' && (order.status === 'ongoing' || order.status === 'accepted') && <FastingAddonPanel order={order} />}

      {/* ===== 阶段引导 ===== */}
      {tab === 'board' && order.status === 'ongoing' && (
        <div className="stage-board">
          <div className="card stage-list">
            <h2>就医环节</h2>
            {order.stages.map((s, i) => (
              <div key={s.key} className={`st-item ${s.status} ${i === selStage ? 'active' : ''}`} onClick={() => setSelStage(i)}>
                <div className="row1">
                  <span>{s.status === 'done' ? '✓ ' : s.status === 'active' ? '● ' : ''}{s.label}</span>
                  {s.status === 'active' && <span className="badge teal">进行中</span>}
                  {s.status === 'done' && <span className="badge green">完成</span>}
                  {s.status === 'skipped' && <span className="badge gray">无此项</span>}
                </div>
                <div className="loc">{s.location}</div>
                {s.waitMinutes != null && s.status !== 'skipped' && <div className="loc">预计排队/等待 {s.waitMinutes} 分钟</div>}
              </div>
            ))}
          </div>

          <div className="card">
            <h2>📍 {stage.label} <span className="badge gray">{stage.location}</span></h2>
            {stage.status === 'skipped' && <div className="callout info">本次行程无此环节。</div>}
            {stage.status === 'done' && <div className="callout ok">本环节已于 {fmtDateTime(stage.completedAt)} 完成。{stage.note ? `记录：${stage.note}` : ''}</div>}
            {stage.status === 'pending' && <div className="callout warn">该环节尚未开始，请先完成当前环节。</div>}

            {stage.status === 'active' && (
              <>
                {blockMsg && (
                  <div className="callout danger">
                    🚫 {blockMsg}
                    <div style={{ marginTop: 6 }}>
                      <button className="btn btn-sm btn-danger" onClick={() => setTab('fasting')}>前往「临时空腹加项」处理</button>
                    </div>
                  </div>
                )}
                <div className="grid grid-2">
                  <div className="field">
                    <label>现场实际排队/等待（分钟，用于同步家属与复盘）</label>
                    <input type="number" className="input" value={stage.waitMinutes ?? 0} onChange={(e) => setStageWait(order.id, stage.key, Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label>本环节备注（叫号/窗口/医嘱要点）</label>
                    <input className="input" value={stage.note ?? ''} placeholder="如：采血号 B023，已嘱按压 5 分钟" onChange={(e) => addStageNote(order.id, stage.key, e.target.value)} />
                  </div>
                </div>

                {stage.key === 'consult' && (
                  <div className="callout warn">
                    医生开单后：逐项核对检查单——若发现缺项，到「⚠ 异常处置」发起【检查单缺项】；若医生临时停诊，发起【医生临时停诊】；
                    <b>若医生临时加开空腹抽血或胃镜</b>，立即到「🍚 临时空腹加项」核查进食并重算方案。
                  </div>
                )}
                {stage.key === 'blood' && order.form.fasting && (
                  <div className="callout danger">空腹项目：优先 1 号空腹采血区，抽完立即提醒患者进食随身早餐，观察 10 分钟防低血糖。</div>
                )}
                {(stage.key === 'blood' || stage.key === 'image') && (
                  <div>
                    <div className="section-title">检查单核对（现场发现缺项可标记）</div>
                    {order.exams.length === 0 && <div className="muted small">本环节无检查项目</div>}
                    {order.exams.map((x) => {
                      const def = EXAMS.find((e) => e.id === x.examId);
                      const here = stage.key === 'blood' ? def?.category === '抽血' : def?.category === '影像';
                      if (!here) return null;
                      return (
                        <div key={x.id} className="inc-card" style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <b>{x.name}</b>
                            {x.missing ? <span className="badge red">缺项 · 待补单授权</span> : <span className="badge green">单据齐全</span>}
                          </div>
                          {x.note && <div className="small muted" style={{ marginTop: 4 }}>{x.note}</div>}
                          <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                            {!x.missing
                              ? <button className="btn btn-sm btn-danger" onClick={() => markExamMissing(order.id, x.id, '科室退回要求补单')}>现场发现缺项，发起补单</button>
                              : <button className="btn btn-sm btn-primary" onClick={() => clearExamMissing(order.id, x.id)}>家属已授权，补单缴费完成</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="sticky-actions" style={{ position: 'static', marginTop: 14 }}>
                  <button className="btn" onClick={() => postStatusSync(order.id, syncText)}>先同步家属，暂不推进</button>
                  {stage.key !== 'done' && <button className="btn btn-primary" onClick={doAdvance}>完成本环节，进入下一步 →</button>}
                  {stage.key === 'done' && <button className="btn btn-primary" onClick={() => setTab('archive')}>全部完成，去归档 →</button>}
                </div>
              </>
            )}

            <div className="hr" />
            <h3>院内楼栋路线（复杂动线已拆成可执行步骤）</h3>
            {order.routeSteps.map((r, i) => (
              <div key={i} className="route-step"><span className="idx">{i + 1}</span><span className="txt">{r}</span></div>
            ))}
          </div>
        </div>
      )}

      {tab === 'board' && order.status !== 'ongoing' && (
        <div className="card"><div className="callout info">患者到院后这里会出现分阶段引导：签到 → 候诊 → 医生开单 → 缴费 → 抽血 → 影像 → 回诊 → 取药。</div></div>
      )}

      {/* ===== 异常处置 ===== */}
      {tab === 'incident' && (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <div className="card">
            <h2>⚠ 发起现场异常处置</h2>
            <div className="field">
              <label>异常类型</label>
              <select className="input" value={incType} onChange={(e) => setIncType(e.target.value as IncidentType)}>
                {(Object.keys(INCIDENT_TYPE_LABEL) as IncidentType[]).map((t) => (
                  <option key={t} value={t}>{INCIDENT_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>现场情况描述</label>
              <textarea className="input" value={incDetail} placeholder={INCIDENT_TEMPLATES[incType].detailHint} onChange={(e) => setIncDetail(e.target.value)} />
            </div>
            <div className="callout warn">
              <b>费用变化：</b>{INCIDENT_TEMPLATES[incType].feeDelta > 0 ? '+' : ''}{INCIDENT_TEMPLATES[incType].feeDelta} 元。{INCIDENT_TEMPLATES[incType].feeReason}
              <br /><b>家属授权：</b>{INCIDENT_TEMPLATES[incType].needAuthorization ? '需要，发起后在家属端推送远程授权' : '不需要，按规范先行处置并同步'}
            </div>
            <button className="btn btn-primary" onClick={() => { raiseIncident(order.id, incType, incDetail); setIncDetail(''); }}>发起并同步家属</button>

            <div className="hr" />
            <h3>患者情绪安抚记录</h3>
            <div className="field">
              <textarea className="input" value={emotion} placeholder="如：老人害怕 MRI，已用通俗语言解释无辐射，并接通家属视频" onChange={(e) => setEmotion(e.target.value)} />
            </div>
            <button className="btn" onClick={() => { if (emotion.trim()) { recordEmotion(order.id, emotion.trim()); setEmotion(''); } }}>记录安抚动作并同步</button>
            {order.emotionNote && <div className="callout teal" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{order.emotionNote}</div>}
          </div>

          <div className="card">
            <h2>🧾 异常处置列表（{order.incidents.length}）</h2>
            {order.incidents.length === 0 && <div className="muted small">暂无异常。六类典型场景：空腹、排队过长、行动不便、医生停诊、检查单缺项、家属追问。</div>}
            {order.incidents.map((inc) => {
              const linkedAuth = order.authorizations.find((a) => a.incidentId === inc.id);
              const locked = inc.needAuthorization && linkedAuth?.status === 'pending';
              return (
                <div key={inc.id} className={`inc-card ${inc.status}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <b>{inc.title}</b>
                    {inc.status === 'open'
                      ? (locked ? <span className="badge orange">待家属授权</span> : <span className="badge red">处置中</span>)
                      : <span className="badge green">已闭环</span>}
                  </div>
                  <div className="small" style={{ margin: '5px 0' }}>{inc.detail}</div>
                  <div className="small muted">发起于 {fmtDateTime(inc.createdAt)}
                    {inc.feeDelta !== 0 && <> · 费用 <b style={{ color: inc.feeDelta > 0 ? 'var(--danger)' : 'var(--ok)' }}>{inc.feeDelta > 0 ? '+' : ''}{inc.feeDelta} 元</b></>}
                  </div>
                  <div className="inc-opts">
                    {inc.options.map((op) => (
                      <button
                        key={op}
                        className={`inc-opt ${inc.chosenOption === op ? 'chosen' : ''}`}
                        disabled={locked}
                        onClick={() => resolveIncident(order.id, inc.id, op)}
                      >
                        {inc.chosenOption === op ? '✓ ' : ''}{op}
                      </button>
                    ))}
                  </div>
                  {locked && <div className="callout warn" style={{ margin: 0 }}>方案已同步家属，等待远程授权后才可执行；可电话提醒 {order.form.contactName}（{order.form.contactPhone}）。</div>}
                  {linkedAuth?.status === 'approved' && inc.status === 'open' && (
                    <button className="btn btn-primary btn-sm" onClick={() => resolveIncident(order.id, inc.id, inc.chosenOption ?? inc.options[0])}>家属已授权，落实该方案并闭环</button>
                  )}
                  {linkedAuth?.status === 'rejected' && <div className="callout danger" style={{ margin: 0 }}>家属未同意该方案，请改用备选项。</div>}
                  {inc.chosenOption && inc.status === 'resolved' && <div className="callout ok" style={{ margin: 0 }}>已执行：{inc.chosenOption}（{fmtDateTime(inc.resolvedAt)}，{inc.authorizedBy ? `家属${inc.authorizedBy}授权` : '规范处置'}）</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== 跨院区 / 换班 ===== */}
      {tab === 'cross' && (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <div className="card">
            <h2>🏥 跨院区检查管理</h2>
            <div className="sub">管理交通方式、报告互认、陪诊费用变化与预计返院时间，避免就医路径中途断开</div>
            {order.crossCampus ? (
              <div>
                <dl className="kv">
                  <dt>目标院区</dt><dd>{CAMPUSES.find((c) => c.id === order.crossCampus!.targetCampusId)?.name}</dd>
                  <dt>检查项目</dt><dd>{order.crossCampus.examNames.join('、')}</dd>
                  <dt>交通</dt><dd>{{ hospitalShuttle: '医院免费班车', taxi: '出租车', ambulance: '救护转运车', walk: '步行陪同' }[order.crossCampus.transport]}（{order.crossCampus.transportFee} 元）</dd>
                  <dt>加收陪诊</dt><dd>{order.crossCampus.extraEscortFee} 元（报告互认不重复检查）</dd>
                  <dt>发车/返院</dt><dd>{order.crossCampus.departTime} → 预计 <b style={{ color: 'var(--warn)' }}>{order.crossCampus.expectedReturnTime}</b></dd>
                  <dt>状态</dt><dd><b>{({ planned: '已规划', enroute: '前往途中', checking: '检查中', returned: '已返院' })[order.crossCampus.status]}</b>{order.crossCampus.actualReturnTime ? `，实际 ${fmtDateTime(order.crossCampus.actualReturnTime)}` : ''}</dd>
                </dl>
                <div className="switch-row" style={{ marginTop: 10 }}>
                  <button className="btn btn-sm" disabled={order.crossCampus.status !== 'planned'} onClick={() => updateCrossStatus(order.id, 'enroute')}>已发车</button>
                  <button className="btn btn-sm" disabled={order.crossCampus.status !== 'enroute'} onClick={() => updateCrossStatus(order.id, 'checking')}>到达开始检查</button>
                  <button className="btn btn-sm btn-primary" disabled={order.crossCampus.status === 'returned'} onClick={() => updateCrossStatus(order.id, 'returned')}>检查完已返院</button>
                </div>
                <div className="callout ok" style={{ marginTop: 10 }}>✅ {order.crossCampus.reportMutualRecognized ? '报告两院互认：电子报告回总院可直接回诊，无需重复检查缴费' : ''}</div>
              </div>
            ) : (
              <div>
                <div className="field">
                  <label>目标院区</label>
                  <select className="input" value={crossCampusId} onChange={(e) => setCrossCampusId(e.target.value)}>
                    {CAMPUSES.filter((c) => c.id !== dept.campusId).map((c) => <option key={c.id} value={c.id}>{c.name}（{c.distanceKm} km）</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>跨院检查项目</label>
                  <div>
                    {otherCampusExams.map((ex) => (
                      <button key={ex.id} type="button" className={`check-pill ${crossExams.includes(ex.name) ? 'on' : ''}`} onClick={() => setCrossExams((x) => x.includes(ex.name) ? x.filter((z) => z !== ex.name) : [...x, ex.name])}>
                        {crossExams.includes(ex.name) ? '✓ ' : ''}{ex.short}（{ex.queueMinutes}min · {ex.fee}元）
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>交通方式</label>
                  <div className="switch-row">
                    <button className={`switch-opt ${crossTransport === 'hospitalShuttle' ? 'on' : ''}`} onClick={() => setCrossTransport('hospitalShuttle')}>医院班车（免费）</button>
                    <button className={`switch-opt ${crossTransport === 'taxi' ? 'on' : ''}`} onClick={() => setCrossTransport('taxi')}>打车</button>
                    <button className={`switch-opt ${crossTransport === 'ambulance' ? 'on' : ''}`} onClick={() => setCrossTransport('ambulance')}>救护转运车</button>
                  </div>
                </div>
                <div className="callout info">
                  {CAMPUSES.find((c) => c.id === crossCampusId)?.shuttleInfo}；系统将自动计算交通费、跨区陪诊费 120 元与预计返院时间，并同步家属（费用变化会发起授权）。
                </div>
                <button
                  className="btn btn-primary"
                  disabled={crossExams.length === 0}
                  onClick={() => planCrossCampus(order.id, buildCrossCampus(crossCampusId, crossExams, crossTransport))}
                >生成跨院区行程并同步家属</button>
              </div>
            )}
          </div>

          <div className="card">
            <h2>🔄 陪诊员换班交接</h2>
            {order.handover ? (
              <div>
                <dl className="kv">
                  <dt>交接</dt><dd>{ESCORTS.find((e) => e.id === order.handover!.fromEscortId)?.name} → {ESCORTS.find((e) => e.id === order.handover!.toEscortId)?.name}</dd>
                  <dt>原因</dt><dd>{order.handover.reason}</dd>
                  <dt>事项</dt><dd>{order.handover.checklist}</dd>
                  <dt>家属确认</dt><dd>{order.handover.acknowledgedByFamily ? '✅ 已知悉确认' : '⏳ 等待家属知悉确认'}</dd>
                </dl>
              </div>
            ) : (
              <div>
                <div className="field">
                  <label>接替陪诊员</label>
                  <select className="input" value={handoverTo} onChange={(e) => setHandoverTo(e.target.value)}>
                    {ESCORTS.filter((e) => e.id !== escortId).map((e) => <option key={e.id} value={e.id}>{e.name}（{e.title} · {e.shift} · ⭐{e.rating}）</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>换班原因</label>
                  <input className="input" value={handoverReason} onChange={(e) => setHandoverReason(e.target.value)} />
                </div>
                <div className="field">
                  <label>交接事项（当前阶段/检查单/费用/家属关注点）</label>
                  <textarea className="input" value={handoverList} placeholder="如：当前在等 HRCT 叫号；血常规已做完；家属已授权跨区方案；老人耳背需大声转述医嘱" onChange={(e) => setHandoverList(e.target.value)} />
                </div>
                <button className="btn btn-primary" disabled={!handoverList.trim()} onClick={() => { handover(order.id, handoverTo, handoverReason, handoverList); setHandoverList(''); }}>发起换班并请家属知悉</button>
                <div className="callout warn" style={{ marginTop: 10 }}>换班不额外收费；接替人员到场前不离开患者，家属确认后交接生效，服务全程不中断。</div>
              </div>
            )}
            <div className="hr" />
            <h3>补录费用（如停车/转运平车/加床等）</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" placeholder="项目，如：院内转运平车" value={extraFeeLabel} onChange={(e) => setExtraFeeLabel(e.target.value)} />
              <input type="number" className="input" style={{ width: 110 }} value={extraFeeAmt} onChange={(e) => setExtraFeeAmt(Number(e.target.value))} />
              <button className="btn" disabled={!extraFeeLabel.trim() || !extraFeeAmt} onClick={() => { addFee(order.id, extraFeeLabel, extraFeeAmt, 'other'); setExtraFeeLabel(''); setExtraFeeAmt(0); }}>入账并同步</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 同步/费用 ===== */}
      {tab === 'sync' && (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <div className="card">
            <h2>💬 家属远程同步</h2>
            <div className="sub">一键把「当前阶段 + 排队时长 + 累计费用 + 下一步」结构化同步给家属，也可回复追问</div>
            <div className="field" style={{ marginTop: 8 }}>
              <textarea className="input" value={syncText} placeholder="补充说明（下一步选择/预计完成时间/患者状态），将拼进结构化状态同步" onChange={(e) => setSyncText(e.target.value)} />
            </div>
            <button className="btn btn-primary" style={{ marginBottom: 12 }} onClick={() => postStatusSync(order.id, syncText)}>📡 发送当前状态+费用同步</button>
            <ChatPanel order={order} role="escort" author={me.name} />
          </div>
          <div className="card">
            <h2>💰 费用清单（累计 {feeTotal(order).toFixed(0)} 元）</h2>
            <FeeTable order={order} />
            <div className="hr" />
            <h3>家属授权状态</h3>
            {order.authorizations.length === 0 && <div className="muted small">暂无授权请求</div>}
            {order.authorizations.map((a) => (
              <div key={a.id} className={`auth-card ${a.status}`}>
                <div className="ttl">{a.title}
                  {a.status === 'pending' && <span className="badge orange" style={{ marginLeft: 8 }}>等待回复</span>}
                  {a.status === 'approved' && <span className="badge green" style={{ marginLeft: 8 }}>已授权</span>}
                  {a.status === 'rejected' && <span className="badge gray" style={{ marginLeft: 8 }}>已拒绝</span>}
                </div>
                <div className="small">{a.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== 归档 ===== */}
      {tab === 'archive' && (
        <div className="card">
          <h2>📁 就诊结束 · 服务档案</h2>
          {order.status === 'completed' && order.archive ? (
            <div>
              <div className="callout ok">✅ 档案已归档，家属端可查看并评价；服务台将据此进行复诊提醒与服务质量评估。</div>
              <dl className="kv" style={{ marginTop: 10 }}>
                <dt>诊断</dt><dd>{order.archive.diagnosis}</dd>
                <dt>用药</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{order.archive.medicationGuide}</dd>
                <dt>复查</dt><dd>{order.archive.revisitDate}</dd>
                <dt>发票</dt><dd>{order.archive.invoiceNumber}</dd>
                <dt>报告</dt><dd>{order.archive.reportReadyAt}；{order.archive.reportPickup}</dd>
                <dt>评价</dt><dd>{order.archive.rating ? `${order.archive.rating} 星（${order.archive.ratingTags.join('、')}）：${order.archive.ratingComment}` : '家属尚未评价'}</dd>
              </dl>
            </div>
          ) : (
            <div className="grid grid-2" style={{ alignItems: 'start' }}>
              <div>
                <div className="field">
                  <label>诊断结果（向医生确认后录入）</label>
                  <textarea className="input" value={archiveForm.diagnosis} onChange={(e) => setArchiveForm({ ...archiveForm, diagnosis: e.target.value })} placeholder="如：冠状动脉支架术后状态稳定，轻度血脂异常" />
                </div>
                <div className="field">
                  <label>用药说明（药名/剂量/频次/注意事项）</label>
                  <textarea className="input" style={{ minHeight: 100 }} value={archiveForm.medicationGuide} onChange={(e) => setArchiveForm({ ...archiveForm, medicationGuide: e.target.value })} placeholder="如：阿司匹林 100mg 每日一次早餐后；注意牙龈出血/黑便及时复诊" />
                </div>
                <div className="field">
                  <label>复查时间</label>
                  <input type="date" className="input" value={archiveForm.revisitDate} onChange={(e) => setArchiveForm({ ...archiveForm, revisitDate: e.target.value })} />
                </div>
              </div>
              <div>
                <div className="field">
                  <label>发票</label>
                  <div className="switch-row">
                    <button className={`switch-opt ${archiveForm.invoiceHandled ? 'on' : ''}`} onClick={() => setArchiveForm({ ...archiveForm, invoiceHandled: true })}>已开具电子发票</button>
                    <button className={`switch-opt ${!archiveForm.invoiceHandled ? 'on' : ''}`} onClick={() => setArchiveForm({ ...archiveForm, invoiceHandled: false })}>稍后补开</button>
                  </div>
                  {archiveForm.invoiceHandled && <input className="input" style={{ marginTop: 8 }} value={archiveForm.invoiceNumber} onChange={(e) => setArchiveForm({ ...archiveForm, invoiceNumber: e.target.value })} />}
                </div>
                <div className="field">
                  <label>报告出具时间（按最长项目自动估算）</label>
                  <input className="input" value={archiveForm.reportReadyAt} readOnly />
                </div>
                <div className="field">
                  <label>检查报告领取方式</label>
                  <textarea className="input" value={archiveForm.reportPickup} onChange={(e) => setArchiveForm({ ...archiveForm, reportPickup: e.target.value })} />
                </div>
                <div className="callout info">陪诊评价由家属在其端提交；归档后本次诊断/用药/复查/发票/报告/评价进入服务档案。</div>
                <button className="btn btn-primary" style={{ width: '100%', padding: '11px' }} onClick={submitArchive}>确认就诊结束，归档并推送给家属</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
