# SmartDesk — System Architecture & Design Document

## 1. System Overview
SmartDesk is an enterprise-grade AI-powered college student help desk application engineered to provide grounded academic, administrative, and logistical assistance. It pairs a Retrieval-Augmented Generation (RAG) assistant with a formal ticketing lifecycle, role-based access control, departmental routing, and SLA tracking.

```mermaid
graph TD
    Client["React Frontend (Vite, Tailwind, TanStack Query)"]
    API["Express.js REST API Server"]
    SupabaseAuth["Supabase Auth (JWT)"]
    SupabaseDB["Supabase PostgreSQL + pgvector"]
    SupabaseStorage["Supabase Storage (Private Buckets)"]
    SupabaseRealtime["Supabase Realtime (WebSocket-free / Subscriptions)"]
    LLMService["AI Service (Gemini / RAG Embeddings)"]
    EmailWorker["Async Email Worker (Nodemailer)"]

    Client -->|HTTPS / API Requests| API
    Client -->|Direct Read Auth/Realtime| SupabaseAuth
    Client -->|Live Updates| SupabaseRealtime

    API -->|Service Role Operations| SupabaseDB
    API -->|Signed URL Generation| SupabaseStorage
    API -->|Vector Retrieval & Citations| SupabaseDB
    API -->|Semantic Completion & Intent| LLMService
    API -->|Asynchronous Dispatch| EmailWorker
```

## 2. Security Boundaries & Authorization Matrix
1. **Student Boundary**:
   - Access limited strictly to own tickets (`created_by = auth.uid()`).
   - May only read public comments on own tickets (`is_internal = false`).
   - May not view other students' tickets, profiles, or uploaded attachments.
2. **Staff Boundary**:
   - Must be approved (`status = 'APPROVED'`).
   - Access restricted to tickets assigned to their department (`department_id`).
   - May create and view internal notes (`is_internal = true`).
   - Confidential grievances restricted to designated Grievance Officers.
3. **Super Admin Boundary**:
   - System-wide governance: approvals, departments, categories, SLAs, system announcements, audit logs.
   - Operations performed strictly via authenticated server-side endpoints with audit logging.
4. **Client-Side Untrusted Role Principle**:
   - Never trust roles from client headers or payloads. All authorization checks verify the user profile record against database records in PostgreSQL via Row Level Security (RLS) and server middleware.

## 3. Ticket Lifecycle State Machine
```mermaid
stateDiagram-v2
    [*] --> OPEN: Student creates ticket
    OPEN --> IN_PROGRESS: Staff claims / assigns
    OPEN --> REJECTED: Staff rejects with documented reason
    IN_PROGRESS --> AWAITING_INFO: Staff requests student details
    AWAITING_INFO --> IN_PROGRESS: Student responds with info
    IN_PROGRESS --> RESOLVED: Staff resolves with summary
    RESOLVED --> CLOSED: Policy auto-close / Student confirms
    RESOLVED --> IN_PROGRESS: Student reopens (once, <= 7 days)
    CLOSED --> [*]
    REJECTED --> [*]
```

## 4. AI & RAG Pipeline Architecture
```mermaid
sequenceDiagram
    autonumber
    actor Student
    participant API as Express API
    participant pgvector as Supabase pgvector
    participant LLM as Server-Side LLM

    Student->>API: POST /api/ai/chat { query, conversationId }
    API->>API: Generate 768-dim query embedding
    API->>pgvector: Cosine similarity match over document_chunks
    pgvector-->>API: Top-K chunks + metadata (title, section, similarity)
    alt Similarity < Threshold (Low Confidence)
        API-->>Student: Grounded Abstention + Offer Ticket Creation
    else High Confidence
        API->>LLM: Grounded prompt (Context + Query + Instruction)
        LLM-->>API: Response with citations
        API-->>Student: Answer + Document Citations + Related FAQs
    end
```

## 5. API Response Envelope Specification
All endpoints adhere to a standardized JSON envelope:
```json
{
  "success": true,
  "message": "Human readable summary of action",
  "data": {}
}
```
In case of error:
```json
{
  "success": false,
  "message": "Clear explanation of the error",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": []
  }
}
```
