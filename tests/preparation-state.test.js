import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionPreparation,
  preparationStatusMessage,
  shouldKeepPreparationResult
} from '../server/preparation-state.js';

test('permite el flujo seguro esperado', () => {
  assert.equal(canTransitionPreparation('prepared', 'page_loading'), true);
  assert.equal(canTransitionPreparation('page_loading', 'form_waiting'), true);
  assert.equal(canTransitionPreparation('form_waiting', 'security_pending'), true);
  assert.equal(canTransitionPreparation('security_pending', 'security_ready'), true);
  assert.equal(canTransitionPreparation('security_ready', 'ready_to_submit'), true);
  assert.equal(canTransitionPreparation('ready_to_submit', 'submitted'), true);
  assert.equal(canTransitionPreparation('submitted', 'success'), true);
});

test('un resultado terminal no puede ser sobrescrito', () => {
  assert.equal(canTransitionPreparation('success', 'timeout'), false);
  assert.equal(canTransitionPreparation('success', 'failed'), false);
  assert.equal(canTransitionPreparation('sold_out', 'success'), false);
});

test('rechaza saltos que inventarian una confirmacion', () => {
  assert.equal(canTransitionPreparation('prepared', 'success'), false);
  assert.equal(canTransitionPreparation('security_pending', 'success'), false);
  assert.equal(canTransitionPreparation('form_waiting', 'submitted'), false);
});

test('mantiene el resultado hasta el mediodia de Lima', () => {
  const preparation = {
    status: 'success',
    finishedAt: '2026-06-25T12:00:05.000Z'
  };
  assert.equal(shouldKeepPreparationResult(preparation, new Date('2026-06-25T16:59:59.000Z')), true);
  assert.equal(shouldKeepPreparationResult(preparation, new Date('2026-06-25T17:00:00.000Z')), false);
});

test('expone mensajes comprensibles para seguridad y timeout', () => {
  assert.match(preparationStatusMessage('security_pending'), /Cloudflare/i);
  assert.match(preparationStatusMessage('timeout'), /sin una respuesta/i);
});
