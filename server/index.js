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
  targetPage: process.env.TARGET_PAGE || 'https://comedor.uncp.edu.pe/charola',
  targetMode: process.env.TARGET_MODE || 'api',
  targetApiToken: process.env.TARGET_API_TOKEN || ''
};

const defaultConfig = {
  targetHour: 7,
  targetMinute: 0,
  targetSecond: 0,
  targetMs: 0,
  preFireMs: 3000,
  maxAttempts: 10,
  intervalMs: 100,
  requestTimeoutMs: 5000,
  stopOnFirstSuccess: true,
  rateLimitPerUser: 10,
  globalRateLimit: 120,
  targetEndpoint: env.targetEndpoint,
  targetPage: env.targetPage,
  targetMode: env.targetMode,
  selectors: {
    campo1: 'input[name="dni"], input[placeholder*="DNI"], input[placeholder*="Documento"]',
    campo2: 'input[name="codigo"], input[name="matricula"], input[placeholder*="Código"], input[placeholder*="Matricula"], input[placeholder*="Matrícula"]',
    button: 'button[type="submit"], button, input[type="submit"]'
  }
};

const initialDb = {
  students: {},
  requests: {},
  attempts: [],
  usedIdempotencyKeys: {},
  config: defaultConfig
};

let db = await loadDb();
let globalWindow = [];
const perUserWindows = new Map();

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

async function runControlledAttempts(student, clientId) {
  const config = db.config;
  const startAt = targetDate(config).getTime() - Number(config.preFireMs);
  const now = Date.now();
  if (now < startAt) {
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
    if (attempt.status === 'rate_limit') break;
    if (i < Number(config.maxAttempts) - 1) {
      const delay = attempt.status === 'failed' ? Math.min(1000, Number(config.intervalMs) * 2) : Number(config.intervalMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  const success = results.find((item) => item.status === 'success');
  return {
    ok: Boolean(success),
    status: success ? 'success' : 'finished',
    message: success ? 'Ticket generado o endpoint oficial confirmo exito.' : 'Intentos finalizados sin exito confirmado.',
    attempts: results
  };
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
app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

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
  res.json({ ok: true, student: student || null, authorized: Boolean(student && student.status === 'approved' && Number(student.credits) > 0) });
});

app.post('/api/student/:id/use-credit', async (req, res) => {
  const student = db.students[req.params.id];
  if (!student || Number(student.credits) <= 0) return res.status(403).json({ ok: false, message: 'Sin cupos disponibles.' });
  student.credits = Math.max(0, Number(student.credits) - 1);
  await saveDb();
  res.json({ ok: true, credits: student.credits });
});

app.post('/api/attempts/run', async (req, res) => {
  const parsed = validateStudentPayload(req.body);
  if (parsed.error) return res.status(400).json({ ok: false, message: parsed.error });
  const student = db.students[parsed.id];
  if (!student || student.status !== 'approved' || Number(student.credits) <= 0) {
    return res.status(403).json({ ok: false, status: 'not_authorized', message: 'Alumno sin autorizacion o sin cupos.' });
  }
  const result = await runControlledAttempts(student, clean(req.body.clientId) || 'student-app');
  res.status(result.status === 'rate_limit' ? 429 : 200).json(result);
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
  const allowed = ['targetHour', 'targetMinute', 'targetSecond', 'targetMs', 'preFireMs', 'maxAttempts', 'intervalMs', 'requestTimeoutMs', 'stopOnFirstSuccess', 'rateLimitPerUser', 'globalRateLimit', 'targetEndpoint', 'targetPage', 'targetMode', 'selectors'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) db.config[key] = req.body[key];
  }
  await saveDb();
  res.json({ ok: true, config: db.config });
});

app.get('/admin/attempts', requireAdmin, (_req, res) => res.json({ ok: true, attempts: db.attempts.slice(0, 500) }));

app.get('/admin/stats', requireAdmin, (_req, res) => {
  const attempts = db.attempts;
  res.json({
    ok: true,
    stats: {
      students: Object.keys(db.students).length,
      pendingRequests: Object.values(db.requests).filter((r) => r.status === 'pending').length,
      attempts: attempts.length,
      success: attempts.filter((a) => a.status === 'success').length,
      failed: attempts.filter((a) => a.status !== 'success').length,
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

app.listen(env.port, () => {
  console.log(`Asistente de estudiantes backend escuchando en puerto ${env.port}`);
});
