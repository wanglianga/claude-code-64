import { useEffect, useRef, useState } from 'react';
import type { AddonPlanView, ChatMessage, EscortOrder, MaterialItem, OrderStatus, RecomputedSchedule, ServiceArchive } from './types';
import { feeTotal, useStore } from './store';
import { fmtTime } from './plan';
import { EXAMS } from './data';

export function StatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, { text: string; cls: string }> = {
    draft: { text: '等待接单', cls: 'orange' },
    accepted: { text: '已接单 · 待到院', cls: 'blue' },
    ongoing: { text: '到院执行中', cls: 'teal' },
    completed: { text: '已归档', cls: 'green' },
    cancelled: { text: '已取消', cls: 'gray' },
  };
  const m = map[status];
  return <span className={`badge ${m.cls}`}>{m.text}</span>;
}

export function Stars({ value, size = 14, onChange }: { value: number; size?: number; onChange?: (v: number) => void }) {
  return (
    <span className="stars" style={{ fontSize: size, cursor: onChange ? 'pointer' : 'default' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? '' : 'off'} onClick={() => onChange?.(n)}>★</span>
      ))}
    </span>
  );
}

/** 横向阶段时间轴 */
export function StageStepper({ order }: { order: EscortOrder }) {
  return (
    <div className="timeline-now">
      {order.stages.map((s) => (
        <div key={s.key} className={`tl-step ${s.status} ${s.key === 'done' ? 'done' : ''}`}>
          <span className="dot" />
          <div className="t">
            {s.status === 'done' ? '✓ ' : s.status === 'active' ? '● ' : ''}{s.label}
          </div>
          <div className="l">{s.status === 'skipped' ? '本次无此项' : s.waitMinutes ? `约 ${s.waitMinutes} 分钟` : ''}</div>
        </div>
      ))}
    </div>
  );
}

export function MaterialChecklist({ items, orderId, editable }: { items: MaterialItem[]; orderId: string; editable: boolean }) {
  const toggle = useStore((s) => s.toggleMaterial);
  const prepared = items.filter((i) => i.prepared).length;
  return (
    <div>
      <div className="small muted" style={{ marginBottom: 6 }}>已备齐 {prepared}/{items.length}{editable ? '（点击勾选，陪诊员到院后逐项核对）' : ''}</div>
      {items.map((m, i) => (
        <label key={i} className={`mat-item ${m.prepared ? 'done' : ''}`} style={{ cursor: editable ? 'pointer' : 'default' }}>
          <input
            type="checkbox" className="mat-check" checked={!!m.prepared} disabled={!editable}
            onChange={() => toggle(orderId, i)}
          />
          <span>
            <div className="mat-name">{m.name} {m.required ? <span className="badge red mat-req">必备</span> : <span className="badge gray mat-req">建议</span>}</div>
            <div className="mat-reason">{m.reason}</div>
          </span>
        </label>
      ))}
    </div>
  );
}

