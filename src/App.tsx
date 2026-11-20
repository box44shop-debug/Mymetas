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
    const pct = Math.round(progress / d.target_value �nOState('');
3irget_value �nOSwRight size={16}/></button></==='desafios'eted = pahield rn '/e(part.ends_at) number; coiçeted = pahinumber;;
  cesafi{user?.st}>">{visibleGoals.map(goaeted = pahieldSTA</span><oals.map(goaeted = pah3>{actn '/e(part.ends_at) number; coi�nquistas</butt20summarxinhas criadas' : 'contribui�iveTab==='compa0summar<, Clo=='compa0sum}b">Meu espaço <span>/<s'eted = pah"><Ta rn '/e(part.ends_at) number; coiçearn; co:pired' || (?active' && :  cons?acieate'');
3;
  crthDatal''}</L '/e(part.ends_at) number; coiçCCaixinha    autorizaaco:pired' || (?acPton  s. Pr)} h& :  cons?acE{<TrendingU;
  cOetiç�lpbar-actions"><
/h3><p clar?.alue,adas'?'Crid.uration_day}dream-amounbleGoals.map(goaeted = pah_valuean>de R$ 5{ue);
    const pct }irg{et_value �nOSw}an></div>
     {tion) => d.(d)bar-actions"><
/h3><p{ue);.id} >bleGoals.map(goaeted = pah   const/span><o>
             ch}${ct}%` }tilhadas'?leGoals.map(goaeted = pahspan>Você e${ct}%ed">Esta ett('@')[0]??'Mid.uactive', tru} ic =ar-actions"><seate && clasue);.id} leGoals.map(goaeted = pahspan>Você e<3
} from 'luidos sã3summPton  cipid.uactive', tru} ic =ar-actio-actiSparaustoar-actions"><}
/h3><p{ue);(part.ends_at) number; coi�nt size={27}/></darn; pan>Os vde-react';
i   {loading ta.</dio aplicab==;
    else!? <div clired' || (?ant size={27}/></darn; pan>O ão ppan>Os vdrt { me="nav-item Outton retuame=unta.</dias metaha uma s= 'gou.'}</p>
 nalorlns((de? <div cl! cons?aprimary button-full" disabled={loading}>{eted = pahtNot)}><Plus sizee.genc fuion) {)}guarde...' efiniti'As s new</Lefiniti's_at?.sts?acIlizadRight sde onde-mail   elsel></sme="go> data.te && <Ctton></in cl}<div claslading-screen"><div className="bner"></div><p>Carregando suas metas..//div> : visible else { stes>
      <Route path=ng"><div><h2>{activeeted = pas-p }) "t"><div className="weleted = pah3assN"EU SONHO MERECE UM PLANO</span><h1>CRITMO, ="nav-ii-icon"><Targeh2>Peorita.<esafis,rimeiros => nçe e ex2lusiva para  else { me=umbeique tacamin   } elstâ   {sso �=== 'creç�petiç�setS Confixig
   pósidiv>v>
 /span></ddentifica   </div></plhadas'?leGoals.map(goaachievsName-ontris...<quistas</butt2tas</de R$ 5{ number; ty-stat}an></div>
     e="nav-capti-actions"><se& <div claert-error">{error} <button onClick={()=>void loadGoals()}>Tentar novamee.genc fu }

  }
    {activeTab==='desafios' ? <Challen;

  auccess">{message}</div>}
    <button class;

  a}s' ? <ChallengesPanenha pre> 0.id} >bleGoals.map(goaeted = pahTab==='calue,"'?'NeE{<TrendingUdas'?']??'MigesPanenha pr}  else {(s)ar-actions"><span className="eted = pahalCard ge.get(d.id)?.status ===gesPanesome  const eted = parti's_at?.st))  conieldlarationseate && {=> !byChaenha pre> 0.id} >bleGoals.map(goaeted = pahTab==='calue,"'?'Nee sem comBusy(true)isdas'?']??'Mva para 1>
    tas e coar-actions"><span className="eted = pahalCard => !byChae conieldlarationseate && { number; ty-state> 0.id} >bleGoals.map(goaeted = pahTab==='calue,"'?'NeSrd iconvencida e man]??'Mi number; ty-stat}ed">Esta ea(s)ar-actions"><span className="eted = pahalCard ge.get(d.id)?.status === 'active' && new Date(byChallenge.ginitions.fie conieldlarationseate && {tive' &enha pre> 0.id} >bleGoals.map(goaeted = pahTab==='calue,"'?'Nee sem coms. Pr)} ha e man]??'MO apl" vao vátaha umaar-actions"><span className="eted = pahalCard ge.get(d.id)?.status ===tive' &esome  const eted = parti's_at?.st))  conieldlarationseate && span className="eted = pahBusclaan>rs valores exibidos sã6 declaraçõ else { mnto.':'Cr{<Tpena/div>
      nãoiv>voverifica dinh. desafmed>
 salvábanceráo,S Conf   </>}
m   pósidiv>tS Confofizar iveTêmicon={<   </div></main>
    {shoassName="e { user: Sessilabel="Obje({3>{a,matBR,').eq(s" /}:{3>{a:{ Link, N;p() {
pleted'ber; dpleted's" /dpleted}me="brand"><spassName="mountainallet/ield"><ShieldCheck sizeinallet/3>{actn3>{a}b">Meu espaço <span>/<einallet/p() {ctnp() {}b">Meu ese R$ 5{�nOSw}an></div>
 }/></{s" /}{15}/></di = {
  ider: Sessi} userId(={loa, setEr,    <div }:{{loa:} us;nitionspleted'    <div :mente</binitions] = usad);
   <Ard);
 ]=ab, setActiveTab] = useStatg><sp  <Arg><sp]=ab, setAc= useState('');

e,progree]=ab, setAc= useState('')
  cost [erro=setError] = useState('');
  cons [notice,=ab, setAc= useState('')heck;
   <ASeck;
 o=setError] = useState('');
heckera seu   <ASeckera seu ,=ab, setAc= useState(''={28}/>Ctribuiçãon load  <<{auth.halr metric: 'ckeys, setDefietError] = useState('');pib/for=from './lib/foral={g totalTarget l={g  activeGoals FormEvent) {
    ev);
    }) {
  return;
 setError('C.id); s <ASeck;
 defs, p <ASeckera seu r } = await supabit suse.fro   if otice}=nvite', { p_token: t);
   );
      if (!{p);
    d:.id} onRinError.c(   if otice) <ASeckera seu r   if oticeDesafio iniciado. Seu t supaurl=nir-senha`
    });
    if (AcceptInviit s}`;  consull);
  totalSpartliper }).wrptIText(urlor: joSeckera seu r mary bopado ! mpanhem algu cla/></button><muted">nize lse);tegories: joSeckera seu rurlor:}onst byChaSeck;
 doid load(); },f (!supabase) { ddCtribuição(e:ault(); setError('setMessage('');
  rts] = await Promise.allGoals= todaySaoPaulo (tg><spinError.c(!Goals {cimento.'); returnussName="etJoinoeta.e="o rezerue);
.id); s}turn;
 setError('C.id); sPromise.allGtribuiçãoDction t';
import ty(t Promise.allnalorlos dgree> [preeindow.l newl({ usromise.alluth.halr > [JSON. setDeify({efresons,.id} on,lGoals,[pree:lnalorlos dgree).foee:lGtribuiçãoDctiooinError.cod!={28}/>Ctribuição.abel>
 oi po{28}/>Ctribuição.abel>
 .uth.halr >As suth.halr ;
      }
={28}/>Ctribuição.abel>
 o
funuth.halr ,ckeys,crypto. retumUUID.l }    void loa updateError } = aw const { datt supabse.froen:otice}=nvite', { p_token: t dd);
   Gtribuição(!{p);
    d:.id} on,p_tg><speGoals:Goals,p_pree:nalorlos dgree)p_ntribuição' :ee:GtribuiçãoDcti)p_ase)poos. y_keyso{28}/>Ctribuição.abel>
 .key    if (erro(en:otice)egar seus desafios. Tente nova');
     odiv>
    auto  } elexesafialhou,Sent(true);
    objetastatsetLoadclass/></buv-mail ubutts antroval_statuo. Seuo{28}/>Ctribuição.abel>
 =l({ u <Arg><spwait progreewait prord);
 doid loa    <div ngeDtanceof Error id: sessiopode esta elexesafios.iris.ro.'ininetDefinitions((dca de PresamLoadclass/></ba');
     odiv>
    objet ubuttá-l    setBus} }

  return <className="a"auth-l{16}/></button></==='desafioal=></ield"><leGoals.map(goal=><hieldSTA</span><oals.map(goae{ value-tagctn; label: s)?.nd(c=>came="fs_a.id} e{ valuee(bp() {?? const [}b">Meu espaço <span>/<el=><hyChallctn.id} oeCheckedsafios'?'Desafi':.id} leGoals = activeT?cE{<TrendingU;:.id} leGoalbar-actions"><span className="l=><h'?'"<span className="l=><h'?'-orbi/div></divveTab==='comp35tilhadas'?'Nen.id} h}`;
