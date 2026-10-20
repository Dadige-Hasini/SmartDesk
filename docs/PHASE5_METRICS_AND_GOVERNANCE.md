# SmartDesk Phase 5: Staff & Super Admin Portals, Metrics & Governance

## 1. Overview
Phase 5 introduces the administrative and departmental triage tier of **SmartDesk — AI-Powered College Student Help Desk**. It establishes departmental queue isolation, multi-factor sorting, administrative controls, server-side scheduled SLA enforcement, and real-time operational analytics for Staff and Super Administrators.

---

## 2. Metric Formulas & Edge-Case Treatment

### 2.1. Average Response Time
- **Definition**: The average elapsed time (in decimal hours) from ticket creation until the first public reply or internal triage note by an assigned department staff member or administrator.
- **Formula**:
  $$\text{Avg Response Time} = \frac{\sum_{i=1}^{N_{\text{responded}}} (T_{\text{first\_response}, i} - T_{\text{created}, i})}{N_{\text{responded}}}$$
- **Unanswered Tickets**: Tickets awaiting their first staff response are excluded from the historical response-time denominator but are prominently highlighted in the department queue via urgency indicators.

### 2.2. Average Resolution Time
- **Definition**: The average active duration required to investigate and resolve student issues.
- **Formula**:
  $$\text{Avg Resolution Time} = \frac{\sum_{i=1}^{N_{\text{resolved}}} \Delta T_{\text{active\_resolution}, i}}{N_{\text{resolved}}}$$
- **Treatment of Paused SLAs (`AWAITING_INFO`)**:
  When a staff member transitions a ticket to `AWAITING_INFO` (e.g. requesting fee payment receipts, identity cards, or laboratory records), the SLA countdown timer is paused. 
  $$\Delta T_{\text{active\_resolution}} = (T_{\text{resolved}} - T_{\text{created}}) - \sum \Delta T_{\text{awaiting\_info}}$$
  Staff resolution metrics are never penalized for delays caused by student response lag.
- **Treatment of Reopened Tickets**:
  Students are permitted one reopening within 7 calendar days of resolution. When reopened:
  - The ticket status returns to `OPEN`.
  - A new response deadline is assigned.
  - The total active resolution duration tracks cumulative triage time through the final subsequent resolution.
- **Treatment of Unresolved Tickets**:
  Tickets in `OPEN`, `IN_PROGRESS`, or `AWAITING_INFO` states are not counted in the completed resolution time average. Instead, they are monitored in real time against their SLA deadlines.

### 2.3. SLA Compliance Rate
- **Definition**: The percentage of resolved tickets whose resolution timestamp fell on or before the calculated SLA deadline.
- **Formula**:
  $$\text{SLA Compliance Rate (\%)} = \frac{N_{\text{resolved on or before SLA deadline}}}{N_{\text{total resolved}}} \times 100\%$$

### 2.4. Student Satisfaction Rating
- **Definition**: The arithmetic mean of 1-to-5 star ratings submitted by students upon ticket resolution.
- **Formula**:
  $$\text{Average Satisfaction} = \frac{\sum_{i=1}^{N_{\text{ratings}}} \text{Rating}_i}{N_{\text{ratings}}}$$

---

## 3. Server-Side Scheduled SLA Watchdog Engine

### 3.1. Architecture
The SLA watchdog (`server/src/workers/sla.worker.js`) runs autonomously on the Express backend as a persistent background daemon. **It does not depend on a browser session being open.**

### 3.2. Execution Cycle (Every 30 Seconds)
1. **Detection**: Queries all non-terminal tickets (`status NOT IN ('RESOLVED', 'CLOSED', 'REJECTED')`) where `sla_due_at < NOW()` and `is_overdue = false`.
2. **Breach Flagging**: Atomically updates the database:
   - `is_overdue = true`
   - `sla_breached_at = NOW()`
3. **Audit Event**: Records an immutable audit event in `ticket_events` noting the breach timestamp and reason.
4. **Staff Alerting**: 
   - Dispatches an in-app notification to the assigned staff member.
   - Enqueues an urgent transactional email job via `EmailService.queueTicketEmail` with `[OVERDUE ALERT]` subject line.

---

## 4. Administrative Security, RBAC & Departmental Isolation

### 4.1. Server-Side Role Enforcement
All Phase 5 endpoints are protected at the route level:
- `/api/staff/*`: Guarded by `requireRole('STAFF', 'SUPER_ADMIN')`.
- `/api/admin/*`: Strictly guarded by `requireRole('SUPER_ADMIN')`.
- Any attempt by a `STUDENT` to invoke administrative or staff routes returns `HTTP 403 Forbidden` (`FORBIDDEN_INSUFFICIENT_PERMISSIONS`).

### 4.2. Departmental Isolation
- Staff members can only query and triage tickets matching their assigned `department_id`.
- Attempts by staff to claim, reassign, or inspect tickets belonging to an unauthorized department are blocked with `HTTP 403 Forbidden`.

### 4.3. Mandatory Reason Enforcement for Sensitive Actions
- Suspending a staff account (`PUT /api/admin/staff/:id/status` with `status: 'SUSPENDED'`) requires a non-empty `reason` string (minimum 5 characters).
- All staff status mutations, department edits, category updates, SLA changes, and announcement deletions are recorded in `admin_audit_logs` with the acting Super Admin ID, timestamp, target, and IP address.

---

## 5. UI/UX & Responsive Visualizations
- **Recharts Integration**:
  - 14-day Tickets Over Time multi-line chart (`ticketsOverTime`).
  - Departmental Category Distribution pie chart (`categoryDistribution`).
  - Status Breakdown donut chart (`statusBreakdown`).
- **Mobile Compatibility**:
  - All charts wrapped in `<ResponsiveContainer width="100%" height={...}>`.
  - Responsive tables with horizontal scroll wrappers and sticky action columns.
  - Multi-select bulk assignment banner with mobile-friendly action buttons.
- **Accessibility & Contrast**:
  - Full support for Deep Navy dark mode and light mode via CSS variables.
  - ARIA attributes, semantic markup, and distinguishable status/priority badges.
