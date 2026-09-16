import { useState } from 'react';
import { CAMPUSES, DEPARTMENTS, ESCORTS, RATING_TAGS } from '../data';
import { useStore } from '../store';
import { fmtDateTime, reportReadyText } from '../plan';
import { AddonPlanCard, ChatPanel, FeeTable, MaterialChecklist, ReportReadyHint, StageStepper, Stars, StatusBadge } from '../ui';

export default function FamilyOrder({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const order = useStore((s) => s.orders.find((o) => o.id === orderId))!;
  const decideAuthorization = useStore((s) => s.decideAuthorization);
  const acknowledgeHandover = useStore((s) => s.acknowledgeHandover);
  const rateOrder = useStore((s) => s.rateOrder);
  const familyChooseAddonPlan = useStore((s) => s.familyChooseAddonPlan);

  const [rating, setRating] = useState(order.archive?.rating ?? 5);
  const [tags, setTags] = useState<string[]>(order.archive?.ratingTags ?? []);
  const [comment, setComment] = useState(order.archive?.ratingComment ?? '');

  const dept = DEPARTMENTS.find((d) => d.id === order.form.departmentId)!;
  const campus = CAMPUSES.find((c) => c.id === dept.campusId)!;
  const escort = ESCORTS.find((e) => e.id === order.escortId);
  const contact = order.form.contactName || '家属';

  const toggleTag = (t: string) => setTags((x) => (x.includes(t) ? x.filter((z) => z !== t) : [...x, t]));

  return (
    <div>
      <div className="top-back">
        <button className="btn btn-sm" onClick={onBack}>← 返回列表</button>
        <h1>{dept.name}陪诊单 <span className="code mono small">{order.code}</span></h1>
        <StatusBadge status={order.status} />
      </div>

      {/* 分时到院建议 */}
      <div className="time-hero">
        <div><div className="lbl">建议到院</div><div className="big">{order.advice.arriveTime}</div></div>
        <div><div className="lbl">挂号时间</div><div style={{ fontSize: 22, fontWeight: 700 }}>{order.status === 'draft' ? order.advice.registerTime : order.registrationTime}</div></div>
        <div><div className="lbl">出诊时段</div><div style={{ fontSize: 22, fontWeight: 700 }}>{order.advice.slotStart}</div></div>
        <span className={`badge ${order.advice.crowdedness === '高' ? 'red' : order.advice.crowdedness === '中' ? 'orange' : 'green'}`}>拥堵：{order.advice.crowdedness}</span>
        <span className="badge blue">{campus.name}</span>
      </div>
      <div className="card">
        <h2>🕑 分时依据（系统为什么建议这个时间到院）</h2>
        {order.advice.reason.map((r, i) => <div key={i} className="callout teal">{r}</div>)}
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h2>🎒 材料清单</h2>
          <MaterialChecklist items={order.materials} orderId={order.id} editable={order.status !== 'completed'} />
        </div>
        <div className="card">
          <h2>👤 就诊信息</h2>
          <dl className="kv">
            <dt>就诊人</dt><dd>{order.form.patientName}，{order.form.patientAge} 岁，{order.form.patientGender}</dd>
            <dt>行动能力</dt><dd>{order.form.mobility === 'wheelchair' ? '需轮椅代步' : order.form.mobility === 'bedridden' ? '卧床/平车' : order.form.mobility === 'cane' ? '拄拐/搀扶' : order.form.mobility === 'slow' ? '行走缓慢' : '可自主行走'}{order.form.needWheelchair ? '（已预约轮椅）' : ''}</dd>
            <dt>空腹</dt><dd>{order.form.fasting ? '是，已要求禁食 8 小时' : '否'}</dd>
            <dt>既往病历</dt><dd>{order.form.medicalHistory || '未填写'}</dd>
            <dt>检查单</dt><dd>{order.form.examSheetText || '结构化勾选检查项'}</dd>
            <dt>陪诊诉求</dt><dd>{order.form.demands || '—'}</dd>
            <dt>陪诊员</dt><dd>{escort ? `${escort.name}（${escort.title}，${escort.shift}），电话 ${escort.phone}` : <span className="muted">派单中…</span>}</dd>
          </dl>
        </div>
      </div>

      {/* 执行信息（接单后可见） */}
      {escort && (
        <div className="card">
          <h2>🧭 现场执行信息（陪诊员已确认）</h2>
          <div className="grid grid-3">
            <div><span className="muted small">挂号/签到</span><br /><b>{order.registrationTime || order.advice.registerTime}</b>　<span className="small muted">{dept.building} 1 层</span></div>
            <div><span className="muted small">楼栋 · 诊室</span><br /><b>{order.building} · {order.room}</b></div>
            <div><span className="muted small">缴费窗口</span><br /><b className="small">{order.payWindow}</b></div>
            <div><span className="muted small">抽血/检验点</span><br /><b className="small">{order.bloodLocation}</b></div>
            <div><span className="muted small">影像检查点</span><br /><b className="small">{order.imageLocation}</b></div>
            <div><span className="muted small">取药点</span><br /><b className="small">{order.pharmacyPoint}</b></div>
          </div>
          <div className="hr" />
          <h3>院内复杂路线（陪诊员按此推送）</h3>
          {order.routeSteps.map((r, i) => (
            <div key={i} className="route-step"><span className="idx">{i + 1}</span><span className="txt">{r}</span></div>
          ))}
        </div>
      )}

      {/* 实时行程 */}
      {(order.status === 'ongoing' || order.status === 'completed') && (
        <div className="card">
          <h2>📍 患者到院实时行程</h2>
          <StageStepper order={order} />
          <div className="hr" />
          <div className="grid grid-2">
            <ReportReadyHint order={order} />
            <div className="small muted">
              {order.stages.filter((s) => s.status === 'done').length} 个环节已完成；陪诊员每推进一步，此处与下方对话同步更新。
            </div>
          </div>
        </div>
      )}

      {/* 轮椅/平车转运 */}
      {order.transfers && order.transfers.length > 0 && (
        <div className="card">
          <h2>♿ 院内转运协同（轮椅 / 平车）</h2>
          {order.transfers.map((t) => {
            const seg = t.segments[0];
            const modeName = t.mode === 'wheelchair' ? '轮椅' : t.mode === 'stretcher' ? '医用平车（卧位）' : '搀扶步行';
            const transferStatusText = ({ planned: '已规划', elevatorPending: '医梯待确认', elevatorConfirmed: '医梯已确认', volunteerRequested: '已呼叫志愿者', enroute: '转运途中', arrived: '已到达检查点', cancelled: '已取消' } as const)[t.status];
            return (
              <div key={t.id} className="inc-card" style={{ borderLeft: '4px solid var(--primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <b>{t.purpose}</b>
                  <span className={`badge ${t.status === 'elevatorPending' ? 'red' : 'teal'}`}>{transferStatusText}</span>
                </div>
                <div className="small" style={{ margin: '5px 0' }}>
                  <span className="badge blue" style={{ marginRight: 6 }}>{t.campusId === 'east' ? '东院区' : '总院'}</span>
                  {t.fromLocation} → {t.toLocation} · {modeName}
                  {t.needSupine && <span className="badge orange" style={{ marginLeft: 6 }}>卧位</span>}
                  {!t.canUseToiletIndependently && <span className="badge blue" style={{ marginLeft: 6 }}>如厕需协助</span>}
                  <span className="badge gray" style={{ marginLeft: 6 }}>{t.familyAccompanying ? '家属随行' : '家属未随行'}</span>
                </div>
                <div className="grid grid-3" style={{ margin: '6px 0' }}>
                  <span className="small">距离 <b>{seg.distanceMeters} 米</b></span>
                  <span className="small">预计耗时 <b>{seg.estimatedMinutes} 分钟</b></span>
                  <span className="small">路线拥堵：<b>{seg.congestion}</b></span>
                </div>
                <details>
                  <summary className="small" style={{ cursor: 'pointer', color: 'var(--primary)' }}>查看无障碍路线与电梯位置</summary>
                  {seg.routeSteps.map((r, i) => <div key={i} className="route-step"><span className="idx">{i + 1}</span><span className="txt">{r}</span></div>)}
                  {seg.elevators.map((e, i) => <div key={i} className="callout info">🛗 {e.name}（{e.location}）：{e.note}</div>)}
                </details>

                {/* 医梯资源：待确认 / 已确认 / 已取消 三态明确告知家属 */}
                {t.elevator.required && t.elevator.state === 'needed' && (
                  <div className="callout danger" style={{ marginTop: 8 }}>
                    🛗 卧位平车医梯<b>待服务台确认</b>（非已预约）：需求电梯 {t.elevator.elevatorName}（{t.elevator.elevatorLocation}），{t.elevator.recommendedSlot}。
                    陪诊员正联系{t.campusId === 'east' ? '东院 8101' : '总院 8001'}，确认后才会开始转运；平车费用暂未入账。
                    {t.elevator.releasedReason && <div className="small" style={{ marginTop: 4 }}>原预约已取消（{t.elevator.releasedReason}），正等待重新确认。</div>}
                  </div>
                )}
                {t.elevator.required && t.elevator.state === 'confirmed' && (
                  <div className="callout info" style={{ marginTop: 8 }}>
                    🛗 医梯<b>已确认</b>：{t.elevator.elevatorName}，预约时段「{t.elevator.confirmedSlot}」，来源 {t.elevator.confirmedSource}，确认人 {t.elevator.confirmedBy}。将按此资源转运。
                  </div>
                )}

                <div className="small" style={{ marginTop: 6 }}>
                  押金 <b>{t.deposit} 元</b>（归还退回）；实缴{' '}
                  {t.feeCommitted
                    ? <b style={{ color: 'var(--danger)' }}>{t.rentalFee + t.transportFee} 元（已入账）</b>
                    : <b style={{ color: 'var(--warn)' }}>{t.rentalFee + t.transportFee} 元（待医梯确认后入账）</b>}
                  {t.volunteerRequested && <span className="badge orange" style={{ marginLeft: 8 }}>已联系志愿服务台接应</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 跨院区 */}
      {order.crossCampus && (
        <div className="card">
          <h2>🏥 跨院区检查行程</h2>
          <div className="grid grid-3">
            <div><span className="muted small">目标院区</span><br /><b>{CAMPUSES.find((c) => c.id === order.crossCampus!.targetCampusId)?.name}</b></div>
            <div><span className="muted small">交通方式</span><br /><b>{{ hospitalShuttle: '医院免费班车', taxi: '出租车', ambulance: '救护转运车', walk: '步行陪同' }[order.crossCampus.transport]}</b></div>
            <div><span className="muted small">状态</span><br /><b>{({ planned: '已规划', enroute: '前往途中', checking: '检查中', returned: '已返院' })[order.crossCampus.status]}</b></div>
            <div><span className="muted small">发车时间</span><br /><b>{order.crossCampus.departTime}</b></div>
            <div><span className="muted small">预计返院</span><br /><b className="text-warn" style={{ color: 'var(--warn)' }}>{order.crossCampus.expectedReturnTime}</b></div>
            <div><span className="muted small">实际返院</span><br /><b>{order.crossCampus.actualReturnTime ? fmtDateTime(order.crossCampus.actualReturnTime) : '—'}</b></div>
          </div>
          <div className="callout info" style={{ marginTop: 12 }}>{order.crossCampus.note}</div>
          <div className="callout ok">✅ 报告互认：{order.crossCampus.reportMutualRecognized ? '跨院区检查报告两院互认，回总院可直接回诊，不重复检查、不重复收费' : '需回院区取报告'}</div>
        </div>
      )}

      {/* 换班知悉 */}
      {order.handover && (
        <div className="card">
          <h2>🔄 陪诊员换班交接</h2>
          <dl className="kv">
            <dt>交接</dt><dd>{ESCORTS.find((e) => e.id === order.handover!.fromEscortId)?.name} → {ESCORTS.find((e) => e.id === order.handover!.toEscortId)?.name}</dd>
            <dt>时间</dt><dd>{fmtDateTime(order.handover.time)}</dd>
            <dt>原因</dt><dd>{order.handover.reason}</dd>
            <dt>交接事项</dt><dd>{order.handover.checklist}</dd>
          </dl>
          {order.handover.acknowledgedByFamily
            ? <div className="callout ok">✅ 您已知悉并确认，服务不中断</div>
            : <button className="btn btn-primary" onClick={() => acknowledgeHandover(order.id)}>我已知悉，确认换班安排</button>}
        </div>
      )}

      {/* 远程授权 */}
      {order.authorizations.length > 0 && (
        <div className="card">
          <h2>🔏 家属远程授权</h2>
          <div className="sub">陪诊员遇到需要您拍板的处置（费用变化、跨院区、补单、停诊方案）时，在这里请求授权</div>
          {order.authorizations.map((a) => (
            <div key={a.id} className={`auth-card ${a.status}`}>
              <div className="ttl">{a.title}
                {a.status === 'pending' && <span className="badge red" style={{ marginLeft: 8 }}>待您决定</span>}
                {a.status === 'approved' && <span className="badge green" style={{ marginLeft: 8 }}>已授权</span>}
                {a.status === 'rejected' && <span className="badge gray" style={{ marginLeft: 8 }}>已拒绝</span>}
              </div>
              <div className="small" style={{ margin: '4px 0' }}>{a.detail}</div>
              <div className="small">费用变化：<b style={{ color: a.feeDelta > 0 ? 'var(--danger)' : 'var(--ok)' }}>{a.feeDelta > 0 ? '+' : ''}{a.feeDelta} 元</b>　<span className="muted">{fmtDateTime(a.createdAt)}</span></div>
              {a.status === 'pending' && (
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => decideAuthorization(order.id, a.id, true, contact)}>✅ 授权执行</button>
                  <button className="btn btn-danger btn-sm" onClick={() => decideAuthorization(order.id, a.id, false, contact)}>不同意，换备选方案</button>
                </div>
              )}
              {a.status !== 'pending' && <div className="small muted" style={{ marginTop: 6 }}>{a.responder} 于 {fmtDateTime(a.decidedAt)} {a.status === 'approved' ? '授权' : '拒绝'}</div>}
            </div>
          ))}
        </div>
      )}

      {/* 医生临时加开空腹项目：三方案选择 */}
      {order.fastingAddons && order.fastingAddons.length > 0 && (
        <div className="card">
          <h2>🍚 医生临时加开空腹项目 · 方案选择</h2>
          <div className="sub">陪诊员已核查患者进食情况，并对当日检查顺序、缴费、取号与回诊时间做了整体重算，请家属选择下一步</div>
          {order.fastingAddons.map((a) => (
            <div key={a.id} className="inc-card" style={{ borderLeft: '4px solid var(--primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <b>{a.examName}</b>
                {a.status === 'checking' && <span className="badge orange">陪诊员核查进食中…</span>}
                {a.status === 'awaitingFamily' && <span className="badge red">待您选择</span>}
                {a.status === 'wait' && <span className="badge blue">已选：继续等待·今日空腹完成</span>}
                {a.status === 'reschedule' && <span className="badge gray">已选：改日检查</span>}
                {a.status === 'othersFirst' && <span className="badge teal">已选：先做其他项目</span>}
              </div>
              {a.check && (
                <div className="small" style={{ margin: '6px 0' }}>
                  进食核查（系统 {new Date(a.check.checkedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 盖戳）：
                  末次进食{a.check.mealDay === 'yesterday' ? '昨日' : a.check.mealDay === 'earlier' ? '前天或更早' : '今日'} {a.check.lastMealTime}
                  → 系统计算已空腹 <b>{a.check.fastingHours} 小时</b>
                  {a.check.riskNote ? `；${a.check.riskNote}` : ''}
                  {a.check.adjusted && <span className="badge orange" style={{ marginLeft: 6 }}>时间已自动修正</span>}
                </div>
              )}
              {a.status === 'checking' && <div className="callout warn" style={{ margin: 0 }}>陪诊员正在确认患者是否已进食、当日检查顺序和可改约时间，方案稍后同步。</div>}
              {a.status !== 'checking' && a.plans && (
                <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  {a.plans.map((p) => (
                    <AddonPlanCard
                      key={p.key}
                      plan={p}
                      selected={a.chosenPlan === p.key}
                      disabled={a.status === 'awaitingFamily' ? false : true}
                      onSelect={a.status === 'awaitingFamily' ? () => familyChooseAddonPlan(order.id, a.id, p.key, contact) : undefined}
                      actionLabel={p.key === 'wait' ? '继续等待，今日空腹完成' : p.key === 'reschedule' ? '同意改日检查' : '先做其他项目'}
                    />
                  ))}
                </div>
              )}
              {a.revisitImpacted && (a.status === 'wait' || a.status === 'othersFirst') && (
                <div className="callout danger" style={{ marginTop: 10 }}>
                  {a.assistantConfirmed
                    ? `✅ 陪诊员已联系医生助理确认新回诊时间（${a.assistantNote}）`
                    : '⚠ 回诊时间因顺序调整改变，陪诊员将先联系医生助理确认号源后再进入回诊，请留意同步。'}
                </div>
              )}
              {a.status === 'reschedule' && (
                <div className="callout info" style={{ marginTop: 10 }}>
                  改约时间：{a.rescheduleDate ?? a.rescheduleOptions[0]}；今日回诊自动顺延，改约前一日陪诊员会电话提醒禁食。
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        {/* 远程同步对话 */}
        <div className="card">
          <h2>💬 远程同步（状态 / 下一步 / 费用）</h2>
          <div className="sub">陪诊员会把当前阶段、排队叫号、下一步选择与费用变化实时同步到这里，您也可以随时追问</div>
          <ChatPanel order={order} role="family" author={contact} />
        </div>
        {/* 费用 */}
        <div className="card">
          <h2>💰 费用变化明细</h2>
          <FeeTable order={order} />
          <div className="callout warn" style={{ marginTop: 10 }}>
            异常处置产生的加收/退费，均需在左侧对话中说明并经您授权后入账；跨院区含交通费 + 跨区陪诊费。
          </div>
        </div>
      </div>

      {/* 服务档案 + 评价 */}
      {order.status === 'completed' && order.archive && (
        <div className="card">
          <h2>📁 本次服务档案</h2>
          <div className="grid grid-2" style={{ alignItems: 'start' }}>
            <div>
              <dl className="kv">
                <dt>诊断结果</dt><dd>{order.archive.diagnosis}</dd>
                <dt>用药说明</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{order.archive.medicationGuide}</dd>
                <dt>复查时间</dt><dd><b style={{ color: 'var(--danger)' }}>{order.archive.revisitDate}</b>（系统将在复诊前 3 天/1 天向家属与陪诊员推送提醒）</dd>
                <dt>发票</dt><dd>{order.archive.invoiceHandled ? `已开具电子发票 ${order.archive.invoiceNumber ?? ''}` : '待开具'}</dd>
                <dt>报告出具</dt><dd>{order.archive.reportReadyAt || reportReadyText(order)}</dd>
                <dt>报告领取</dt><dd>{order.archive.reportPickup}</dd>
              </dl>
            </div>
            <div>
              <h3>陪诊服务评价</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0' }}>
                <Stars value={rating} onChange={setRating} size={26} />
                <b>{rating} 星</b>
              </div>
              <div style={{ marginBottom: 10 }}>
                {RATING_TAGS.map((t) => (
                  <button key={t} type="button" className={`check-pill ${tags.includes(t) ? 'on' : ''}`} onClick={() => toggleTag(t)}>
                    {tags.includes(t) ? '✓ ' : ''}{t}
                  </button>
                ))}
              </div>
              <textarea className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="说说本次陪诊的感受，将进入陪诊员服务质量评估" />
              <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => rateOrder(order.id, rating, tags, comment || '家属未填写文字评价')}>提交评价</button>
              <div className="callout teal" style={{ marginTop: 12 }}>
                评价将与本次行程的准点率、异常响应时长、费用透明度一起，进入陪诊员服务质量评估（服务台端可见星级、本月单量与好评标签）。
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
