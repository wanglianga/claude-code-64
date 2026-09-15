import { CAMPUSES, DEPARTMENTS, ESCORTS, EXAMS, MOBILITY_LABELS } from '../data';
import { useStore } from '../store';
import { Empty, Stars, StatusBadge } from '../ui';

export default function EscortHome({ escortId, onOpen }: { escortId: string; onOpen: (id: string) => void }) {
  const orders = useStore((s) => s.orders);
  const acceptOrder = useStore((s) => s.acceptOrder);
  const me = ESCORTS.find((e) => e.id === escortId)!;

  const pool = orders.filter((o) => o.status === 'draft');
  const mine = orders.filter((o) => o.escortId === escortId && o.status !== 'cancelled' && o.status !== 'draft');
  const ongoing = mine.filter((o) => o.status === 'ongoing');
  const accepted = mine.filter((o) => o.status === 'accepted');
  const done = mine.filter((o) => o.status === 'completed');
  const pendingAuth = orders.filter((o) => o.escortId === escortId && o.authorizations.some((a) => a.status === 'pending')).length;
  const pendingFasting = orders.filter((o) => o.escortId === escortId && (o.fastingAddons ?? []).some((a) => a.status === 'awaitingFamily' || a.status === 'checking')).length;

  return (
    <div>
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="stat-tile"><div className="num">{accepted.length + ongoing.length}</div><div className="lb">我的在跟订单</div></div>
        <div className="stat-tile"><div className="num" style={{ color: pendingAuth ? 'var(--danger)' : undefined }}>{pendingAuth}</div><div className="lb">待家属授权事项</div></div>
        <div className="stat-tile"><div className="num">{done.length}</div><div className="lb">本月已归档（我）</div></div>
      </div>

      {pendingAuth > 0 && (
        <div className="callout danger">有 {pendingAuth} 个异常处置方案正等待家属远程授权，请进入订单查看并可电话提醒家属。</div>
      )}
      {pendingFasting > 0 && (
        <div className="callout warn">有 {pendingFasting} 个「医生临时加开空腹项目」正待核查进食或待家属选择方案（继续等待 / 改日检查 / 先做其他项目）。</div>
      )}

      {/* 抢单池 */}
      <div className="card">
        <h2>🛎️ 待接单队列（{pool.length}）</h2>
        <div className="sub">系统按科室专长、班次匹配；接单后将看到挂号时间、楼栋诊室、缴费窗口、检验检查点与路线</div>
        {pool.length === 0 && <Empty text="暂无可接订单" />}
        {pool.map((o) => {
          const d = DEPARTMENTS.find((x) => x.id === o.form.departmentId)!;
          const exams = EXAMS.filter((e) => o.form.examIds.includes(e.id));
          const match = me.strongDepartments.includes(d.id);
          return (
            <div key={o.id} className="order-card" style={{ cursor: 'default' }}>
              <div className="top">
                <b style={{ fontSize: 15 }}>{d.name} · {o.form.patientName}（{o.form.patientAge} 岁）</b>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {match && <span className="badge teal">科室专长匹配</span>}
                  <StatusBadge status={o.status} />
                </div>
              </div>
              <div className="body">
                <span><b>院区：</b>{CAMPUSES.find((c) => c.id === d.campusId)?.name}</span>
                <span><b>就诊：</b>{o.form.appointmentDate} {o.advice.slotStart} 时段</span>
                <span><b>建议到院：</b><b style={{ color: 'var(--primary-dark)' }}>{o.advice.arriveTime}</b>（挂号 {o.advice.registerTime}）</span>
                <span><b>行动：</b>{MOBILITY_LABELS[o.form.mobility]}{o.form.needWheelchair ? ' · ♿需轮椅' : ''}</span>
                <span><b>空腹：</b>{o.form.fasting || exams.some((e) => e.needFasting) ? '是 ⚠' : '否'}</span>
                <span><b>检查：</b>{exams.map((e) => e.short).join('、') || '无'}</span>
                <span style={{ gridColumn: '1 / -1' }}><b>诉求：</b>{o.form.demands || '—'}</span>
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-primary btn-sm" onClick={() => acceptOrder(o.id, escortId)}>我接单</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 我的订单 */}
      <div className="card">
        <h2>📂 我的陪诊单（{mine.length}）</h2>
        {mine.length === 0 && <Empty text="接单后会出现在这里" />}
        {mine.map((o) => {
          const d = DEPARTMENTS.find((x) => x.id === o.form.departmentId)!;
          const waitAuth = o.authorizations.some((a) => a.status === 'pending');
          const active = o.stages[o.activeStageIndex];
          return (
            <button key={o.id} className="order-card" onClick={() => onOpen(o.id)}>
              <div className="top">
                <b style={{ fontSize: 15 }}>{d.name} · {o.form.patientName}</b>
                <div style={{ display: 'flex', gap: 6 }}>
                  {waitAuth && <span className="badge red">待授权</span>}
                  {(o.fastingAddons ?? []).some((a) => a.status === 'awaitingFamily') && <span className="badge orange">空腹方案待家属选</span>}
                  {(o.fastingAddons ?? []).some((a) => a.status === 'checking') && <span className="badge orange">待核查进食</span>}
                  {o.status === 'ongoing' && <span className="badge teal"><span className="pulse" style={{ marginRight: 5 }} />{active?.label}</span>}
                  <StatusBadge status={o.status} />
                </div>
              </div>
              <div className="body">
                <span><b>单号：</b><span className="code">{o.code}</span></span>
                <span><b>到院：</b>{o.advice.arriveTime}{o.arrivedAt ? `（实际 ${new Date(o.arrivedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}）` : ''}</span>
                <span><b>诊室：</b>{o.room}</span>
                <span><b>未闭环异常：</b>{o.incidents.filter((i) => i.status === 'open').length}</span>
                {o.status === 'completed' && o.archive && (
                  <span><b>评价：</b><Stars value={o.archive.rating} /> {o.archive.rating}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
