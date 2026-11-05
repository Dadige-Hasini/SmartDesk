/**
 * Structured JSON Logger for SmartDesk API
 * Outputs structured logs with timestamps, levels, context, and request IDs.
 */

const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'secret',
  'apikey',
  'api_key',
  'ai_api_key',
  'llm_api_key',
  'smtp_pass',
  'cookie',
  'service_role_key',
]);

export function sanitizeMeta(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return obj;
  if (Array.isArray(obj)) return obj.map((item) => sanitizeMeta(item, depth + 1));

  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      clean[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      clean[k] = sanitizeMeta(v, depth + 1);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

function formatLog(level, message, meta = {}) {
  const sanitizedMeta = sanitizeMeta(meta);
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...sanitizedMeta,
  };

  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify(logEntry);
  }

  // Readable developer format in non-production
  const reqIdStr = sanitizedMeta.requestId ? `[${sanitizedMeta.requestId}] ` : '';
  const metaStr = Object.keys(sanitizedMeta).length > (sanitizedMeta.requestId ? 1 : 0)
    ? ` ${JSON.stringify(sanitizedMeta)}`
    : '';
  return `[${logEntry.timestamp}] [${level}] ${reqIdStr}${message}${metaStr}`;
}

export const logger = {
  debug: (message, meta) => console.debug(formatLog(LOG_LEVELS.DEBUG, message, meta)),
  info: (message, meta) => console.info(formatLog(LOG_LEVELS.INFO, message, meta)),
  warn: (message, meta) => console.warn(formatLog(LOG_LEVELS.WARN, message, meta)),
  error: (message, meta) => console.error(formatLog(LOG_LEVELS.ERROR, message, meta)),
};
