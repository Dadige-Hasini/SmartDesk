import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config/env.js';
import { supabaseAdmin, isSupabaseAdminConfigured } from '../src/config/supabase.js';
import { logger } from '../src/utils/logger.js';
import { embeddingService } from '../src/services/ai/embedding.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Locate the SmartDesk demo data directory across common workspace layouts
 */
export function findDemoDataDir() {
  const candidates = [
    path.resolve(__dirname, '../../SmartDesk_AI_Demo_Data/data'),
    path.resolve(__dirname, '../../SmartDesk_AI_Demo_Data_Pack/SmartDesk_AI_Demo_Data/data'),
    path.resolve(process.cwd(), 'SmartDesk_AI_Demo_Data/data'),
    path.resolve(process.cwd(), 'SmartDesk_AI_Demo_Data_Pack/SmartDesk_AI_Demo_Data/data'),
    path.resolve(process.cwd(), '../SmartDesk_AI_Demo_Data/data'),
    path.resolve(process.cwd(), '../SmartDesk_AI_Demo_Data_Pack/SmartDesk_AI_Demo_Data/data'),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'departments.json'))) {
      return dir;
    }
  }

  throw new Error(`Demo data directory not found. Checked: \n${candidates.join('\n')}`);
}

/**
 * Read and parse JSON demo file safely
 */
