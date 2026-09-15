import { useMemo, useState } from 'react';
import { CAMPUSES, DEPARTMENTS, EXAMS, MOBILITY_LABELS } from '../data';
import type { BookingForm, MobilityLevel } from '../types';
import { useStore } from '../store';
import { buildAdvice, buildMaterials, todayStr } from '../plan';
import { Empty, StatusBadge } from '../ui';

const initial: BookingForm = {
  departmentId: 'digest',
  patientName: '',
  patientAge: 65,
  patientGender: '女',
  contactName: '',
  contactPhone: '',
  mobility: 'slow',
  medicalHistory: '',
  examSheetText: '',
  examIds: [],
  needWheelchair: false,
  fasting: false,
  demands: '',
  appointmentDate: todayStr(),
  preferredSlot: 'morning',
  crossCampusExpected: false,
};

export default function FamilyHome({ onOpen }: { onOpen: (id: string) => void }) {
  const orders = useStore((s) => s.orders);
  const submitBooking = useStore((s) => s.submitBooking);
  const [form, setForm] = useState<BookingForm>(initial);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const set = <K extends keyof BookingForm>(k: K, v: BookingForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dept = DEPARTMENTS.find((d) => d.id === form.departmentId)!;
  const deptExams = useMemo(() => EXAMS, []);

  const previewAdvice = useMemo(() => buildAdvice(form), [form]);
  const previewMaterials = useMemo(() => buildMaterials(form), [form]);

  const toggleExam = (id: string) =>
    set('examIds', form.examIds.includes(id) ? form.examIds.filter((x) => x !== id) : [...form.examIds, id]);

  const submit = () => {
    if (!form.patientName.trim() || !form.contactName.trim() || !form.contactPhone.trim()) {
      alert('请填写就诊人姓名、家属称呼与联系电话');
      return;
    }
    const id = submitBooking({ ...form });
    setSubmittedId(id);
    setForm(initial);
    setTimeout(() => document.getElementById('my-orders')?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const myOrders = orders.filter((o) => o.status !== 'cancelled');

  return (
    <div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        {/* 左：预约表单 */}
        <div className="card">
          <h2>📝 提交陪诊预约</h2>
          <div className="sub">填写后系统将立即生成「分时到院建议」与「携带材料清单」，并派单给匹配科室的陪诊员</div>

          <div className="grid grid-2">
            <div className="field">
              <label>就诊科室</label>
              <select className="input" value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
                {DEPARTMENTS.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}（{CAMPUSES.find((c) => c.id === d.campusId)?.name}）</option>
                ))}
              </select>
              <div className="hint">{dept.morningPeak}，平均候诊 {dept.avgWait} 分钟</div>
            </div>
            <div className="field">
              <label>就诊日期 / 时段</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="date" className="input" style={{ flex: 1 }} value={form.appointmentDate} min={todayStr()} onChange={(e) => set('appointmentDate', e.target.value)} />
                <button className={`switch-opt ${form.preferredSlot === 'morning' ? 'on' : ''}`} onClick={() => set('preferredSlot', 'morning')}>上午</button>
                <button className={`switch-opt ${form.preferredSlot === 'afternoon' ? 'on' : ''}`} onClick={() => set('preferredSlot', 'afternoon')}>下午</button>
              </div>
            </div>
          </div>

          <div className="grid grid-3">
            <div className="field">
              <label>就诊人姓名</label>
              <input className="input" value={form.patientName} placeholder="如：刘桂芳" onChange={(e) => set('patientName', e.target.value)} />
            </div>
            <div className="field">
              <label>年龄</label>
              <input type="number" className="input" value={form.patientAge} onChange={(e) => set('patientAge', Number(e.target.value))} />
            </div>
            <div className="field">
              <label>性别</label>
              <div className="switch-row">
                {(['女', '男'] as const).map((g) => (
                  <button key={g} className={`switch-opt ${form.patientGender === g ? 'on' : ''}`} onClick={() => set('patientGender', g)}>{g}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-2">
            <div className="field">
              <label>家属称呼（远程联系人）</label>
              <input className="input" value={form.contactName} placeholder="如：张女士（儿媳）" onChange={(e) => set('contactName', e.target.value)} />
            </div>
            <div className="field">
              <label>家属电话</label>
              <input className="input" value={form.contactPhone} placeholder="用于异常授权与进度电话同步" onChange={(e) => set('contactPhone', e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>行动能力</label>
            <div className="switch-row">
              {(Object.keys(MOBILITY_LABELS) as MobilityLevel[]).map((m) => (
                <button key={m} className={`switch-opt ${form.mobility === m ? 'on' : ''}`} onClick={() => set('mobility', m)}>{MOBILITY_LABELS[m]}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>既往病历 <span className="hint">（病史、手术史、过敏史、长期用药）</span></label>
            <textarea className="input" value={form.medicalHistory} placeholder="如：高血压 12 年、糖尿病、去年胆囊切除术；青霉素过敏；长期服用阿司匹林" onChange={(e) => set('medicalHistory', e.target.value)} />
          </div>

          <div className="field">
            <label>检查单 / 本次预计检查项</label>
            <textarea className="input" style={{ minHeight: 48 }} value={form.examSheetText} placeholder="可粘贴医生开具的检查单原文，下方也可结构化勾选" onChange={(e) => set('examSheetText', e.target.value)} />
            <div style={{ marginTop: 8 }}>
              {deptExams.map((ex) => (
                <button key={ex.id} type="button" className={`check-pill ${form.examIds.includes(ex.id) ? 'on' : ''}`} onClick={() => toggleExam(ex.id)}>
                  {form.examIds.includes(ex.id) ? '✓ ' : ''}{ex.short}
                  <span className="hint" style={{ marginLeft: 4 }}>{ex.needFasting ? '空腹·' : ''}{ex.queueMinutes}min·{ex.fee}元</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-2">
            <div className="field">
              <label>特殊情况</label>
              <div className="switch-row">
                <button className={`switch-opt ${form.needWheelchair ? 'on' : ''}`} onClick={() => set('needWheelchair', !form.needWheelchair)}>
                  ♿ {form.needWheelchair ? '需要轮椅' : '是否需要轮椅'}
                </button>
                <button className={`switch-opt ${form.fasting ? 'on' : ''}`} onClick={() => set('fasting', !form.fasting)}>
                  🍚 {form.fasting ? '需空腹（已禁食）' : '是否空腹'}
                </button>
                <button className={`switch-opt ${form.crossCampusExpected ? 'on' : ''}`} onClick={() => set('crossCampusExpected', !form.crossCampusExpected)}>
                  🏥 可能跨院区
                </button>
              </div>
            </div>
            <div className="field">
              <label>陪诊诉求</label>
              <textarea className="input" style={{ minHeight: 72 }} value={form.demands} placeholder="如：老人独自就诊需全程陪同；家属远程关注进度；需要医嘱转述…" onChange={(e) => set('demands', e.target.value)} />
            </div>
          </div>

          <button className="btn btn-primary" style={{ width: '100%', padding: '11px' }} onClick={submit}>提交预约并生成分时到院方案</button>
          {submittedId && (
            <div className="callout ok" style={{ marginTop: 12 }}>
              ✅ 预约已提交！可在下方「我的陪诊单」打开查看方案，陪诊员接单后会显示挂号时间与楼栋路线。
              <button className="btn btn-sm btn-primary" style={{ marginLeft: 10 }} onClick={() => onOpen(submittedId)}>立即查看</button>
            </div>
          )}
        </div>

        {/* 右：实时预览方案 */}
        <div style={{ position: 'sticky', top: 80 }}>
          <div className="time-hero">
            <div>
              <div className="lbl">建议到院时间</div>
              <div className="big">{previewAdvice.arriveTime}</div>
            </div>
            <div>
              <div className="lbl">建议完成挂号</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{previewAdvice.registerTime}</div>
            </div>
            <div>
              <div className="lbl">出诊时段</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{previewAdvice.slotStart}</div>
            </div>
            <span className={`badge ${previewAdvice.crowdedness === '高' ? 'red' : previewAdvice.crowdedness === '中' ? 'orange' : 'green'}`}>
              拥堵程度：{previewAdvice.crowdedness}
            </span>
          </div>

          <div className="card">
            <h2>🕑 为什么是这个时间</h2>
            {previewAdvice.reason.length === 0 && <div className="muted small">选择科室、检查项与时段后，这里会给出分时依据</div>}
            {previewAdvice.reason.map((r, i) => (
              <div key={i} className="callout teal" style={{ margin: '7px 0' }}>{r}</div>
            ))}
          </div>

          <div className="card">
            <h2>🎒 材料清单预览（{previewMaterials.length} 项）</h2>
            <div className="small" style={{ maxHeight: 260, overflowY: 'auto' }}>
              {previewMaterials.slice(0, 8).map((m, i) => (
                <div key={i} className="mat-item" style={{ cursor: 'default' }}>
                  <span>
                    <div className="mat-name">{m.name} {m.required ? <span className="badge red mat-req">必备</span> : <span className="badge gray mat-req">建议</span>}</div>
                    <div className="mat-reason">{m.reason}</div>
                  </span>
                </div>
              ))}
              {previewMaterials.length > 8 && <div className="muted small" style={{ paddingTop: 6 }}>…提交后在详情中查看全部 {previewMaterials.length} 项并逐项勾选</div>}
            </div>
          </div>
        </div>
      </div>

      {/* 我的陪诊单 */}
      <div id="my-orders" className="card" style={{ marginTop: 18 }}>
        <h2>📋 我的陪诊单</h2>
        {myOrders.length === 0 && <Empty text="还没有预约，提交左侧表单试试" />}
        {myOrders.map((o) => {
          const d = DEPARTMENTS.find((x) => x.id === o.form.departmentId)!;
          return (
            <button key={o.id} className="order-card" onClick={() => onOpen(o.id)}>
              <div className="top">
                <b style={{ fontSize: 15 }}>{d.name} · {o.form.patientName}（{o.form.patientAge} 岁{o.form.patientGender}）</b>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {(o.fastingAddons ?? []).some((a) => a.status === 'awaitingFamily') && <span className="badge red">🍚 空腹加项待您选方案</span>}
                  <StatusBadge status={o.status} />
                </span>
              </div>
              <div className="body">
                <span><b>单号：</b><span className="code">{o.code}</span></span>
                <span><b>建议到院：</b>{o.form.appointmentDate} {o.advice.arriveTime}</span>
                <span><b>行动能力：</b>{MOBILITY_LABELS[o.form.mobility]}{o.form.needWheelchair ? ' · 需轮椅' : ''}</span>
                <span><b>检查：</b>{o.form.examIds.length} 项{o.form.fasting ? ' · 空腹' : ''}</span>
                <span><b>待办：</b>
                  {o.status === 'draft' && '等待陪诊员接单'}
                  {o.status === 'accepted' && '按建议时间到院，陪诊员门口接应'}
                  {o.status === 'ongoing' && `当前：${o.stages[o.activeStageIndex]?.label}`}
                  {o.status === 'completed' && '查看服务档案 / 评价'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
