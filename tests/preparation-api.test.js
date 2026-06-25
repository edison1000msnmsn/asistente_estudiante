import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const port = 43127;
const baseUrl = `http://127.0.0.1:${port}`;
let child;
let dataDir;

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('El servidor de prueba no inicio.');
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  return { response, data };
}

test.before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'assistant-preparation-'));
  const studentId = '72769843:2021200783B';
  await fs.writeFile(path.join(dataDir, 'db.json'), JSON.stringify({
    schemaVersion: 2,
    students: {
      [studentId]: {
        id: studentId,
        dni: '72769843',
        codigo: '2021200783B',
        credits: 2,
        status: 'approved',
        createdAt: new Date().toISOString()
      }
    },
    requests: {},
    ticketQueue: {},
    preparations: {},
    preparationEvents: [],
    attempts: [],
    usedIdempotencyKeys: {},
    config: {
      targetHour: 23,
      targetMinute: 59,
      targetSecond: 0,
      targetMs: 0,
      preparationLeadMs: 86400000,
      preparationTimeoutMs: 300000,
      autoSubmitWhenSecurityReady: true,
      targetPage: 'https://comedor.uncp.edu.pe/charola',
      selectors: {
        campo1: '#dni',
        campo2: '#codigo',
        button: '.btn-register'
      }
    }
  }));

  child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'test-password',
      ADMIN_TOKEN: 'test-admin-token',
      PREPARATION_TOKEN_SECRET: 'test-preparation-secret',
      ALLOWED_ORIGINS: 'http://localhost'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await waitForHealth();
});

test.after(async () => {
  child?.kill();
  await fs.rm(dataDir, { recursive: true, force: true });
});

test('crea una sola preparacion, protege reportes y descuenta una sola vez', async () => {
  const payload = JSON.stringify({
    dni: '72769843',
    codigo: '2021200783b',
    purpose: 'registration'
  });
  const first = await request('/api/preparations/start', { method: 'POST', body: payload });
  assert.equal(first.response.status, 201);
  assert.equal(first.data.preparation.status, 'prepared');
  assert.ok(first.data.reportToken);

  const repeated = await request('/api/preparations/start', { method: 'POST', body: payload });
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.data.reused, true);
  assert.equal(repeated.data.preparation.id, first.data.preparation.id);

  const invalidToken = await request(`/api/preparations/${first.data.preparation.id}/report`, {
    method: 'POST',
    headers: { 'X-Preparation-Token': 'incorrecto' },
    body: JSON.stringify({ status: 'page_loading' })
  });
  assert.equal(invalidToken.response.status, 401);

  const token = first.data.reportToken;
  const statuses = [
    'page_loading',
    'form_waiting',
    'security_pending',
    'security_ready',
    'ready_to_submit',
    'submitted',
    'success'
  ];
  for (const status of statuses) {
    const report = await request(`/api/preparations/${first.data.preparation.id}/report`, {
      method: 'POST',
      headers: { 'X-Preparation-Token': token },
      body: JSON.stringify({ status })
    });
    assert.equal(report.response.status, 200, `${status}: ${JSON.stringify(report.data)}`);
  }

  const lateTimeout = await request(`/api/preparations/${first.data.preparation.id}/report`, {
    method: 'POST',
    headers: { 'X-Preparation-Token': token },
    body: JSON.stringify({ status: 'timeout' })
  });
  assert.equal(lateTimeout.response.status, 200);
  assert.equal(lateTimeout.data.preparation.status, 'success');

  const status = await request('/api/student/72769843%3A2021200783b/status');
  assert.equal(status.data.student.credits, 1);
  assert.equal(status.data.hasTicketToday, true);
});

test('rechaza saltar directamente de preparado a exito', async () => {
  const created = await request('/api/preparations/start', {
    method: 'POST',
    body: JSON.stringify({
      dni: '72769843',
      codigo: '2021200783B',
      purpose: 'verify'
    })
  });
  const report = await request(`/api/preparations/${created.data.preparation.id}/report`, {
    method: 'POST',
    headers: { 'X-Preparation-Token': created.data.reportToken },
    body: JSON.stringify({ status: 'success' })
  });
  assert.equal(report.response.status, 409);
});

test('la cola y los disparos antiguos permanecen desactivados', async () => {
  const attempts = await request('/api/attempts/run', {
    method: 'POST',
    body: JSON.stringify({ dni: '72769843', codigo: '2021200783B' })
  });
  const queue = await request('/api/queue/arm', {
    method: 'POST',
    body: JSON.stringify({ dni: '72769843', codigo: '2021200783B' })
  });
  assert.equal(attempts.response.status, 410);
  assert.equal(queue.response.status, 410);
});
