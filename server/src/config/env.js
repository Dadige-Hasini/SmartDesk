import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load server/.env, root .env, or working directory .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

// Resolve LLM and Embedding credentials from server environment
const rawApiKey = (process.env.LLM_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || '').trim();

// Resolve chat model (prevent accidental key-in-model pastes)
let rawChatModel = (process.env.LLM_MODEL || process.env.AI_MODEL_CHAT || '').trim();
if (!rawChatModel || rawChatModel.startsWith('sk-')) {
  rawChatModel = rawApiKey.startsWith('AIza') ? 'gemini-1.5-flash' : 'gpt-4o-mini';
}

// Resolve embedding model
let rawEmbeddingModel = (process.env.EMBEDDING_MODEL || process.env.AI_MODEL_EMBEDDING || '').trim();
if (!rawEmbeddingModel) {
  rawEmbeddingModel = rawApiKey.startsWith('AIza') ? 'text-embedding-004' : 'text-embedding-3-small';
}

// Auto-detect provider if not explicitly specified
let resolvedProvider = (process.env.AI_PROVIDER || '').trim().toLowerCase();
if (!resolvedProvider) {
  if (rawApiKey.startsWith('sk-') || rawEmbeddingModel.includes('text-embedding-3') || rawChatModel.startsWith('gpt-')) {
    resolvedProvider = 'openai';
  } else if (rawApiKey.startsWith('AIza') || rawChatModel.includes('gemini') || rawEmbeddingModel.includes('004')) {
    resolvedProvider = 'gemini';
  } else {
    resolvedProvider = 'openai';
  }
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  clientUrl: process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173',

  supabase: {
    url: process.env.SUPABASE_URL || '',
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
    secretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    jwtSecret: process.env.SUPABASE_JWT_SECRET || '',
    storage: {
      attachmentsBucket: process.env.SUPABASE_STORAGE_BUCKET_ATTACHMENTS || 'ticket-attachments',
      documentsBucket: process.env.SUPABASE_STORAGE_BUCKET_DOCUMENTS || 'knowledge-documents',
    },
  },

  ai: {
    provider: resolvedProvider,
    apiKey: rawApiKey,
    chatModel: rawChatModel,
    embeddingModel: rawEmbeddingModel,
    embeddingDimension: parseInt(process.env.AI_EMBEDDING_DIMENSION || '768', 10),
    rateLimitPerMinute: parseInt(process.env.AI_RATE_LIMIT_PER_MINUTE || '30', 10),
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

/**
 * Validate server environment configuration at startup
 * Provides clear, safe diagnostics without ever leaking credentials or secrets.
 */
export function validateEnv() {
  const warnings = [];
  const errors = [];

  // Check Supabase Configuration
  if (!config.supabase.url) {
    warnings.push('SUPABASE_URL is not configured; running in fallback mode.');
  }
  if (!config.supabase.publishableKey) {
    warnings.push('SUPABASE_PUBLISHABLE_KEY is not configured.');
  }

  // Check AI & LLM Service Configuration
  const hasAiKey = Boolean(config.ai.apiKey && config.ai.apiKey.length > 0 && config.ai.apiKey !== 'your-ai-api-key-here');
  if (!hasAiKey) {
    warnings.push('LLM_API_KEY is not configured. Server will operate using deterministic MockProvider for conversations and embeddings.');
  }

  return {
    isValid: errors.length === 0,
    hasLiveAi: hasAiKey,
    provider: config.ai.provider,
    chatModel: config.ai.chatModel,
    embeddingModel: config.ai.embeddingModel,
    embeddingDimension: config.ai.embeddingDimension,
    warnings,
    errors,
  };
}
