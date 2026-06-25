import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { nanoid } from 'nanoid';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACTIVE_PREPARATION_STATUSES,
  SUCCESS_PREPARATION_STATUSES,
  TERMINAL_PREPARATION_STATUSES,
  canTransitionPreparation,
  preparationStatusMessage
} from './preparation-state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
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
  targetMode: process.env.TARGET_MODE || 'secure_webview',
  targetApiToken: process.env.TARGET_API_TOKEN || '',
  publicRateLimit: Number(process.env.PUBLIC_RATE_LIMIT || 5000),
  preparationTokenSecret: process.env.PREPARATION_TOKEN_SECRET || process.env.ADMIN_TOKEN || ''
};

const defaultConfig = {
  targetHour: Number(process.env.TARGET_HOUR || 7),
  targetMinute: Number(process.env.TARGET_MINUTE || 0),
  targetSecond: Number(process.env.TARGET_SECOND || 0),
  targetMs: Number(process.env.TARGET_MS || 0),
  preFireMs: Number(process.env.PRE_FIRE_MS || 0),
  postFireMs: Number(process.env.POST_FIRE_MS || 0),
  maxAttempts: 1,
  intervalMs: Number(process.env.INTERVAL_MS || 1000),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 2000),
  parallelAttemptsPerUser: 1,
  globalConcurrentAttempts: 1,
  stopOnFirstSuccess: true,
  rateLimitPerUser: Number(process.env.RATE_LIMIT_PER_USER || 260),
  globalRateLimit: Number(process.env.GLOBAL_RATE_LIMIT || 2500),
  useServerQueue: false,
  automationMode: 'secure_session',
  preparationLeadMs: Number(process.env.PREPARATION_LEAD_MS || 180000),
  preparationTimeoutMs: Number(process.env.PREPARATION_TIMEOUT_MS || 300000),
  autoSubmitWhenSecurityReady: true,
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
  schemaVersion: 2,
  students: {},
  requests: {},
  ticketQueue: {},
  preparations: {},
  preparationEvents: [],
  attempts: [],
  usedIdempotencyKeys: {},
  lastHistoryCleanupAt: null,
  lastHistoryCleanupDay: null,
  config: defaultConfig
};

let db = await loadDb();
let globalWindow = [];
const perUserWindows = new Map();
const queueTimers = new Map();
const queueRunners = new Set();
let activeOfficialAttempts = 0;
const officialAttemptWaiters = [];

async function loadDb() {
  try {
    const text = await fs.readFile(dbPath, 'utf8');
    const loaded = JSON.parse(text);
    const migrated = {
      ...initialDb,
      ...loaded,
      preparations: loaded.preparations || {},
      preparationEvents: loaded.preparationEvents || [],
      config: { ...defaultConfig, ...(loaded.config || {}) }
    };
    if (Number(loaded.schemaVersion || 1) < 2) {
      migrated.schemaVersion = 2;
      migrated.config.useServerQueue = false;
      migrated.config.automationMode = 'secure_session';
      migrated.config.targetMode = 'secure_webview';
      migrated.config.maxAttempts = 1;
      migrated.config.parallelAttemptsPerUser = 1;
      migrated.config.globalConcurrentAttempts = 1;
      for (const job of Object.values(migrated.ticketQueue || {})) {
        if (job.status === 'queued' || job.status === 'running') {
          job.status = 'cancelled';
          job.finishedAt = new Date().toISOString();
          job.lastStatus = 'cancelled';
          job.lastMessage = 'Cola antigua cancelada por migracion a sesion segura.';
        }
      }
    }
    return migrated;
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

function findStudentByCredentials(dni, codigo) {
  const normalizedDni = clean(dni);
  const normalizedCode = clean(codigo).toUpperCase();
  return Object.values(db.students).find((student) => (
    clean(student.dni) === normalizedDni
    && clean(student.codigo).toUpperCase() === normalizedCode
  )) || null;
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

function limaDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(value));
  const mapped = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(mapped.year),
    month: Number(mapped.month),
    day: Number(mapped.day)
  };
}

function limaNoonUtc(value = new Date()) {
  const parts = limaDateParts(value);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 17, 0, 0, 0));
}

