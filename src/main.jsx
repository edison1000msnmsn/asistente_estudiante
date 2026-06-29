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
const LIMA_TIME_ZONE = 'America/Lima';

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

function limaParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LIMA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false
  }).formatToParts(new Date(value));
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return {
    dayKey: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour') || 0) % 24
  };
}

function formatLimaDateTime(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: LIMA_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(new Date(value));
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

function normalizeHistoryEntry(item) {
  const status = item.status || (item.ok ? 'success' : 'failed');
  const fallbackTitle = preparationStatusLabel(status);
  return {
    ...item,
    at: item.at || new Date().toISOString(),
    status,
    title: item.title || fallbackTitle,
    message: item.message || fallbackTitle
  };
}

function HistoryEntryCard({ item }) {
  const entry = normalizeHistoryEntry(item);
  const isWaiting = ACTIVE_PREPARATION_STATUSES.has(entry.status);
  const Icon = entry.ok ? CheckCircle2 : isWaiting ? Clock3 : XCircle;
  const tone = entry.ok ? 'success' : isWaiting ? 'wait' : 'danger';
  const attemptsCount = Array.isArray(entry.attempts) ? entry.attempts.length : Number(entry.attempts || 0);
  return (
    <article className={`historyCard ${tone}`}>
      <div className="historyIcon"><Icon size={19} /></div>
      <div className="historyBody">
        <div className="historyHead">
          <strong>{entry.title}</strong>
          <span>{formatLimaDateTime(entry.at)}</span>
        </div>
        <p>{entry.message}</p>
        <div className="historyMeta">
          <small>{entry.mode || 'Sesion segura'}</small>
          {attemptsCount > 0 ? <small>{attemptsCount} intentos</small> : null}
          <small>{preparationStatusLabel(entry.status)}</small>
        </div>
      </div>
    </article>
  );
}

const ACTIVE_PREPARATION_STATUSES = new Set([
  'prepared',
  'page_loading',
  'form_waiting',
  'security_pending',
  'security_ready',
  'ready_to_submit',
  'submitted'
]);

const TERMINAL_PREPARATION_STATUSES = new Set([
  'success',
  'already_issued',
  'sold_out',
  'closed',
  'invalid_student',
  'restricted',
  'manual_required',
  'timeout',
  'cancelled',
  'failed'
]);

function preparationStatusLabel(status) {
  const labels = {
    prepared: 'Preparado',
    page_loading: 'Cargando pagina',
    form_waiting: 'Esperando formulario',
    security_pending: 'Validando seguridad',
    security_ready: 'Seguridad lista',
    ready_to_submit: 'Listo para enviar',
    submitted: 'Solicitud enviada',
    success: 'Ticket confirmado',
    already_issued: 'Ticket recuperado',
    sold_out: 'Cupos agotados',
    closed: 'Registro cerrado',
    invalid_student: 'Alumno no encontrado',
    restricted: 'Alumno restringido',
    manual_required: 'Validacion requerida',
    timeout: 'Sin confirmacion',
    cancelled: 'Cancelado',
    failed: 'Error de sesion'
  };
  return labels[status] || status || 'Sin estado';
}

function preparationOutcome(preparation, status, id) {
  const sameStudent = status?.id === id;
  const credits = Number(status?.student?.credits ?? 0);
  const current = preparation?.status;
  if (current === 'success' || current === 'already_issued') {
    return {
      tone: 'success',
      icon: CheckCircle2,
      title: current === 'already_issued' ? 'Ticket recuperado' : 'Felicitaciones, obtuviste cupo',
      message: 'La pagina oficial confirmo tu ticket. Guarda el comprobante.'
    };
  }
  if (current === 'manual_required') {
    return {
      tone: 'wait',
      icon: ShieldCheck,
      title: 'Validacion requerida',
      message: 'Cloudflare solicito una comprobacion. Abre la sesion segura y completala.'
    };
  }
  if (current === 'sold_out') {
    return { tone: 'danger', icon: Ticket, title: 'Upps, cupos agotados', message: 'La pagina oficial informa que ya no quedan cupos.' };
  }
  if (current === 'closed') {
    return { tone: 'danger', icon: XCircle, title: 'Registro cerrado', message: 'La pagina oficial no esta habilitada para registrar.' };
  }
  if (current === 'invalid_student') {
    return { tone: 'danger', icon: XCircle, title: 'Alumno no encontrado', message: 'Revisa el DNI y el codigo de matricula.' };
  }
  if (current === 'restricted') {
    return { tone: 'danger', icon: XCircle, title: 'Acceso restringido', message: 'La pagina oficial no habilito este alumno.' };
  }
  if (current === 'timeout' || current === 'failed') {
    return { tone: 'danger', icon: XCircle, title: 'Sin confirmacion', message: preparation?.message || 'La sesion termino sin confirmar ticket.' };
  }
  if (current === 'submitted') {
    return { tone: 'info', icon: Activity, title: 'Solicitud enviada', message: 'Esperando la respuesta final de la pagina oficial.' };
  }
  if (current === 'security_ready' || current === 'ready_to_submit') {
    return { tone: 'info', icon: ShieldCheck, title: 'Seguridad lista', message: 'Formulario y validacion preparados para el envio unico.' };
  }
  if (current === 'security_pending') {
    return { tone: 'wait', icon: ShieldCheck, title: 'Validando seguridad', message: 'Cloudflare esta comprobando esta sesion oficial.' };
  }
  if (ACTIVE_PREPARATION_STATUSES.has(current)) {
    return { tone: 'wait', icon: Clock3, title: 'Sesion preparada', message: preparation?.message || 'La pagina oficial se esta preparando.' };
  }
  if (sameStudent && status?.pendingRequest?.status === 'pending') {
    return { tone: 'wait', icon: Send, title: 'Solicitud enviada', message: 'Tu solicitud de cupos esta pendiente de aprobacion del administrador.' };
  }
  if (sameStudent && !status?.authorized && credits <= 0) {
    return { tone: 'empty', icon: Users, title: 'Sin cupos', message: 'Solicita cupos al administrador para usar el asistente.' };
  }
  return {
    tone: 'idle',
    icon: ShieldCheck,
    title: sameStudent && status?.authorized ? 'Listo para preparar' : 'Verifica tus datos',
    message: sameStudent && status?.authorized
      ? 'Abre una sesion segura unos minutos antes de la hora.'
      : 'Consulta tu autorizacion para continuar.'
  };
}

function readStoredPreparation() {
  try {
    return JSON.parse(localStorage.getItem('student:preparation') || 'null');
  } catch {
    return null;
  }
}

function readSecureHistory() {
  try {
    return JSON.parse(localStorage.getItem('student:secureHistory') || '[]');
  } catch {
    return [];
  }
}

function preparationHistoryEntry(preparation) {
  const ok = preparation.status === 'success' || preparation.status === 'already_issued';
  return {
    at: preparation.finishedAt || preparation.updatedAt || new Date().toISOString(),
    ok,
    status: preparation.status,
    title: preparationStatusLabel(preparation.status),
    message: preparation.message || preparationStatusLabel(preparation.status),
    preparationId: preparation.id,
    mode: preparation.purpose === 'verify' ? 'Verificar ticket' : 'Preparacion segura'
  };
}

function shouldKeepPreparationToday(preparation) {
  if (!preparation || !TERMINAL_PREPARATION_STATUSES.has(preparation.status)) return false;
  const reference = preparation.finishedAt || preparation.updatedAt || preparation.createdAt;
  if (!reference) return false;
  const now = limaParts();
  return limaParts(reference).dayKey === now.dayKey && now.hour < 12;
}

function SecureStudentApp({ onSwitchRole }) {
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
  const [errorMessage, setErrorMessage] = useState('');
  const [preparation, setPreparationState] = useState(readStoredPreparation);
  const [history, setHistory] = useState(readSecureHistory);
  const [autoChecked, setAutoChecked] = useState(false);

  const id = useMemo(() => studentId(dni, codigo), [dni, codigo]);
  const sameStudentRecord = Boolean(status?.student && String(status.student.dni) === dni && String(status.student.codigo).toUpperCase() === codigo.toUpperCase());
  const sameStudentStatus = Boolean(status?.id === id || sameStudentRecord);
  const isAuthorized = sameStudentStatus && status?.authorized;
  const studentCredits = sameStudentStatus && status?.student ? Number(status.student.credits ?? 0) : null;
  const hasPendingRequest = Boolean(sameStudentStatus && status?.pendingRequest?.status === 'pending');
  const targetMs = config?.targetTime ? new Date(config.targetTime).getTime() : 0;
  const countdownMs = targetMs ? targetMs - (nowTick + serverOffset) : 0;
  const preparationLeadMs = Number(config?.config?.preparationLeadMs || 180000);
  const canPrepareNow = Boolean(config && countdownMs <= preparationLeadMs);
  const showRequestAccess = Boolean(dni && codigo && sameStudentStatus && !isAuthorized && Number(studentCredits || 0) <= 0 && !hasPendingRequest);
  const showCheckStatus = Boolean(dni && codigo && !sameStudentStatus);
  const outcome = errorMessage
    ? { tone: 'danger', icon: XCircle, title: 'No se pudo continuar', message: errorMessage }
    : preparationOutcome(preparation, { ...status, id: sameStudentStatus ? id : '' }, id);
  const OutcomeIcon = outcome.icon;

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem('student:dni', dni);
    localStorage.setItem('student:codigo', codigo);
  }, [dni, codigo]);

  useEffect(() => {
    refreshConfig().catch(() => {});
  }, []);

  useEffect(() => {
    if (autoChecked || !dni || !codigo || !localStorage.getItem('student:dni')) return;
    setAutoChecked(true);
    checkStatus({ keepPreparation: true });
  }, [autoChecked, dni, codigo]);

  useEffect(() => {
    if (!preparation?.id || !ACTIVE_PREPARATION_STATUSES.has(preparation.status)) return undefined;
    let cancelled = false;
    async function pollPreparation() {
      try {
        const data = await api(`/api/preparations/${encodeURIComponent(preparation.id)}/status`);
        if (cancelled) return;
        updatePreparation(data.preparation);
        if (TERMINAL_PREPARATION_STATUSES.has(data.preparation.status)) {
          addHistory(data.preparation);
          await checkStatus({ keepPreparation: true });
        }
      } catch {
        // The native session remains authoritative while connectivity recovers.
      }
    }
    pollPreparation();
    const timer = setInterval(pollPreparation, 1400);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [preparation?.id, preparation?.status]);

  useEffect(() => {
    if (!preparation || ACTIVE_PREPARATION_STATUSES.has(preparation.status)) return;
    if (!shouldKeepPreparationToday(preparation)) updatePreparation(null);
  }, [preparation?.id, preparation?.status, nowTick]);

  function updatePreparation(next) {
    setPreparationState(next);
    if (next) localStorage.setItem('student:preparation', JSON.stringify(next));
    else localStorage.removeItem('student:preparation');
  }

  function addHistory(nextPreparation) {
    if (nextPreparation?.purpose === 'verify') return;
    const entry = preparationHistoryEntry(nextPreparation);
    setHistory((items) => {
      const next = [entry, ...items.filter((item) => item.preparationId !== entry.preparationId)].slice(0, 30);
      localStorage.setItem('student:secureHistory', JSON.stringify(next));
      return next;
    });
  }

  async function refreshConfig() {
    const sentAt = Date.now();
    const timeRequest = api('/api/time').then((data) => ({ data, receivedAt: Date.now() }));
    const [sample, target] = await Promise.all([timeRequest, api('/api/config/target-time')]);
    setServerOffset(Number(sample.data.epochMs) - Math.round((sentAt + sample.receivedAt) / 2));
    setConfig(target);
    return target;
  }

  async function refreshLatestPreparation() {
    const data = await api(`/api/student/${encodeURIComponent(id)}/preparations`);
    const latest = data.preparations?.[0];
    if (latest && (ACTIVE_PREPARATION_STATUSES.has(latest.status) || shouldKeepPreparationToday(latest))) {
      updatePreparation(latest);
    }
  }

  async function checkStatus({ keepPreparation = false } = {}) {
    if (!dni || !codigo) return;
    setBusy(true);
    setErrorMessage('');
    if (!keepPreparation) updatePreparation(null);
    try {
      const data = await api(`/api/student/${encodeURIComponent(id)}/status`);
      const nextStatus = { ...data, id };
      setStatus(nextStatus);
      localStorage.setItem('student:status', JSON.stringify(nextStatus));
      await refreshConfig();
      await refreshLatestPreparation();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function requestAccess() {
    setBusy(true);
    setErrorMessage('');
    try {
      await api(`/api/student/${encodeURIComponent(id)}/request-access`, {
        method: 'POST',
        body: JSON.stringify({ dni, codigo })
      });
      await checkStatus({ keepPreparation: true });
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function openSecureSession(nextPreparation, reportToken, sessionClockOffset = serverOffset) {
    const params = new URLSearchParams({
      url: config?.config?.targetPage || TARGET_PAGE,
      dni,
      codigo,
      preparationId: nextPreparation.id,
      reportToken,
      apiBase: API_BASE || location.origin,
      fireAt: String(new Date(nextPreparation.targetAt).getTime()),
      deadlineAt: String(new Date(nextPreparation.deadlineAt).getTime()),
      clockOffsetMs: String(Math.round(sessionClockOffset)),
      purpose: nextPreparation.purpose || 'registration',
      autoSubmit: config?.config?.autoSubmitWhenSecurityReady === false ? '0' : '1'
    });
    if (/capacitor|android/i.test(navigator.userAgent)) {
      window.location.href = `asistente://official?${params.toString()}`;
      return;
    }
    window.open(config?.config?.targetPage || TARGET_PAGE, '_blank', 'noopener,noreferrer');
  }

  async function startSecureSession(purpose = 'registration') {
    if (!isAuthorized) return;
    setBusy(true);
    setErrorMessage('');
    try {
      const sentAt = Date.now();
      const data = await api('/api/preparations/start', {
        method: 'POST',
        body: JSON.stringify({ dni, codigo, purpose })
      });
      const receivedAt = Date.now();
      const sessionClockOffset = Number.isFinite(Number(data.serverNowEpochMs))
        ? Number(data.serverNowEpochMs) - Math.round((sentAt + receivedAt) / 2)
        : serverOffset;
      setServerOffset(sessionClockOffset);
      updatePreparation(data.preparation);
      openSecureSession(data.preparation, data.reportToken, sessionClockOffset);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function saveReceipt() {
    const receipt = { dni, codigo, preparation, savedAt: new Date().toISOString() };
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
      <header className="topbar studentTopbar">
        <div>
          <p className="eyebrow">Sesion oficial protegida</p>
          <h1>Estudiante</h1>
        </div>
        <div className="topActions">
          <button className="backButton" onClick={onSwitchRole}><ArrowLeft size={18} /> Regresar</button>
          <a className="iconButton" href={config?.config?.targetPage || TARGET_PAGE} target="_blank" rel="noreferrer" title="Abrir pagina oficial">
            <Ticket size={20} />
          </a>
        </div>
      </header>

      <section className="studentHero secureHero">
        <div>
          <strong>{isAuthorized ? 'Listo para preparar' : 'Verifica tu cupo'}</strong>
          <span>{isAuthorized ? 'La app precarga la sesion oficial y espera su validacion' : 'Consulta tu autorizacion para continuar'}</span>
        </div>
        <div className="heroBadge">{hasPendingRequest ? 'Solicitud pendiente' : sameStudentStatus ? `${studentCredits ?? 0} cupos` : 'Sin verificar'}</div>
      </section>

      <main className="studentGrid">
        <section className="panel mainPanel">
          <div className="sectionTitle"><ShieldCheck /><h2>Datos</h2></div>
          <div className="twoCols">
            <Field label="DNI" value={dni} onChange={setDni} placeholder="Ej. 70123456" />
            <Field label="Codigo estudiante" value={codigo} onChange={setCodigo} placeholder="Ej. 2020123456" />
          </div>
          <div className="actions">
            {showCheckStatus && <button disabled={busy} onClick={() => checkStatus()}><ListChecks size={18} /> Ver cupo</button>}
            {showRequestAccess && <button disabled={busy} onClick={requestAccess}><Send size={18} /> Solicitar cupos</button>}
          </div>
        </section>

        <section className="panel timerPanel secureTimer">
          <div className="sectionTitle"><Clock3 /><h2>Preparacion segura</h2></div>
          <div className="countdownWrap">
            <span>Objetivo 07:00:00</span>
            <div className="countdown">{config ? formatCountdown(countdownMs) : '--:--:--.---'}</div>
            <i />
          </div>
          <p className="secureHint">
            Disponible desde {config ? formatLimaDateTime(new Date(targetMs - preparationLeadMs)) : '--'}.
            La pagina oficial permanece cargada, completa tus datos y realiza un unico envio cuando Cloudflare este listo.
          </p>
          <div className="secureActions">
            <button className="primary" disabled={busy || !isAuthorized || !canPrepareNow} onClick={() => startSecureSession('registration')}>
              <ShieldCheck size={18} /> Preparar registro
            </button>
            <button disabled={busy || !isAuthorized} onClick={() => startSecureSession('verify')}>
              <Ticket size={18} /> Verificar ticket
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="sectionTitle"><OutcomeIcon /><h2>Resultado</h2></div>
          <StudentResultVisual
            outcome={outcome}
            showRequestAccess={showRequestAccess}
            busy={busy}
            onRequestAccess={requestAccess}
            onSaveReceipt={saveReceipt}
            hasResult={Boolean(preparation && TERMINAL_PREPARATION_STATUSES.has(preparation.status))}
          />
        </section>

        <section className="panel">
          <details className="historyDetails">
            <summary>
              <span className="sectionTitle"><History /><h2>Historial local</h2></span>
              <small>{history.length} registros</small>
            </summary>
            <div className="list">
              {history.length === 0 && <p className="hint">Aqui apareceran solo resultados confirmados por la sesion oficial.</p>}
              {history.map((item) => <HistoryEntryCard item={item} key={item.preparationId} />)}
            </div>
          </details>
        </section>
      </main>
    </div>
  );
}

/*
 * Legacy burst-based student flow intentionally retained only as migration
 * reference. It is excluded from the production bundle because the official
 * site now requires an origin-bound Turnstile session.
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
  const [history, setHistory] = useState(readStoredHistory);
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
          const entry = historyEntryFromQueueJob(data.job);
          setHistory((items) => {
            const next = [entry, ...items.filter((item) => item.queueJobId !== entry.queueJobId)].slice(0, 30).map(normalizeHistoryEntry);
            localStorage.setItem('student:history', JSON.stringify(next));
            return next;
          });
          setResult({ ok: data.job.status === 'success', status: data.job.status, message: entry.message, job: data.job });
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
    if (shouldKeepQueueResultUntilNoon(queueJob)) {
      if (!result) {
        const entry = historyEntryFromQueueJob(queueJob);
        setResult({ ok: queueJob.status === 'success', status: queueJob.status, message: entry.message, job: queueJob });
      }
      return;
    }
    const currentTarget = new Date(config.targetTime).getTime();
    const queueTarget = new Date(queueJob.targetAt || queueJob.targetTime || 0).getTime();
    if (Number.isFinite(currentTarget) && Number.isFinite(queueTarget) && Math.abs(currentTarget - queueTarget) > 60_000) {
      updateQueueJob(null);
      setResult(null);
    }
  }, [queueJob?.id, queueJob?.status, queueJob?.targetAt, config?.targetTime, id, result]);

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

  async function refreshLatestQueueJob() {
    if (!dni || !codigo || !id.includes(':')) return null;
    const data = await api(`/api/student/${encodeURIComponent(id)}/queue`);
    const latest = data.jobs?.[0];
    if (!latest) return null;
    if (ACTIVE_QUEUE_STATUSES.has(latest.status) || shouldKeepQueueResultUntilNoon(latest)) {
      updateQueueJob(latest);
      if (!ACTIVE_QUEUE_STATUSES.has(latest.status)) {
        const entry = historyEntryFromQueueJob(latest);
        setResult({ ok: latest.status === 'success', status: latest.status, message: entry.message, job: latest });
      }
    }
    return latest;
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
      await refreshLatestQueueJob();
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
        status: data.status || (data.ok ? 'success' : 'failed'),
        title: data.ok ? 'Operacion completada' : 'Sin confirmacion',
        message: data.message,
        attempts: data.attempts || []
      };
      if (scheduled) {
        const next = [entry, ...history].slice(0, 30);
        setHistory(next);
        localStorage.setItem('student:history', JSON.stringify(next));
      }
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
          <details className="historyDetails">
            <summary>
              <span className="sectionTitle">
                <History />
                <h2>Historial local</h2>
              </span>
              <small>{history.length} registros</small>
            </summary>
            <div className="list">
              {history.length === 0 && <p className="hint">Aqui solo apareceran registros hechos con Generar con disparos.</p>}
              {history.map((item) => (
                <HistoryEntryCard item={item} key={`${item.queueJobId || item.at}-${item.status || ''}`} />
              ))}
            </div>
          </details>
        </section>
      </main>
    </div>
  );
}
*/

function AdminApp({ onSwitchRole }) {
  const [token, setToken] = useState(localStorage.getItem('admin:token') || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [data, setData] = useState({ stats: null, students: [], requests: [], events: [], preparations: [], config: null });
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
      const [stats, students, requests, events, preparations, config] = await Promise.all([
        api('/admin/stats', { token }),
        api('/admin/students', { token }),
        api('/admin/requests', { token }),
        api('/admin/preparation-events', { token }),
        api('/admin/preparations', { token }),
        api('/api/config/target-time')
      ]);
      setData({
        stats: stats.stats,
        students: students.students,
        requests: requests.requests,
        events: events.events,
        preparations: preparations.preparations,
        config: config.config
      });
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
      preparationLeadMs: Number(next.preparationLeadMs),
      preparationTimeoutMs: Number(next.preparationTimeoutMs),
      autoSubmitWhenSecurityReady: next.autoSubmitWhenSecurityReady === 'on',
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
          ['preparations', ShieldCheck, 'Sesiones'],
          ['events', History, 'Eventos'],
          ['config', Settings, 'Configuracion']
        ].map(([key, Icon, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}><Icon size={17} /> {label}</button>
        ))}
      </nav>
      {message && <p className="notice">{message}</p>}

      {tab === 'dashboard' && <Dashboard stats={data.stats} config={data.config} preparations={data.preparations} />}
      {tab === 'students' && <Students students={data.students} setCredits={setCredits} />}
      {tab === 'requests' && <Requests requests={data.requests} approve={approve} />}
      {tab === 'preparations' && <PreparationSessions preparations={data.preparations} />}
      {tab === 'events' && <PreparationEvents events={data.events} />}
      {tab === 'config' && <ConfigForm config={data.config} saveConfig={saveConfig} />}
    </div>
  );
}

function Dashboard({ stats, config, preparations = [] }) {
  const items = [
    ['Alumnos', stats?.students ?? 0],
    ['Solicitudes pendientes', stats?.pendingRequests ?? 0],
    ['Sesiones', stats?.preparations ?? 0],
    ['Sesiones activas', stats?.preparationActive ?? 0],
    ['Tickets confirmados', stats?.preparationSuccess ?? 0],
    ['Validacion manual', stats?.preparationManual ?? 0],
    ['Sesiones sin ticket', stats?.preparationFailed ?? 0],
    ['Cupos disponibles', stats?.creditsAvailable ?? 0]
  ];
  const finished = preparations.filter((item) => item && TERMINAL_PREPARATION_STATUSES.has(item.status));
  const success = finished.filter((item) => item.status === 'success' || item.status === 'already_issued').length;
  const failed = finished.filter((item) => item.status !== 'success' && item.status !== 'already_issued').length;
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
            <em>Sesion oficial</em>
            <em>Turnstile respetado</em>
            <em>Unico envio</em>
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
          <div className="barRow"><span>Tickets</span><i><b style={{ width: `${successRate}%` }} /></i><strong>{successRate}%</strong></div>
          <div className="barRow"><span>Sin ticket</span><i><b style={{ width: `${failRate}%` }} /></i><strong>{failRate}%</strong></div>
          <div className="barRow"><span>Sesiones activas</span><i><b style={{ width: `${Math.min(100, Number(stats?.preparationActive ?? 0) * 20)}%` }} /></i><strong>{stats?.preparationActive ?? 0}</strong></div>
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

/*
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
*/

function PreparationSessions({ preparations }) {
  return (
    <main className="panel tablePanel">
      <h2>Sesiones seguras</h2>
      {preparations.length === 0 && <p className="hint">Todavia no hay sesiones preparadas.</p>}
      {preparations.map((item) => (
        <div className="tableRow queueRow" key={item.id}>
          <span>{formatLimaDateTime(item.createdAt)}</span>
          <span>{item.dni}</span>
          <span>{item.codigo}</span>
          <StatusBadge ok={item.status === 'success' || item.status === 'already_issued'}>
            {preparationStatusLabel(item.status)}
          </StatusBadge>
          <small>{item.message}</small>
          <small>{item.purpose === 'verify' ? 'Verificacion' : 'Registro programado'} | Objetivo: {formatLimaDateTime(item.targetAt)}</small>
        </div>
      ))}
    </main>
  );
}

function PreparationEvents({ events }) {
  return (
    <main className="panel tablePanel">
      <h2>Eventos de sesion</h2>
      {events.length === 0 && <p className="hint">Todavia no hay eventos registrados.</p>}
      {events.map((event) => (
        <div className="tableRow wide" key={event.id}>
          <span>{formatLimaDateTime(event.createdAt)}</span>
          <span>{event.dni}</span>
          <span>{preparationStatusLabel(event.status)}</span>
          <small>{event.message}</small>
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
        {['targetHour', 'targetMinute', 'targetSecond', 'targetMs', 'preparationLeadMs', 'preparationTimeoutMs'].map((key) => (
          <label className="field" key={key}><span>{key}</span><input name={key} type="number" defaultValue={config[key]} /></label>
        ))}
        <label className="field wideField"><span>Pagina oficial</span><input name="targetPage" defaultValue={config.targetPage} /></label>
        <label className="field"><span>Selector campo 1</span><input name="selectorCampo1" defaultValue={config.selectors?.campo1} /></label>
        <label className="field"><span>Selector campo 2</span><input name="selectorCampo2" defaultValue={config.selectors?.campo2} /></label>
        <label className="field"><span>Selector boton</span><input name="selectorButton" defaultValue={config.selectors?.button} /></label>
        <label className="check"><input name="autoSubmitWhenSecurityReady" type="checkbox" defaultChecked={config.autoSubmitWhenSecurityReady !== false} /> Enviar una vez cuando Turnstile este listo</label>
        <p className="hint wideField">La pagina oficial controla CAPTCHA, CSRF y fingerprint. La app no los evita: precarga la sesion, espera la validacion y realiza un solo envio.</p>
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
              <small>Preparar y verificar ticket.</small>
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
  const requestedRole = new URLSearchParams(location.search).get('role');
  const initialMode = requestedRole === 'student' || requestedRole === 'admin'
    ? requestedRole
    : location.hash === '#admin'
      ? 'admin'
      : localStorage.getItem('app:role') || '';
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
  return mode === 'admin' ? <AdminApp onSwitchRole={switchRole} /> : <SecureStudentApp onSwitchRole={switchRole} />;
}

createRoot(document.getElementById('root')).render(<Root />);
