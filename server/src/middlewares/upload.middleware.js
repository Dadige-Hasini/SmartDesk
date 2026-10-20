import multer from 'multer';
import { MAX_FILE_SIZE, MAX_ATTACHMENTS_PER_REQUEST } from '../utils/fileValidation.js';

// Configure multer with in-memory storage so we can inspect buffer magic bytes
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_ATTACHMENTS_PER_REQUEST,
  },
});

export const uploadAttachmentsMiddleware = upload.array('files', MAX_ATTACHMENTS_PER_REQUEST);
