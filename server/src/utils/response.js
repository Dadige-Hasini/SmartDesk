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

export const responseHandler = {
  success(res, data = {}, message = 'Operation successful', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
    });
  },
  created(res, data = {}, message = 'Created successfully') {
    return res.status(201).json({
      success: true,
      message,
      data,
    });
  },
  error(res, message = 'An error occurred', statusCode = 500, error = null) {
    return sendError(res, message, error, statusCode);
  },
};

