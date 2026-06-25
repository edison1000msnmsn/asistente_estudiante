export const ACTIVE_PREPARATION_STATUSES = new Set([
  'prepared',
  'page_loading',
  'form_waiting',
  'security_pending',
  'security_ready',
  'ready_to_submit',
  'submitted'
]);

export const SUCCESS_PREPARATION_STATUSES = new Set(['success', 'already_issued']);

export const TERMINAL_PREPARATION_STATUSES = new Set([
  ...SUCCESS_PREPARATION_STATUSES,
  'sold_out',
  'closed',
  'invalid_student',
  'restricted',
  'manual_required',
  'timeout',
  'cancelled',
  'failed'
]);

const TRANSITIONS = {
  prepared: new Set(['page_loading', 'cancelled', 'failed']),
  page_loading: new Set(['form_waiting', 'security_pending', 'security_ready', 'manual_required', 'closed', 'timeout', 'failed']),
  form_waiting: new Set(['security_pending', 'security_ready', 'manual_required', 'closed', 'timeout', 'failed']),
  security_pending: new Set(['security_ready', 'manual_required', 'closed', 'timeout', 'failed']),
  security_ready: new Set(['ready_to_submit', 'submitted', 'manual_required', 'closed', 'timeout', 'failed']),
  ready_to_submit: new Set(['submitted', 'manual_required', 'closed', 'timeout', 'failed']),
  submitted: new Set(['success', 'already_issued', 'sold_out', 'closed', 'invalid_student', 'restricted', 'timeout', 'failed'])
};

export function canTransitionPreparation(from, to) {
  if (!from || from === to) return true;
  if (TERMINAL_PREPARATION_STATUSES.has(from)) return false;
  return Boolean(TRANSITIONS[from]?.has(to));
}

export function preparationStatusMessage(status) {
  const messages = {
    prepared: 'Sesion segura preparada.',
    page_loading: 'Cargando la pagina oficial.',
    form_waiting: 'Esperando que la web oficial habilite el formulario.',
    security_pending: 'Esperando validacion de seguridad de Cloudflare.',
    security_ready: 'Validacion de seguridad lista.',
    ready_to_submit: 'Formulario listo para enviar.',
    submitted: 'Solicitud enviada una sola vez.',
    success: 'Ticket confirmado por la pagina oficial.',
    already_issued: 'La pagina oficial devolvio un ticket ya emitido.',
    sold_out: 'La pagina oficial informa que no quedan cupos.',
    closed: 'El registro oficial esta cerrado.',
    invalid_student: 'DNI o codigo no reconocido por la pagina oficial.',
    restricted: 'La pagina oficial restringio al alumno.',
    manual_required: 'Cloudflare requiere una validacion manual.',
    timeout: 'La sesion termino sin una respuesta confirmada.',
    cancelled: 'Preparacion cancelada.',
    failed: 'La sesion segura fallo.'
  };
  return messages[status] || status || 'Sin estado';
}

export function shouldKeepPreparationResult(preparation, now = new Date()) {
  if (!preparation || !TERMINAL_PREPARATION_STATUSES.has(preparation.status)) return false;
  const reference = preparation.finishedAt || preparation.updatedAt || preparation.createdAt;
  if (!reference) return false;
  const dayFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const hourFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    hour12: false
  });
  return dayFormatter.format(new Date(reference)) === dayFormatter.format(now)
    && Number(hourFormatter.format(now)) % 24 < 12;
}
