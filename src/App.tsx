import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, Bell, ChevronDown, CircleHelp,
  Home, LogOut, Plus, ShieldCheck, Sparkles, Target, TrendingUp, Users, Wallet, X, Trophy, Flame, CalendarDays, CheckCircle2, Clock3
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { formatBRL, parseBRLToCents, progressPercent, todaySaoPaulo } from './lib/format';
import type { Goal, GoalCategory } from './types';

type SessionUser = { id: string; email?: string };
function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.origin !== window.location.origin) return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch { return '/'; }
}
const categories: { value: GoalCategory; label: string }[] = [
  { value: 'casa', label: 'Casa e reforma' },
  { value: 'veiculo', label: 'Carro ou moto' },
  { value: 'viagem', label: 'Viagem e lazer' },
  { value: 'familia', label: 'Família' },
  { value: 'estudos', label: 'Estudos' },
  { value: 'negocio', label: 'Negócio' },
  { value: 'emergencia', label: 'Reserva de emergência' },
  { value: 'outros', label: 'Outros' }
];

function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (authLoading) return <div className="loading-screen"><div className="brand-mark">M</div><p>Preparando seu espaço...</p></div>;
  return (
    <Routes>
      <Route path="/entrar" element={user ? <Navigate to="/" replace /> : <AuthPage mode="login" redirectTo={safeRedirectPath(new URLSearchParams(window.location.search).get("next"))} />} />
      <Route path="/criar-conta" element={user ? <Navigate to="/" replace /> : <AuthPage mode="signup" redirectTo={safeRedirectPath(new URLSearchParams(window.location.search).get("next"))} />} />
      <Route path="/convite/:token" element={<InviteGate user={user} />} />
      <Route path="/recuperar-senha" element={<PasswordRecoveryPage />} />
      <Route path="/redefinir-senha" element={<PasswordResetPage />} />
      <Route path="/*" element={user ? <Dashboard user={user} /> : <Landing />} />
    </Routes>
  );
}

function InviteGate({ user }: { user: SessionUser | null }) {
  const { token = '' } = useParams();
  if (!user) return <AuthPage mode="login" redirectTo={`/convite/${token}`} />;
  return <AcceptInvite token={token} />;
}

function AcceptInvite({ token }: { token: string }) {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Validando seu convite...');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    async function accept() {
      if (!supabase) { setFailed(true); setMessage('Não foi possível conectar ao serviço.'); return; }
      const { error } = await supabase.rpc('accept_goal_invite', { p_token: token });
      if (!active) return;
      if (error) { setFailed(true); setMessage(error.message); }
      else { setMessage('Convite aceito! A meta compartilhada já está disponível no seu espaço.'); }
    }
    void accept();
    return () => { active = false; };
  }, [token]);
  return <main className="pending-access"><Brand/><div className="pending-card"><span className="pending-shield"><Users size={28}/></span><h1>{failed ? 'Não foi possível aceitar' : 'Convite para meta compartilhada'}</h1><p>{message}</p><button className="button button-primary" onClick={()=>navigate('/')}>Ir para minhas metas</button></div></main>;
}

function PasswordRecoveryPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!supabase) { setError('Serviço temporariamente indisponível.'); return; }
    setBusy(true);
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`
    });
    if (recoveryError) setError('Não foi possível solicitar a recuperação. Confira o e-mail e tente novamente.');
    else setSent(true);
    setBusy(false);
  }
  return <main className="auth-layout"><div className="auth-side"><Brand/><div><span className="eyebrow">ACESSO SEGURO</span><h1>Vamos ajudar você a recuperar seu acesso.</h1><p>Enviaremos um link para o endereço cadastrado.</p></div><span className="auth-side-foot">Metas.com.br</span></div><section className="auth-main"><Link to="/entrar" className="back-link">← Voltar ao acesso</Link><form className="auth-card" onSubmit={submit}><span className="eyebrow">RECUPERAÇÃO DE ACESSO</span><h2>Esqueceu sua senha?</h2>{sent ? <div className="alert alert-success">Se o endereço estiver cadastrado, você receberá um e-mail com as instruções para redefinir sua senha. Verifique também a caixa de spam.</div> : <><p className="muted">Informe o e-mail utilizado no cadastro.</p><label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required/></label>{error && <div className="alert alert-error">{error}</div>}<button className="button button-primary button-full" disabled={busy}>{busy?'Enviando...':'Enviar link de recuperação'} <ArrowRight size={17}/></button></>}</form></section></main>;
}

function PasswordResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (password.length < 8) { setError('A nova senha precisa ter pelo menos 8 caracteres.'); return; }
    if (password !== confirmPassword) { setError('As senhas não coincidem.'); return; }
    if (!supabase) { setError('Serviço temporariamente indisponível.'); return; }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) setError('Não foi possível atualizar a senha. Solicite um novo link de recuperação.');
    else setSuccess(true);
    setBusy(false);
  }

  return <main className="auth-layout"><div className="auth-side"><Brand/><div><span className="eyebrow">ACESSO SEGURO</span><h1>Uma nova senha para continuar seus planos.</h1><p>Escolha uma senha forte e exclusiva para sua conta.</p></div><span className="auth-side-foot">Metas.com.br</span></div><section className="auth-main"><Link to="/entrar" className="back-link">← Voltar ao acesso</Link><form className="auth-card" onSubmit={submit}><span className="eyebrow">RECUPERAÇÃO DE ACESSO</span><h2>Definir nova senha</h2>{success ? <><div className="alert alert-success">Sua senha foi atualizada. Você já pode entrar na sua conta.</div><button type="button" className="button button-primary button-full" onClick={()=>navigate('/entrar')}>Ir para entrar <ArrowRight size={17}/></button></> : <><p className="muted">Digite e confirme sua nova senha.</p><label>Nova senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} autoComplete="new-password" required/></label><label>Confirmar nova senha<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} minLength={8} autoComplete="new-password" required/></label>{error && <div className="alert alert-error">{error}</div>}<button className="button button-primary button-full" disabled={busy}>{busy?'Salvando...':'Atualizar senha'} <ArrowRight size={17}/></button></>}</form></section></main>;
}

function Landing() {
  return (
    <main className="landing">
      <header className="landing-header">
        <Brand />
        <div className="landing-actions"><Link className="link-button" to="/entrar">Entrar</Link><Link className="button button-primary" to="/criar-conta">Criar minha conta <ArrowRight size={17} /></Link></div>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={15} /> SEU PRÓXIMO PASSO COMEÇA AQUI</span>
          <h1>Todo sonho fica mais perto quando vira <em>uma meta.</em></h1>
          <p>Organize seus objetivos financeiros, acompanhe cada conquista e realize seus planos — sozinho ou com quem importa.</p>
          <div className="hero-actions"><Link className="button button-primary button-large" to="/criar-conta">Começar gratuitamente <ArrowRight size={18} /></Link><span className="quiet-note"><ShieldCheck size={15} /> Seus registros são privados</span></div>
        </div>
        <div className="hero-visual">
          <div className="visual-glow"></div>
          <div className="dream-card">
            <div className="dream-card-top"><span>MINHA PRÓXIMA CONQUISTA</span><span className="mini-icon"><Target size={17}/></span></div>
            <div className="dream-image"><div className="sun"></div><div className="mountain mountain-back"></div><div className="mountain mountain-front"></div><div className="water"></div></div>
            <h3>Conhecer novos lugares</h3><p className="muted">Minha viagem dos sonhos</p>
            <div className="dream-amount"><strong>R$ 2.450,00</strong><span>de R$ 5.000,00</span></div>
            <div className="progress-track"><div className="progress-fill" style={{width:'49%'}}></div></div>
            <div className="dream-foot"><span>49% realizado</span><span>Você está no caminho!</span></div>
          </div>
          <div className="floating-note"><span className="note-icon"><TrendingUp size={18}/></span><span><b>Um passo de cada vez</b><small>Seu progresso merece ser celebrado.</small></span></div>
        </div>
      </section>
      <section className="pillars">
        <div><span className="pillar-icon"><Wallet size={21}/></span><h3>Suas Caixinhas</h3><p>Visualize seus sonhos, defina valores e acompanhe o quanto falta para chegar lá.</p></div>
        <div><span className="pillar-icon"><Users size={21}/></span><h3>Metas compartilhadas</h3><p>Convide pessoas importantes e acompanhem juntos uma conquista em comum.</p></div>
        <div><span className="pillar-icon"><Sparkles size={21}/></span><h3>Desafios e conquistas</h3><p>Marque cada etapa vencida e mantenha a motivação durante o caminho.</p></div>
      </section>
      <footer className="landing-footer"><Brand /><span>Metas.com.br — Seu sonho merece um plano.</span></footer>
    </main>
  );
}

function Brand() {
  return <Link to="/" className="brand"><span className="brand-mark">M</span><span>metas<span className="brand-dot">.com.br</span></span></Link>;
}

function AuthPage({ mode, redirectTo = '/' }: { mode: 'login' | 'signup'; redirectTo?: string }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const signup = mode === 'signup';

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    if (!supabase) { setError('Configure as credenciais do Supabase no arquivo .env para ativar o cadastro e o acesso.'); return; }
    if (signup && !birthDate) { setError('Informe sua data de nascimento.'); return; }
    if (signup && new Date(birthDate) > new Date()) { setError('A data de nascimento não pode estar no futuro.'); return; }
    setLoading(true);
    try {
      if (signup) {
        const { data, error: authError } = await supabase.auth.signUp({
          email, password,
          options: { data: { birth_date: birthDate } }
        });
        if (authError) throw authError;
        if (data.session) navigate(redirectTo);
        else setMessage('Cadastro iniciado. Confira seu e-mail para confirmar a conta antes de entrar.');
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        navigate(redirectTo);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir. Tente novamente.'); }
    finally { setLoading(false); }
  }

  return <main className="auth-layout"><div className="auth-side"><Brand /><div><span className="eyebrow">SEU SONHO MERECE UM PLANO</span><h1>Comece com um objetivo. Avance com um plano.</h1><p>Um espaço para organizar suas metas financeiras e acompanhar cada conquista.</p></div><span className="auth-side-foot">Metas.com.br</span></div><section className="auth-main"><Link to="/" className="back-link">← Voltar ao início</Link><form className="auth-card" onSubmit={submit}><span className="eyebrow">{signup ? 'SEU FUTURO COMEÇA AGORA' : 'BEM-VINDO DE VOLTA'}</span><h2>{signup ? 'Crie sua conta' : 'Entre na sua conta'}</h2><p className="muted">{signup ? 'É gratuito. E seu próximo objetivo pode começar hoje.' : 'Acesse suas metas e continue de onde parou.'}</p>
    <label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email" required /></label>
    <label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres" minLength={8} autoComplete={signup?'new-password':'current-password'} required /></label>
    {!signup && <div className="forgot-password-row"><Link to="/recuperar-senha">Esqueci minha senha</Link></div>}
    {signup && <label>Data de nascimento<input type="date" value={birthDate} onChange={e=>setBirthDate(e.target.value)} required /><small className="field-help">A data é necessária para aplicar proteções adequadas à faixa etária. O acesso de menores dependerá de um fluxo de autorização do responsável, ainda não habilitado nesta etapa.</small></label>}
    {error && <div className="alert alert-error">{error}</div>}{message && <div className="alert alert-success">{message}</div>}
    <button className="button button-primary button-full" disabled={loading}>{loading ? 'Aguarde...' : signup ? 'Criar conta gratuitamente' : 'Entrar'} <ArrowRight size={17}/></button>
    <p className="auth-switch">{signup ? 'Já tem uma conta?' : 'Ainda não tem conta?'} <Link to={`${signup?'/entrar':'/criar-conta'}?next=${encodeURIComponent(redirectTo)}`}>{signup?'Entrar':'Criar conta'}</Link></p>
    <p className="legal-note">Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade, que deverão ser publicados antes do lançamento.</p>
    </form></section></main>;
}

function Dashboard({ user }: { user: SessionUser }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState('inicio');
  const [error, setError] = useState('');
  const [minorPending, setMinorPending] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);
  const navigate = useNavigate();

  async function loadGoals() {
    if (!supabase) { setLoading(false); return; }
    setLoading(true); setError('');
    const { data, error: queryError } = await supabase.from('goals_summary').select('*').order('created_at', { ascending: false });
    if (queryError) setError(queryError.message);
    else setGoals((data ?? []) as Goal[]);
    setLoading(false);
  }
  useEffect(() => {
    let alive = true;
    async function checkProfile() {
      if (!supabase) { setProfileChecked(true); return; }
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('birth_date, guardian_approval_status')
        .eq('id', user.id)
        .maybeSingle();
      if (!alive) return;
      if (profileError) setError('Não foi possível verificar as regras de acesso da conta.');
      if (data?.guardian_approval_status === 'pending' || data?.guardian_approval_status === 'rejected') {
        setMinorPending(true);
      }
      setProfileChecked(true);
    }
    void checkProfile();
    void loadGoals();
    return () => { alive = false; };
  }, [user.id]);

  async function signOut() {
    await supabase?.auth.signOut();
    navigate('/entrar');
  }

  const totalSaved = useMemo(() => goals.reduce((sum,g)=>sum+g.saved_cents,0),[goals]);
  const totalTarget = useMemo(() => goals.reduce((sum,g)=>sum+g.target_cents,0),[goals]);
  const activeGoals = goals.filter(g=>g.status==='active');
  const visibleGoals = activeTab==='compartilhadas' ? goals.filter(g=>g.is_shared) : activeTab==='caixinhas' ? goals.filter(g=>!g.is_shared) : goals;

  if (!profileChecked) return <div className="loading-screen"><div className="spinner"></div><p>Verificando acesso à conta...</p></div>;
  if (minorPending) return <main className="pending-access"><Brand/><div className="pending-card"><span className="pending-shield"><ShieldCheck size={28}/></span><h1>Precisamos da autorização de um responsável</h1><p>Identificamos que esta conta pertence a uma pessoa menor de 18 anos. Para proteger seus dados, o acesso às metas está temporariamente bloqueado até que o processo de autorização do responsável seja implementado e concluído.</p><p className="muted">Esta etapa inicial ainda não permite concluir a autorização dentro do aplicativo.</p><button className="button button-primary" onClick={signOut}>Sair da conta</button></div></main>;

  return <div className="app-shell">
    <aside className="sidebar"><Brand/><nav><span className="nav-caption">MENU PRINCIPAL</span><button className={`nav-item ${activeTab==='inicio'?'selected':''}`} onClick={()=>setActiveTab('inicio')}><Home size={18}/> Visão geral</button><button className={`nav-item ${activeTab==='caixinhas'?'selected':''}`} onClick={()=>setActiveTab('caixinhas')}><Wallet size={18}/> Minhas Caixinhas</button><button className={`nav-item ${activeTab==='compartilhadas'?'selected':''}`} onClick={()=>setActiveTab('compartilhadas')}><Users size={18}/> Compartilhadas</button><button className={`nav-item ${activeTab==='desafios'?'selected':''}`} onClick={()=>setActiveTab('desafios')}><Trophy size={18}/> Desafios e conquistas</button><span className="nav-caption nav-caption-bottom">SUA CONTA</span><button className="nav-item disabled-nav"><CircleHelp size={18}/> Ajuda</button></nav><div className="sidebar-bottom"><div className="user-chip"><span className="avatar">{(user.email?.[0]??'U').toUpperCase()}</span><span><b>{user.email?.split('@')[0]??'Minha conta'}</b><small>Plano gratuito</small></span><ChevronDown size={15}/></div><button className="nav-item" onClick={signOut}><LogOut size={18}/> Sair da conta</button></div></aside>
    <main className="main-area"><header className="topbar"><div><span className="mobile-brand"><Brand/></span><span className="breadcrumb">Meu espaço <span>/</span> {activeTab==='inicio'?'Visão geral':activeTab==='compartilhadas'?'Compartilhadas':activeTab==='desafios'?'Desafios e conquistas':'Minhas Caixinhas'}</span></div><div className="topbar-actions"><span className="status-pill"><span></span> Seus dados são privados</span><button className="icon-button" aria-label="Notificações"><Bell size={19}/></button></div></header>
    <div className="page-content"><div className="welcome-row"><div><span className="eyebrow">{new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toUpperCase()}</span><h1>{activeTab==='desafios'?'Cada passo merece ser celebrado.':'Vamos realizar seus sonhos?'}</h1><p>{activeTab==='desafios'?'Desafios opcionais, no seu ritmo e sem competição.':'Todo grande objetivo começa com um primeiro passo.'}</p></div>{activeTab!=='desafios' && <button className="button button-primary" onClick={()=>setShowCreate(true)}><Plus size={18}/> Nova Caixinha</button>}</div>
    {!isSupabaseConfigured && <div className="alert alert-info">O projeto ainda não está conectado ao Supabase. Configure o arquivo <code>.env</code> para ativar a persistência e a autenticação.</div>}
    {error && <div className="alert alert-error">{error} <button onClick={()=>void loadGoals()}>Tentar novamente</button></div>}
    {activeTab==='desafios' ? <ChallengesPanel userId={user.id}/> : <>
    <section className="summary-grid"><SummaryCard icon={<Wallet/>} label="Total declarado" value={formatBRL(totalSaved)} hint="Soma das suas contribuições" /><SummaryCard icon={<Target/>} label="Metas ativas" value={String(activeGoals.length)} hint="Objetivos em andamento" /><SummaryCard icon={<TrendingUp/>} label="Objetivo total" value={formatBRL(totalTarget)} hint="Valor desejado nas Caixinhas" /></section>
    <section className="section-heading"><div><h2>{activeTab==='compartilhadas'?'Metas compartilhadas':activeTab==='caixinhas'?'Minhas Caixinhas':'Suas Caixinhas'}</h2><p>Acompanhe de perto cada conquista.</p></div><button className="text-action" onClick={()=>setActiveTab('inicio')}>Ver todas <ArrowRight size={16}/></button></section>
    {loading ? <div className="empty-state"><div className="spinner"></div><p>Carregando suas metas...</p></div> : visibleGoals.length===0 ? <div className="empty-state"><div className="empty-icon"><Target size={27}/></div><h3>{activeTab==='compartilhadas'?'Nenhuma meta compartilhada ainda':'Sua primeira conquista começa aqui'}</h3><p>{activeTab==='compartilhadas'?'Crie uma meta compartilhada ou aceite um convite para acompanhar uma conquista em conjunto.':'Crie uma Caixinha para transformar seu sonho em uma meta com valor e prazo.'}</p><button className="button button-primary" onClick={()=>setShowCreate(true)}><Plus size={17}/> Criar minha primeira Caixinha</button></div> :
      <div className="goals-grid">{visibleGoals.map(goal=><GoalCard key={goal.id} goal={goal} userId={user.id} onRefresh={loadGoals}/>)}</div>}
    <div className="declaration-note"><ShieldCheck size={17}/><span>Os valores exibidos são declarações feitas por você. O Metas.com.br não movimenta nem verifica dinheiro.</span></div>
    </>}
    </div></main>
    {showCreate && <CreateGoalModal userId={user.id} defaultShared={activeTab==='compartilhadas'} onClose={()=>setShowCreate(false)} onCreated={()=>{setShowCreate(false);void loadGoals();}}/>}
  </div>;
}

type ChallengeDefinition = {
  id: string; slug: string; title: string; description: string;
  metric: 'contributions_count' | 'contribution_days' | 'goals_count';
  target_value: number; duration_days: number; display_order: number;
};
type ChallengeParticipation = {
  id: string; challenge_id: string; started_at: string; ends_at: string;
  status: 'active' | 'completed' | 'expired'; progress: number; completed_at: string | null;
};

function ChallengesPanel({ userId }: { userId: string }) {
  const [definitions, setDefinitions] = useState<ChallengeDefinition[]>([]);
  const [participations, setParticipations] = useState<ChallengeParticipation[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    if (!supabase) { setLoading(false); setError('Conecte o projeto ao Supabase para carregar os desafios.'); return; }
    setLoading(true); setError('');
    const [defs, parts] = await Promise.all([
      supabase.from('challenge_definitions').select('id,slug,title,description,metric,target_value,duration_days,display_order').eq('active', true).order('display_order'),
      supabase.from('challenge_participations').select('id,challenge_id,started_at,ends_at,status,progress,completed_at').eq('user_id', userId).order('started_at', { ascending: false })
    ]);
    if (defs.error || parts.error) setError('Não foi possível carregar seus desafios. Tente novamente.');
    else { setDefinitions((defs.data ?? []) as ChallengeDefinition[]); setParticipations((parts.data ?? []) as ChallengeParticipation[]); }
    setLoading(false);
  }
  useEffect(() => { void load(); }, [userId]);

  async function join(definition: ChallengeDefinition) {
    if (!supabase || joining) return;
    setJoining(definition.id); setError(''); setNotice('');
    const { error: joinError } = await supabase.from('challenge_participations').insert({
      challenge_id: definition.id, user_id: userId
    });
    if (joinError) setError(joinError.code === '23505' ? 'Você já participou deste desafio.' : joinError.message);
    else { setNotice('Desafio iniciado. Seu progresso será atualizado automaticamente a cada ação válida.'); await load(); }
    setJoining(null);
  }

  const byChallenge = new Map(participations.map(p => [p.challenge_id, p]));
  const completed = participations.filter(p => p.status === 'completed');
  const active = definitions.filter(d => byChallenge.get(d.id)?.status === 'active' && new Date(byChallenge.get(d.id)!.ends_at) > new Date());
  const available = definitions.filter(d => !byChallenge.has(d.id));
  const expired = definitions.filter(d => byChallenge.get(d.id)?.status === 'expired' || (byChallenge.get(d.id)?.status === 'active' && new Date(byChallenge.get(d.id)!.ends_at) <= new Date()));
  const metricLabel = (d: ChallengeDefinition) => d.metric === 'contribution_days' ? 'dias com contribuição' : d.metric === 'goals_count' ? 'Caixinhas criadas' : 'contribuições registradas';
  const card = (d: ChallengeDefinition) => {
    const part = byChallenge.get(d.id);
    const isExpired = part?.status === 'expired' || (part?.status === 'active' && new Date(part.ends_at) <= new Date());
    const progress = Math.min(part?.progress ?? 0, d.target_value);
    const pct = Math.round(progress / d.target_value * 100);
    return <article className={`challenge-card ${part?.status === 'completed' ? 'challenge-complete' : ''}`} key={d.id}>
      <div className="challenge-card-top"><span className="challenge-icon">{part?.status === 'completed' ? <Trophy size={20}/> : d.metric === 'goals_count' ? <Target size={20}/> : <Flame size={20}/>}</span><span className={`challenge-state ${part?.status === 'completed' ? 'earned' : isExpired ? 'expired' : part ? 'in-progress' : 'optional'}`}>{part?.status === 'completed' ? 'Conquista desbloqueada' : isExpired ? 'Prazo encerrado' : part ? 'Em andamento' : 'Opcional'}</span></div>
      <h3>{d.title}</h3><p>{d.description}</p>
      <div className="challenge-target"><strong>{part?.progress ?? 0} / {d.target_value}</strong><span>{metricLabel(d)}</span></div>
      {part && <><div className="challenge-progress"><span style={{ width: `${pct}%` }}/></div><div className="challenge-foot"><span>{pct}% concluído</span><span>{d.duration_days} dias</span></div></>}
      {!part && <div className="challenge-foot"><span><CalendarDays size={13}/> Prazo de {d.duration_days} dias</span><span>Sem custo</span></div>}
      {part?.status === 'completed' ? <div className="earned-note"><CheckCircle2 size={16}/> Você concluiu este desafio!</div> : isExpired ? <div className="earned-note muted-note"><Clock3 size={15}/> O prazo terminou. Você pode continuar com suas metas normalmente.</div> : !part ? <button className="button button-primary challenge-join" onClick={() => void join(d)} disabled={joining !== null}>{joining === d.id ? 'Iniciando...' : 'Aceitar desafio'}</button> : null}
    </article>;
  };

  if (loading) return <div className="empty-state"><div className="spinner"/><p>Carregando desafios...</p></div>;
  return <section className="challenges-panel">
    <div className="challenge-intro"><div><span className="eyebrow">SEU RITMO, SUA CONQUISTA</span><h2>Pequenos passos, grandes avanços.</h2><p>Escolha desafios simples para manter a constância. Participar é opcional e não exige depósitos nem movimentação de dinheiro.</p></div><div className="achievement-counter"><Trophy size={21}/><strong>{completed.length}</strong><span>conquistas</span></div></div>
    {error && <div className="alert alert-error">{error} <button onClick={() => void load()}>Tentar novamente</button></div>}
    {notice && <div className="alert alert-success">{notice}</div>}
    {active.length > 0 && <><div className="challenge-section-title"><h3>Em andamento</h3><span>{active.length} desafio(s)</span></div><div className="challenge-grid">{definitions.filter(d => active.some(p => p.challenge_id === d.id)).map(card)}</div></>}
    {available.length > 0 && <><div className="challenge-section-title"><h3>Desafios disponíveis</h3><span>Escolha quando começar</span></div><div className="challenge-grid">{available.map(card)}</div></>}
    {completed.length > 0 && <><div className="challenge-section-title"><h3>Suas conquistas</h3><span>{completed.length} concluída(s)</span></div><div className="challenge-grid">{definitions.filter(d => byChallenge.get(d.id)?.status === 'completed').map(card)}</div></>}
    {expired.length > 0 && <><div className="challenge-section-title"><h3>Desafios encerrados</h3><span>O aprendizado continua</span></div><div className="challenge-grid">{definitions.filter(d => expired.some(p => p.challenge_id === d.id)).map(card)}</div></>}
    <div className="challenge-disclaimer"><ShieldCheck size={16}/><span>Os desafios acompanham apenas registros feitos no Metas.com.br. Não medem saldo bancário, não verificam depósitos e não oferecem prêmios em dinheiro.</span></div>
  </section>;
}

function SummaryCard({icon,label,value,hint}:{icon:ReactNode;label:string;value:string;hint:string}) {
  return <div className="summary-card"><span className="summary-icon">{icon}</span><span className="summary-label">{label}</span><strong>{value}</strong><small>{hint}</small></div>;
}

function GoalCard({goal,userId,onRefresh}:{goal:Goal;userId:string;onRefresh:()=>void}) {
  const [adding,setAdding]=useState(false);
  const [amount,setAmount]=useState('');
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [sharing,setSharing]=useState(false);
  const [shareMessage,setShareMessage]=useState('');
  const pendingContribution = useRef<{ signature: string; key: string } | null>(null);
  const percent=progressPercent(goal.saved_cents,goal.target_cents);
  async function createInvite() {
    if(!supabase)return;setSharing(true);setShareMessage('');
    const {data,error:inviteError}=await supabase.rpc('create_goal_invite',{p_goal_id:goal.id});
    if(inviteError)setShareMessage(inviteError.message);
    else { const url=`${window.location.origin}/convite/${data}`; try { await navigator.clipboard.writeText(url); setShareMessage('Link copiado! Convide alguém para entrar na sua meta.'); } catch { setShareMessage(url); } }
    setSharing(false);
  }
  async function addContribution(e:FormEvent) {
    e.preventDefault();setError('');
    const cents=parseBRLToCents(amount);
    if(!cents){setError('Informe um valor válido maior que zero.');return;}
    if(!supabase)return;
    const contributionDate = todaySaoPaulo();
    const normalizedNote = note.trim() || null;
    const signature = JSON.stringify({ goalId: goal.id, cents, note: normalizedNote, date: contributionDate });
    if (!pendingContribution.current || pendingContribution.current.signature !== signature) {
      pendingContribution.current = { signature, key: crypto.randomUUID() };
    }
    setBusy(true);
    try {
      const {error:rpcError}=await supabase.rpc('add_goal_contribution',{p_goal_id:goal.id,p_amount_cents:cents,p_note:normalizedNote,p_contribution_date:contributionDate,p_idempotency_key:pendingContribution.current.key});
      if(rpcError)setError('Não foi possível confirmar o registro. Se a conexão falhou, tente novamente sem alterar os dados para evitar duplicidade.');
      else {pendingContribution.current=null;setAmount('');setNote('');setAdding(false);onRefresh();}
    } catch {
      setError('A conexão foi interrompida. Tente novamente com os mesmos dados para confirmar o registro sem duplicá-lo.');
    } finally { setBusy(false); }
  }
  return <article className="goal-card"><div className="goal-card-top"><span className="category-tag">{categories.find(c=>c.value===goal.category)?.label??'Outros'}</span><span className="goal-status">{goal.is_shared?'Compartilhada':goal.status==='active'?'Em andamento':goal.status}</span></div><div className="goal-art"><div className="goal-art-orbit"></div><Target size={35}/></div><h3>{goal.name}</h3><p className="goal-description">{goal.description||'Um sonho que está ganhando forma.'}</p><div className="goal-values"><div><small>Valor declarado</small><strong>{formatBRL(goal.saved_cents)}</strong></div><div className="align-right"><small>Objetivo</small><strong>{formatBRL(goal.target_cents)}</strong></div></div><div className="progress-track"><div className="progress-fill" style={{width:`${percent}%`}}></div></div><div className="goal-progress-foot"><b>{percent.toFixed(0)}% alcançado</b><span>Faltam {formatBRL(Math.max(0,goal.target_cents-goal.saved_cents))}</span></div>
    {goal.is_shared && goal.owner_id===userId && <div className="share-actions"><button className="add-contribution" type="button" onClick={createInvite} disabled={sharing}><Users size={16}/>{sharing?'Gerando link...':'Convidar participante'}</button>{shareMessage&&<small className="field-help">{shareMessage}</small>}</div>}
    {adding ? <form className="contribution-form" onSubmit={addContribution}><label>Quanto você reservou?<input value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Ex.: 150,00" inputMode="decimal" required/></label><label>Observação (opcional)<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Ex.: reserva deste mês"/></label>{error&&<div className="inline-error">{error}</div>}<div className="form-actions"><button type="button" className="button button-ghost" onClick={()=>setAdding(false)}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy?'Salvando...':'Registrar valor'}</button></div></form> : <button className="add-contribution" onClick={()=>setAdding(true)}><Plus size={16}/> Registrar contribuição</button>}
  </article>;
}

function CreateGoalModal({userId,defaultShared=false,onClose,onCreated}:{userId:string;defaultShared?:boolean;onClose:()=>void;onCreated:()=>void}) {
  const [name,setName]=useState('');
  const [category,setCategory]=useState<GoalCategory>('outros');
  const [target,setTarget]=useState('');
  const [date,setDate]=useState('');
  const [description,setDescription]=useState('');
  const [isShared,setIsShared]=useState(defaultShared);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function submit(e:FormEvent) {
    e.preventDefault();setError('');
    const cents=parseBRLToCents(target);
    if(!cents){setError('Informe um valor desejado válido.');return;}
    if(!supabase){setError('Supabase não configurado.');return;}
    setBusy(true);
    const {error:insertError}=await supabase.from('goals').insert({owner_id:userId,name:name.trim(),category,target_cents:cents,target_date:date||null,description:description.trim()||null,status:'active',is_shared:isShared});
    if(insertError)setError(insertError.message);
    else onCreated();
    setBusy(false);
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-title"><div className="modal-heading"><div><span className="eyebrow">UMA NOVA CONQUISTA</span><h2 id="create-title">Criar Caixinha</h2><p>Defina seu objetivo. O primeiro passo é seu.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X/></button></div><form onSubmit={submit}><label>Nome do sonho<input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Minha viagem para o Nordeste" maxLength={80} required/></label><label>Categoria<select value={category} onChange={e=>setCategory(e.target.value as GoalCategory)}>{categories.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label><label>Quanto você deseja reunir?<div className="money-input"><span>R$</span><input value={target} onChange={e=>setTarget(e.target.value)} placeholder="5.000,00" inputMode="decimal" required/></div></label><label>Prazo desejado (opcional)<input type="date" value={date} onChange={e=>setDate(e.target.value)} min={todaySaoPaulo()}/></label><label>Descrição (opcional)<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Conte um pouco sobre esse sonho..." maxLength={500}/></label><label className="checkbox-row"><input type="checkbox" checked={isShared} onChange={e=>setIsShared(e.target.checked)}/> Compartilhar esta meta com outras pessoas</label>{isShared&&<p className="field-help">Você poderá gerar um link de convite depois de criar a meta. Cada participante registra apenas suas próprias contribuições; o progresso total é compartilhado.</p>}{error&&<div className="alert alert-error">{error}</div>}<div className="form-actions"><button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy?'Criando...':'Criar Caixinha'} <ArrowRight size={16}/></button></div></form></section></div>;
}

export default App;
