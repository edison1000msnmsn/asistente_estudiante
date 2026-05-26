import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { nanoid } from 'nanoid';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'db.json');

const env = {
  port: Number(process.env.PORT || 3000),
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adminToken: process.env.ADMIN_TOKEN || '',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,capacitor://localhost').split(',').map((x) => x.trim()),
  targetEndpoint: process.env.TARGET_ENDPOINT || 'https://comedor.uncp.edu.pe/charola',
  officialTicketEndpoint: process.env.OFFICIAL_TICKET_ENDPOINT || 'https://comensales.uncp.edu.pe/api/registros',
  targetPage: process.env.TARGET_PAGE || 'https://comedor.uncp.edu.pe/charola',
  targetMode: process.env.TARGET_MODE || 'api',
  targetApiToken: process.env.TARGET_API_TOKEN || '',
  publicRateLimit: Number(process.env.PUBLIC_RATE_LIMIT || 5000)
};

const defaultConfig = {
  targetHour: Number(process.env.TARGET_HOUR || 7),
  targetMinute: Number(process.env.TARGET_MINUTE || 0),
  targetSecond: Number(process.env.TARGET_SECOND || 0),
  targetMs: Number(process.env.TARGET_MS || 0),
  preFireMs: Number(process.env.PRE_FIRE_MS || 120000),
  maxAttempts: Number(process.env.MAX_ATTEMPTS || 480),
  intervalMs: Number(process.env.INTERVAL_MS || 250),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 2000),
  stopOnFirstSuccess: true,
  rateLimitPerUser: Number(process.env.RATE_LIMIT_PER_USER || 260),
  globalRateLimit: Number(process.env.GLOBAL_RATE_LIMIT || 2500),
  useServerQueue: true,
  officialTicketEndpoint: env.officialTicketEndpoint,
  targetEndpoint: env.targetEndpoint,
  targetPage: env.targetPage,
  targetMode: env.targetMode,
  selectors: {
    campo1: '#dni, input[name="tl_dni"], input[id*="dni"], input[placeholder*="DNI"], input[placeholder*="Documento"]',
    campo2: '#codigo, #matricula, input[name*="codigo"], input[name*="matricula"], input[id*="codigo"], input[id*="matricula"], input[placeholder*="Codigo"], input[placeholder*="Código"], input[placeholder*="Matricula"], input[placeholder*="Matrícula"]',
    button: '.btn-register, button[type="submit"], button.btn-success, button, input[type="submit"]'
  }
};

const initialDb = {
  students: {},
  requests: {},
  ticketQueue: {},
  attempts: [],
  usedIdempotencyKeys: {},
  config: defaultConfig
};

let db = await loadDb();
let globalWindow = [];
const perUserWindows = new Map();
const queueTimers = new Map();

async function loadDb() {
  try {
    const text = await fs.readFile(dbPath, 'utf8');
    const loaded = JSON.parse(text);
    return { ...initialDb, ...loaded, config: { ...defaultConfig, ...(loaded.config || {}) } };
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(dbPath, JSON.stringify(initialDb, null, 2));
    return structuredClone(initialDb);
  }
}

async function saveDb() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

function clean(value) {
  return String(value || '').trim();
}

function validateStudentPayload(body) {
  const dni = clean(body.dni || body.campo1);
  const codigo = clean(body.codigo || body.campo2);
  if (!/^[a-zA-Z0-9]{6,16}$/.test(dni)) return { error: 'DNI invalido. Use 6 a 16 caracteres alfanumericos.' };
  if (!/^[a-zA-Z0-9-]{4,24}$/.test(codigo)) return { error: 'Codigo invalido. Use 4 a 24 caracteres alfanumericos.' };
  return { dni, codigo, id: `${dni}:${codigo}` };
}

function targetDate(config = db.config, now = new Date()) {
  const date = new Date(now);
  date.setHours(config.targetHour, config.targetMinute, config.targetSecond, config.targetMs);
  if (date.getTime() < now.getTime() - 60_000) date.setDate(date.getDate() + 1);
  return date;
}