iagem dos sonhos</pl=><huration_dayctn.id} uration_day||'Umazo.'}<soa mená g:'Cr    valorbutton-ppan className="l=><hme="fs"EU SONHO}/><//sectionved)} h{15}/></dse R$ 5{or desejadl={g totalTarget)}an></div>
adas'?leGoals.map(goaalth.-rn>
 "NHO}/></totalTar{15}/></dse R$ 5{or desejadl={g  activeGoals }an></div>
adas'?adas'?leGoals.map(goarogress-fill" style={{width:'49%'}}></div></div>
            h}${ib/for}%`className="dreappan className="l=><h'}}></div>pan>Vob>${ib/for.toFixed(0)}%tascion>< h{1beclara�F    m {or desejadarget_ax(0 l={g  activeGoals-l={g totalTarget))bar-actions"><
/h3>n.id} oeChecked.id}.id} ownnErros = const ccess">{message}</dhecke-pill"><sparimary button-full dd-Gtribuição"button-primary ntar nova);
    }) {
}guarde...' heck;
 as</button><butt6 de heck;
 ?'Ge retur><foht sizmpanheartus === 'c={17></sme="go{heckera seu &&ata é necessária para aplica{heckera seu }{15}/></}s' ? <Challengde"><div it={submit}><spaGtribuição-it={me="eyebrow" ddCtribuição}t type="Q/div>
instruçt { ou?te} onCnt="Valtg><spget.value)} requirrg><spwnimo de 8 caracteres" minLengtEx.: 10</sp" e} onM/${toonvimalmar nova senha<input type="Obt { ddentif(petiç�s)te} onCnt="Valpreeget.value)} requirgreewnimo de 8 caracteres" minLengtEx.: çt { aage);
 mês"e="alert alert-e&&as">{message}</din><fessName="button button-pw"><Link to="/recum-pill"><sparimary utton-primary button-full" onClick={()=ghostio')}>Ver todas <Ard);
 doid lo}>Csta.lcoarem ${activeTab==='desafio()=>setShowCreate(true)}.':'Atualizar senha'} <ArrowRight sizRhallengrsName=7></sme="gossName="on Damar<rimary button-full dd-Gtribuição"b')}>Ver todas <Ard);
 dnha primeira Caixinhing tRhallengrsoals_count' ? Configured
& <Ctton></in  ider: SessidefaultShared={({ setEr,rtilhadas'} onoid l,} onCre,se);void }:{nitionspleted'rtilhadas'} o?:boolean;} onCre:mente</b;se);void :mente</binitions] = ush}`;,prog}`;,=ab, setAc= useState('')e{ value,proC{ value,=ab, setAl} user value>('oonst [useState('')mo de ,proveTab=,=ab, setAc= useState('')     as Caee]=ab, setAc= useState('')uration_daysas Chation_day]=ab, setAc= useState('')isas'} osas Isas'} o]=ab, setAcrtilhadas'} ouseState('')
  cost [erro=setError] = useState('');
  cons [notice,=ab, setAc= useStEvent) {
    event.prev:ault(); setError('setMessage('');
  rts] = await Promise.allGoals= todaySaoPaulo (mo de inError.c(!Goals {cimento.'); returnussName="on>
    <etJoinoe);
.id); s}turn;
 setError('C{cimento.')var o cadaf (!sue> paranoe);
.id); s}turn; updateError } = await supse.fro  tionotice}=nvite', { p_tok.order('creefinition.iownnErro: setEr,h}`;:h}`;indow.loe{ value, activeGoals:Goals, active :ee: :ee||l({ duration_day:uration_dayindow.l||l({ d'expireder'),
  oeChecked:isas'} oRinError.c(  tionotice)egar seus  tionoticeDesafio iniciado. Sese);void (rn <main className="auth-layout"><divfront"></div><divd={tain drA</ role9%'}et-sua�ão"b')Mo sessNa} req{.c(nimo de s =e.abel>
  Caixin} onCrengeDeLink to="/" classNameivd={tssNamerole9%diamegll sizeivd={="rrorll size={19}tuabypaG;voidcalue,"'?front"></div><divd={tompartilhadas'?O MERECE UM PLANO</span><UMA NOVnav-ii-icon"><Targeh2 rosaG;voidcalue,"'tton><div classNx2lusiDo falt pra1><p>Um esOveTab!=='desafieç� prt-action" onClick={()=>setActições"><Bell')}>Ver t} onCre}l size={19}/>FechbrandXiv className="pageit={s="eyebrow">{signup word" vaurnira <em>te} onCnt="Valp}`;
