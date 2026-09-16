import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { buildSegment, CONGESTION_TIP, isRouteConfigured, LOCATIONS, ORIGIN_KEYS, routeCongestedHint, transferFeeTotal } from '../transfer';
import { DEPARTMENTS } from '../data';
import type { EscortOrder, TransferMode, TransferSegment, TransferStatus, WheelchairTransfer } from '../types';

const MODE_LABEL: Record<TransferMode, string> = { wheelchair: '轮椅', stretcher: '医用平车（卧位）', walkAssist: '搀扶步行' };
const STATUS_LABEL: Record<TransferStatus, { text: string; cls: string }> = {
  planned: { text: '已规划', cls: 'gray' },
  elevatorPending: { text: '医梯待确认', cls: 'red' },
  elevatorConfirmed: { text: '医梯已确认', cls: 'blue' },
  volunteerRequested: { text: '已呼叫志愿者', cls: 'orange' },
  enroute: { text: '转运途中', cls: 'teal' },
  arrived: { text: '已到达', cls: 'green' },
  cancelled: { text: '已取消', cls: 'gray' },
};

function RoutePreview({ seg }: { seg: TransferSegment }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 9, padding: 12, marginTop: 10, background: '#fbfdfe' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="small">距离 <b>{seg.distanceMeters} 米</b></span>
        <span className="small">陪诊员预计耗时 <b style={{ color: 'var(--primary-dark)' }}>{seg.estimatedMinutes} 分钟</b>（含等电梯）</span>
        <span className={`badge ${seg.congestion === '拥堵' ? 'red' : seg.congestion === '一般' ? 'orange' : 'green'}`}>路线{seg.congestion}</span>
      </div>
      <div className="small" style={{ fontWeight: 700, marginBottom: 4 }}>无障碍路线</div>
      {seg.routeSteps.map((r, i) => (
        <div key={i} className="route-step"><span className="idx">{i + 1}</span><span className="txt">{r}</span></div>
      ))}
      <div className="small" style={{ fontWeight: 700, margin: '8px 0 4px' }}>电梯位置</div>
      {seg.elevators.map((e, i) => (
        <div key={i} className="callout info" style={{ margin: '4px 0' }}>
          🛗 <b>{e.name}</b>（{e.location}）<br /><span className="small">{e.note}</span>
        </div>
      ))}
      <div className={`callout ${seg.congestion === '拥堵' ? 'danger' : 'info'}`} style={{ marginBottom: 0 }}>{CONGESTION_TIP[seg.congestion]}</div>
    </div>
  );
}