function readJsonFile(dir, fileName) {
  const filePath = path.join(dir, fileName);
  if (!fs.existsSync(filePath)) {
    logger.warn(`Demo data file missing: ${fileName}`);
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Main idempotent seed runner
 */
export async function seedDemoPack(options = {}) {
  const {
    dataDir = findDemoDataDir(),
    client = supabaseAdmin,
    generateEmbeddings = false,
    verbose = true,
  } = options;

  if (verbose) {
    logger.info(`[Seed] Starting demo pack import from: ${dataDir}`);
  }

  const results = {
    departments: 0,
    categories: 0,
    routingRules: 0,
    slaPolicies: 0,
    faqs: 0,
    knowledgeDocuments: 0,
    demoTickets: 0,
    auditEvents: 0,
    isLiveSupabase: false,
    errors: [],
  };

  const isLive = isSupabaseAdminConfigured() && client;
  results.isLiveSupabase = Boolean(isLive);

  // 1. Seed Departments
  const rawDepartments = readJsonFile(dataDir, 'departments.json');
  const departmentsMap = new Map();

  const formattedDepts = rawDepartments.map((dept) => ({
    name: dept.name,
    code: dept.code,
    description: dept.description,
    is_active: true,
  }));

  if (isLive) {
    try {
      const { data, error } = await client
        .from('departments')
        .upsert(formattedDepts, { onConflict: 'code' })
        .select('id, code, name');

      if (error) {
        results.errors.push({ step: 'departments', message: error.message });
      } else if (data) {
        data.forEach((d) => departmentsMap.set(d.code, d.id));
        results.departments = data.length;
      }
    } catch (err) {
      results.errors.push({ step: 'departments', message: err.message });
    }
  } else {
    results.departments = formattedDepts.length;
  }

  // 2. Seed Categories
  const rawCategories = readJsonFile(dataDir, 'categories.json');
  const categoriesMap = new Map();

  const formattedCategories = rawCategories.map((cat) => {
    const formattedName = cat.code
      .split('_')
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ');

    return {
      name: formattedName,
      code: cat.code,
      description: Array.isArray(cat.examples) ? cat.examples.join(', ') : '',
      is_active: true,
    };
  });

  if (isLive) {
    try {
      const { data, error } = await client
        .from('categories')
        .upsert(formattedCategories, { onConflict: 'code' })
        .select('id, code, name');

      if (error) {
        results.errors.push({ step: 'categories', message: error.message });
      } else if (data) {
        data.forEach((c) => categoriesMap.set(c.code, c.id));
        results.categories = data.length;
      }
    } catch (err) {
      results.errors.push({ step: 'categories', message: err.message });
    }
  } else {
    results.categories = formattedCategories.length;
  }

  // 3. Seed Routing Rules
  const rawRoutingRules = readJsonFile(dataDir, 'routing_rules.json');
  const formattedRules = [];

  for (const rule of rawRoutingRules) {
    const categoryId = departmentsMap.size > 0 ? categoriesMap.get(rule.category) : null;
    const departmentId = departmentsMap.size > 0 ? departmentsMap.get(rule.department) : null;
    const fallbackId = departmentsMap.size > 0 && rule.fallback_department ? departmentsMap.get(rule.fallback_department) : null;

    formattedRules.push({
      rule_id: rule.rule_id,
      category_id: categoryId || 'c1000000-0000-0000-0000-000000000001',
      default_department_id: departmentId || '11111111-1111-1111-1111-111111111111',
      default_priority: rule.priority || 'Medium',
      confidence_threshold: rule.confidence_threshold || 0.7,
      fallback_department_id: fallbackId,
      human_review: Boolean(rule.human_review),
      is_active: true,
    });
  }

  if (isLive && departmentsMap.size > 0 && categoriesMap.size > 0) {
    try {
      const validRules = formattedRules.filter((r) => r.category_id && r.default_department_id);
      const { data, error } = await client
        .from('category_routing_rules')
        .upsert(validRules, { onConflict: 'rule_id' })
        .select('id');

      if (error) {
        results.errors.push({ step: 'routing_rules', message: error.message });
      } else {
        results.routingRules = data ? data.length : validRules.length;
      }
    } catch (err) {
      results.errors.push({ step: 'routing_rules', message: err.message });
    }
  } else {
    results.routingRules = formattedRules.length;
  }

  // 4. Seed SLA Policies
  const rawSlaPolicies = readJsonFile(dataDir, 'sla_policies.json');
  const formattedSlas = rawSlaPolicies.map((sla) => {
    // Map P1-P4 to hours
    const resHours = sla.resolution_hours || (sla.priority === 'P1' ? 8 : sla.priority === 'P2' ? 24 : sla.priority === 'P3' ? 72 : 120);
    const respHours = sla.first_response_minutes ? Math.max(1, Math.round(sla.first_response_minutes / 60)) : 4;

    return {
      priority: sla.priority,
      name: sla.name,
      response_time_hours: respHours,
      resolution_time_hours: resHours,
      first_response_minutes: sla.first_response_minutes,
      resolution_hours: sla.resolution_hours,
      escalate_hours: sla.escalate_hours,
      is_active: true,
    };
  });

  if (isLive) {
    try {
      const { data, error } = await client
        .from('sla_policies')
        .upsert(formattedSlas, { onConflict: 'priority' })
        .select('id');

      if (error) {
        results.errors.push({ step: 'sla_policies', message: error.message });
      } else {
        results.slaPolicies = data ? data.length : formattedSlas.length;
      }
    } catch (err) {
      results.errors.push({ step: 'sla_policies', message: err.message });
    }
  } else {
    results.slaPolicies = formattedSlas.length;
  }

  // 5. Seed Canonical FAQs
  const rawFaqs = readJsonFile(dataDir, 'faqs.json');
  const formattedFaqs = [];

  for (const faq of rawFaqs) {
    const categoryId = categoriesMap.get(faq.category) || null;
    let embedding = null;

    if (generateEmbeddings) {
      try {
        embedding = await embeddingService.embedText(`${faq.question} ${faq.answer}`);
      } catch (err) {
        // Fallback to deterministic
        embedding = embeddingService.generateDeterministicVector(`${faq.question} ${faq.answer}`);
      }
    }

    formattedFaqs.push({
      faq_code: faq.faq_id,
      question: faq.question,
      answer: faq.answer,
      category_id: categoryId,
      source_document: faq.source_document,
      status: faq.approval_status === 'APPROVED_DEMO' ? 'PUBLISHED' : 'DRAFT',
      visibility: faq.visibility === 'STUDENT' ? 'PUBLIC' : 'STAFF_ONLY',
      version: 1,
      is_published: true,
      embedding,
    });
  }

  if (isLive) {
    try {
      const { data, error } = await client
        .from('faqs')
        .upsert(formattedFaqs, { onConflict: 'faq_code' })
        .select('id');

      if (error) {
        results.errors.push({ step: 'faqs', message: error.message });
      } else {
        results.faqs = data ? data.length : formattedFaqs.length;
      }
    } catch (err) {
      results.errors.push({ step: 'faqs', message: err.message });
    }
  } else {
    results.faqs = formattedFaqs.length;
  }

  // 6. Seed Knowledge Documents
  const rawKDocs = readJsonFile(dataDir, 'knowledge_documents.json');
  const formattedDocs = rawKDocs.map((doc) => ({
    document_code: doc.document_id,
    title: doc.title,
    content: doc.content,
    file_type: 'TXT',
    category_id: categoriesMap.get(doc.category) || null,
    version: 1,
    is_approved: doc.approval_status === 'APPROVED_DEMO',
    is_active: true,
    status: 'ACTIVE',
    visibility: doc.visibility === 'STUDENT' ? 'PUBLIC' : 'STAFF_ONLY',
  }));

  if (isLive) {
    try {
      const { data, error } = await client
        .from('knowledge_documents')
        .upsert(formattedDocs, { onConflict: 'document_code' })
        .select('id');

      if (error) {
        results.errors.push({ step: 'knowledge_documents', message: error.message });
      } else {
        results.knowledgeDocuments = data ? data.length : formattedDocs.length;
      }
    } catch (err) {
      results.errors.push({ step: 'knowledge_documents', message: err.message });
    }
  } else {
    results.knowledgeDocuments = formattedDocs.length;
  }

  // 7. Seed Demo Tickets
  const rawTickets = readJsonFile(dataDir, 'demo_tickets.json');
  const formattedTickets = rawTickets.map((t) => ({
    demo_id: t.demo_id,
    title: t.title,
    description: `Demo student inquiry for ${t.category}: ${t.title}. Submitted by demo reference ${t.student_ref}.`,
    priority: t.priority === 'P1' ? 'High' : t.priority === 'P2' ? 'Medium' : 'Low',
    status: t.status || 'OPEN',
    is_confidential: t.visibility === 'RESTRICTED' || t.category === 'GRIEVANCE',
  }));

  results.demoTickets = formattedTickets.length;

  // 8. Seed Audit Events
  const rawAudit = readJsonFile(dataDir, 'audit_events.json');
  const formattedAudit = rawAudit.map((a) => ({
    event_id: a.event_id,
    actor: a.actor,
    role: a.role,
    action: a.action,
    entity: a.entity,
    timestamp: a.timestamp,
    metadata: a.metadata || {},
  }));

  if (isLive) {
    try {
      const { data, error } = await client
        .from('audit_events')
        .upsert(formattedAudit, { onConflict: 'event_id' })
        .select('id');

      if (error) {
        results.errors.push({ step: 'audit_events', message: error.message });
      } else {
        results.auditEvents = data ? data.length : formattedAudit.length;
      }
    } catch (err) {
      results.errors.push({ step: 'audit_events', message: err.message });
    }
  } else {
    results.auditEvents = formattedAudit.length;
  }

  if (verbose) {
    logger.info('[Seed] Demo pack seed complete:', {
      departments: results.departments,
      categories: results.categories,
      routingRules: results.routingRules,
      slaPolicies: results.slaPolicies,
      faqs: results.faqs,
      knowledgeDocuments: results.knowledgeDocuments,
      demoTickets: results.demoTickets,
      auditEvents: results.auditEvents,
      errorsCount: results.errors.length,
      mode: isLive ? 'Remote Supabase DB' : 'Local File / Memory Resilience Mode',
    });
  }

  return results;
}

// Direct CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDemoPack()
    .then((res) => {
      console.log('✅ Demo pack seed script finished successfully!');
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Demo pack seed failed:', err);
      process.exit(1);
    });
}
