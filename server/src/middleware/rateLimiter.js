import rateLimit from 'express-rate-limit';

/**
 * Standard factory for rate limiters with consistent JSON error envelope
 */
function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 100,
  message = 'Too many requests, please slow down.',
}) {
  return rateLimit({
    windowMs,
    max: (req) => {
      // Allow regular test suite to run without interference unless explicitly testing rate limits
      if (process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
        return 50000;
      }
      return max;
    },
    message: {
      success: false,
      message,
      error: { code: 'RATE_LIMIT_EXCEEDED' },
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

// 1. Ticket Creation Abuse Protection: 20 tickets per 15 minutes
export const ticketCreationLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.TICKET_CREATION_LIMIT || '20', 10),
  message: 'Ticket submission rate limit exceeded. Please wait a while before raising more tickets.',
});

// 2. Comment Posting Abuse Protection: 60 comments per 15 minutes
export const commentLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.COMMENT_LIMIT || '60', 10),
  message: 'Comment rate limit exceeded. Please wait before posting more comments.',
});

// 3. File Upload Flood Protection: 30 uploads per 15 minutes
export const uploadLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.UPLOAD_LIMIT || '30', 10),
  message: 'Upload rate limit exceeded. Please wait before uploading more files.',
});

// 4. Sensitive Profile Modification Protection: 30 updates per 15 minutes
export const profileUpdateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PROFILE_UPDATE_LIMIT || '30', 10),
  message: 'Profile update rate limit exceeded. Please try again later.',
});

// 5. Bulk Action Abuse Protection: 10 bulk operations per 15 minutes
export const bulkActionLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.BULK_ACTION_LIMIT || '10', 10),
  message: 'Bulk operation rate limit exceeded. Please try again later.',
});
