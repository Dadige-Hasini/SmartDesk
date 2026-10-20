import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';
import { sendError } from '../utils/response.js';

export function errorHandler(err, req, res, next) {
  // If headers already sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  const requestId = req.id || 'unknown';

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const errorDetails = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
      rule: e.code,
    }));

    logger.warn('Validation error on request', {
      requestId,
      url: req.originalUrl,
      errors: errorDetails,
    });

    return sendError(
      res,
      'Validation failed for provided request parameters',
      { code: 'VALIDATION_ERROR', details: errorDetails },
      400
    );
  }

  // Handle JSON parsing syntax errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    logger.warn('Malformed JSON payload received', {
      requestId,
      url: req.originalUrl,
    });

    return sendError(
      res,
      'Malformed JSON payload in request body',
      { code: 'INVALID_JSON' },
      400
    );
  }

  // Custom application error with explicit status code
  const statusCode = err.statusCode || err.status || 500;
  const isServerFault = statusCode >= 500;

  if (isServerFault) {
    logger.error('Unhandled internal server error', {
      requestId,
      url: req.originalUrl,
      errorName: err.name,
      errorMessage: err.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    });
  } else {
    logger.warn(`Handled application error (${statusCode})`, {
      requestId,
      url: req.originalUrl,
      message: err.message,
    });
  }

  const message = isServerFault && process.env.NODE_ENV === 'production'
    ? 'An unexpected internal error occurred. Please contact support.'
    : err.message || 'Internal server error';

  return sendError(
    res,
    message,
    {
      code: err.code || (isServerFault ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST'),
      details: err.details || null,
      requestId,
    },
    statusCode
  );
}
