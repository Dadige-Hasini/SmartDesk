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

function formatLog(level, message, meta = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify(logEntry);
  }

  // Readable developer format in non-production
  const reqIdStr = meta.requestId ? `[${meta.requestId}] ` : '';
  const metaStr = Object.keys(meta).length > (meta.requestId ? 1 : 0)
    ? ` ${JSON.stringify(meta)}`
    : '';
  return `[${logEntry.timestamp}] [${level}] ${reqIdStr}${message}${metaStr}`;
}

export const logger = {
  debug: (message, meta) => console.debug(formatLog(LOG_LEVELS.DEBUG, message, meta)),
  info: (message, meta) => console.info(formatLog(LOG_LEVELS.INFO, message, meta)),
  warn: (message, meta) => console.warn(formatLog(LOG_LEVELS.WARN, message, meta)),
  error: (message, meta) => console.error(formatLog(LOG_LEVELS.ERROR, message, meta)),
};
