import { useEffect, useState } from 'react';
import { useStore } from './store';
import LoginPage from './LoginPage';
import FamilyHome from './pages/FamilyHome';
import FamilyOrder from './pages/FamilyOrder';
import EscortHome from './pages/EscortHome';
import EscortConsole from './pages/EscortConsole';
import DeskHome from './pages/DeskHome';

export default function App() {
  const session = useStore((s) => s.session);
  const orders = useStore((s) => s.orders);
  const seedDemo = useStore((s) => s.seedDemo);
  const logout = useStore((s) => s.logout);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    seedDemo();
  }, [seedDemo]);

  // 切换账号/角色时回到列表，避免停留在上一角色打开的详情
  useEffect(() => {
    setOpenId(null);
  }, [session?.role, session?.username]);

  if (!session) return <LoginPage />;

  const open = orders.find((o) => o.id === openId) ?? null;
  const back = () => setOpenId(null);

  const roleLabel = session.role === 'family' ? '患者家属端' : session.role === 'escort' ? '陪诊员端' : '服务台管理端';
  const roleIcon = session.role === 'family' ? '👪' : session.role === 'escort' ? '🧑‍⚕️' : '🗂️';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🌤️</span>
          <span>暖阳陪诊 · 医院分时到院与检查引导平台</span>
          <span className="chip" style={{ background: 'rgba(255,255,255,.15)', borderRadius: 20, padding: '2px 10px', fontSize: 12 }}>{roleIcon} {roleLabel}</span>
        </div>
        <div className="who">
          <span className="chip">{session.username}</span>
          <button className="btn-logout" onClick={logout}>退出登录</button>
        </div>
      </header>

      <main className="container">
        {session.role === 'family' && (
          open ? <FamilyOrder orderId={open.id} onBack={back} /> : <FamilyHome onOpen={setOpenId} />
        )}
        {session.role === 'escort' && (
          open ? <EscortConsole orderId={open.id} escortId={session.escortId!} onBack={back} /> : <EscortHome escortId={session.escortId!} onOpen={setOpenId} />
        )}
        {session.role === 'desk' && <DeskHome onOpen={setOpenId} />}
      </main>
    </div>
  );
}
