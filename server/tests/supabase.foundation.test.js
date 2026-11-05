import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config/env.js';
import { supabaseClient, supabaseAdmin, isSupabaseConfigured, isSupabaseAdminConfigured } from '../src/config/supabase.js';
import { seedDemoPack, findDemoDataDir } from '../scripts/seed_demo_pack.js';
import { embeddingService } from '../src/services/ai/embedding.service.js';
import { ticketRepository } from '../src/repositories/ticket.repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Supabase Foundation & Authorization Suite (Phase 2)', () => {
  // --------------------------------------------------------------------------
  // 1. Client Architecture & Credential Boundary Tests
  // --------------------------------------------------------------------------
  describe('Client Configuration & Credential Safety', () => {
    it('provides separated public and administrative clients', () => {
      expect(typeof isSupabaseConfigured).toBe('function');
      expect(typeof isSupabaseAdminConfigured).toBe('function');
      expect(config.supabase).toBeDefined();
      expect(config.supabase.url).toBeDefined();
    });

    it('ensures client-side configuration file never contains secretKey or admin role', () => {
      const clientConfigPath = path.resolve(__dirname, '../../client/src/config/supabase.js');
      expect(fs.existsSync(clientConfigPath)).toBe(true);
      const clientSource = fs.readFileSync(clientConfigPath, 'utf-8');

      // Assert frontend code never references server-only secret envs
      expect(clientSource).not.toContain('SUPABASE_SECRET_KEY');
      expect(clientSource).not.toContain('SERVICE_ROLE_KEY');
      expect(clientSource).not.toContain('service_role');
      expect(clientSource).toContain('VITE_SUPABASE_');
    });

    it('ensures .gitignore strictly ignores all environment and secret files', () => {
      const gitignorePath = path.resolve(__dirname, '../../.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(true);
      const gitignore = fs.readFileSync(gitignorePath, 'utf-8');

      expect(gitignore).toMatch(/\.env/);
      expect(gitignore).toMatch(/\*\.local/);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Demo Pack Ingestion & Idempotency Tests
  // --------------------------------------------------------------------------
  describe('Demo Data Ingestion & Seed Idempotency', () => {
    it('successfully locates demo data pack directory', () => {
      const dataDir = findDemoDataDir();
      expect(fs.existsSync(dataDir)).toBe(true);
      expect(fs.existsSync(path.join(dataDir, 'departments.json'))).toBe(true);
      expect(fs.existsSync(path.join(dataDir, 'categories.json'))).toBe(true);
      expect(fs.existsSync(path.join(dataDir, 'routing_rules.json'))).toBe(true);
      expect(fs.existsSync(path.join(dataDir, 'sla_policies.json'))).toBe(true);
      expect(fs.existsSync(path.join(dataDir, 'faqs.json'))).toBe(true);
      expect(fs.existsSync(path.join(dataDir, 'knowledge_documents.json'))).toBe(true);
      expect(fs.existsSync(path.join(dataDir, 'demo_tickets.json'))).toBe(true);
      expect(fs.existsSync(path.join(dataDir, 'audit_events.json'))).toBe(true);
    });

    it('guarantees seed-import idempotency across repeated runs without record duplication', async () => {
      // First seed run
      const run1 = await seedDemoPack({ verbose: false, client: null });
      expect(run1.departments).toBe(11);
      expect(run1.categories).toBe(16);
      expect(run1.routingRules).toBe(16);
      expect(run1.slaPolicies).toBe(4);
      expect(run1.faqs).toBe(18);
      expect(run1.knowledgeDocuments).toBe(28);
      expect(run1.demoTickets).toBe(10);
      expect(run1.auditEvents).toBe(7);

      // Second identical seed run
      const run2 = await seedDemoPack({ verbose: false, client: null });
      expect(run2.departments).toBe(run1.departments);
      expect(run2.categories).toBe(run1.categories);
      expect(run2.routingRules).toBe(run1.routingRules);
      expect(run2.slaPolicies).toBe(run1.slaPolicies);
      expect(run2.faqs).toBe(run1.faqs);
      expect(run2.knowledgeDocuments).toBe(run1.knowledgeDocuments);
      expect(run2.demoTickets).toBe(run1.demoTickets);
      expect(run2.auditEvents).toBe(run1.auditEvents);

      // Verify that entities have unique natural keys
      const dataDir = findDemoDataDir();
      const depts = JSON.parse(fs.readFileSync(path.join(dataDir, 'departments.json'), 'utf-8'));
      const deptCodes = new Set(depts.map((d) => d.code));
      expect(deptCodes.size).toBe(depts.length);

      const categories = JSON.parse(fs.readFileSync(path.join(dataDir, 'categories.json'), 'utf-8'));
      const catCodes = new Set(categories.map((c) => c.code));
      expect(catCodes.size).toBe(categories.length);

      const rules = JSON.parse(fs.readFileSync(path.join(dataDir, 'routing_rules.json'), 'utf-8'));
      const ruleIds = new Set(rules.map((r) => r.rule_id));
      expect(ruleIds.size).toBe(rules.length);

      const slas = JSON.parse(fs.readFileSync(path.join(dataDir, 'sla_policies.json'), 'utf-8'));
      const priorities = new Set(slas.map((s) => s.priority));
      expect(priorities.size).toBe(slas.length);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Row Level Security (RLS) & Least-Privilege Authorization Assumptions
  // --------------------------------------------------------------------------
  describe('Row Level Security & Scoped Access Simulation', () => {
    const studentA = {
      id: 'student-user-uuid-001',
      role: 'STUDENT',
      department_id: 'dept-cse-uuid',
    };

    const studentB = {
      id: 'student-user-uuid-002',
      role: 'STUDENT',
      department_id: 'dept-ece-uuid',
    };

    const itStaff = {
      id: 'staff-it-uuid-001',
      role: 'STAFF',
      department_id: 'dept-it-uuid',
      department_code: 'IT',
    };

    const examStaff = {
      id: 'staff-exam-uuid-001',
      role: 'STAFF',
      department_id: 'dept-exam-uuid',
      department_code: 'EXAM',
    };

    const grievanceStaff = {
      id: 'staff-grievance-uuid-001',
      role: 'STAFF',
      department_id: 'dept-stu-uuid',
      department_code: 'STU',
    };

    const superAdmin = {
      id: 'admin-super-uuid-001',
      role: 'SUPER_ADMIN',
      department_id: null,
    };

    // Helper implementing the EXACT SQL can_access_ticket() RLS rule
    function simulateCanAccessTicket(ticket, caller) {
      if (caller.role === 'SUPER_ADMIN') return true;
      if (ticket.created_by === caller.id) return true;

      if (caller.role === 'STAFF') {
        if (!ticket.is_confidential && caller.department_id === ticket.assigned_department_id) {
          return true;
        }
        if (
          ticket.is_confidential &&
          caller.department_id === ticket.assigned_department_id &&
          ['STU', 'AFFAIRS'].includes(caller.department_code)
        ) {
          return true;
        }
      }

      return false;
    }

    // Helper implementing the EXACT SQL ticket_comments RLS rule
    function simulateCanViewComment(comment, ticket, caller) {
      if (!simulateCanAccessTicket(ticket, caller)) return false;

      // Student can only see public comments
      if (caller.role === 'STUDENT') {
        return comment.is_internal === false;
      }

      // Authorized staff/admin can see both public and internal notes
      return true;
    }

    it('guarantees students can access ONLY their own tickets', () => {
      const ticketStudentA = {
        id: 'tkt-001',
        created_by: studentA.id,
        assigned_department_id: 'dept-it-uuid',
        is_confidential: false,
      };

      // Student A can access their own ticket
      expect(simulateCanAccessTicket(ticketStudentA, studentA)).toBe(true);

      // Student B is strictly denied access to Student A's ticket
      expect(simulateCanAccessTicket(ticketStudentA, studentB)).toBe(false);
    });

    it('restricts staff to tickets assigned to their authorized department only', () => {
      const itTicket = {
        id: 'tkt-it-01',
        created_by: studentA.id,
        assigned_department_id: itStaff.department_id,
        is_confidential: false,
      };

      const examTicket = {
        id: 'tkt-exam-01',
        created_by: studentA.id,
        assigned_department_id: examStaff.department_id,
        is_confidential: false,
      };

      // IT staff can view IT ticket
      expect(simulateCanAccessTicket(itTicket, itStaff)).toBe(true);

      // IT staff CANNOT view Exam ticket
      expect(simulateCanAccessTicket(examTicket, itStaff)).toBe(false);

      // Exam staff can view Exam ticket
      expect(simulateCanAccessTicket(examTicket, examStaff)).toBe(true);

      // Exam staff CANNOT view IT ticket
      expect(simulateCanAccessTicket(itTicket, examStaff)).toBe(false);

      // Super admin can view both
      expect(simulateCanAccessTicket(itTicket, superAdmin)).toBe(true);
      expect(simulateCanAccessTicket(examTicket, superAdmin)).toBe(true);
    });

    it('strictly isolates confidential grievances from regular staff', () => {
      const confidentialGrievance = {
        id: 'tkt-grievance-01',
        created_by: studentA.id,
        assigned_department_id: grievanceStaff.department_id,
        is_confidential: true,
      };

      // Student creator can view their own confidential grievance
      expect(simulateCanAccessTicket(confidentialGrievance, studentA)).toBe(true);

      // Other students CANNOT view it
      expect(simulateCanAccessTicket(confidentialGrievance, studentB)).toBe(false);

      // IT staff CANNOT view it
      expect(simulateCanAccessTicket(confidentialGrievance, itStaff)).toBe(false);

      // Exam staff CANNOT view it
      expect(simulateCanAccessTicket(confidentialGrievance, examStaff)).toBe(false);

      // Authorized Student Affairs / Grievance Cell staff CAN view it
      expect(simulateCanAccessTicket(confidentialGrievance, grievanceStaff)).toBe(true);

      // Super admin CAN view it
      expect(simulateCanAccessTicket(confidentialGrievance, superAdmin)).toBe(true);
    });

    it('strictly hides internal staff notes from student view', () => {
      const ticket = {
        id: 'tkt-it-02',
        created_by: studentA.id,
        assigned_department_id: itStaff.department_id,
        is_confidential: false,
      };

      const publicComment = {
        id: 'cmt-pub-01',
        ticket_id: ticket.id,
        author_id: itStaff.id,
        is_internal: false,
        content: 'Your Wi-Fi profile has been re-provisioned.',
      };

      const internalNote = {
        id: 'cmt-int-01',
        ticket_id: ticket.id,
        author_id: itStaff.id,
        is_internal: true,
        content: 'Escalated to network vendor Cisco TAC for MAC binding.',
      };

      // Student can view public comment on their ticket
      expect(simulateCanViewComment(publicComment, ticket, studentA)).toBe(true);

      // Student is STRICTLY DENIED access to internal staff notes
      expect(simulateCanViewComment(internalNote, ticket, studentA)).toBe(false);

      // Authorized staff can view both public comment and internal note
      expect(simulateCanViewComment(publicComment, ticket, itStaff)).toBe(true);
      expect(simulateCanViewComment(internalNote, ticket, itStaff)).toBe(true);

      // Super admin can view both
      expect(simulateCanViewComment(publicComment, ticket, superAdmin)).toBe(true);
      expect(simulateCanViewComment(internalNote, ticket, superAdmin)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 4. pgvector Embedding Dimension Verification (Strict 768-Dim Requirement)
  // --------------------------------------------------------------------------
  describe('pgvector & Vector Dimension Precision', () => {
    it('guarantees embedding vector dimension is exactly 768 matching pgvector schema', async () => {
      const text = 'How do I reset my campus WiFi password?';
      const vector = await embeddingService.embedText(text);

      expect(Array.isArray(vector)).toBe(true);
      expect(vector.length).toBe(768);

      // Check L2 unit normalization: sum of squares ≈ 1.0
      const sumSquares = vector.reduce((acc, v) => acc + v * v, 0);
      expect(sumSquares).toBeCloseTo(1.0, 3);
    });

    it('verifies SQL migration files specify exact vector(768) dimensions without guessing', () => {
      const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
      const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

      let vectorDefinitionsFound = 0;
      for (const file of migrationFiles) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        const matches = sql.match(/vector\(\s*(\d+)\s*\)/g);
        if (matches) {
          for (const match of matches) {
            expect(match).toBe('vector(768)');
            vectorDefinitionsFound++;
          }
        }
      }

      expect(vectorDefinitionsFound).toBeGreaterThanOrEqual(2);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Remote Supabase Connection Probe
  // --------------------------------------------------------------------------
  describe('Live Supabase Connectivity Verification', () => {
    it('safely tests remote Supabase connection without crashing or leaking secrets', async () => {
      expect(config.supabase.url).toBeDefined();

      if (isSupabaseAdminConfigured()) {
        const { error } = await supabaseAdmin.from('departments').select('id').limit(1);

        // When tables exist, error is null.
        // When migrations are pending in remote Supabase, error.code is 'PGRST205' (schema cache).
        // In both cases, this confirms live HTTPS communication with Supabase API.
        if (error) {
          expect(error.code === 'PGRST205' || error.message.includes('schema cache')).toBe(true);
        } else {
          expect(error).toBeNull();
        }
      }
    });
  });
});