function nextLimaNoon(value = new Date()) {
  const target = limaNoonUtc(value);
  if (target.getTime() <= new Date(value).getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return target;
}

function preparationDedupeKey(studentId, targetAt, purpose = 'registration') {
  return `${studentId}:${limaDayKey(targetAt)}:${purpose}`;
}

function hashPreparationToken(token) {
  return crypto
    .createHmac('sha256', env.preparationTokenSecret || 'local-development-only')
    .update(String(token || ''))
    .digest('hex');
}

function safeTokenEqual(expectedHash, token) {
  const actualHash = hashPreparationToken(token);
  const left = Buffer.from(String(expectedHash || ''));
  const right = Buffer.from(actualHash);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function publicPreparation(preparation) {
  if (!preparation) return null;
  const {
    reportTokenHash: _reportTokenHash,
    reportTokenHashes: _reportTokenHashes,
    ...safe
  } = preparation;
  return safe;
}

function addPreparationEvent(preparation, status, message, details = null) {
  const event = {
    id: nanoid(),
    preparationId: preparation.id,
    studentId: preparation.studentId,
    dni: preparation.dni,
    codigo: preparation.codigo,
    status,
    message,
    details,
    createdAt: new Date().toISOString()
  };
  db.preparationEvents.unshift(event);
  if (db.preparationEvents.length > 3000) db.preparationEvents = db.preparationEvents.slice(0, 3000);
  return event;
}

function latestPreparationForStudent(studentId) {
  return Object.values(db.preparations || {})
    .filter((item) => item.studentId === studentId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;
}

function preparationForDay(studentId, targetAt, purpose = 'registration') {
  const dedupeKey = preparationDedupeKey(studentId, targetAt, purpose);
  return Object.values(db.preparations || {})
    .filter((item) => item.dedupeKey === dedupeKey)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;
}

async function transitionPreparation(preparation, status, {
  message,
  details,
  ticket
} = {}) {
  if (SUCCESS_PREPARATION_STATUSES.has(preparation.status)) return preparation;
  if (!canTransitionPreparation(preparation.status, status)) {
    const error = new Error(`Transicion invalida: ${preparation.status} -> ${status}.`);
    error.code = 'invalid_transition';
    throw error;
  }
  preparation.status = status;
  preparation.message = clean(message) || preparationStatusMessage(status);
  preparation.updatedAt = new Date().toISOString();
  if (ticket && typeof ticket === 'object') preparation.ticket = ticket;
  if (TERMINAL_PREPARATION_STATUSES.has(status)) preparation.finishedAt = preparation.updatedAt;
  addPreparationEvent(preparation, status, preparation.message, details || null);

  if (SUCCESS_PREPARATION_STATUSES.has(status) && !preparation.creditConsumedAt) {
    const student = db.students[preparation.studentId];
    const alreadyUsedToday = Boolean(student?.lastSuccessAt && limaDayKey(student.lastSuccessAt) === limaDayKey(preparation.targetAt));
    if (student && !alreadyUsedToday) {
      student.credits = Math.max(0, Number(student.credits || 0) - 1);
      student.lastSuccessAt = preparation.updatedAt;
    } else if (student && alreadyUsedToday) {
      student.lastSuccessAt = preparation.updatedAt;
    }
    preparation.creditConsumedAt = preparation.updatedAt;
  }
  await saveDb();
  return preparation;
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

function parallelAttemptsPerUser(config = db.config) {
  const configured = Number(config.parallelAttemptsPerUser || 1);
  return Math.max(1, Math.min(10, configured));
}

function globalConcurrentAttempts(config = db.config) {
  const configured = Number(config.globalConcurrentAttempts || 1);
  return Math.max(1, Math.min(100, configured));
}

async function acquireOfficialAttemptSlot(config = db.config) {
  if (activeOfficialAttempts < globalConcurrentAttempts(config)) {
    activeOfficialAttempts += 1;
    return releaseOfficialAttemptSlot;
  }

  return new Promise((resolve) => {
    officialAttemptWaiters.push(() => {
      activeOfficialAttempts += 1;
      resolve(releaseOfficialAttemptSlot);
    });
  });
}

function releaseOfficialAttemptSlot() {
  activeOfficialAttempts = Math.max(0, activeOfficialAttempts - 1);
  if (officialAttemptWaiters.length > 0 && activeOfficialAttempts < globalConcurrentAttempts()) {
    const next = officialAttemptWaiters.shift();
    if (next) next();
  }
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

function queueMaxAttempts(config = db.config) {
  const configured = Number(config.maxAttempts || 1);
  if (!Number.isFinite(configured)) return 1;
  return Math.max(1, Math.min(2000, configured));
}

function queuePostFireMs(config = db.config) {
  const configured = Number(config.postFireMs || 0);
  if (!Number.isFinite(configured)) return 0;
  return Math.max(0, Math.min(5 * 60_000, configured));
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
  if (!job || job.status !== 'queued') return;
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
  if (job.status === 'success') {
    await saveDb();
    return;
  }
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
  if (queueRunners.has(jobId)) return;
  queueRunners.add(jobId);
  try {
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
  const maxAttempts = queueMaxAttempts(config);
  const intervalMs = Math.max(80, Math.min(10_000, Number(config.intervalMs || 400)));
  const timeoutMs = queueAttemptTimeoutMs(config);
  const parallelLimit = parallelAttemptsPerUser(config);
  const concurrentLimit = globalConcurrentAttempts(config);
  const endAt = new Date(job.targetAt).getTime() + queuePostFireMs(config);
  job.status = 'running';
  job.startedAt = job.startedAt || new Date().toISOString();
  job.maxAttempts = maxAttempts;
  job.intervalMs = intervalMs;
  job.parallelAttemptsPerUser = parallelLimit;
  job.globalConcurrentAttempts = concurrentLimit;
  job.postFireMs = queuePostFireMs(config);
  await saveDb();

  let lastResult = null;
  let terminal = false;
  let launched = Number(job.attemptsRun || 0);
  const pending = new Set();
  const terminalStatuses = new Set(['sold_out', 'restricted', 'not_found', 'rate_limit']);

  async function recordAttempt(index, apiResult) {
    const attempt = {
      id: nanoid(),
      queueJobId: job.id,
      studentId: job.studentId,
      dni: job.dni,
      codigo: job.codigo,
      mode: 'backend_queue',
      number: index + 1,
      idempotencyKey: apiResult.idempotencyKey,
      createdAt: apiResult.createdAt,
      status: apiResult.status,
      response: apiResult
    };

    db.attempts.unshift(attempt);
    if (db.attempts.length > 2000) db.attempts = db.attempts.slice(0, 2000);

    job.attemptsRun = Math.max(Number(job.attemptsRun || 0), index + 1);
    job.lastAttemptAt = new Date().toISOString();
    if (job.status !== 'success') {
      job.lastStatus = apiResult.status;
      job.lastMessage = apiResult.payload?.message || apiResult.status;
      job.result = apiResult;
      lastResult = apiResult;
    }
    await saveDb();
  }

  async function launchAttempt(index) {
    if (terminal) return;
    const idempotencyKey = `${job.studentId}:queue:${limaDayKey(job.targetAt)}:${index + 1}:${nanoid(8)}`;
    db.usedIdempotencyKeys[idempotencyKey] = true;
    job.attemptsRun = Math.max(Number(job.attemptsRun || 0), index + 1);

    let apiResult;
    if (!checkSlidingWindow('global', Number(config.globalRateLimit))) {
      apiResult = { ok: false, statusCode: 0, officialCode: -1, status: 'rate_limit', idempotencyKey, createdAt: new Date().toISOString(), payload: { message: 'Limite global alcanzado en Railway.' } };
    } else if (!checkSlidingWindow(job.studentId, Number(config.rateLimitPerUser))) {
      apiResult = { ok: false, statusCode: 0, officialCode: -1, status: 'rate_limit', idempotencyKey, createdAt: new Date().toISOString(), payload: { message: 'Limite por alumno alcanzado en Railway.' } };
    } else {
      const releaseSlot = await acquireOfficialAttemptSlot(config);
      try {
        if (terminal) return;
        apiResult = await callOfficialTicketApi({ student: job, idempotencyKey, timeoutMs });
        apiResult.idempotencyKey = idempotencyKey;
        apiResult.createdAt = new Date().toISOString();
      } finally {
        releaseSlot();
      }
    }

    if (!apiResult) return;
    apiResult.idempotencyKey = apiResult.idempotencyKey || idempotencyKey;
    apiResult.createdAt = apiResult.createdAt || new Date().toISOString();
    await recordAttempt(index, apiResult);

    if (terminal) return;
    if (apiResult.status === 'success') {
      terminal = true;
      const alreadyUsedToday = Boolean(student.lastSuccessAt && limaDayKey(student.lastSuccessAt) === limaDayKey());
      if (!alreadyUsedToday) {
        student.credits = Math.max(0, Number(student.credits || 0) - 1);
      }
      student.lastSuccessAt = new Date().toISOString();
      await finishQueueJob(job, 'success', apiResult);
      return;
    }

    if (terminalStatuses.has(apiResult.status)) {
      terminal = true;
      await finishQueueJob(job, apiResult.status, apiResult);
    }
  }

  while (!terminal && launched < maxAttempts && Date.now() <= endAt) {
    if (pending.size < parallelLimit) {
      const attemptIndex = launched;
      launched += 1;
      const pendingAttempt = launchAttempt(attemptIndex).finally(() => pending.delete(pendingAttempt));
      pending.add(pendingAttempt);
    }
    await sleep(intervalMs);
  }

  while (!terminal && pending.size > 0) {
    await Promise.race([...pending]);
  }

  if (!terminal) {
    const exhaustedByAttempts = launched >= maxAttempts;
    const message = exhaustedByAttempts
      ? 'Intentos maximos agotados sin confirmacion.'
      : 'Ventana de disparo agotada sin confirmacion.';
    await finishQueueJob(job, lastResult?.status || 'failed', lastResult || { status: 'failed', payload: { message } });
  }
  } finally {
    queueRunners.delete(jobId);
  }
}

async function resumeQueueJobs() {
  for (const job of Object.values(db.ticketQueue || {})) {
    if (job.status === 'running') job.status = 'queued';
    if (job.status === 'queued') scheduleQueueJob(job);
  }
  await saveDb();
}

async function clearCompletedHistory(cleanupDay = limaDayKey()) {
  const before = {
    attempts: db.attempts.length,
    queueJobs: Object.keys(db.ticketQueue || {}).length,
    idempotencyKeys: Object.keys(db.usedIdempotencyKeys || {}).length
  };
  db.attempts = [];
  db.ticketQueue = Object.fromEntries(
    Object.entries(db.ticketQueue || {}).filter(([, job]) => queueIsActive(job))
  );
  db.usedIdempotencyKeys = {};
  db.lastHistoryCleanupAt = new Date().toISOString();
  db.lastHistoryCleanupDay = cleanupDay;
  await saveDb();
  const after = {
    attempts: db.attempts.length,
    queueJobs: Object.keys(db.ticketQueue || {}).length,
    idempotencyKeys: Object.keys(db.usedIdempotencyKeys || {}).length
  };
  console.log(`Historial limpiado: attempts ${before.attempts}->${after.attempts}, queue ${before.queueJobs}->${after.queueJobs}, keys ${before.idempotencyKeys}->${after.idempotencyKeys}`);
}

async function clearMissedNoonHistory() {
  const now = new Date();
  const today = limaDayKey(now);
  if (now.getTime() >= limaNoonUtc(now).getTime() && db.lastHistoryCleanupDay !== today) {
    await clearCompletedHistory(today);
  }
}

function scheduleDailyHistoryCleanup() {
  const target = nextLimaNoon();
  const delay = Math.max(0, target.getTime() - Date.now());
  setTimeout(async () => {
    try {
      await clearCompletedHistory(limaDayKey(target));
    } catch (error) {
      console.error('No se pudo limpiar el historial diario:', error);
    } finally {
      scheduleDailyHistoryCleanup();
    }
  }, delay);
  console.log(`Proxima limpieza de historial: ${target.toISOString()} (12:00 p. m. Lima)`);
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
  const [dni = '', ...codeParts] = decodeURIComponent(req.params.id).split(':');
  const student = db.students[req.params.id] || findStudentByCredentials(dni, codeParts.join(':'));
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
  const beforeCredits = Number(student.credits || 0);
  student.credits = Math.max(0, Number(student.credits) - 1);
  student.lastSuccessAt = new Date().toISOString();
  db.attempts.unshift({
    id: nanoid(),
    studentId: student.id,
    dni: student.dni,
    codigo: student.codigo,
    mode: 'native_confirmation',
    number: 1,
    idempotencyKey: `native:${student.id}:${student.lastSuccessAt}`,
    createdAt: student.lastSuccessAt,
    status: 'success',
    response: {
      ok: true,
      status: 'success',
      payload: {
        message: 'Ticket confirmado desde la app nativa/WebView.',
        beforeCredits,
        afterCredits: student.credits
      }
    }
  });
  if (db.attempts.length > 2000) db.attempts = db.attempts.slice(0, 2000);
  await saveDb();
  res.json({ ok: true, credits: student.credits, alreadyUsedToday: false });
});

app.post('/api/attempts/run', async (req, res) => {
  res.status(410).json({
    ok: false,
    status: 'legacy_automation_disabled',
    message: 'Los disparos API fueron desactivados porque la web oficial exige Turnstile, CSRF y fingerprint.'
  });
});

app.post('/api/queue/arm', async (req, res) => {
  res.status(410).json({
    ok: false,
    status: 'legacy_queue_disabled',
    message: 'La cola de disparos fue reemplazada por preparacion de sesion segura.'
  });
});

app.post('/api/preparations/start', async (req, res) => {
  const parsed = validateStudentPayload(req.body);
  if (parsed.error) return res.status(400).json({ ok: false, message: parsed.error });
  const student = findStudentByCredentials(parsed.dni, parsed.codigo);
  const hasTicketToday = Boolean(student?.lastSuccessAt && limaDayKey(student.lastSuccessAt) === limaDayKey());
  if (!student || student.status !== 'approved' || (Number(student.credits) <= 0 && !hasTicketToday)) {
    return res.status(403).json({ ok: false, status: 'not_authorized', message: 'Alumno sin autorizacion o sin cupos.' });
  }

  const purpose = req.body.purpose === 'verify' ? 'verify' : 'registration';
  const target = purpose === 'verify' ? new Date() : targetDate(db.config);
  const recommendedOpenAt = new Date(target.getTime() - Number(db.config.preparationLeadMs || 180000));
  if (purpose === 'registration' && Date.now() < recommendedOpenAt.getTime()) {
    return res.status(409).json({
      ok: false,
      status: 'too_early',
      message: `La preparacion estara disponible desde ${recommendedOpenAt.toISOString()}.`,
      recommendedOpenAt: recommendedOpenAt.toISOString(),
      targetAt: target.toISOString()
    });
  }
  const existing = preparationForDay(student.id, target.toISOString(), purpose);
  const samePurpose = existing?.purpose === purpose || (!existing?.purpose && purpose === 'registration');
  if (existing && samePurpose && (ACTIVE_PREPARATION_STATUSES.has(existing.status) || SUCCESS_PREPARATION_STATUSES.has(existing.status))) {
    const reportToken = crypto.randomBytes(24).toString('base64url');
    const previousHashes = existing.reportTokenHashes || (existing.reportTokenHash ? [existing.reportTokenHash] : []);
    existing.reportTokenHashes = [...previousHashes, hashPreparationToken(reportToken)].slice(-3);
    delete existing.reportTokenHash;
    existing.updatedAt = new Date().toISOString();
    existing.message = ACTIVE_PREPARATION_STATUSES.has(existing.status)
      ? 'Sesion segura ya preparada.'
      : existing.message;
    await saveDb();
    return res.json({
      ok: true,
      reused: true,
      preparation: publicPreparation(existing),
      reportToken
    });
  }

  const reportToken = crypto.randomBytes(24).toString('base64url');
  const preparation = {
    id: nanoid(),
    dedupeKey: preparationDedupeKey(student.id, target.toISOString(), purpose),
    studentId: student.id,
    dni: student.dni,
    codigo: student.codigo,
    purpose,
    status: 'prepared',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    targetAt: target.toISOString(),
    recommendedOpenAt: purpose === 'verify' ? new Date().toISOString() : recommendedOpenAt.toISOString(),
    deadlineAt: new Date(target.getTime() + Number(db.config.preparationTimeoutMs || 300000)).toISOString(),
    message: preparationStatusMessage('prepared'),
    reportTokenHashes: [hashPreparationToken(reportToken)],
    ticket: null,
    creditConsumedAt: null
  };
  db.preparations[preparation.id] = preparation;
  addPreparationEvent(preparation, 'prepared', preparation.message);
  await saveDb();
  res.status(201).json({
    ok: true,
    reused: false,
    preparation: publicPreparation(preparation),
    reportToken
  });
});

app.get('/api/queue/:jobId/status', (req, res) => {
  res.status(410).json({ ok: false, status: 'legacy_queue_disabled', message: 'Consulte /api/preparations/:id/status.' });
});

app.get('/api/student/:id/queue', (req, res) => {
  res.status(410).json({ ok: false, status: 'legacy_queue_disabled', message: 'Consulte /api/student/:id/preparations.' });
});

app.get('/api/preparations/:id/status', (req, res) => {
  const preparation = db.preparations?.[req.params.id];
  if (!preparation) return res.status(404).json({ ok: false, message: 'Preparacion no encontrada.' });
  res.json({ ok: true, preparation: publicPreparation(preparation) });
});

app.post('/api/preparations/:id/report', async (req, res) => {
  const preparation = db.preparations?.[req.params.id];
  if (!preparation) return res.status(404).json({ ok: false, message: 'Preparacion no encontrada.' });
  const reportToken = req.get('X-Preparation-Token') || clean(req.body.reportToken);
  const reportTokenHashes = preparation.reportTokenHashes || (preparation.reportTokenHash ? [preparation.reportTokenHash] : []);
  if (!reportTokenHashes.some((hash) => safeTokenEqual(hash, reportToken))) {
    return res.status(401).json({ ok: false, message: 'Token de preparacion invalido.' });
  }
  const status = clean(req.body.status).toLowerCase();
  const allowed = new Set([
    ...ACTIVE_PREPARATION_STATUSES,
    ...TERMINAL_PREPARATION_STATUSES
  ]);
  if (!allowed.has(status)) return res.status(400).json({ ok: false, message: 'Estado de preparacion invalido.' });
  try {
    await transitionPreparation(preparation, status, {
      message: req.body.message,
      details: req.body.details,
      ticket: req.body.ticket
    });
    res.json({ ok: true, preparation: publicPreparation(preparation) });
  } catch (error) {
    res.status(error.code === 'invalid_transition' ? 409 : 500).json({ ok: false, message: error.message });
  }
});

app.get('/api/student/:id/preparations', (req, res) => {
  const [dni = '', ...codeParts] = decodeURIComponent(req.params.id).split(':');
  const student = db.students[req.params.id] || findStudentByCredentials(dni, codeParts.join(':'));
  const preparations = Object.values(db.preparations || {})
    .filter((item) => item.studentId === (student?.id || req.params.id))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);
  res.json({ ok: true, preparations: preparations.map(publicPreparation) });
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
  const allowed = [
    'targetHour',
    'targetMinute',
    'targetSecond',
    'targetMs',
    'preparationLeadMs',
    'preparationTimeoutMs',
    'autoSubmitWhenSecurityReady',
    'targetPage',
    'selectors'
  ];
  for (const key of allowed) {
    if (req.body[key] !== undefined) db.config[key] = req.body[key];
  }
  db.config.useServerQueue = false;
  db.config.automationMode = 'secure_session';
  db.config.targetMode = 'secure_webview';
  db.config.maxAttempts = 1;
  db.config.parallelAttemptsPerUser = 1;
  db.config.globalConcurrentAttempts = 1;
  await saveDb();
  res.json({ ok: true, config: db.config });
});

app.get('/admin/attempts', requireAdmin, (_req, res) => res.json({ ok: true, attempts: db.attempts.slice(0, 500) }));

app.get('/admin/queue', requireAdmin, (_req, res) => {
  const jobs = Object.values(db.preparations || {})
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 500);
  res.json({ ok: true, jobs: jobs.map(publicPreparation), legacyAlias: true });
});

app.get('/admin/preparations', requireAdmin, (_req, res) => {
  const preparations = Object.values(db.preparations || {})
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 500);
  res.json({ ok: true, preparations: preparations.map(publicPreparation) });
});

app.get('/admin/preparation-events', requireAdmin, (_req, res) => {
  res.json({ ok: true, events: db.preparationEvents.slice(0, 1000) });
});

app.get('/admin/stats', requireAdmin, (_req, res) => {
  const attempts = db.attempts;
  const queueJobs = Object.values(db.ticketQueue || {});
  const preparations = Object.values(db.preparations || {});
  const today = limaDayKey();
  const todayPreparations = preparations.filter((item) => (
    limaDayKey(item.targetAt || item.createdAt) === today
  ));
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
      preparations: todayPreparations.length,
      preparationActive: todayPreparations.filter((item) => ACTIVE_PREPARATION_STATUSES.has(item.status)).length,
      preparationSuccess: todayPreparations.filter((item) => SUCCESS_PREPARATION_STATUSES.has(item.status)).length,
      preparationManual: todayPreparations.filter((item) => item.status === 'manual_required').length,
      preparationFailed: todayPreparations.filter((item) => (
        TERMINAL_PREPARATION_STATUSES.has(item.status)
        && !SUCCESS_PREPARATION_STATUSES.has(item.status)
      )).length,
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

await saveDb();
await clearMissedNoonHistory();
scheduleDailyHistoryCleanup();

app.listen(env.port, () => {
  console.log(`Asistente de estudiantes backend escuchando en puerto ${env.port}`);
});
