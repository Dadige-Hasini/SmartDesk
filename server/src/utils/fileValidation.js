import path from 'path';

/**
 * SmartDesk File Validation Utility
 *
 * Enforces strict verification of:
 * 1. File size (max 5 MB)
 * 2. File extension (whitelisted only)
 * 3. Client MIME type (whitelisted only)
 * 4. File signature (magic bytes) to prevent spoofing (.exe/.sh renamed to .pdf/.docx)
 */

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
export const MAX_ATTACHMENTS_PER_REQUEST = 3;

export const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf', 'docx']);

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/**
 * Validates a buffer's header against known magic bytes.
 *
 * @param {Buffer} buffer - File buffer
 * @param {string} claimedExt - Lowercase file extension
 * @param {string} claimedMime - Claimed MIME type
 * @returns {{ isValid: boolean, error?: string, detectedType?: string }}
 */
export function validateFileMagicBytes(buffer, claimedExt, claimedMime) {
  if (!buffer || buffer.length < 4) {
    return { isValid: false, error: 'File is empty or too small to verify signature.' };
  }

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    if (!['jpg', 'jpeg'].includes(claimedExt) || claimedMime !== 'image/jpeg') {
      return { isValid: false, error: 'MIME type or extension does not match JPEG file signature.' };
    }
    return { isValid: true, detectedType: 'image/jpeg' };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    if (claimedExt !== 'png' || claimedMime !== 'image/png') {
      return { isValid: false, error: 'MIME type or extension does not match PNG file signature.' };
    }
    return { isValid: true, detectedType: 'image/png' };
  }

  // 3. WEBP: RIFF....WEBP (Bytes 0-3 = "RIFF", Bytes 8-11 = "WEBP")
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    if (claimedExt !== 'webp' || claimedMime !== 'image/webp') {
      return { isValid: false, error: 'MIME type or extension does not match WEBP file signature.' };
    }
    return { isValid: true, detectedType: 'image/webp' };
  }

  // 4. PDF: %PDF- (Bytes 0-4 = "%PDF-")
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') {
    if (claimedExt !== 'pdf' || claimedMime !== 'application/pdf') {
      return { isValid: false, error: 'MIME type or extension does not match PDF file signature.' };
    }
    return { isValid: true, detectedType: 'application/pdf' };
  }

  // 5. DOCX: PK\x03\x04 (ZIP format starting with 50 4B 03 04)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    if (
      claimedExt !== 'docx' ||
      claimedMime !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return { isValid: false, error: 'MIME type or extension does not match DOCX file signature.' };
    }

    // Inspect first 2048 bytes for standard OOXML components ([Content_Types].xml or word/)
    const headerSlice = buffer.slice(0, Math.min(buffer.length, 2048)).toString('binary');
    const isDocxStructure = headerSlice.includes('[Content_Types].xml') || headerSlice.includes('word/');
    if (!isDocxStructure) {
      return { isValid: false, error: 'Invalid DOCX structure detected in archive package.' };
    }

    return {
      isValid: true,
      detectedType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  return {
    isValid: false,
    error: 'Unrecognized or unauthorized file signature. Only JPEG, PNG, WEBP, PDF, and DOCX files are allowed.',
  };
}

/**
 * Complete file validation pipeline
 *
 * @param {Express.Multer.File} file
 * @returns {{ isValid: boolean, error?: string, extension?: string }}
 */
export function validateAttachment(file) {
  if (!file) {
    return { isValid: false, error: 'No file provided.' };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `File "${file.originalname}" exceeds the 5 MB size limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`,
    };
  }

  // Extract extension
  const rawExt = path.extname(file.originalname).toLowerCase().replace(/^\./, '');
  if (!rawExt || !ALLOWED_EXTENSIONS.has(rawExt)) {
    return {
      isValid: false,
      error: `File extension ".${rawExt}" is not permitted. Allowed extensions: .jpg, .jpeg, .png, .webp, .pdf, .docx`,
    };
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return {
      isValid: false,
      error: `MIME type "${file.mimetype}" is not permitted.`,
    };
  }

  // Check file signature / magic bytes
  const signatureCheck = validateFileMagicBytes(file.buffer, rawExt, file.mimetype);
  if (!signatureCheck.isValid) {
    return {
      isValid: false,
      error: `Security verification failed for "${file.originalname}": ${signatureCheck.error}`,
    };
  }

  return { isValid: true, extension: rawExt };
}
