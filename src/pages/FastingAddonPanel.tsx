import { useState } from 'react';
import { ADDON_EXAMS } from '../data';
import { useStore } from '../store';
import type { EscortOrder, FastingAddonConflict, FastingCheck } from '../types';
import { AddonPlanCard, RecomputedScheduleView } from '../ui';

const STATUS_LABEL: Record<FastingAddonConflict['status'], { text: string; cls: string }> = {
  checking: { text: '待核查进食', cls: 'orange' },
  awaitingFamily: { text: '待家属选择方案', cls: 'red' },
  wait: { text: '继续等待·空腹完成', cls: 'blue' },
  reschedule: { text: '改日检查', cls: 'gray' },
  othersFirst: { text: '先做其他项目', cls: 'teal' },
};

function EatingCheckForm({ order, addon }: { order: EscortOrder; addon: FastingAddonConflict }) {
  const submitFastingCheck = useStore((s) => s.submitFastingCheck);
  const def = ADDON_EXAMS.find((x) => x.id === addon.examId)!;
  const [eaten, setEaten] = useState(false);
  const [lastMeal, setLastMeal] = useState('20:30');
  const [hours, setHours] = useState(12);
  const historyRisk = /糖尿病|低血糖|高血压|冠心|心脏/.test(order.form.medicalHistory) ? `基础病：${order.form.medicalHistory}` : '';
  const [risk, setRisk] = useState(historyRisk);

  return (
    <div className="callout warn">
      <b>第一步 · 立即核查患者进食情况</b>（{def.name}，要求禁食 {def.fastingHoursRequired} 小时）
      <div className="switch-row" style={{ margin: '8px 0' }}>
        <button className={`switch-opt ${!eaten ? 'on' : ''}`} onClick={() => { setEaten(false); setHours(12); }}>未进食（仍空腹）</button>
        <button className={`switch-opt ${eaten ? 'on' : ''}`} onClick={() => { setEaten(true); setHours(0); }}>已进食</button>
      </div>
      <div className="grid grid-2">
        <label className="small">末次进食时间
          <input type="time" className="input" value={lastMeal} onChange={(e) => setLastMeal(e.target.value)} />
        </label>
        <label className="small">距末次进食（小时）
          <input type="number" className="input" value={hours} min={0} max={24} onChange={(e) => setHours(Number(e.target.value))} />
        </label>
      </div>
      <label className="small">风险提示（既往病历自动带入，可修改）
        <textarea className="input" value={risk} onChange={(e) => setRisk(e.target.value)} placeholder="如糖尿病史→空腹低血糖风险；胃镜→麻醉误吸风险" />
      </label>
      <button
        className="btn btn-primary btn-sm"
        disabled={!lastMeal}
        onClick={() => {
          const check: FastingCheck = { eaten, lastMealTime: lastMeal, fastingHours: hours, riskNote: risk };
          submitFastingCheck(order.id, addon.id, check);
        }}
      >确认核查结果，生成三方案并同步家属</button>
    </div>
  );
}