export function FeeTable({ order }: { order: EscortOrder }) {
  return (
    <table className="fee-table">
      <thead><tr><th>费用项目</th><th>时间</th><th className="amt">金额（元）</th></tr></thead>
      <tbody>
        {order.fees.map((f) => (
          <tr key={f.id}>
            <td>{f.label}</td>
            <td className="small muted">{fmtTime(f.at)}</td>
            <td className={`amt ${f.amount < 0 ? 'neg' : ''}`}>{f.amount < 0 ? '-' : ''}{Math.abs(f.amount).toFixed(0)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr><td>累计应缴（含退费）</td><td></td><td className="amt">{feeTotal(order).toFixed(0)}</td></tr>
      </tfoot>
    </table>
  );
}

/** 家属—陪诊员 同步面板（当前状态 / 费用变化 / 授权 / 追问 都会沉淀在这里） */
export function ChatPanel({
  order, role, author,
}: { order: EscortOrder; role: 'family' | 'escort'; author: string }) {
  const postMessage = useStore((s) => s.postMessage);
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current as unknown as { scrollTo?: (o: ScrollToOptions) => void; scrollHeight?: number } | null;
    if (el && typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight ?? 0 });
  }, [order.messages.length]);

  const send = () => {
    if (!text.trim()) return;
    postMessage(order.id, text.trim(), role, author, 'chat');
    setText('');
  };

  const cls = (m: ChatMessage) => (m.from === 'system' ? 'system' : m.from === 'family' ? 'family' : 'escort');
  const kindLabel: Record<ChatMessage['kind'], string> = {
    chat: '', status: '进度', fee: '费用', auth: '授权', report: '档案', system: '',
  };

  return (
    <div className="chat-box">
      <div className="chat-scroll" ref={scrollRef}>
        {order.messages.map((m) => (
          <div key={m.id} className={`msg ${cls(m)} ${m.from === 'system' ? '' : `kind-${m.kind}`}`}>
            {m.from !== 'system' && (
              <div className="meta">
                {m.author}
                {m.kind !== 'chat' && <span className="tag-mini" style={{ marginLeft: 6 }}>{kindLabel[m.kind]}</span>}
                <span style={{ marginLeft: 8 }}>{fmtTime(m.ts)}</span>
              </div>
            )}
            {m.text}
          </div>
        ))}
      </div>
      <div className="chat-input">
        <input
          className="input" placeholder={role === 'family' ? '远程追问陪诊员：当前位置、排队、费用…' : '回复家属 / 主动同步进展…'}
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn btn-primary" onClick={send}>发送</button>
      </div>
    </div>
  );
}

/** 检查报告领取与出具时间提示 */
export function ReportReadyHint({ order }: { order: EscortOrder }) {
  const exams = EXAMS.filter((e) => order.form.examIds.includes(e.id));
  if (exams.length === 0) return null;
  return (
    <div className="small">
      {exams.map((e) => (
        <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px dashed var(--line)' }}>
          <span>{e.short}（{e.building}）</span>
          <span className="muted">{e.reportHours < 1 ? '30 分钟' : `${e.reportHours} 小时`}出报告 · {e.fee} 元</span>
        </div>
      ))}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="empty">📭 {text}</div>;
}

/** 空腹加项方案中「缴费/取号/回诊」重算结果 */
export function RecomputedScheduleView({ schedule, compact }: { schedule: RecomputedSchedule; compact?: boolean }) {
  return (
    <div className="recompute" style={{ border: '1px solid var(--line)', borderRadius: 9, padding: '10px 12px', marginTop: 8, background: '#fbfdfe' }}>
      <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>🧮 检查顺序调整后重算（缴费 / 取号 / 回诊）</div>
      <table className="fee-table" style={{ fontSize: 12.5 }}>
        <thead><tr><th>环节</th><th>取号票</th><th>呼叫时间</th><th>排队</th><th className="amt">费用</th></tr></thead>
        <tbody>
          {schedule.tickets.map((t, i) => (
            <tr key={i}>
              <td>{t.label}{t.note ? <div className="muted" style={{ fontSize: 11.5 }}>{t.note}</div> : null}</td>
              <td className="mono small">{t.ticketNo || '—'}</td>
              <td className="small">{t.callTime}</td>
              <td className="small">{t.waitMinutes} 分</td>
              <td className={`amt ${t.fee ? '' : 'muted'}`}>{t.fee ? `${t.fee} 元` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
        <span className="small">原回诊：<b>{schedule.originalRevisitTime}</b></span>
        <span className="small">重算回诊：<b style={{ color: 'var(--primary-dark)' }}>{schedule.revisitTime}</b></span>
        <span className="small">新增费用合计：<b style={{ color: schedule.extraFeeTotal ? 'var(--danger)' : 'var(--ok)' }}>{schedule.extraFeeTotal ? `+${schedule.extraFeeTotal} 元` : '0 元'}</b></span>
      </div>
      {!compact && <div className="callout warn" style={{ margin: '8px 0 0' }}>{schedule.note}</div>}
    </div>
  );
}

/** 单个方案卡（可点选择） */
export function AddonPlanCard({
  plan, selected, disabled, onSelect, actionLabel,
}: {
  plan: AddonPlanView;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className={`inc-opt ${selected ? 'chosen' : ''}`} style={{ display: 'block', padding: 0, borderRadius: 10, overflow: 'hidden', borderColor: selected ? 'var(--ok)' : plan.feasible ? undefined : 'var(--ink-3)', opacity: plan.feasible ? 1 : 0.65 }}>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <b>{plan.title}</b>
          <span className={`badge ${plan.feasible ? (plan.revisitImpacted ? 'orange' : 'green') : 'red'}`}>
            {!plan.feasible ? '当前不可行' : plan.revisitImpacted ? '回诊时间受影响' : '回诊不受影响'}
          </span>
        </div>
        <div className="small" style={{ margin: '6px 0' }}>{plan.text}</div>
        <RecomputedScheduleView schedule={plan.schedule} compact />
        {onSelect && plan.feasible && (
          <button className={`btn btn-sm ${selected ? '' : 'btn-primary'}`} style={{ marginTop: 8 }} disabled={disabled} onClick={onSelect}>
            {selected ? '✓ 已选择' : actionLabel ?? '选择此方案'}
          </button>
        )}
        {!plan.feasible && <div className="small" style={{ color: 'var(--danger)', marginTop: 6 }}>需待空腹达标或改约，不可选择此项</div>}
      </div>
    </div>
  );
}

export function Spent({ archive }: { archive?: ServiceArchive }) {
  if (!archive) return null;
  return <Stars value={archive.rating} />;
}
