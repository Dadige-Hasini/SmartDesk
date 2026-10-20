import crypto from 'crypto';
import { logger } from '../utils/logger.js';

export function requestIdMiddleware(req, res, next) {
  const reqId = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);

  const startHrTime = process.hrtime();

  res.on('finish', () => {
    const elapsedHrTime = process.hrtime(startHrTime);
    const elapsedTimeInMs = (elapsedHrTime[0] * 1000 + elapsedHrTime[1] / 1e6).toFixed(2);

    logger.info(`${req.method} ${req.originalUrl} - ${res.statusCode} (${elapsedTimeInMs}ms)`, {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: parseFloat(elapsedTimeInMs),
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });

  next();
}
