import { useState } from 'react';
import { ArrowRight, Check, LayoutDashboard, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button, Input } from './ui';
import { Brand } from './brand';
import type { Role } from '../lib/types';

type Props = {
  busy: boolean;
  error: string;
  themeToggle: React.ReactNode;
  onSubmit: (credentials: {email: string; password: string; role: Role}) => void;
  onRoleChange: () => void;
};

const columns = ['Yapılacak', 'Devam ediyor', 'Tamamlandı'];

export function Login({busy, error, themeToggle, onSubmit, onRoleChange}: Props) {
  const [role, setRole] = useState<Role>('admin');
  const pickRole = (next: Role) => {setRole(next); onRoleChange();};

  return <main className="login-layout">
    <div className="login-theme-toggle">{themeToggle}</div>

    <section className="login-art">
      <Brand/>
      <div className="login-message">
        <span className="eyebrow">BİRLİKTE, ADIM ADIM</span>
        <h1>İşler bir arada.<br/>Her adım görünür.</h1>
        <p>Ekibinizin çalışma alanına hoş geldiniz.</p>
        <div className="board-illustration" aria-hidden="true">{columns.map((name, index) => <div key={name}>
          <span className="illustration-label"><i/>{name}</span>
          {Array.from({length: 3 - index}, (_, card) => <div className="illustration-card" key={card}>
            <span/><span/><small>{index === 2 ? <Check size={12}/> : <span/>}</small>
          </div>)}
        </div>)}</div>
      </div>
      <div className="login-foot">Daha net bir pano. Daha düzenli bir iş günü.</div>
    </section>

    <section className="login-form">
      <div className="login-mobile-brand"><Brand/></div>
      <div className="login-form-inner">
        <div className="login-badge"><LockKeyhole size={21}/></div>
        <h2>Hoş geldiniz</h2>
        <p className="muted">Devam etmek için hesabınıza giriş yapın.</p>

        <div className="login-tabs" aria-label="Giriş türü">
          <span className="login-tabs-pill" style={{transform: role === 'user' ? 'translateX(100%)' : 'translateX(0)'}}/>
          <button type="button" aria-pressed={role === 'admin'} onClick={() => pickRole('admin')}><ShieldCheck size={16}/> Yönetici</button>
          <button type="button" aria-pressed={role === 'user'} onClick={() => pickRole('user')}><LayoutDashboard size={16}/> Kullanıcı</button>
        </div>

        <form onSubmit={event => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSubmit({email: String(form.get('email')), password: String(form.get('password')), role});
        }}>
          <label>E-posta adresi<Input name="email" type="email" autoComplete="username" placeholder="ornek@sirket.com" maxLength={254} required/></label>
          <label>Şifre<Input name="password" type="password" autoComplete="current-password" placeholder="Şifrenizi girin" maxLength={256} required/></label>
          {error && <p className="error" role="alert">{error}</p>}
          <Button className="w-full mt-2" disabled={busy}>
            {busy ? 'Giriş yapılıyor…' : `${role === 'admin' ? 'Yönetici' : 'Kullanıcı'} olarak giriş yap`}<ArrowRight size={16}/>
          </Button>
        </form>

        <p className="login-note"><LockKeyhole size={13}/> Yalnızca yetkili ekip üyeleri erişebilir.</p>
      </div>
    </section>
  </main>;
}