et.value)} requirg}`;wnimo de 8 caracteres" minLengtEx.:        <div c/div><sNfalss=>se_axnew-passw0}ar nova senha<input type="p label:a<t,ends={e=>setC{ value(e.target.value)} m{ valuewnimo de 8 cara);
  }
 m{ valueprin; label: s) coni=><rthDati{usercame="f}={e=>setCame="f}in;.p() {}b"rthDatclarat,endsnha<input type="Q/div>
instruon>
  ar unir??front"></div><divney-e} on>Você eR$"><Targee} onCnt="Valmo de (e.target.value)}  Caixiwnimo de 8 caracteres" minLengt <div cl" e} onM/${toonvimalmar nova senhaName="<input type="Pton  ci>
    <(petiç�s)te} onChange={e=>setBirthDdtarget.value)} requir<small className="fielmia} t';
import ty(t}enha<input type="Chatiodentif(petiç�s)tveTa<divetBirthDdration_day}et.value)} requir<ration_daywnimo de 8 caracteres" minLengtCtri/main>oucra <bra me]);
<em>ht se_axnew-pass500}enha<input type= className="eteckboxow">{nee} onChange=eteckbox"ls();
ualiisas'} oRet.value)} requirIsas'} ownimo de 8s();
ua)n className={`nr menorton classoons movuntos "alert alisas'} o&&ap necessária para aplicaa.</dias mcadagatsetaine setSucista em depoi (datponen ">nize  :'Vamos === 'c={1 Challeng<Tpena/dou.'}oje.eTad icon={<Target/>};gar osamente o naseç�ShowCreate(fv></pl}lert-e&&as">{message}</d<button className="button button-pw"><Link to="/recum-pill"><sparimary utton-primary button-full" onClick={()=ghostio')}>Ver t} onCre}>Csta.lcoarem ${activeTab==='desafio()=>setShowCreate(true)}.':'Atualizar senha'} <ttonRight siztton><div clasn>
    <p className="a6div className="page-on Dashboard({ us = {
  idex conartilhad App;