function TransferForm({ order }: { order: EscortOrder }) {
  const createTransfer = useStore((s) => s.createTransfer);
  const orderCampus = DEPARTMENTS.find((d) => d.id === order.form.departmentId)?.campusId ?? 'main';
  const campusName = LOCATIONS[orderCampus === 'east' ? 'eastOutpatient' : 'outpatient1'].campusName;
  const defaultFrom = orderCampus === 'east' ? 'eastOutpatient' : 'outpatient2';
  const defaultTo = orderCampus === 'east' ? 'eastImaging' : 'medimaging';
  const [purpose, setPurpose] = useState('前往影像楼做 CT/MRI');
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [mode, setMode] = useState<TransferMode>('wheelchair');
  const [needSupine, setNeedSupine] = useState(order.form.mobility === 'bedridden');
  const [canToilet, setCanToilet] = useState(order.form.mobility === 'self' || order.form.mobility === 'slow');
  const [familyWith, setFamilyWith] = useState(false);
  const [congestion, setCongestion] = useState<TransferSegment['congestion']>('一般');
  const [formError, setFormError] = useState<string | null>(null);

  // 仅允许选择本订单院区的点位（跨院检查请走「跨院区」功能）
  const campusPoints = (Object.entries(LOCATIONS) as [string, typeof LOCATIONS[string]][])
    .filter(([, def]) => def.campusId === orderCampus);
  const fromKeys = campusPoints.filter(([k]) => ORIGIN_KEYS.includes(k));
  const toKeys = campusPoints.filter(([k]) => !ORIGIN_KEYS.includes(k));

  // 卧位强制平车
  const effectiveMode: TransferMode = needSupine ? 'stretcher' : mode;
  const deposit = effectiveMode === 'wheelchair' ? 500 : effectiveMode === 'stretcher' ? 1000 : 0;
  const rental = effectiveMode === 'stretcher' ? 30 : 0;
  const svc = effectiveMode === 'stretcher' ? 40 : 0;

  // 实时校验当前组合是否在本院区路线库中（不回退到其他院区）
  const routeReady = isRouteConfigured(from, to);
  const previewSegment = useMemo(() => {
    if (!routeReady) return null;
    try {
      return buildSegment(from, to, effectiveMode, congestion);
    } catch {
      return null;
    }
  }, [from, to, effectiveMode, congestion, routeReady]);

  const submit = () => {
    const err = createTransfer(order.id, { purpose, from, to, mode, needSupine, canUseToiletIndependently: canToilet, familyAccompanying: familyWith, congestion });
    setFormError(err);
    if (!err) setPurpose('前往影像楼做 CT/MRI');
  };

  return (
    <div className="card">
      <h2>♿ 发起楼间转运（{campusName}）</h2>
      <div className="sub">仅可选择<b>{campusName}</b>内的楼栋点位（系统按订单科室院区锁定）；系统给出该院区的无障碍路线、电梯位置、距离、拥堵提示与预计耗时。跨院区检查请使用「跨院区/换班」功能。</div>

      <div className="grid grid-2">
        <label className="field" style={{ margin: 0 }}>转运事由
          <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </label>
        <div className="grid grid-2" style={{ gap: 8 }}>
          <label className="field" style={{ margin: 0 }}>起点（{campusName}）
            <select className="input" value={from} onChange={(e) => { setFrom(e.target.value); setFormError(null); }}>
              {fromKeys.map(([k, def]) => <option key={k} value={k}>{def.label}</option>)}
            </select>
          </label>
          <label className="field" style={{ margin: 0 }}>终点（{campusName}）
            <select className="input" value={to} onChange={(e) => { setTo(e.target.value); setFormError(null); }}>
              {toKeys.map(([k, def]) => <option key={k} value={k}>{def.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* 路线配置校验：未配置时明确阻止，不回退总院路线 */}
      {!routeReady && (
        <div className="callout danger">
          🚫 路线库尚未配置「{LOCATIONS[from]?.label} → {LOCATIONS[to]?.label}」（{campusName}）的无障碍路线、电梯位置与耗时。
          <b>系统不会使用其他院区路线替代</b>，请联系服务台在路线库补充该组合后再创建；本次转运记录、家属提示、押金与费用均不会写入。
        </div>
      )}
      {formError && <div className="callout danger">🚫 {formError}</div>}
      {routeReady && previewSegment && (
        <div className="callout teal">
          ✅ 已匹配{campusName}路线：距离约 <b>{previewSegment.distanceMeters} 米</b>，预计耗时 <b>{previewSegment.estimatedMinutes} 分钟</b>（含等电梯，当前拥堵系数：{congestion}）。
        </div>
      )}

      <div className="field">
        <label>转运方式</label>
        <div className="switch-row">
          {(['wheelchair', 'stretcher', 'walkAssist'] as TransferMode[]).map((m) => (
            <button key={m} type="button" className={`switch-opt ${effectiveMode === m ? 'on' : ''}`} disabled={needSupine && m !== 'stretcher'} onClick={() => setMode(m)}>
              {m === 'wheelchair' ? '♿ 轮椅' : m === 'stretcher' ? '🛏️ 医用平车' : '🧑‍🦯 搀扶步行'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-3">
        <label className="field" style={{ margin: 0 }}>患者需要卧位？
          <div className="switch-row" style={{ marginTop: 4 }}>
            <button type="button" className={`switch-opt ${needSupine ? 'on' : ''}`} onClick={() => setNeedSupine(true)}>需要卧位</button>
            <button type="button" className={`switch-opt ${!needSupine ? 'on' : ''}`} onClick={() => setNeedSupine(false)}>可坐位</button>
          </div>
        </label>
        <label className="field" style={{ margin: 0 }}>能否独立上厕所？
          <div className="switch-row" style={{ marginTop: 4 }}>
            <button type="button" className={`switch-opt ${canToilet ? 'on' : ''}`} onClick={() => setCanToilet(true)}>可独立</button>
            <button type="button" className={`switch-opt ${!canToilet ? 'on' : ''}`} onClick={() => setCanToilet(false)}>需协助</button>
          </div>
        </label>
        <label className="field" style={{ margin: 0 }}>家属是否随行？
          <div className="switch-row" style={{ marginTop: 4 }}>
            <button type="button" className={`switch-opt ${familyWith ? 'on' : ''}`} onClick={() => setFamilyWith(true)}>随行</button>
            <button type="button" className={`switch-opt ${!familyWith ? 'on' : ''}`} onClick={() => setFamilyWith(false)}>未随行</button>
          </div>
        </label>
      </div>

      <div className="field">
        <label>路线当前拥堵程度（陪诊员现场判断）</label>
        <div className="switch-row">
          {(['畅通', '一般', '拥堵'] as const).map((c) => (
            <button key={c} type="button" className={`switch-opt ${congestion === c ? 'on' : ''}`} onClick={() => setCongestion(c)}>{c}</button>
          ))}
        </div>
        {congestion === '拥堵' && routeReady && <div className="callout danger" style={{ marginTop: 8 }}>{routeCongestedHint(from, to)}</div>}
      </div>

      {previewSegment && <RoutePreview seg={previewSegment} />}

      <div className="grid grid-3" style={{ marginBottom: 8, marginTop: 10 }}>
        <div className="stat-tile"><div className="num" style={{ fontSize: 20 }}>{deposit} 元</div><div className="lb">{effectiveMode === 'stretcher' ? '平车' : '轮椅'}押金（归还退回）</div></div>
        <div className="stat-tile"><div className="num" style={{ fontSize: 20 }}>{rental + svc} 元</div><div className="lb">{needSupine ? '平车费用（医梯确认后入账）' : `实缴费用${rental ? `：租借${rental}+服务${svc}` : '：轮椅免租金'}`}</div></div>
        <div className="stat-tile"><div className="num" style={{ fontSize: 20 }}>{needSupine ? '待确认' : '否'}</div><div className="lb">{needSupine ? '需医梯，确认后方可转运' : '无需医梯'}</div></div>
      </div>

      {needSupine && (
        <div className="callout warn" style={{ marginBottom: 8 }}>
          卧位平车生成后仅为<b>医梯待确认需求</b>（非已预约）：需联系{orderCampus === 'east' ? '东院志愿服务台 8101' : '总院志愿服务台 8001'}落实时段与确认人，确认前不可开始转运、平车费用不入账。
        </div>
      )}

      <button
        className="btn btn-primary"
        disabled={!purpose.trim() || !routeReady}
        onClick={submit}
      >{routeReady ? '生成转运方案并同步家属（费用自动入账）' : '路线未配置，无法创建'}</button>
    </div>
  );
}

function TransferCard({ order, t }: { order: EscortOrder; t: WheelchairTransfer }) {
  const updateTransferStatus = useStore((s) => s.updateTransferStatus);
  const requestTransferVolunteer = useStore((s) => s.requestTransferVolunteer);
  const confirmTransferElevator = useStore((s) => s.confirmTransferElevator);
  const releaseTransferElevator = useStore((s) => s.releaseTransferElevator);
  const reorderForTransferCongestion = useStore((s) => s.reorderForTransferCongestion);
  const seg = t.segments[0];
  const st = STATUS_LABEL[t.status];
  const [elevTime, setElevTime] = useState('建议提前 15 分钟，约 ' + seg.estimatedMinutes + ' 分钟后梯位');
  const [confirmBy, setConfirmBy] = useState('');
  const [blockMsg, setBlockMsg] = useState<string | null>(null);
  const phone = t.campusId === 'east' ? '8101' : '8001';
  const el = t.elevator;
  const elevatorPending = el.required && el.state === 'needed';

  const start = () => {
    const err = updateTransferStatus(order.id, t.id, 'enroute');
    setBlockMsg(err);
  };

  return (
    <div className="inc-card" style={{ borderLeft: `4px solid var(--${t.status === 'elevatorPending' ? 'danger' : 'primary'})` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <b>♿ {t.purpose}</b>
        <span className={`badge ${st.cls}`}>{st.text}</span>
      </div>
      <div className="small" style={{ margin: '5px 0' }}>
        <span className="badge blue" style={{ marginRight: 6 }}>{t.campusId === 'east' ? '东院区' : '总院'}</span>
        {t.fromLocation} → {t.toLocation} · {MODE_LABEL[t.mode]}
        {t.needSupine && <span className="badge orange" style={{ marginLeft: 6 }}>卧位·平车</span>}
        {!t.canUseToiletIndependently && <span className="badge blue" style={{ marginLeft: 6 }}>如厕需协助</span>}
        <span className="badge gray" style={{ marginLeft: 6 }}>{t.familyAccompanying ? '家属随行' : '家属未随行'}</span>
      </div>
      <div className="small" style={{ whiteSpace: 'pre-wrap', color: 'var(--ink-2)' }}>{t.note}</div>

      <RoutePreview seg={seg} />

      <div className="grid grid-3" style={{ marginTop: 10 }}>
        <div className="small">押金：<b>{t.deposit} 元</b>（归还退回，不计应缴）</div>
        <div className="small">实缴：{t.feeCommitted
          ? <b style={{ color: 'var(--danger)' }}>{transferFeeTotal(t)} 元</b>
          : <b style={{ color: 'var(--warn)' }}>{transferFeeTotal(t)} 元（待医梯确认后入账）</b>}</div>
        <div className="small">医梯：
          {!el.required ? <b>无需</b>
            : el.state === 'confirmed' ? <b style={{ color: 'var(--info)' }}>已确认 · {el.confirmedSlot}</b>
            : <b style={{ color: 'var(--danger)' }}>待确认</b>}
        </div>
      </div>

      {/* 医梯资源：需求与确认分离 */}
      {el.required && el.state === 'needed' && (
        <div className="callout danger" style={{ marginTop: 10 }}>
          🛗 <b>{t.campusId === 'east' ? '东院' : '总院'}医梯资源待确认</b>（非已预约）：
          <div className="small" style={{ marginTop: 4 }}>
            需求电梯：{el.elevatorName}（{el.elevatorLocation}）；{el.recommendedSlot}<br />
            请联系 <b>{t.campusId === 'east' ? '东院志愿服务台 8101' : '总院志愿服务台 8001'}</b> 落实时段与检查位，确认前不可开始转运、平车费用暂不入账。
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <input className="input" style={{ maxWidth: 220 }} placeholder="确认的预约时段，如 10:20 梯位" value={elevTime} onChange={(e) => setElevTime(e.target.value)} />
            <input className="input" style={{ maxWidth: 170 }} placeholder="确认人姓名/工号" value={confirmBy} onChange={(e) => setConfirmBy(e.target.value)} />
            <button
              className="btn btn-sm btn-primary"
              disabled={!elevTime.trim() || !confirmBy.trim()}
              onClick={() => { confirmTransferElevator(order.id, t.id, { slot: elevTime, confirmedBy: confirmBy }); setBlockMsg(null); }}
            >已联系 {phone}，确认医梯</button>
          </div>
        </div>
      )}

      {el.required && el.state === 'confirmed' && (
        <div className="callout info" style={{ marginTop: 10 }}>
          🛗 <b>医梯已确认</b>：{el.elevatorName}，时段「{el.confirmedSlot}」，来源 {el.confirmedSource}，确认人 {el.confirmedBy}。
          <div style={{ marginTop: 6 }}>
            <button className="btn btn-sm btn-danger" disabled={t.status === 'arrived'} onClick={() => releaseTransferElevator(order.id, t.id, '志愿服务台通知该时段梯位被占用')}>取消确认（资源变更/改线）</button>
          </div>
        </div>
      )}

      {seg.congestion === '拥堵' && t.congestionAction && (
        <div className="callout danger" style={{ marginTop: 10 }}>
          路线拥堵处置（{t.campusId === 'east' ? '东院志愿服务台 8101' : '总院志愿服务台 8001'}）：
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {!t.volunteerRequested && <button className="btn btn-sm btn-primary" disabled={t.status === 'arrived'} onClick={() => requestTransferVolunteer(order.id, t.id)}>📞 提前联系{t.campusId === 'east' ? '东院（8101）' : '总院（8001）'}</button>}
            {t.congestionAction === 'volunteer' && <button className="btn btn-sm" disabled={t.status === 'arrived'} onClick={() => reorderForTransferCongestion(order.id, t.id)}>🔀 改为调整检查顺序错峰</button>}
          </div>
        </div>
      )}

      {blockMsg && <div className="callout danger" style={{ marginTop: 10 }}>🚫 {blockMsg}</div>}

      <div className="switch-row" style={{ marginTop: 10 }}>
        <button className="btn btn-sm" disabled={t.status === 'arrived'} onClick={start}>▶ 开始转运</button>
        <button className="btn btn-sm btn-primary" disabled={t.status === 'arrived' || elevatorPending} onClick={() => updateTransferStatus(order.id, t.id, 'arrived')}>✅ 已到达检查点</button>
        {elevatorPending && <span className="small" style={{ color: 'var(--danger)' }}>医梯待确认，暂不可开始/到达</span>}
      </div>
    </div>
  );
}

export default function TransferPanel({ order }: { order: EscortOrder }) {
  const transfers = order.transfers ?? [];
  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <TransferForm order={order} />
      <div className="card">
        <h2>🧾 转运记录（{transfers.length}）</h2>
        {transfers.length === 0 && <div className="muted small">暂无转运记录。患者需要从门诊楼转到影像楼/内镜楼时在此发起。</div>}
        {transfers.map((t) => <TransferCard key={t.id} order={order} t={t} />)}
      </div>
    </div>
  );
}
