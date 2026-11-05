import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabaseAdmin, supabaseClient } from '../../config/supabase.js';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.resolve(__dirname, '../../../data/ai_conversations.json');

class AiConversationService {
  constructor() {
    this.conversations = new Map(); // id -> conversation object
    this.messages = new Map();      // id -> message object
    this.initLocalStore();
  }

  initLocalStore() {
    try {
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.conversations)) {
          for (const c of parsed.conversations) {
            this.conversations.set(c.id, c);
          }
        }
        if (Array.isArray(parsed.messages)) {
          for (const m of parsed.messages) {
            this.messages.set(m.id, m);
          }
        }
        logger.info(`[AiConversationService] Loaded ${this.conversations.size} conversations and ${this.messages.size} messages from local store`);
      }
    } catch (err) {
      logger.warn('[AiConversationService] Could not load local conversations file', { error: err.message });
    }
  }

  saveLocalStore() {
    try {
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = {
        conversations: Array.from(this.conversations.values()),
        messages: Array.from(this.messages.values()),
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      logger.warn('[AiConversationService] Could not save local conversations file', { error: err.message });
    }
  }

  async listConversations(studentId) {
    const db = supabaseAdmin || supabaseClient;
    if (db && studentId) {
      try {
        const { data, error } = await db
          .from('ai_conversations')
          .select('*')
          .eq('student_id', studentId)
          .eq('is_archived', false)
          .order('last_message_at', { ascending: false });

        if (!error && Array.isArray(data) && data.length > 0) {
          // Sync into memory
          for (const c of data) {
            this.conversations.set(c.id, c);
          }
          return data;
        }
      } catch (e) {
        logger.debug('[AiConversationService.listConversations] Supabase query fallback', { error: e.message });
      }
    }

    // Fallback to local memory / file store
    const list = Array.from(this.conversations.values())
      .filter((c) => (!studentId || c.student_id === studentId) && !c.is_archived)
      .sort((a, b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at));

    return list;
  }

  async createConversation(studentId, { title = 'New Conversation' } = {}) {
    const id = `conv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const newConv = {
      id,
      student_id: studentId,
      title: title.slice(0, 80),
      is_archived: false,
      last_message_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const db = supabaseAdmin || supabaseClient;
    if (db && studentId) {
      try {
        const { data, error } = await db
          .from('ai_conversations')
          .insert({
            student_id: studentId,
            title: newConv.title,
            is_archived: false,
          })
          .select()
          .single();

        if (!error && data) {
          this.conversations.set(data.id, data);
          this.saveLocalStore();
          return data;
        }
      } catch (e) {
        logger.debug('[AiConversationService.createConversation] Supabase insert fallback', { error: e.message });
      }
    }

    this.conversations.set(id, newConv);
    this.saveLocalStore();
    return newConv;
  }

  async getConversation(conversationId, studentId = null) {
    const db = supabaseAdmin || supabaseClient;
    if (db) {
      try {
        let q = db.from('ai_conversations').select('*').eq('id', conversationId);
        if (studentId) q = q.eq('student_id', studentId);
        const { data, error } = await q.maybeSingle();
        if (!error && data) {
          this.conversations.set(data.id, data);
          return data;
        }
      } catch {}
    }

    const conv = this.conversations.get(conversationId);
    if (!conv) return null;
    if (studentId && conv.student_id !== studentId) return null;
    return conv;
  }

  async getMessages(conversationId) {
    const db = supabaseAdmin || supabaseClient;
    if (db) {
      try {
        const { data, error } = await db
          .from('ai_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        if (!error && Array.isArray(data) && data.length > 0) {
          for (const m of data) {
            this.messages.set(m.id, m);
          }
          return data;
        }
      } catch {}
    }

    return Array.from(this.messages.values())
      .filter((m) => m.conversation_id === conversationId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  async addMessage(conversationId, { role, content, workflowMode = null, workflowLabel = null, metadata = {} }) {
    const id = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const newMsg = {
      id,
      conversation_id: conversationId,
      role,
      content,
      workflow_mode: workflowMode,
      workflow_label: workflowLabel,
      metadata,
      created_at: nowIso,
    };

    const db = supabaseAdmin || supabaseClient;
    if (db) {
      try {
        const { data, error } = await db
          .from('ai_messages')
          .insert({
            conversation_id: conversationId,
            role,
            content,
            workflow_mode: workflowMode,
            workflow_label: workflowLabel,
            metadata,
          })
          .select()
          .single();

        if (!error && data) {
          this.messages.set(data.id, data);
          // Update conversation last_message_at
          await db
            .from('ai_conversations')
            .update({ last_message_at: nowIso, updated_at: nowIso })
            .eq('id', conversationId);

          this.updateConversationMemory(conversationId, nowIso, role, content);
          this.saveLocalStore();
          return data;
        }
      } catch {}
    }

    this.messages.set(id, newMsg);
    this.updateConversationMemory(conversationId, nowIso, role, content);
    this.saveLocalStore();
    return newMsg;
  }

  updateConversationMemory(conversationId, nowIso, role, content) {
    const conv = this.conversations.get(conversationId);
    if (conv) {
      conv.last_message_at = nowIso;
      conv.updated_at = nowIso;
      // If conversation has default title and first user prompt arrives, derive a smart title
      if ((!conv.title || conv.title === 'New Conversation') && role === 'user' && content) {
        const trimmed = content.trim().replace(/^["']|["']$/g, '');
        conv.title = trimmed.length > 40 ? trimmed.substring(0, 37) + '...' : trimmed;
        const db = supabaseAdmin || supabaseClient;
        if (db) {
          db.from('ai_conversations')
            .update({ title: conv.title })
            .eq('id', conversationId)
            .then(() => {})
            .catch(() => {});
        }
      }
    }
  }

  async deleteConversation(conversationId, studentId) {
    const db = supabaseAdmin || supabaseClient;
    if (db && studentId) {
      try {
        await db
          .from('ai_conversations')
          .update({ is_archived: true })
          .eq('id', conversationId)
          .eq('student_id', studentId);
      } catch {}
    }

    const conv = this.conversations.get(conversationId);
    if (conv && (!studentId || conv.student_id === studentId)) {
      conv.is_archived = true;
      this.saveLocalStore();
      return true;
    }
    return false;
  }
}

export const aiConversationService = new AiConversationService();