function AddonCard({ order, addon }: { order: EscortOrder; addon: FastingAddonConflict }) {
  const confirmAddonAssistant = useStore((s) => s.confirmAddonAssistant);
  const [note, setNote] = useState('');
  const def = ADDON_EXAMS.find((x) => x.id === addon.examId)!;
  const st = STATUS_LABEL[addon.status];
  const chosen = addon.plans?.find((p) => p.key === addon.chosenPlan);
  const needAssistant = addon.revisitImpacted && !!addon.recomputed && !addon.assistantConfirmed
    && (addon.status === 'wait' || addon.status === 'othersFirst');

  return (
    <div className="inc-card" style={{ borderLeft: `4px solid var(--${addon.status === 'awaitingFamily' ? 'danger' : addon.status === 'checking' ? 'warn' : 'primary'})` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <b>🍚 {def.name}</b>
        <span className={`badge ${st.cls}`}>{st.text}</span>
      </div>
      <div className="small muted" style={{ marginTop: 4 }}>
        {def.building} {def.location} · 费用 {def.fee} 元 · 排队约 {def.queueMinutes} 分钟 · 报告 {def.reportHours} 小时
      </div>

      {addon.status === 'checking' && <div style={{ marginTop: 10 }}><EatingCheckForm order={order} addon={addon} /></div>}

      {addon.status !== 'checking' && addon.plans && (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {addon.plans.map((p) => (
            <AddonPlanCard
              key={p.key}
              plan={p}
              selected={addon.chosenPlan === p.key}
              actionLabel="等待家属选择"
              disabled
            />
          ))}
        </div>
      )}

      {addon.status === 'awaitingFamily' && (
        <div className="callout danger" style={{ marginTop: 10 }}>
          已将继续等待 / 改日检查 / 先做其他项目三个方案（含缴费、取号、回诊重算）同步给家属，等待家属在其端选择；可电话提醒 {order.form.contactName}（{order.form.contactPhone}）。
        </div>
      )}

      {chosen && (
        <div style={{ marginTop: 10 }}>
          <div className="callout ok">家属已选择：{chosen.title}（{addon.decidedBy}）</div>
          <RecomputedScheduleView schedule={chosen.schedule} />
        </div>
      )}

      {addon.status === 'reschedule' && addon.recomputed && (
        <div className="callout info" style={{ marginTop: 10 }}>
          今日不加收加项费、回诊顺延至改约日后；改约时间：{addon.rescheduleDate ?? addon.rescheduleOptions[0]}。
          请在今日行程结束时把改约须知口头交代家属，系统已自动跳过当日回诊环节。
        </div>
      )}

      {needAssistant && (
        <div className="callout danger" style={{ marginTop: 10 }}>
          <b>⚠ 回诊时间被调整，进入回诊环节前必须先联系医生助理确认。</b>
          <div style={{ marginTop: 6 }}>
            <input className="input" placeholder="医生助理姓名/工号与确认的回诊号源，如：助理小王 已锁定 11:40 回诊号" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} disabled={!note.trim()} onClick={() => confirmAddonAssistant(order.id, addon.id, note)}>
              📞 已联系医生助理，确认新回诊时段
            </button>
          </div>
        </div>
      )}
      {addon.assistantConfirmed && (
        <div className="callout ok" style={{ marginTop: 10 }}>✅ 医生助理已确认：{addon.assistantNote}。回诊环节已解锁。</div>
      )}
    </div>
  );
}

export default function FastingAddonPanel({ order }: { order: EscortOrder }) {
  const raiseFastingAddon = useStore((s) => s.raiseFastingAddon);
  const [examId, setExamId] = useState(ADDON_EXAMS[0].id);
  const addons = order.fastingAddons ?? [];

  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div className="card">
        <h2>🍚 医生临时加开空腹项目</h2>
        <div className="sub">医生在问诊/开单环节临时增加空腹抽血或胃镜预约时，在此发起：核查进食 → 生成方案 → 家属选择 → 费用/取号/回诊整体重算 → 助理确认</div>
        <div className="field">
          <label>临时加开项目</label>
          <select className="input" value={examId} onChange={(e) => setExamId(e.target.value)}>
            {ADDON_EXAMS.map((d) => <option key={d.id} value={d.id}>{d.name}（{d.fee} 元 · 禁食 {d.fastingHoursRequired}h）</option>)}
          </select>
        </div>
        <button className="btn btn-primary" onClick={() => raiseFastingAddon(order.id, examId)}>医生临时加开，发起空腹冲突处置</button>
        <div className="callout teal" style={{ marginTop: 12 }}>
          系统会自动核查三件事：① 患者是否已进食（空腹时长是否达标）；② 当日检查顺序如何重排；③ 可改约时间。
          并对缴费窗口、各检查取号、回诊时间做<b>整体重算</b>，避免只改一项导致后续排队失效。
        </div>
      </div>

      <div className="card">
        <h2>处置列表（{addons.length}）</h2>
        {addons.length === 0 && <div className="muted small">暂无临时加开的空腹项目。</div>}
        {addons.map((a) => <AddonCard key={a.id} order={order} addon={a} />)}
      </div>
    </div>
  );
}
