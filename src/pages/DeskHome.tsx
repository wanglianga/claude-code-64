import { useMemo } from 'react';
import { DEPARTMENTS, ESCORTS, MOBILITY_LABELS, RATING_TAGS } from '../data';
import { useStore } from '../store';
import { Stars, StatusBadge } from '../ui';

function daysBetween(iso: string): number {
  const d = new Date(iso);
  const now = new Date();
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86_400_000);
}

export default function DeskHome(_: { onOpen: (id: string) => void }) {
  const orders = useStore((s) => s.orders);
  const resetAll = useStore((s) => s.resetAll);

  const stats = useMemo(() => ({
    total: orders.length,
    ongoing: orders.filter((o) => o.status === 'ongoing').length,
    accepted: orders.filter((o) => o.status === 'accepted').length,
    completed: orders.filter((o) => o.status === 'completed').length,
    pendingAuth: orders.reduce((n, o) => n + o.authorizations.filter((a) => a.status === 'pending').length, 0),
    openInc: orders.reduce((n, o) => n + o.incidents.filter((i) => i.status === 'open').length, 0),
    cross: orders.filter((o) => o.crossCampus).length,
  }), [orders]);

  // 陪诊员服务质量评估
  const quality = ESCORTS.map((e) => {
    const mine = orders.filter((o) => o.escortId === e.id);
    const rated = mine.filter((o) => o.archive && o.archive.rating > 0);
    const avg = rated.length ? rated.reduce((s, o) => s + (o.archive!.rating), 0) / rated.length : 0;
    const tagCount: Record<string, number> = {};
    rated.forEach((o) => o.archive!.ratingTags.forEach((t) => { tagCount[t] = (tagCount[t] ?? 0) + 1; }));
    const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const openInc = orders.reduce((n, o) => n + (o.escortId === e.id ? o.incidents.filter((i) => i.status === 'open').length : 0), 0);
    return { e, count: mine.length, ratedCount: rated.length, avg, topTags, openInc };
  }).sort((a, b) => b.avg - a.avg);

  // 复诊提醒
  const revisits = orders
    .filter((o) => o.status === 'completed' && o.archive?.revisitDate)
    .map((o) => ({ o, days: daysBetween(o.archive!.revisitDate) }))
    .sort((a, b) => a.days - b.days);

  const archived = orders.filter((o) => o.status === 'completed');

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 16 }}>
        <div className="stat-tile"><div className="num">{stats.total}</div><div className="lb">全部陪诊单</div></div>
        <div className="stat-tile"><div className="num" style={{ color: 'var(--info)' }}>{stats.accepted + stats.ongoing}</div><div className="lb">待到院/执行中</div></div>
        <div className="stat-tile"><div className="num" style={{ color: stats.pendingAuth ? 'var(--danger)' : undefined }}>{stats.pendingAuth}</div><div className="lb">待家属远程授权</div></div>
        <div className="stat-tile"><div className="num" style={{ color: stats.openInc ? 'var(--warn)' : undefined }}>{stats.openInc}</div><div className="lb">未闭环异常</div></div>
        <div className="stat-tile"><div className="num">{stats.cross}</div><div className="lb">跨院区行程</div></div>
        <div className="stat-tile"><div className="num" style={{ color: 'var(--ok)' }}>{stats.completed}</div><div className="lb">已归档服务</div></div>
      </div>

      {/* 进行中总览 */}
      <div className="card">
        <h2>🏥 全院陪诊实时总览</h2>
        {orders.filter((o) => o.status === 'ongoing' || o.status === 'accepted' || o.status === 'draft').length === 0 && <div className="muted small">暂无进行中订单</div>}
        {orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').map((o) => {
          const d = DEPARTMENTS.find((x) => x.id === o.form.departmentId)!;
          const e = ESCORTS.find((x) => x.id === o.escortId);
          return (
            <div key={o.id} className="inc-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <b>{o.code} · {d.name} · {o.form.patientName}（{o.form.mobility === 'wheelchair' ? '轮椅' : MOBILITY_LABELS[o.form.mobility]}）</b>
                <StatusBadge status={o.status} />
              </div>
              <div className="small" style={{ marginTop: 6 }}>
                陪诊员：{e?.name ?? '未分配'}
                {o.status === 'ongoing' && <>当前环节：<b>{o.stages[o.activeStageIndex]?.label}</b>（{o.stages[o.activeStageIndex]?.location}）　</>}
                待授权 {o.authorizations.filter((a) => a.status === 'pending').length}
                未闭环异常 {o.incidents.filter((i) => i.status === 'open').length}
                {(o.fastingAddons ?? []).some((a) => a.status === 'awaitingFamily') && <span className="badge orange" style={{ marginLeft: 6 }}>空腹加项待家属选方案</span>}
                {(o.fastingAddons ?? []).some((a) => ['wait', 'othersFirst'].includes(a.status) && a.revisitImpacted && !a.assistantConfirmed) && <span className="badge red" style={{ marginLeft: 6 }}>回诊待医生助理确认</span>}
                {o.crossCampus && <>　<span className="badge blue">跨院区 · {({ planned: '已规划', enroute: '前往中', checking: '检查中', returned: '已返院' })[o.crossCampus.status]}</span></>}
                {(o.transfers ?? []).filter((t) => t.status !== 'arrived' && t.status !== 'cancelled').length > 0 && (
                  (() => {
                    const tt = o.transfers.find((t) => t.status !== 'arrived' && t.status !== 'cancelled')!;
                    const map: Record<string, string> = { planned: '已规划', elevatorPending: '医梯待确认', elevatorConfirmed: '医梯已确认', volunteerRequested: '志愿者接应中', enroute: '转运途中' };
                    return <span className={`badge ${tt.status === 'elevatorPending' ? 'red' : 'teal'}`} style={{ marginLeft: 6 }}>♿ 转运{map[tt.status]}</span>;
                  })()
                )}
                {o.handover && <span className="badge orange" style={{ marginLeft: 6 }}>已换班{!o.handover.acknowledgedByFamily && '·待家属确认'}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        {/* 陪诊员服务质量评估 */}
        <div className="card">
          <h2>⭐ 陪诊员服务质量评估</h2>
          <div className="sub">综合家属星级、好评标签、单量与异常处置情况</div>
          {quality.map(({ e, count, ratedCount, avg, topTags, openInc }, idx) => (
            <div key={e.id} className="inc-card" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <b>#{idx + 1} {e.name}</b> <span className="small muted">{e.title} · {e.shift}</span>
                </div>
                <span className={`badge ${avg >= 4.8 ? 'green' : avg >= 4.5 ? 'blue' : 'orange'}`}>{avg >= 4.8 ? '金牌' : avg >= 4.5 ? '优秀' : '待提升'}</span>
              </div>
              <div className="small" style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Stars value={Math.round(avg)} /> <b>{avg ? avg.toFixed(1) : '—'}</b>
                <span className="muted">（{ratedCount} 条评价 / 本月 {count} 单，演示含在跟单）</span>
              </div>
              <div style={{ marginTop: 6 }}>
                {topTags.length > 0 ? topTags.map(([t, n]) => (
                  <span key={t} className="badge teal" style={{ marginRight: 6 }}>{t} ×{n}</span>
                )) : <span className="small muted">暂无评价标签</span>}
                {openInc > 0 && <span className="badge orange">未闭环异常 {openInc}</span>}
              </div>
            </div>
          ))}
          <div className="callout teal">
            评估维度：家属评分（{RATING_TAGS.join('、')}）、行程准点率、异常响应与授权闭环时长、费用透明度、投诉率。评估结果用于派单权重与月度评级。
          </div>
        </div>

        {/* 复诊提醒 */}
        <div className="card">
          <h2>🔔 复诊提醒</h2>
          <div className="sub">依据服务档案中的复查时间，提前 3 天 / 1 天向家属与原陪诊员推送</div>
          {revisits.length === 0 && <div className="muted small">暂无已归档复诊记录</div>}
          {revisits.map(({ o, days }) => (
            <div key={o.id} className="inc-card" style={{ marginBottom: 10, borderLeft: `4px solid ${days < 0 ? 'var(--danger)' : days <= 3 ? 'var(--warn)' : 'var(--ok)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <b>{o.form.patientName} · {DEPARTMENTS.find((d) => d.id === o.form.departmentId)?.name}</b>
                {days < 0 ? <span className="badge red">已逾期 {-days} 天</span>
                  : days === 0 ? <span className="badge red">今日复诊</span>
                  : days <= 3 ? <span className="badge orange">{days} 天后复诊</span>
                  : <span className="badge green">{days} 天后</span>}
              </div>
              <div className="small" style={{ marginTop: 5 }}>
                复查日期：<b>{o.archive!.revisitDate}</b>　家属：{o.form.contactName} {o.form.contactPhone}<br />
                原陪诊员：{ESCORTS.find((e) => e.id === o.escortId)?.name ?? '—'}
                {days <= 3 ? '已推送复诊提醒并开放一键再预约' : '将在复诊前 3 天自动提醒'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 服务档案库 */}
      <div className="card">
        <h2>📁 服务档案库（{archived.length}）</h2>
        {archived.length === 0 && <div className="muted small">暂无归档</div>}
        {archived.map((o) => {
          const d = DEPARTMENTS.find((x) => x.id === o.form.departmentId)!;
          const e = ESCORTS.find((x) => x.id === o.escortId);
          return (
            <div key={o.id} className="inc-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <b>{o.code} · {d.name} · {o.form.patientName}</b>
                <span className="small muted">陪诊：{e?.name} · 归档于 {new Date(o.completedAt!).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <dl className="kv" style={{ marginTop: 8 }}>
                <dt>诊断</dt><dd>{o.archive!.diagnosis}</dd>
                <dt>用药</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{o.archive!.medicationGuide}</dd>
                <dt>复查</dt><dd>{o.archive!.revisitDate}</dd>
                <dt>发票</dt><dd>{o.archive!.invoiceHandled ? o.archive!.invoiceNumber : '待补开'}</dd>
                <dt>报告</dt><dd>{o.archive!.reportReadyAt}；{o.archive!.reportPickup}</dd>
                <dt>评价</dt><dd><Stars value={o.archive!.rating} /> {o.archive!.rating} 星　{o.archive!.ratingTags.join('、')}<br /><span className="muted">“{o.archive!.ratingComment}”</span></dd>
              </dl>
            </div>
          );
        })}
      </div>

      <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('重置为演示种子数据？当前所有改动将被清除。')) resetAll(); }}>重置演示数据</button>
    </div>
  );
}
