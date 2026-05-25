import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  CheckCircle2,
  Clock3,
  History,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  School,
  Save,
  Send,
  Settings,
  ShieldCheck,
  Ticket,
  Users,
  XCircle
} from 'lucide-react';
import './styles.css';

const DEFAULT_REMOTE_API = import.meta.env.VITE_DEFAULT_API_BASE || 'https://asistenteestudiante-production.up.railway.app';
const isNativeApp = Boolean(window.Capacitor) || location.protocol === 'capacitor:' || (location.hostname === 'localhost' && location.protocol === 'https:');
const API_BASE = import.meta.env.VITE_API_BASE || (isNativeApp ? DEFAULT_REMOTE_API : '');
const TARGET_PAGE = import.meta.env.VITE_TARGET_PAGE || 'https://comedor.uncp.edu.pe/charola';

function studentId(dni, codigo) {
  return `${String(dni).trim()}:${String(codigo).trim()}`;
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({ ok: false, message: 'Respuesta invalida.' }));
  if (!response.ok) throw new Error(data.message || data.status || 'Error de servidor');
  return data;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatCountdown(ms) {
  const safe = Math.max(0, ms);
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const milli = Math.floor(safe % 1000);
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${String(milli).padStart(3, '0')}`;
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function StatusBadge({ ok, children }) {
  return <span className={`badge ${ok ? 'ok' : 'warn'}`}>{children}</span>;
}

function StudentApp({ onSwitchRole }) {
  const [dni, setDni] = useState(localStorage.getItem('student:dni') || '');
  const [codigo, setCodigo] = useState(localStorage.getItem('student:codigo') || '');
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState(JSON.parse(localStorage.getItem('student:history') || '[]'));
  const [attemptLogs, setAttemptLogs] = useState([]);

  const id = useMemo(() => studentId(dni, codigo), [dni, codigo]);
  const targetMs = config?.targetTime ? new Date(config.targetTime).getTime() : 0;
  const correctedNow = nowTick + serverOffset;
  const countdownMs = targetMs ? targetMs - correctedNow : 0;

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 47);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    refreshConfig();
  }, []);

  useEffect(() => {
    localStorage.setItem('student:dni', dni);
    localStorage.setItem('student:codigo', codigo);
  }, [dni, codigo]);

  async function refreshConfig() {
    const [time, target] = await Promise.all([
      api('/api/time'),
      api('/api/config/target-time')
    ]);
    setServerOffset(Number(time.epochMs) - Date.now());
    setConfig(target);
    return target;
  }

  async function checkStatus() {
    setBusy(true);
    setResult(null);
    try {
      const data = await api(`/api/student/${encodeURIComponent(id)}/status`);
      setStatus(data);
      await refreshConfig();
    } catch (error) {
      setResult({ ok: false, message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function requestAccess() {
    setBusy(true);
    try {
      const data = await api(`/api/student/${encodeURIComponent(id)}/request-access`, {
        method: 'POST',
        body: JSON.stringify({ dni, codigo })
      });
      setResult({ ok: true, message: `Solicitud enviada: ${data.request.id}` });
      await checkStatus();
    } catch (error) {
      setResult({ ok: false, message: error.message });
    } finally {
      setBusy(false);
    }
  }

  function addAttemptLog(message) {
    setAttemptLogs((items) => [{ at: new Date().toLocaleTimeString(), message }, ...items].slice(0, 16));
  }

  async function runAttempts({ scheduled = false, fireAtMs = Date.now() } = {}) {
    setBusy(true);
    setResult(null);
    try {
      const isWebViewMode = config?.config?.targetMode === 'webview';
      addAttemptLog(scheduled ? 'Ventana de pre-disparo alcanzada; ejecutando intento controlado.' : 'Verificacion inmediata iniciada.');
      const data = await api('/api/attempts/run', {
        method: 'POST',
        body: JSON.stringify({ dni, codigo, clientId: 'student-app' })
      });
      const entry = {
        at: new Date().toISOString(),
        ok: data.ok,
        message: data.message,
        attempts: data.attempts || []
      };
      const next = [entry, ...history].slice(0, 30);
      setHistory(next);
      localStorage.setItem('student:history', JSON.stringify(next));
      setResult(data);
      if (isWebViewMode) {
        openOfficialWebView(scheduled ? fireAtMs : Date.now());
      }
      await checkStatus();
    } catch (error) {
      setResult({ ok: false, message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function generateWithPrefire() {
    setResult(null);
    setAttemptLogs([]);
    setBusy(true);
    try {
      const freshConfig = await refreshConfig();
      if (!status?.authorized) {
        setResult({ ok: false, message: 'Primero verifique que el alumno tenga autorizacion/cupo.' });
        return;
      }
      const cfg = freshConfig?.config;
      const fireAt = freshConfig?.targetTime ? new Date(freshConfig.targetTime).getTime() : Date.now();
      if (cfg?.targetMode === 'webview') {
        addAttemptLog('Abriendo la web oficial ahora para dejarla precargada.');
        addAttemptLog(`Los refrescos controlados empezaran ${Number(cfg?.preFireMs || 3000)} ms antes de la hora.`);
        addAttemptLog(`Click automatico objetivo: ${new Date(fireAt).toLocaleTimeString()}.`);
        setResult({ ok: true, status: 'armed', message: 'Web oficial abierta y preparada para disparar en la hora objetivo.' });
        openOfficialWebView(fireAt, cfg);
        return;
      }
      const startAt = Math.max(Date.now(), fireAt - Number(cfg?.preFireMs || 3000));
      const waitMs = startAt - Date.now();
      addAttemptLog(`Programado para abrir la pagina oficial ${Number(cfg?.preFireMs || 3000)} ms antes.`);
      addAttemptLog(`Click automatico objetivo: ${new Date(fireAt).toLocaleTimeString()}.`);
      if (waitMs > 0) {
        setResult({ ok: true, status: 'scheduled', message: `Esperando ventana de pre-disparo: ${Math.ceil(waitMs / 1000)} s.` });
        const logTimer = setInterval(() => {
          const remaining = startAt - Date.now();
          if (remaining <= 0) {
            clearInterval(logTimer);
            return;
          }
          addAttemptLog(`Esperando pre-disparo: faltan ${Math.ceil(remaining / 1000)} s para abrir y preparar.`);
        }, 1000);
        setTimeout(() => runAttempts({ scheduled: true, fireAtMs: fireAt }), waitMs);
      } else {
        await runAttempts({ scheduled: true, fireAtMs: fireAt });
      }
    } catch (error) {
      setResult({ ok: false, message: error.message });
    } finally {
      setBusy(false);
    }
  }

  function openOfficialWebView(fireAtMs = Date.now(), configOverride = config?.config) {
    const activeConfig = configOverride || {};
    const selectors = activeConfig.selectors || {};
    const fallbackCampo1 = '#dni, input[name="tl_dni"], input[id*="dni"], input[placeholder*="DNI"], input[placeholder*="Documento"]';
    const fallbackCampo2 = '#codigo, #matricula, input[name*="codigo"], input[name*="matricula"], input[id*="codigo"], input[id*="matricula"], input[placeholder*="Codigo"], input[placeholder*="Código"], input[placeholder*="Matricula"], input[placeholder*="Matrícula"]';
    const fallbackButton = '.btn-register, button[type="submit"], button.btn-success, button, input[type="submit"]';
    const params = new URLSearchParams({
      url: activeConfig.targetPage || TARGET_PAGE,
      dni,
      codigo,
      studentId: id,
      apiBase: API_BASE || location.origin,
      s1: [selectors.campo1, fallbackCampo1].filter(Boolean).join(', '),
      s2: [selectors.campo2, fallbackCampo2].filter(Boolean).join(', '),
      button: [selectors.button, fallbackButton].filter(Boolean).join(', '),
      fireAt: String(fireAtMs),
      maxAttempts: String(activeConfig.maxAttempts || 10),
      intervalMs: String(activeConfig.intervalMs || 100),
      reloadWindowMs: String(activeConfig.preFireMs || 3000),
      timeoutMs: String(activeConfig.requestTimeoutMs || 15000)
    });
    const nativeUrl = `asistente://official?${params.toString()}`;
    if (/capacitor|android/i.test(navigator.userAgent)) {
      window.location.href = nativeUrl;
      return;
    }
    window.open(activeConfig.targetPage || TARGET_PAGE, '_blank', 'noopener,noreferrer');
  }

  function saveReceipt() {
    const receipt = {
      dni,
      codigo,
      result,
      savedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `comprobante-${dni}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Acceso autorizado</p>
          <h1>Asistente de estudiantes</h1>
        </div>
        <div className="topActions">
          <button className="iconButton" onClick={onSwitchRole} title="Cambiar perfil"><Users size={20} /></button>
          <a className="iconButton" href={config?.config?.targetPage || TARGET_PAGE} target="_blank" rel="noreferrer" title="Abrir pagina oficial">
            <Ticket size={20} />
          </a>
        </div>
      </header>

      <main className="studentGrid">
        <section className="panel mainPanel">
          <div className="sectionTitle">
            <ShieldCheck />
            <h2>Datos del alumno</h2>
          </div>
          <div className="twoCols">
            <Field label="DNI" value={dni} onChange={setDni} placeholder="Ej. 70123456" />
            <Field label="Codigo estudiante" value={codigo} onChange={setCodigo} placeholder="Ej. 2020123456" />
          </div>
          <div className="actions">
            <button disabled={busy || !dni || !codigo} onClick={checkStatus}><ListChecks size={18} /> Ver cupo</button>
            <button disabled={busy || !dni || !codigo} onClick={requestAccess}><Send size={18} /> Solicitar acceso</button>
          </div>
          {status && (
            <div className="statusLine">
              <StatusBadge ok={status.authorized}>{status.authorized ? 'Autorizado' : 'Sin cupo activo'}</StatusBadge>
              <span>Cupos: {status.student?.credits ?? 0}</span>
              <span>Estado: {status.student?.status || 'no registrado'}</span>
            </div>
          )}
        </section>

        <section className="panel timerPanel">
          <div className="sectionTitle">
            <Clock3 />
            <h2>Hora objetivo</h2>
          </div>
          <div className="countdown">{config ? formatCountdown(countdownMs) : '--:--:--.---'}</div>
          <div className="metaGrid">
            <span>Servidor</span><strong>{serverOffset >= 0 ? '+' : ''}{serverOffset} ms</strong>
            <span>Pre-disparo</span><strong>{config?.config?.preFireMs ?? '-'} ms</strong>
            <span>Intentos</span><strong>{config?.config?.maxAttempts ?? '-'}</strong>
            <span>Intervalo</span><strong>{config?.config?.intervalMs ?? '-'} ms</strong>
          </div>
          <button className="primary" disabled={busy || !status?.authorized} onClick={generateWithPrefire}>
            <Activity size={18} /> Generar con disparos
          </button>
          <button disabled={busy || !status?.authorized} onClick={() => runAttempts({ scheduled: false })}>
            <Ticket size={18} /> Verificar ahora
          </button>
          {config && <p className="hint">Generar con disparos abre la pagina oficial de inmediato, la deja precargada, refresca solo en la ventana configurada y hace clic en la hora objetivo. Verificar ahora sirve para recuperar un ticket ya emitido o ver si la web oficial cerro/no tiene cupos.</p>}
          <div className="attemptLog">
            {attemptLogs.map((item) => <span key={`${item.at}-${item.message}`}>{item.at} - {item.message}</span>)}
          </div>
        </section>

        <section className="panel">
          <div className="sectionTitle">
            {result?.ok ? <CheckCircle2 /> : <XCircle />}
            <h2>Resultado</h2>
          </div>
          <pre className="resultBox">{result ? JSON.stringify(result, null, 2) : 'Sin ejecuciones todavia.'}</pre>
          <div className="actions">
            <button disabled={!result} onClick={saveReceipt}><Save size={18} /> Guardar comprobante</button>
          </div>
        </section>

        <section className="panel">
          <div className="sectionTitle">
            <History />
            <h2>Historial local</h2>
          </div>
          <div className="list">
            {history.length === 0 && <p className="hint">Los intentos quedaran guardados en este dispositivo.</p>}
            {history.map((item) => (
              <div className="row" key={item.at}>
                <span>{new Date(item.at).toLocaleString()}</span>
                <StatusBadge ok={item.ok}>{item.ok ? 'exito' : 'fallo'}</StatusBadge>
                <small>{item.message}</small>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function AdminApp({ onSwitchRole }) {
  const [token, setToken] = useState(localStorage.getItem('admin:token') || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [data, setData] = useState({ stats: null, students: [], requests: [], attempts: [], config: null });
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (token) loadAdmin();
  }, [token]);

  async function login() {
    const response = await api('/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setToken(response.token);
    localStorage.setItem('admin:token', response.token);
  }

  async function loadAdmin() {
    try {
      const [stats, students, requests, attempts, config] = await Promise.all([
        api('/admin/stats', { token }),
        api('/admin/students', { token }),
        api('/admin/requests', { token }),
        api('/admin/attempts', { token }),
        api('/api/config/target-time')
      ]);
      setData({ stats: stats.stats, students: students.students, requests: requests.requests, attempts: attempts.attempts, config: config.config });
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function approve(id, approved) {
    await api(`/admin/requests/${id}/approve`, { token, method: 'POST', body: JSON.stringify({ approved, credits: 1 }) });
    await loadAdmin();
  }

  async function setCredits(id, credits) {
    await api(`/admin/students/${encodeURIComponent(id)}/set-credits`, { token, method: 'POST', body: JSON.stringify({ credits }) });
    await loadAdmin();
  }

  async function saveConfig(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = Object.fromEntries(form.entries());
    const payload = {
      targetHour: Number(next.targetHour),
      targetMinute: Number(next.targetMinute),
      targetSecond: Number(next.targetSecond),
      targetMs: Number(next.targetMs),
      preFireMs: Number(next.preFireMs),
      maxAttempts: Number(next.maxAttempts),
      intervalMs: Number(next.intervalMs),
      requestTimeoutMs: Number(next.requestTimeoutMs),
      rateLimitPerUser: Number(next.rateLimitPerUser),
      globalRateLimit: Number(next.globalRateLimit),
      stopOnFirstSuccess: next.stopOnFirstSuccess === 'on',
      targetMode: next.targetMode,
      targetEndpoint: next.targetEndpoint,
      targetPage: next.targetPage,
      selectors: { campo1: next.selectorCampo1, campo2: next.selectorCampo2, button: next.selectorButton }
    };
    await api('/admin/config', { token, method: 'POST', body: JSON.stringify(payload) });
    setMessage('Configuracion guardada.');
    await loadAdmin();
  }

  if (!token) {
    return (
      <div className="authPage">
        <section className="panel authBox">
          <div className="sectionTitle"><KeyRound /><h1>Panel administrador</h1></div>
          <Field label="Correo admin" value={email} onChange={setEmail} />
          <Field label="Password" type="password" value={password} onChange={setPassword} />
          <button className="primary" onClick={login}><ShieldCheck size={18} /> Entrar</button>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Administracion</p>
          <h1>Panel de control</h1>
        </div>
        <div className="topActions">
          <button className="iconButton" title="Cambiar perfil" onClick={onSwitchRole}><Users size={20} /></button>
          <button className="iconButton" title="Cerrar sesion" onClick={() => { localStorage.removeItem('admin:token'); setToken(''); }}><LogOut size={20} /></button>
        </div>
      </header>
      <nav className="tabs">
        {[
          ['dashboard', LayoutDashboard, 'Dashboard'],
          ['students', Users, 'Alumnos'],
          ['requests', ListChecks, 'Solicitudes'],
          ['attempts', History, 'Intentos'],
          ['config', Settings, 'Configuracion']
        ].map(([key, Icon, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}><Icon size={17} /> {label}</button>
        ))}
      </nav>
      {message && <p className="notice">{message}</p>}

      {tab === 'dashboard' && <Dashboard stats={data.stats} />}
      {tab === 'students' && <Students students={data.students} setCredits={setCredits} />}
      {tab === 'requests' && <Requests requests={data.requests} approve={approve} />}
      {tab === 'attempts' && <Attempts attempts={data.attempts} />}
      {tab === 'config' && <ConfigForm config={data.config} saveConfig={saveConfig} />}
    </div>
  );
}

function Dashboard({ stats }) {
  const items = [
    ['Alumnos', stats?.students ?? 0],
    ['Solicitudes pendientes', stats?.pendingRequests ?? 0],
    ['Intentos', stats?.attempts ?? 0],
    ['Exitos', stats?.success ?? 0],
    ['Fallos', stats?.failed ?? 0],
    ['Cupos disponibles', stats?.creditsAvailable ?? 0]
  ];
  return <main className="cards">{items.map(([label, value]) => <section className="metric" key={label}><span>{label}</span><strong>{value}</strong></section>)}</main>;
}

function Students({ students, setCredits }) {
  return <main className="panel tablePanel"><h2>Alumnos autorizados</h2>{students.map((s) => <div className="tableRow" key={s.id}><span>{s.dni}</span><span>{s.codigo}</span><span>{s.status}</span><input type="number" defaultValue={s.credits} min="0" onBlur={(e) => setCredits(s.id, Number(e.target.value))} /></div>)}</main>;
}

function Requests({ requests, approve }) {
  return <main className="panel tablePanel"><h2>Solicitudes</h2>{requests.map((r) => <div className="tableRow" key={r.id}><span>{r.dni}</span><span>{r.codigo}</span><span>{r.status}</span><button onClick={() => approve(r.id, true)}>Aprobar</button><button onClick={() => approve(r.id, false)}>Rechazar</button></div>)}</main>;
}

function Attempts({ attempts }) {
  return <main className="panel tablePanel"><h2>Historial de intentos</h2>{attempts.map((a) => <div className="tableRow wide" key={a.id}><span>{new Date(a.createdAt).toLocaleString()}</span><span>{a.dni}</span><span>{a.status}</span><small>{a.response?.payload?.message || a.response?.payload?.status || a.mode}</small></div>)}</main>;
}

function ConfigForm({ config, saveConfig }) {
  if (!config) return null;
  return (
    <main className="panel">
      <h2>Configuracion</h2>
      <form className="configGrid" onSubmit={saveConfig}>
        {['targetHour', 'targetMinute', 'targetSecond', 'targetMs', 'preFireMs', 'maxAttempts', 'intervalMs', 'requestTimeoutMs', 'rateLimitPerUser', 'globalRateLimit'].map((key) => (
          <label className="field" key={key}><span>{key}</span><input name={key} type="number" defaultValue={config[key]} /></label>
        ))}
        <label className="field"><span>Modo</span><select name="targetMode" defaultValue={config.targetMode}><option value="api">api</option><option value="webview">webview</option></select></label>
        <label className="field wideField"><span>Endpoint</span><input name="targetEndpoint" defaultValue={config.targetEndpoint} /></label>
        <label className="field wideField"><span>Pagina oficial</span><input name="targetPage" defaultValue={config.targetPage} /></label>
        <label className="field"><span>Selector campo 1</span><input name="selectorCampo1" defaultValue={config.selectors?.campo1} /></label>
        <label className="field"><span>Selector campo 2</span><input name="selectorCampo2" defaultValue={config.selectors?.campo2} /></label>
        <label className="field"><span>Selector boton</span><input name="selectorButton" defaultValue={config.selectors?.button} /></label>
        <label className="check"><input name="stopOnFirstSuccess" type="checkbox" defaultChecked={config.stopOnFirstSuccess} /> Detener al primer exito</label>
        <button className="primary"><Save size={18} /> Guardar</button>
      </form>
    </main>
  );
}

function RoleSelection({ onSelect }) {
  return (
    <div className="rolePage">
      <section className="roleHero">
        <p className="eyebrow">Seleccion de acceso</p>
        <h1>Asistente de estudiantes</h1>
        <div className="roleGrid">
          <button className="roleButton" onClick={() => onSelect('student')}>
            <School size={30} />
            <span>Estudiante</span>
            <small>Solicitar cupo, sincronizar hora y generar tiket.</small>
          </button>
          <button className="roleButton" onClick={() => onSelect('admin')}>
            <ShieldCheck size={30} />
            <span>Administrador</span>
            <small>Gestionar alumnos, solicitudes, cupos e intentos.</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function Root() {
  const initialMode = location.hash === '#admin' ? 'admin' : localStorage.getItem('app:role') || '';
  const [mode, setMode] = useState(initialMode);
  function selectMode(nextMode) {
    localStorage.setItem('app:role', nextMode);
    setMode(nextMode);
    if (nextMode === 'admin') location.hash = 'admin';
    if (nextMode === 'student' && location.hash === '#admin') history.replaceState(null, '', location.pathname);
  }
  function switchRole() {
    localStorage.removeItem('app:role');
    setMode('');
    if (location.hash === '#admin') history.replaceState(null, '', location.pathname);
  }
  useEffect(() => {
    const onHash = () => {
      if (location.hash === '#admin') selectMode('admin');
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  if (!mode) return <RoleSelection onSelect={selectMode} />;
  return mode === 'admin' ? <AdminApp onSwitchRole={switchRole} /> : <StudentApp onSwitchRole={switchRole} />;
}

createRoot(document.getElementById('root')).render(<Root />);
