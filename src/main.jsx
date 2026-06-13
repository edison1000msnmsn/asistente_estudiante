import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  ArrowLeft,
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

function resolveGenerateFireAt(freshConfig) {
  const localNow = Date.now();
  const serverNow = freshConfig?.serverTime ? new Date(freshConfig.serverTime).getTime() : localNow;
  const serverTarget = freshConfig?.targetTime ? new Date(freshConfig.targetTime).getTime() : localNow;
  const delta = serverTarget - serverNow;
  if (Number.isFinite(delta) && delta > 0 && delta <= 12 * 60 * 60 * 1000) {
    return { fireAt: localNow + delta, immediate: false };
  }
  return { fireAt: localNow, immediate: true };
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

const ACTIVE_QUEUE_STATUSES = new Set(['queued', 'running']);

function readStoredQueueJob() {
  try {
    return JSON.parse(localStorage.getItem('student:queueJob') || 'null');
  } catch {
    return null;
  }
}

function queueStatusLabel(status) {
  const labels = {
    queued: 'Preparado',
    running: 'Generando ticket',
    success: 'Ticket confirmado',
    sold_out: 'Cupos agotados',
    restricted: 'Alumno restringido',
    not_found: 'Alumno no encontrado',
    not_authorized: 'Sin autorizacion',
    rate_limit: 'Limite alcanzado',
    failed: 'Sin confirmacion',
    not_open_yet: 'Fuera de horario'
  };
  return labels[status] || status || 'Sin estado';
}

function queueMessage(job) {
  return job?.result?.payload?.message || job?.lastMessage || queueStatusLabel(job?.status);
}

function studentQueueMessage(job) {
  if (job?.status === 'queued') return 'Tu registro automatico quedo programado.';
  if (job?.status === 'running') return 'Estamos generando tu ticket automaticamente.';
  return queueMessage(job);
}

function buildStudentOutcome({ result, queueJob, status, id }) {
  const sameStudent = status?.id === id;
  const credits = Number(status?.student?.credits ?? 0);
  if (queueJob?.status === 'queued') {
    return {
      tone: 'wait',
      icon: Clock3,
      title: 'Preparado',
      message: 'Tu registro automatico ya esta en cola activa.'
    };
  }
  if (queueJob?.status === 'running') {
    return {
      tone: 'info',
      icon: Activity,
      title: 'Generando ticket',
      message: 'Railway esta intentando obtener tu ticket.'
    };
  }
  if (queueJob?.status === 'success' || result?.status === 'success' || result?.job?.status === 'success') {
    return {
      tone: 'success',
      icon: CheckCircle2,
      title: 'Exito',
      message: 'Ticket confirmado. Guarda tu comprobante y presentalo en el comedor.'
    };
  }
  if (queueJob?.status === 'sold_out' || result?.status === 'sold_out' || result?.job?.status === 'sold_out') {
    return {
      tone: 'danger',
      icon: Ticket,
      title: 'Agotado',
      message: 'Ya no quedan cupos disponibles para hoy.'
    };
  }
  if (queueJob?.status === 'not_open_yet' || result?.status === 'not_open_yet' || result?.job?.status === 'not_open_yet') {
    return {
      tone: 'danger',
      icon: XCircle,
      title: 'Cerrado',
      message: 'El registro oficial todavia no esta abierto o ya cerro.'
    };
  }
  if (queueJob?.status === 'not_authorized' || result?.status === 'not_authorized' || result?.job?.status === 'not_authorized') {
    return {
      tone: 'empty',
      icon: Users,
      title: 'Sin cupos',
      message: 'No tienes cupos activos para generar ticket.'
    };
  }
  if (queueJob?.status === 'restricted' || result?.status === 'restricted') {
    return {
      tone: 'danger',
      icon: XCircle,
      title: 'Alumno restringido',
      message: 'La web oficial no permitio generar ticket para estos datos.'
    };
  }
  if (queueJob?.status === 'not_found' || result?.status === 'not_found') {
    return {
      tone: 'danger',
      icon: XCircle,
      title: 'Alumno no encontrado',
      message: 'Revisa DNI y codigo. La letra del codigo puede ir en mayuscula o minuscula.'
    };
  }
  if (sameStudent && !status?.authorized && credits <= 0) {
    return {
      tone: 'empty',
      icon: Users,
      title: 'Sin cupos',
      message: 'Solicita cupos al administrador para activar el registro automatico.'
    };
  }
  if (result?.status === 'scheduled' || result?.status === 'armed') {
    return {
      tone: 'wait',
      icon: Clock3,
      title: 'Preparado',
      message: 'Tu registro automatico quedo programado.'
    };
  }
  if (result?.message) {
    return {
      tone: result.ok ? 'success' : 'danger',
      icon: result.ok ? CheckCircle2 : XCircle,
      title: result.ok ? 'Operacion completada' : 'Sin confirmacion',
      message: result.message
    };
  }
  return {
    tone: 'idle',
    icon: Clock3,
    title: sameStudent && status?.authorized ? 'Listo' : 'Sin ejecutar',
    message: sameStudent && status?.authorized ? 'Puedes armar la cola cuando corresponda.' : 'Verifica tu cupo para continuar.'
  };
}

function StudentResultVisual({ outcome, showRequestAccess, busy, onRequestAccess, onSaveReceipt, hasResult }) {
  const Icon = outcome.icon;
  const canSaveReceipt = outcome.tone === 'success' && hasResult;
  return (
    <div className={`studentOutcome ${outcome.tone}`}>
      <div className="outcomeIcon"><Icon size={24} /></div>
      <div className="outcomeText">
        <strong>{outcome.title}</strong>
        <span>{outcome.message}</span>
        <div className="outcomeActions">
          {showRequestAccess && <button disabled={busy} onClick={onRequestAccess}><Send size={17} /> Solicitar cupos</button>}
          {canSaveReceipt && <button onClick={onSaveReceipt}><Save size={17} /> Guardar comprobante</button>}
        </div>
      </div>
    </div>
  );
}

function StudentApp({ onSwitchRole }) {
  const [dni, setDni] = useState(localStorage.getItem('student:dni') || '');
  const [codigo, setCodigo] = useState(localStorage.getItem('student:codigo') || '');
  const [status, setStatus] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('student:status') || 'null');
    } catch {
      return null;
    }
  });
  const [config, setConfig] = useState(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState(JSON.parse(localStorage.getItem('student:history') || '[]'));
  const [attemptLogs, setAttemptLogs] = useState([]);
  const [queueJob, setQueueJobState] = useState(readStoredQueueJob);
  const [autoCheckAllowed] = useState(() => Boolean(localStorage.getItem('student:dni') && localStorage.getItem('student:codigo')));
  const [autoCheckedInitial, setAutoCheckedInitial] = useState(false);

  const id = useMemo(() => studentId(dni, codigo), [dni, codigo]);
  const targetMs = config?.targetTime ? new Date(config.targetTime).getTime() : 0;
  const correctedNow = nowTick + serverOffset;
  const countdownMs = targetMs ? targetMs - correctedNow : 0;
  const isAuthorized = status?.id === id && status?.authorized;

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

  useEffect(() => {
    if (!autoCheckAllowed || autoCheckedInitial || !dni || !codigo) return;
    setAutoCheckedInitial(true);
    checkStatus({ keepResult: true });
  }, [autoCheckAllowed, autoCheckedInitial, dni, codigo]);

  useEffect(() => {
    if (!queueJob?.id || !ACTIVE_QUEUE_STATUSES.has(queueJob.status) || (queueJob.studentId && queueJob.studentId !== id)) return undefined;
    let cancelled = false;
    async function pollQueue() {
      try {
        const data = await api(`/api/queue/${encodeURIComponent(queueJob.id)}/status`);
        if (cancelled) return;
        updateQueueJob(data.job);
        if (!ACTIVE_QUEUE_STATUSES.has(data.job.status)) {
          const entry = {
            at: new Date().toISOString(),
            ok: data.job.status === 'success',
            message: queueMessage(data.job),
            queueJobId: data.job.id,
            attempts: data.job.attemptsRun || 0
          };
          setHistory((items) => {
            const next = [entry, ...items].slice(0, 30);
            localStorage.setItem('student:history', JSON.stringify(next));
            return next;
          });
          setResult({ ok: data.job.status === 'success', status: data.job.status, message: queueMessage(data.job), job: data.job });
          addAttemptLog(`Cola Railway finalizada: ${queueStatusLabel(data.job.status)}.`);
          await checkStatus({ keepResult: true });
        }
      } catch (error) {
        if (!cancelled) setResult({ ok: false, message: error.message });
      }
    }
    pollQueue();
    const timer = setInterval(pollQueue, 1200);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [queueJob?.id, queueJob?.status, id]);

  useEffect(() => {
    if (!queueJob?.id || !config?.targetTime || queueJob.studentId !== id || ACTIVE_QUEUE_STATUSES.has(queueJob.status)) return;
    const currentTarget = new Date(config.targetTime).getTime();
    const queueTarget = new Date(queueJob.targetAt || queueJob.targetTime || 0).getTime();
    if (Number.isFinite(currentTarget) && Number.isFinite(queueTarget) && Math.abs(currentTarget - queueTarget) > 60_000) {
      updateQueueJob(null);
      setResult(null);
    }
  }, [queueJob?.id, queueJob?.status, queueJob?.targetAt, config?.targetTime, id]);

  function updateQueueJob(job) {
    setQueueJobState(job);
    if (job) localStorage.setItem('student:queueJob', JSON.stringify(job));
    else localStorage.removeItem('student:queueJob');
  }

  async function refreshConfig() {
    const [time, target] = await Promise.all([
      api('/api/time'),
      api('/api/config/target-time')
    ]);
    setServerOffset(Number(time.epochMs) - Date.now());
    setConfig(target);
    return target;
  }

  async function checkStatus({ keepResult = false } = {}) {
    setBusy(true);
    if (!keepResult) setResult(null);
    try {
      const data = await api(`/api/student/${encodeURIComponent(id)}/status`);
      const nextStatus = { ...data, id };
      setStatus(nextStatus);
      localStorage.setItem('student:status', JSON.stringify(nextStatus));
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
      await checkStatus({ keepResult: true });
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
        openOfficialWebView(scheduled ? fireAtMs : Date.now(), undefined, { mode: scheduled ? 'prefire' : 'immediate' });
      }
      await checkStatus({ keepResult: true });
    } catch (error) {
      setResult({ ok: false, message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function generateWithPrefire() {
    setResult(null);
    setAttemptLogs([]);
    updateQueueJob(null);
    setBusy(true);
    try {
      const freshConfig = await refreshConfig();
      if (!isAuthorized) {
        setResult({ ok: false, message: 'Primero verifique que el alumno tenga autorizacion/cupo.' });
        return;
      }
      const cfg = freshConfig?.config;
      const firePlan = resolveGenerateFireAt(freshConfig);
      const fireAt = firePlan.fireAt;
      if (cfg?.useServerQueue) {
        const queued = await api('/api/queue/arm', {
          method: 'POST',
          body: JSON.stringify({ dni, codigo, clientId: 'student-app' })
        });
        updateQueueJob(queued.job);
        setResult({
          ok: true,
          status: queued.status,
          message: queued.status === 'running' ? 'Cola activa: generando ticket.' : 'Cola activa: registro automatico preparado.',
          job: queued.job
        });
        return;
      }
      if (cfg?.targetMode === 'webview') {
        addAttemptLog('Abriendo la web oficial ahora para dejarla precargada.');
        if (firePlan.immediate) {
          addAttemptLog('La hora objetivo de hoy ya paso; se ejecuta la API oficial inmediatamente.');
        } else {
          addAttemptLog(`Los refrescos controlados empezaran ${Number(cfg?.preFireMs || 3000)} ms antes de la hora.`);
          addAttemptLog(`Click/API objetivo: ${new Date(fireAt).toLocaleTimeString()}.`);
        }
        setResult({ ok: true, status: firePlan.immediate ? 'immediate' : 'armed', message: firePlan.immediate ? 'Ejecutando verificacion/generacion inmediata.' : 'Web oficial abierta y preparada para disparar en la hora objetivo.' });
        openOfficialWebView(fireAt, cfg, { mode: firePlan.immediate ? 'immediate' : 'prefire' });
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

  function openOfficialWebView(fireAtMs = Date.now(), configOverride = config?.config, options = {}) {
    const activeConfig = configOverride || {};
    const selectors = activeConfig.selectors || {};
    const fallbackCampo1 = '#dni, input[name="tl_dni"], input[id*="dni"], input[placeholder*="DNI"], input[placeholder*="Documento"]';
    const fallbackCampo2 = '#codigo, #matricula, input[name*="codigo"], input[name*="matricula"], input[id*="codigo"], input[id*="matricula"], input[placeholder*="Codigo"], input[placeholder*="Código"], input[placeholder*="Matricula"], input[placeholder*="Matrícula"]';
    const fallbackButton = '.btn-register, button[type="submit"], button.btn-success, button, input[type="submit"]';
    const directEndpoint = activeConfig.officialTicketEndpoint
      || (activeConfig.targetEndpoint?.includes('/api/')
        ? activeConfig.targetEndpoint
        : 'https://comensales.uncp.edu.pe/api/registros');
    const params = new URLSearchParams({
      url: activeConfig.targetPage || TARGET_PAGE,
      directEndpoint,
      dni,
      codigo,
      studentId: id,
      apiBase: API_BASE || location.origin,
      s1: [selectors.campo1, fallbackCampo1].filter(Boolean).join(', '),
      s2: [selectors.campo2, fallbackCampo2].filter(Boolean).join(', '),
      button: [selectors.button, fallbackButton].filter(Boolean).join(', '),
      mode: options.mode || 'immediate',
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

  const sameStudentStatus = status?.id === id;
  const studentCredits = sameStudentStatus ? Number(status?.student?.credits ?? 0) : null;
  const showCheckStatus = Boolean(dni && codigo && !sameStudentStatus);
  const showRequestAccess = Boolean(sameStudentStatus && !status?.authorized && Number(studentCredits || 0) <= 0);
  const outcome = buildStudentOutcome({ result, queueJob, status, id });
  const OutcomeIcon = outcome.icon;

  return (
    <div className="page">
      <header className="topbar studentTopbar">
        <div>
          <p className="eyebrow">Acceso autorizado</p>
          <h1>Estudiante</h1>
        </div>
        <div className="topActions">
          <button className="backButton" onClick={onSwitchRole}><ArrowLeft size={18} /> Regresar</button>
          <a className="iconButton" href={config?.config?.targetPage || TARGET_PAGE} target="_blank" rel="noreferrer" title="Abrir pagina oficial">
            <Ticket size={20} />
          </a>
        </div>
      </header>

      <section className="studentHero">
        <div>
          <strong>{isAuthorized ? 'Listo para generar' : 'Verifica tu cupo'}</strong>
          <span>{isAuthorized ? 'Cupo activo y hora sincronizada' : 'Consulta tu estado antes de armar la cola'}</span>
        </div>
        <div className="heroBadge">{sameStudentStatus ? `${studentCredits ?? 0} cupos` : 'Sin verificar'}</div>
      </section>

      <main className="studentGrid">
        <section className="panel mainPanel">
          <div className="sectionTitle">
            <ShieldCheck />
            <h2>Datos</h2>
          </div>
          <div className="twoCols">
            <Field label="DNI" value={dni} onChange={setDni} placeholder="Ej. 70123456" />
            <Field label="Codigo estudiante" value={codigo} onChange={setCodigo} placeholder="Ej. 2020123456" />
          </div>
          <div className="actions">
            {showCheckStatus && <button disabled={busy || !dni || !codigo} onClick={checkStatus}><ListChecks size={18} /> Ver cupo</button>}
            {showRequestAccess && <button disabled={busy || !dni || !codigo} onClick={requestAccess}><Send size={18} /> Solicitar cupos</button>}
          </div>
        </section>

        <section className="panel timerPanel">
          <div className="sectionTitle">
            <Clock3 />
            <h2>Hora objetivo</h2>
          </div>
          <div className="countdownWrap">
            <span>Objetivo 07:00:00</span>
            <div className="countdown">{config ? formatCountdown(countdownMs) : '--:--:--.---'}</div>
            <i />
          </div>
          <button className="primary" disabled={busy || !isAuthorized} onClick={generateWithPrefire}>
            <Activity size={18} /> Generar con disparos
          </button>
          <button disabled={busy || !isAuthorized} onClick={() => runAttempts({ scheduled: false })}>
            <Ticket size={18} /> Verificar ticket
          </button>
        </section>

        <section className="panel">
          <div className="sectionTitle">
            <OutcomeIcon />
            <h2>Resultado</h2>
          </div>
          <StudentResultVisual
            outcome={outcome}
            showRequestAccess={showRequestAccess}
            busy={busy}
            onRequestAccess={requestAccess}
            onSaveReceipt={saveReceipt}
            hasResult={Boolean(result)}
          />
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
  const [data, setData] = useState({ stats: null, students: [], requests: [], attempts: [], queue: [], config: null });
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
      const [stats, students, requests, attempts, queue, config] = await Promise.all([
        api('/admin/stats', { token }),
        api('/admin/students', { token }),
        api('/admin/requests', { token }),
        api('/admin/attempts', { token }),
        api('/admin/queue', { token }),
        api('/api/config/target-time')
      ]);
      setData({ stats: stats.stats, students: students.students, requests: requests.requests, attempts: attempts.attempts, queue: queue.jobs, config: config.config });
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
      postFireMs: Number(next.postFireMs),
      maxAttempts: Number(next.maxAttempts),
      intervalMs: Number(next.intervalMs),
      requestTimeoutMs: Number(next.requestTimeoutMs),
      parallelAttemptsPerUser: Number(next.parallelAttemptsPerUser),
      globalConcurrentAttempts: Number(next.globalConcurrentAttempts),
      rateLimitPerUser: Number(next.rateLimitPerUser),
      globalRateLimit: Number(next.globalRateLimit),
      stopOnFirstSuccess: next.stopOnFirstSuccess === 'on',
      useServerQueue: next.useServerQueue === 'on',
      officialTicketEndpoint: next.officialTicketEndpoint,
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
          <button className="backButton authBack" onClick={onSwitchRole}><ArrowLeft size={18} /> Regresar</button>
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
          <button className="backButton" onClick={onSwitchRole}><ArrowLeft size={18} /> Regresar</button>
          <button className="iconButton" title="Cerrar sesion" onClick={() => { localStorage.removeItem('admin:token'); setToken(''); }}><LogOut size={20} /></button>
        </div>
      </header>
      <nav className="tabs">
        {[
          ['dashboard', LayoutDashboard, 'Dashboard'],
          ['students', Users, 'Alumnos'],
          ['requests', ListChecks, 'Solicitudes'],
          ['queue', Clock3, 'Cola Railway'],
          ['attempts', History, 'Intentos'],
          ['config', Settings, 'Configuracion']
        ].map(([key, Icon, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}><Icon size={17} /> {label}</button>
        ))}
      </nav>
      {message && <p className="notice">{message}</p>}

      {tab === 'dashboard' && <Dashboard stats={data.stats} config={data.config} />}
      {tab === 'students' && <Students students={data.students} setCredits={setCredits} />}
      {tab === 'requests' && <Requests requests={data.requests} approve={approve} />}
      {tab === 'queue' && <QueueJobs jobs={data.queue} />}
      {tab === 'attempts' && <Attempts attempts={data.attempts} />}
      {tab === 'config' && <ConfigForm config={data.config} saveConfig={saveConfig} />}
    </div>
  );
}

function Dashboard({ stats, config }) {
  const items = [
    ['Alumnos', stats?.students ?? 0],
    ['Solicitudes pendientes', stats?.pendingRequests ?? 0],
    ['Intentos', stats?.attempts ?? 0],
    ['Exitos', stats?.success ?? 0],
    ['Fallos', stats?.failed ?? 0],
    ['Cola activa', stats?.queueActive ?? 0],
    ['Cola exitosa', stats?.queueSuccess ?? 0],
    ['Cupos disponibles', stats?.creditsAvailable ?? 0]
  ];
  const success = Number(stats?.success ?? 0);
  const failed = Number(stats?.failed ?? 0);
  const total = Math.max(1, success + failed);
  const successRate = Math.round((success / total) * 100);
  const failRate = Math.round((failed / total) * 100);
  return (
    <main className="dashboard">
      <section className="adminHero">
        <div>
          <span>Estado actual</span>
          <strong>Operacion lista</strong>
          <div className="adminHeroChips">
            <em>{config?.useServerQueue ? 'Cola activa' : 'Cola local'}</em>
            <em>{config?.targetMode === 'api' ? 'API conectada' : 'WebView activo'}</em>
            <em>{config?.parallelAttemptsPerUser ?? '-'} paralelos</em>
          </div>
        </div>
        <Activity size={34} />
      </section>
      <section className="cards adminStats">
        {items.map(([label, value], index) => <section className={`metric tone${index % 4}`} key={label}><span>{label}</span><strong>{value}</strong></section>)}
      </section>
      <section className="panel diagnosticPanel">
        <div className="sectionTitle"><Activity /><h2>Diagnostico rapido</h2></div>
        <div className="barList">
          <div className="barRow"><span>Exitos</span><i><b style={{ width: `${successRate}%` }} /></i><strong>{successRate}%</strong></div>
          <div className="barRow"><span>Fallos</span><i><b style={{ width: `${failRate}%` }} /></i><strong>{failRate}%</strong></div>
          <div className="barRow"><span>Cola activa</span><i><b style={{ width: `${Math.min(100, Number(stats?.queueActive ?? 0) * 25)}%` }} /></i><strong>{stats?.queueActive ?? 0}</strong></div>
        </div>
      </section>
    </main>
  );
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

function QueueJobs({ jobs }) {
  return (
    <main className="panel tablePanel">
      <h2>Cola Railway</h2>
      {jobs.length === 0 && <p className="hint">Todavia no hay disparos programados en backend.</p>}
      {jobs.map((job) => (
        <div className="tableRow queueRow" key={job.id}>
          <span>{new Date(job.queuedAt).toLocaleString()}</span>
          <span>{job.dni}</span>
          <span>{queueStatusLabel(job.status)}</span>
          <span>Intentos usados: {job.attemptsRun || 0} de {job.maxAttempts || '-'}</span>
          <small>{queueMessage(job)}</small>
          <small>Paralelos: {job.parallelAttemptsPerUser || '-'} | Post: {job.postFireMs || 0} ms</small>
        </div>
      ))}
    </main>
  );
}

function ConfigForm({ config, saveConfig }) {
  if (!config) return null;
  return (
    <main className="panel">
      <h2>Configuracion</h2>
      <form className="configGrid" onSubmit={saveConfig}>
        {['targetHour', 'targetMinute', 'targetSecond', 'targetMs', 'preFireMs', 'postFireMs', 'maxAttempts', 'intervalMs', 'requestTimeoutMs', 'parallelAttemptsPerUser', 'globalConcurrentAttempts', 'rateLimitPerUser', 'globalRateLimit'].map((key) => (
          <label className="field" key={key}><span>{key}</span><input name={key} type="number" defaultValue={config[key]} /></label>
        ))}
        <label className="field"><span>Modo</span><select name="targetMode" defaultValue={config.targetMode}><option value="api">api</option><option value="webview">webview</option></select></label>
        <label className="field wideField"><span>Endpoint oficial de ticket</span><input name="officialTicketEndpoint" defaultValue={config.officialTicketEndpoint} /></label>
        <label className="field wideField"><span>Endpoint</span><input name="targetEndpoint" defaultValue={config.targetEndpoint} /></label>
        <label className="field wideField"><span>Pagina oficial</span><input name="targetPage" defaultValue={config.targetPage} /></label>
        <label className="field"><span>Selector campo 1</span><input name="selectorCampo1" defaultValue={config.selectors?.campo1} /></label>
        <label className="field"><span>Selector campo 2</span><input name="selectorCampo2" defaultValue={config.selectors?.campo2} /></label>
        <label className="field"><span>Selector boton</span><input name="selectorButton" defaultValue={config.selectors?.button} /></label>
        <label className="check"><input name="useServerQueue" type="checkbox" defaultChecked={config.useServerQueue} /> Usar cola Railway para disparo critico</label>
        <label className="check"><input name="stopOnFirstSuccess" type="checkbox" defaultChecked={config.stopOnFirstSuccess} /> Detener al primer exito</label>
        <button className="primary"><Save size={18} /> Guardar</button>
      </form>
    </main>
  );
}

function RoleSelection({ onSelect }) {
  return (
    <div className="rolePage">
      <div className="roleStars" aria-hidden="true" />
      <section className="roleHero">
        <div className="roleHeroTop">
          <span className="roleLogo"><School size={28} /></span>
          <span className="liveDot">Sistema activo</span>
        </div>
        <p className="eyebrow">Registro automatico</p>
        <h1>Asistente de estudiantes</h1>
        <div className="roleGrid">
          <button className="roleButton" onClick={() => onSelect('student')}>
            <span className="roleIconTile"><School size={22} /></span>
            <span className="roleCopy">
              <strong>Estudiante</strong>
              <small>Generar y verificar ticket.</small>
            </span>
            <Ticket className="roleArrow" size={20} />
          </button>
          <button className="roleButton" onClick={() => onSelect('admin')}>
            <span className="roleIconTile admin"><ShieldCheck size={22} /></span>
            <span className="roleCopy">
              <strong>Administrador</strong>
              <small>Control, cupos y diagnostico.</small>
            </span>
            <ShieldCheck className="roleArrow" size={20} />
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
