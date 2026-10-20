/**
 * Standard API Response Envelope Helpers
 * Enforces uniform contract:
 * { "success": true, "message": "Human-readable message", "data": {} }
 */

export function sendSuccess(res, message, data = {}, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

export function sendError(res, message, error = null, statusCode = 500) {
  const payload = {
    success: false,
    message,
  };

  if (error) {
    payload.error = error;
  }

  return res.status(statusCode).json(payload);
}
