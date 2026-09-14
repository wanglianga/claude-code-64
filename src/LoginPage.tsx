import { useState } from 'react';
import { useStore } from './store';
import { DEMO_ACCOUNTS } from './data';

export default function LoginPage() {
  const login = useStore((s) => s.login);
  const [username, setUsername] = useState('family');
  const [password, setPassword] = useState('123456');
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    const e = login(username, password);
    if (e) setErr(e);
  };

  const fill = (u: string) => {
    setUsername(u);
    setPassword('123456');
    setErr(null);
  };

  return (
    <div className="login-wrap">
      <div className="login-hero">
        <div style={{ fontSize: 15, opacity: .85, letterSpacing: 2 }}>WARM SUN ESCORT · 暖阳陪诊</div>
        <h1 style={{ marginTop: 14 }}>分时到院 · 检查单引导<br />一条能在现场执行的就医行程</h1>
        <p>
          面向患者家属、陪诊员与医院服务台：从预约阶段的分时到院建议与材料清单，
          到陪诊员接单后的楼栋路线、缴费窗口、检验检查点与排队时长，
          再到异常处置（空腹、排队、停诊、缺项、情绪安抚）、家属远程授权、
          跨院区检查与陪诊员换班，最终沉淀服务档案与复诊提醒。
        </p>
        <div className="feat">
          <div>🕑 依据科室高峰、空腹要求、行动能力与检查排队，生成精确到分钟的到院时间</div>
          <div>🧭 门诊楼栋路线、采血/影像/取药点、排队时长与叫号进度全程引导</div>
          <div>⚠ 六类现场异常处置模板：状态、下一步选项、费用变化一键同步家属</div>
          <div>🏥 跨院区交通、报告互认、费用变化、预计返院时间闭环管理</div>
          <div>📁 诊断、用药、复查、发票、报告领取与评价进入服务档案</div>
        </div>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <h2>登录演示系统</h2>
          <div className="muted small">三个角色，同一平台协作。数据保存在浏览器本地（localStorage）。</div>
          <div className="field" style={{ marginTop: 20 }}>
            <label>用户名</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>
          <div className="field">
            <label>密码</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>
          {err && <div className="callout danger" style={{ margin: '0 0 10px' }}>{err}</div>}
          <button className="btn btn-primary" style={{ width: '100%', padding: '10px' }} onClick={submit}>登 录</button>

          <div className="acct-list">
            <div className="small muted" style={{ marginBottom: 8 }}>点击可快速填充演示账号（密码均为 123456）</div>
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.username} className="acct-item" onClick={() => fill(a.username)}>
                <div>
                  <div className="nm">{a.label}</div>
                  <div className="cred">{a.username} / 123456</div>
                </div>
                <span className="badge teal">{a.role === 'family' ? '家属端' : a.role === 'escort' ? '陪诊端' : '服务台'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
