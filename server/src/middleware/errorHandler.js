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

  // Handle Multer upload errors (e.g. LIMIT_FILE_SIZE, LIMIT_FILE_COUNT)
  if (err.name === 'MulterError' || err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT') {
    const isFileSize = err.code === 'LIMIT_FILE_SIZE';
    const message = isFileSize
      ? 'File exceeds the maximum permitted size limit of 5 MB.'
      : (err.message || 'File upload limit exceeded');

    logger.warn('File upload limit exceeded', {
      requestId,
      url: req.originalUrl,
      code: err.code,
    });

    return sendError(
      res,
      message,
      { code: err.code || 'UPLOAD_LIMIT_EXCEEDED' },
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

  // Sanitize error message and details to prevent secret or credential disclosures
  const SENSITIVE_PATTERN = /(?:password|secret|bearer\s+[^\s]+|token\s*=\s*[^\s]+|api[_-]?key|postgres:\/\/[^\s]+|supabase_secret)[^\s"']*/gi;

  let message = isServerFault && process.env.NODE_ENV === 'production'
    ? 'An unexpected internal error occurred. Please contact support.'
    : (err.message || 'Internal server error');

  if (typeof message === 'string') {
    message = message.replace(SENSITIVE_PATTERN, '[REDACTED_SECRET]');
  }

  let cleanDetails = err.details || null;
  if (cleanDetails && typeof cleanDetails === 'string') {
    cleanDetails = cleanDetails.replace(SENSITIVE_PATTERN, '[REDACTED_SECRET]');
  }

  return sendError(
    res,
    message,
    {
      code: err.code || (isServerFault ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST'),
      details: cleanDetails,
      requestId,
    },
    statusCode
  );
}