function limaDayKey(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value));
}

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.headers['x-admin-token'];
  if (!env.adminToken || token !== env.adminToken) return res.status(401).json({ ok: false, message: 'Token admin invalido.' });
  return next();
}

function checkSlidingWindow(key, limit) {
  const now = Date.now();
  const start = now - 60_000;
  const bucket = key === 'global' ? globalWindow : perUserWindows.get(key) || [];
  const fresh = bucket.filter((stamp) => stamp >= start);
  if (fresh.length >= limit) {
    if (key === 'global') globalWindow = fresh;
    else perUserWindows.set(key, fresh);
    return false;
  }
  fresh.push(now);
  if (key === 'global') globalWindow = fresh;
  else perUserWindows.set(key, fresh);
  return true;
}

async function callOfficialApi({ dni, codigo, idempotencyKey, clientId, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(db.config.targetEndpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': clientId,
        'X-Idempotency-Key': idempotencyKey,
        ...(env.targetApiToken ? { Authorization: `Bearer ${env.targetApiToken}` } : {})
      },
      body: JSON.stringify({
        campo1: dni,
        campo2: codigo,
        timestamp: new Date().toISOString(),
        clientId,
        idempotencyKey
      })
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text.slice(0, 500) };
    }
    return {
      ok: response.ok && Boolean(payload.ok ?? payload.success ?? payload.ticketId),
      statusCode: response.status,
      payload
    };
  } catch (error) {
    return { ok: false, statusCode: 0, payload: { message: error.name === 'AbortError' ? 'timeout' : error.message } };
  } finally {
    clearTimeout(timeout);
  }
}

function officialTicketEndpoint(config = db.config) {
  if (config.officialTicketEndpoint) return config.officialTicketEndpoint;
  if (String(config.targetEndpoint || '').includes('/api/')) return config.targetEndpoint;
  return env.officialTicketEndpoint;
}

function officialStatusFromCode(code) {
  if (code === 200 || code === 201) return { status: 'success', message: 'Ticket generado por API oficial.' };
  if (code === 300) return { status: 'not_open_yet', message: 'Fuera de horario segun API oficial.' };
  if (code === 400) return { status: 'restricted', message: 'Alumno restringido por API oficial.' };
  if (code === 404) return { status: 'not_found', message: 'DNI/codigo no encontrado por API oficial.' };
  if (code === 500) return { status: 'sold_out', message: 'Cupos agotados segun API oficial.' };
  return { status: 'failed', message: 'Respuesta no confirmada por API oficial.' };
}

