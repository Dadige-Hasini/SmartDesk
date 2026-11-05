# SmartDesk AI Demo Data Pack

All records are synthetic demonstration data. They are not official college policy, verified contact details, or production SLA commitments. Replace with approved institution-specific content before deployment.

## Data files
- `departments.json`: routing destinations.
- `categories.json`: categories, examples and default departments/priorities.
- `routing_rules.json`: deterministic routing, confidence thresholds and human-review flags.
- `sla_policies.json`: demo response/resolution/escalation targets.
- `faqs.json`: 18 student FAQs with source IDs and visibility.
- `policies.json`: grounding, ticket confirmation, routing, authorization, audit, privacy, SLA and file safety.
- `resolution_playbooks.json`: issue-specific troubleshooting steps.
- `ticket_classification_train.jsonl`: synthetic labeled examples for a classifier smoke test.
- `demo_tickets.json`: demo ticket states and routing.
- `audit_events.json`: example audit events.
- `conversation_examples.json`: assistant dialogue and expected workflow.
- `knowledge_documents.json`: normalized FAQ/policy records ready for chunking and embedding.
- CSV files are provided for quick inspection in a spreadsheet.

## Suggested AI design
1. LLM: a server-side LLM API handles conversation, explanation and structured tool-call proposals.
2. RAG: embed approved knowledge documents; retrieve only current and role-authorized chunks; cite source IDs. Abstain if evidence is missing or conflicting.
3. Deep learning: use a pretrained transformer classifier or sentence-transformer embeddings plus a classifier for ticket intent/category. The provided synthetic examples are small and must not be used to claim reliable model accuracy. Create a held-out test set and report per-class precision, recall and F1.
4. Routing and SLA: apply JSON rules in deterministic backend logic. Model outputs are suggestions, not authority. Sensitive grievances, exam deadlines and fee issues need human review.
5. Audit: append events for ticket creation, assignment, status changes, AI suggestions accepted/rejected, SLA warnings, escalations and knowledge approvals. Never log passwords, tokens, OTPs or unnecessary sensitive content.
6. Security: secrets stay server-side; students only see their tickets and public comments; internal notes and restricted grievances must be filtered by backend authorization.

## Supabase notes
Use reviewed migrations for tables, RLS, indexes and functions. Enable pgvector and make the vector column dimension match the exact embedding model output. Use the same embedding model for documents and queries. Do not use demo student references as real `auth.users` IDs; map them to test accounts you create.
