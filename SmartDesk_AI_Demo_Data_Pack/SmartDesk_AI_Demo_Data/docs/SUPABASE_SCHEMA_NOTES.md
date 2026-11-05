# Suggested Supabase schema

Create versioned migrations for:
- departments(id, code unique, name, description, contact_channel, is_active)
- profiles(id references auth.users, role, department_id, account_status)
- ticket_categories(id, code unique, description, default_department_id, default_priority)
- routing_rules(id, category_id, department_id, fallback_department_id, confidence_threshold, requires_human_review)
- sla_policies(id, priority unique, first_response_minutes, resolution_minutes, escalation_minutes, version, is_active)
- tickets(id, public_ticket_number unique, student_id, title, description, category_id, department_id, assigned_staff_id, priority, status, visibility, sla_policy_id, first_response_due_at, resolution_due_at, created_at, updated_at)
- ticket_comments(id, ticket_id, author_id, body, visibility public/internal, created_at)
- ticket_attachments(id, ticket_id, uploader_id, storage_path, mime_type, size_bytes, visibility, created_at)
- knowledge_documents(id, source_id, title, content, category, visibility, approval_status, version, embedding vector(N), updated_at)
- audit_events(id, actor_id, actor_role_snapshot, action, entity_type, entity_id, correlation_id, metadata jsonb, created_at)
- ai_interactions(id, actor_id, ticket_id nullable, redacted_message, intent, confidence, source_ids jsonb, model_name, outcome, created_at)

`N` must be the exact embedding dimension. Apply RLS to every exposed table. Students read only their tickets and public comments. Staff access only authorized department tickets. Restricted grievances need stricter policies. Clients must not insert arbitrary audit events, change roles, or self-assign departments.
