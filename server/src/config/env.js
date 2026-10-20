import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env or local .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  supabase: {
    url: process.env.SUPABASE_URL || 'https://placeholder-project.supabase.co',
    anonKey: process.env.SUPABASE_ANON_KEY || 'placeholder-anon-key',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    jwtSecret: process.env.SUPABASE_JWT_SECRET || 'placeholder-jwt-secret',
    storage: {
      attachmentsBucket: process.env.SUPABASE_STORAGE_BUCKET_ATTACHMENTS || 'ticket-attachments',
      documentsBucket: process.env.SUPABASE_STORAGE_BUCKET_DOCUMENTS || 'knowledge-documents',
    },
  },

  ai: {
    provider: process.env.AI_PROVIDER || 'gemini',
    apiKey: process.env.AI_API_KEY || '',
    chatModel: process.env.AI_MODEL_CHAT || 'gemini-1.5-flash',
    embeddingModel: process.env.AI_MODEL_EMBEDDING || 'text-embedding-004',
    embeddingDimension: parseInt(process.env.AI_EMBEDDING_DIMENSION || '768', 10),
    rateLimitPerMinute: parseInt(process.env.AI_RATE_LIMIT_PER_MINUTE || '20', 10),
  },

  email: {
    host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.SMTP_PORT || '2525', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'support@smartdesk.college.edu',
    fromName: process.env.EMAIL_FROM_NAME || 'SmartDesk Support',
  },
};