async function callOfficialTicketApi({ student, idempotencyKey, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = new URLSearchParams();
    body.set('data', JSON.stringify({ t1_dni: student.dni, t1_codigo: student.codigo }));
    const response = await fetch(officialTicketEndpoint(), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json, text/plain, */*',
        'X-Client-Id': 'railway-queue',
        'X-Idempotency-Key': idempotencyKey
      },
      body
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text.slice(0, 500) };
    }
    const officialCode = Number(payload?.code);
    const mapped = officialStatusFromCode(officialCode);
    return {
      ok: mapped.status === 'success',
      statusCode: response.status,
      officialCode,
      status: mapped.status,
      payload: { ...payload, message: mapped.message }
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      officialCode: -1,
      status: 'failed',
      payload: { message: error.name === 'AbortError' ? 'timeout' : error.message }
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runControlledAttempts(student, clientId) {
  const config = db.config;
  const startAt = targetDate(config).getTime() - Number(config.preFireMs);
  const now = Date.now();
  if (config.targetMode !== 'webview' && now < startAt) {
    return { ok: false, status: 'scheduled_later', message: 'Aun no inicia la ventana de pre-disparo.', startAt: new Date(startAt).toISOString() };
  }

  if (!checkSlidingWindow('global', Number(config.globalRateLimit))) {
    return { ok: false, status: 'rate_limit', message: 'Limite global alcanzado. Intente mas tarde.' };
  }
  if (!checkSlidingWindow(student.id, Number(config.rateLimitPerUser))) {
    return { ok: false, status: 'rate_limit', message: 'Limite por usuario alcanzado. Intente mas tarde.' };
  }

  const results = [];
  for (let i = 0; i < Number(config.maxAttempts); i += 1) {
    const idempotencyKey = `${student.id}:${new Date().toISOString()}:${nanoid(8)}`;
    if (db.usedIdempotencyKeys[idempotencyKey]) continue;
    db.usedIdempotencyKeys[idempotencyKey] = true;

    const attempt = {
      id: nanoid(),
      studentId: student.id,
      dni: student.dni,
      codigo: student.codigo,
      mode: config.targetMode,
      number: i + 1,
      idempotencyKey,
      createdAt: new Date().toISOString(),
      status: 'pending',
      response: null
    };

    if (config.targetMode === 'webview') {
      attempt.status = 'webview_required';
      attempt.response = { message: 'Modo WebView: la app debe abrir la pagina oficial y ejecutar selectores configurados.' };
    } else if (config.officialTicketEndpoint) {
      const apiResult = await callOfficialTicketApi({
        student,
        idempotencyKey,
        timeoutMs: queueAttemptTimeoutMs(config)
      });
      attempt.status = apiResult.status;
      attempt.response = apiResult;
    } else {
      const apiResult = await callOfficialApi({
        dni: student.dni,
        codigo: student.codigo,
        idempotencyKey,
        clientId,
        timeoutMs: Number(config.requestTimeoutMs)
      });
      attempt.status = apiResult.ok ? 'success' : (apiResult.payload?.status || 'failed');
      attempt.response = apiResult;
    }

    db.attempts.unshift(attempt);
    results.push(attempt);
    await saveDb();

    if (attempt.status === 'success' && config.stopOnFirstSuccess) {
      student.credits = Math.max(0, Number(student.credits || 0) - 1);
      student.lastSuccessAt = new Date().toISOString();
      await saveDb();
      break;
    }
    if (attempt.status === 'webview_required') break;
    if (attempt.status === 'rate_limit') break;
    if (i < Number(config.maxAttempts) - 1) {
      const delay = attempt.status === 'failed' ? Math.min(1000, Number(config.intervalMs) * 2) : Number(config.intervalMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  const success = results.find((item) => item.status === 'success');
  const webviewRequired = results.find((item) => item.status === 'webview_required');
  return {
    ok: Boolean(success || webviewRequired),
    status: success ? 'success' : (webviewRequired ? 'webview_required' : 'finished'),
    message: success ? 'Ticket generado o endpoint oficial confirmo exito.' : (webviewRequired ? 'Abriendo pagina oficial para generar o verificar ticket.' : 'Intentos finalizados sin exito confirmado.'),
    attempts: results
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function queueAttemptTimeoutMs(config = db.config) {
  const configured = Number(config.requestTimeoutMs || 2500);
  if (!Number.isFinite(configured)) return 2500;
  return Math.max(1200, Math.min(configured, 5000));
}

function queueWindowStartDate(config = db.config) {
  const target = targetDate(config);
  return new Date(target.getTime() - Math.max(0, Number(config.preFireMs || 0)));
}

function queueDedupeKey(studentId, targetAt) {
  return `${studentId}:${limaDayKey(targetAt)}`;
}

function queueIsActive(job) {
  return job && (job.status === 'queued' || job.status === 'running');
}

function findActiveQueueJob(studentId, targetAt) {
  const dedupeKey = queueDedupeKey(studentId, targetAt);
  return Object.values(db.ticketQueue || {}).find((job) => job.dedupeKey === dedupeKey && queueIsActive(job));
}

function scheduleQueueJob(job) {
  if (!job || !queueIsActive(job)) return;
  if (queueTimers.has(job.id)) clearTimeout(queueTimers.get(job.id));
  const startAt = new Date(job.startAt || job.targetAt).getTime();
  const delay = Math.max(0, startAt - Date.now());
  const timer = setTimeout(() => {
    queueTimers.delete(job.id);
    runQueueJob(job.id).catch((error) => {
      const current = db.ticketQueue[job.id];
      if (current) {
        current.status = 'failed';
        current.finishedAt = new Date().toISOString();
        current.lastMessage = error.message;
        saveDb().catch(() => {});
      }
    });
  }, delay);
  queueTimers.set(job.id, timer);
}

async function finishQueueJob(job, status, result = null) {
  job.status = status;
  job.finishedAt = new Date().toISOString();
  if (result) {
    job.result = result;
    job.lastStatus = result.status || status;
    job.lastMessage = result.payload?.message || result.message || status;
  }
  await saveDb();
}

async function runQueueJob(jobId) {
  const job = db.ticketQueue?.[jobId];
  if (!job || !queueIsActive(job)) return;

  const startAt = new Date(job.startAt || job.targetAt).getTime();
  if (Date.now() < startAt) {
    scheduleQueueJob(job);
    return;
  }

  const student = db.students[job.studentId];
  if (!student || student.status !== 'approved') {
    await finishQueueJob(job, 'not_authorized', { status: 'not_authorized', payload: { message: 'Alumno sin autorizacion.' } });
    return;
  }

  const hasTicketToday = Boolean(student.lastSuccessAt && limaDayKey(student.lastSuccessAt) === limaDayKey());
  if (Number(student.credits) <= 0 && !hasTicketToday) {
    await finishQueueJob(job, 'not_authorized', { status: 'not_authorized', payload: { message: 'Alumno sin cupos activos.' } });
    return;
  }

  const config = db.config;
  const maxAttempts = Math.max(1, Math.min(300, Number(config.maxAttempts || 1)));
  const intervalMs = Math.max(80, Math.min(10_000, Number(config.intervalMs || 400)));
  const timeoutMs = queueAttemptTimeoutMs(config);
  job.status = 'running';
  job.startedAt = job.startedAt || new Date().toISOString();
  job.maxAttempts = maxAttempts;
  job.intervalMs = intervalMs;
  await saveDb();

  let lastResult = null;
  for (let index = Number(job.attemptsRun || 0); index < maxAttempts; index += 1) {
    if (!checkSlidingWindow('global', Number(config.globalRateLimit))) {
      await finishQueueJob(job, 'rate_limit', { status: 'rate_limit', payload: { message: 'Limite global alcanzado en Railway.' } });
      return;
    }
    if (!checkSlidingWindow(job.studentId, Number(config.rateLimitPerUser))) {
      await finishQueueJob(job, 'rate_limit', { status: 'rate_limit', payload: { message: 'Limite por alumno alcanzado en Railway.' } });
      return;
    }

    const idempotencyKey = `${job.studentId}:queue:${limaDayKey(job.targetAt)}:${index + 1}:${nanoid(8)}`;
    db.usedIdempotencyKeys[idempotencyKey] = true;

    const attempt = {
      id: nanoid(),
      queueJobId: job.id,
      studentId: job.studentId,
      dni: job.dni,
      codigo: job.codigo,
      mode: 'backend_queue',
      number: index + 1,
      idempotencyKey,
      createdAt: new Date().toISOString(),
      status: 'pending',
      response: null
    };

    const apiResult = await callOfficialTicketApi({ student: job, idempotencyKey, timeoutMs });
    attempt.status = apiResult.status;
    attempt.response = apiResult;
    db.attempts.unshift(attempt);
    if (db.attempts.length > 2000) db.attempts = db.attempts.slice(0, 2000);

    job.attemptsRun = index + 1;
    job.lastAttemptAt = new Date().toISOString();
    job.lastStatus = apiResult.status;
    job.lastMessage = apiResult.payload?.message || apiResult.status;
    job.result = apiResult;
    lastResult = apiResult;
    await saveDb();

    if (apiResult.status === 'success') {
      const alreadyUsedToday = Boolean(student.lastSuccessAt && limaDayKey(student.lastSuccessAt) === limaDayKey());
      if (!alreadyUsedToday) {
        student.credits = Math.max(0, Number(student.credits || 0) - 1);
      }
      student.lastSuccessAt = new Date().toISOString();
      await finishQueueJob(job, 'success', apiResult);
      return;
    }

    if (['sold_out', 'restricted', 'not_found'].includes(apiResult.status)) {
      await finishQueueJob(job, apiResult.status, apiResult);
      return;
    }

    if (index < maxAttempts - 1) {
      await sleep(apiResult.status === 'failed' ? Math.min(1200, intervalMs * 2) : intervalMs);
    }
  }

  await finishQueueJob(job, lastResult?.status || 'failed', lastResult || { status: 'failed', payload: { message: 'Intentos de cola finalizados sin confirmacion.' } });
}

async function resumeQueueJobs() {
  for (const job of Object.values(db.ticketQueue || {})) {
    if (job.status === 'running') job.status = 'queued';
    if (job.status === 'queued') scheduleQueueJob(job);
  }
  await saveDb();
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origen no permitido por CORS.'));
  }
}));
app.use(rateLimit({ windowMs: 60_000, limit: env.publicRateLimit, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'asistente-de-estudiantes', now: new Date().toISOString() }));

app.get('/api/time', (_req, res) => {
  res.json({ ok: true, serverTime: new Date().toISOString(), epochMs: Date.now() });
});

app.get('/api/config/target-time', (_req, res) => {
  const target = targetDate();
  res.json({ ok: true, config: db.config, targetTime: target.toISOString(), serverTime: new Date().toISOString() });
});

app.post('/api/student/:id/request-access', async (req, res) => {
  const parsed = validateStudentPayload(req.body);
  if (parsed.error) return res.status(400).json({ ok: false, message: parsed.error });
  const id = req.params.id || parsed.id;
  const request = {
    id: nanoid(),
    studentId: id,
    dni: parsed.dni,
    codigo: parsed.codigo,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  db.requests[request.id] = request;
  if (!db.students[id]) db.students[id] = { id, dni: parsed.dni, codigo: parsed.codigo, credits: 0, status: 'pending', createdAt: new Date().toISOString() };
  await saveDb();
  res.json({ ok: true, request });
});

app.get('/api/student/:id/status', (req, res) => {
  const student = db.students[req.params.id];
  const hasTicketToday = Boolean(student?.lastSuccessAt && limaDayKey(student.lastSuccessAt) === limaDayKey());
  res.json({ ok: true, student: student || null, authorized: Boolean(student && student.status === 'approved' && (Number(student.credits) > 0 || hasTicketToday)), hasTicketToday });
});

app.post('/api/student/:id/use-credit', async (req, res) => {
  const student = db.students[req.params.id];
  if (!student) return res.status(403).json({ ok: false, message: 'Alumno no encontrado.' });
  if (student.lastSuccessAt && limaDayKey(student.lastSuccessAt) === limaDayKey()) {
    return res.json({ ok: true, credits: student.credits, alreadyUsedToday: true, message: 'Ticket ya registrado hoy; no se descuenta otro cupo.' });
  }
  if (Number(student.credits) <= 0) return res.status(403).json({ ok: false, message: 'Sin cupos disponibles.' });
  student.credits = Math.max(0, Number(student.credits) - 1);
  student.lastSuccessAt = new Date().toISOString();
  await saveDb();
  res.json({ ok: true, credits: student.credits, alreadyUsedToday: false });
});

app.post('/api/attempts/run', async (req, res) => {
  const parsed = validateStudentPayload(req.body);
  if (parsed.error) return res.status(400).json({ ok: false, message: parsed.error });
  const student = db.students[parsed.id];
  const hasTicketToday = Boolean(student?.lastSuccessAt && limaDayKey(student.lastSuccessAt) === limaDayKey());
  if (!student || student.status !== 'approved' || (Number(student.credits) <= 0 && !hasTicketToday)) {
    return res.status(403).json({ ok: false, status: 'not_authorized', message: 'Alumno sin autorizacion o sin cupos.' });
  }
  const result = await runControlledAttempts(student, clean(req.body.clientId) || 'student-app');
  res.status(result.status === 'rate_limit' ? 429 : 200).json(result);
});

app.post('/api/queue/arm', async (req, res) => {
  const parsed = validateStudentPayload(req.body);
  if (parsed.error) return res.status(400).json({ ok: false, message: parsed.error });
  if (!db.config.useServerQueue) {
    return res.status(409).json({ ok: false, status: 'queue_disabled', message: 'La cola Railway esta desactivada por el administrador.' });
  }
  const student = db.students[parsed.id];
  const hasTicketToday = Boolean(student?.lastSuccessAt && limaDayKey(student.lastSuccessAt) === limaDayKey());
  if (!student || student.status !== 'approved' || (Number(student.credits) <= 0 && !hasTicketToday)) {
    return res.status(403).json({ ok: false, status: 'not_authorized', message: 'Alumno sin autorizacion o sin cupos.' });
  }

  const target = targetDate(db.config);
  const startAt = queueWindowStartDate(db.config);
  const existing = findActiveQueueJob(parsed.id, target.toISOString());
  if (existing) {
    if (existing.status === 'queued') {
      existing.dni = parsed.dni;
      existing.codigo = parsed.codigo;
      existing.dedupeKey = queueDedupeKey(parsed.id, target.toISOString());
      existing.startAt = startAt.toISOString();
      existing.targetAt = target.toISOString();
      existing.maxAttempts = Number(db.config.maxAttempts || 0);
      existing.intervalMs = Number(db.config.intervalMs || 0);
      existing.lastStatus = 'queued';
      existing.lastMessage = 'Programacion actualizada con la configuracion vigente.';
      existing.updatedAt = new Date().toISOString();
      existing.result = null;
      await saveDb();
    }
    scheduleQueueJob(existing);
    return res.json({ ok: true, status: existing.status, reused: true, updated: existing.status === 'queued', job: existing, targetTime: existing.targetAt, startAt: existing.startAt });
  }

  const job = {
    id: nanoid(),
    dedupeKey: queueDedupeKey(parsed.id, target.toISOString()),
    studentId: parsed.id,
    dni: parsed.dni,
    codigo: parsed.codigo,
    status: 'queued',
    queuedAt: new Date().toISOString(),
    startAt: startAt.toISOString(),
    targetAt: target.toISOString(),
    attemptsRun: 0,
    maxAttempts: Number(db.config.maxAttempts || 0),
    intervalMs: Number(db.config.intervalMs || 0),
    lastStatus: 'queued',
    lastMessage: 'Cola Railway armada.',
    result: null
  };
  db.ticketQueue[job.id] = job;
  await saveDb();
  scheduleQueueJob(job);
  res.json({ ok: true, status: 'queued', job, targetTime: job.targetAt, startAt: job.startAt });
});

app.get('/api/queue/:jobId/status', (req, res) => {
  const job = db.ticketQueue?.[req.params.jobId];
  if (!job) return res.status(404).json({ ok: false, message: 'Cola no encontrada.' });
  res.json({ ok: true, job });
});

app.get('/api/student/:id/queue', (req, res) => {
  const jobs = Object.values(db.ticketQueue || {})
    .filter((job) => job.studentId === req.params.id)
    .sort((a, b) => new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime())
    .slice(0, 10);
  res.json({ ok: true, jobs });
});

app.post('/admin/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!env.adminEmail || !env.adminPassword || !env.adminToken) {
    return res.status(500).json({ ok: false, message: 'Configure ADMIN_EMAIL, ADMIN_PASSWORD y ADMIN_TOKEN en Railway/.env.' });
  }
  if (email === env.adminEmail && password === env.adminPassword) {
    return res.json({ ok: true, token: env.adminToken });
  }
  return res.status(401).json({ ok: false, message: 'Credenciales invalidas.' });
});

app.get('/admin/students', requireAdmin, (_req, res) => res.json({ ok: true, students: Object.values(db.students) }));

app.post('/admin/students/:id/add-credits', requireAdmin, async (req, res) => {
  const student = db.students[req.params.id];
  if (!student) return res.status(404).json({ ok: false, message: 'Alumno no encontrado.' });
  student.credits = Number(student.credits || 0) + Math.max(0, Number(req.body.credits || 1));
  student.status = 'approved';
  await saveDb();
  res.json({ ok: true, student });
});

app.post('/admin/students/:id/set-credits', requireAdmin, async (req, res) => {
  const student = db.students[req.params.id];
  if (!student) return res.status(404).json({ ok: false, message: 'Alumno no encontrado.' });
  student.credits = Math.max(0, Number(req.body.credits || 0));
  student.status = student.credits > 0 ? 'approved' : student.status;
  await saveDb();
  res.json({ ok: true, student });
});

app.get('/admin/requests', requireAdmin, (_req, res) => res.json({ ok: true, requests: Object.values(db.requests) }));

app.post('/admin/requests/:id/approve', requireAdmin, async (req, res) => {
  const request = db.requests[req.params.id];
  if (!request) return res.status(404).json({ ok: false, message: 'Solicitud no encontrada.' });
  request.status = req.body.approved === false ? 'rejected' : 'approved';
  request.reviewedAt = new Date().toISOString();
  const student = db.students[request.studentId] || { id: request.studentId, dni: request.dni, codigo: request.codigo, createdAt: new Date().toISOString() };
  student.status = request.status;
  student.credits = request.status === 'approved' ? Math.max(Number(student.credits || 0), Number(req.body.credits || 1)) : 0;
  db.students[student.id] = student;
  await saveDb();
  res.json({ ok: true, request, student });
});

app.post('/admin/config', requireAdmin, async (req, res) => {
  const allowed = ['targetHour', 'targetMinute', 'targetSecond', 'targetMs', 'preFireMs', 'maxAttempts', 'intervalMs', 'requestTimeoutMs', 'stopOnFirstSuccess', 'rateLimitPerUser', 'globalRateLimit', 'useServerQueue', 'officialTicketEndpoint', 'targetEndpoint', 'targetPage', 'targetMode', 'selectors'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) db.config[key] = req.body[key];
  }
  await saveDb();
  res.json({ ok: true, config: db.config });
});

app.get('/admin/attempts', requireAdmin, (_req, res) => res.json({ ok: true, attempts: db.attempts.slice(0, 500) }));

app.get('/admin/queue', requireAdmin, (_req, res) => {
  const jobs = Object.values(db.ticketQueue || {})
    .sort((a, b) => new Date(b.queuedAt || b.startedAt || 0).getTime() - new Date(a.queuedAt || a.startedAt || 0).getTime())
    .slice(0, 500);
  res.json({ ok: true, jobs });
});

app.get('/admin/stats', requireAdmin, (_req, res) => {
  const attempts = db.attempts;
  const queueJobs = Object.values(db.ticketQueue || {});
  res.json({
    ok: true,
    stats: {
      students: Object.keys(db.students).length,
      pendingRequests: Object.values(db.requests).filter((r) => r.status === 'pending').length,
      attempts: attempts.length,
      success: attempts.filter((a) => a.status === 'success').length,
      failed: attempts.filter((a) => a.status !== 'success').length,
      queueActive: queueJobs.filter(queueIsActive).length,
      queueSuccess: queueJobs.filter((job) => job.status === 'success').length,
      creditsAvailable: Object.values(db.students).reduce((sum, student) => sum + Number(student.credits || 0), 0)
    }
  });
});

const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));
app.get('*', async (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/admin/') || req.path === '/health') return next();
  res.sendFile(path.join(distDir, 'index.html'));
});

await resumeQueueJobs();

app.listen(env.port, () => {
  console.log(`Asistente de estudiantes backend escuchando en puerto ${env.port}`);
});
