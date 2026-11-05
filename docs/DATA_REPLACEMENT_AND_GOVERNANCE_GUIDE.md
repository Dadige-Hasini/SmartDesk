# SmartDesk — Real College Ticket Data Replacement & Privacy Governance Guide

## 1. Executive Summary & Objective

The SmartDesk ticket classification subsystem currently operates on a verified synthetic demonstration dataset (`SmartDesk_AI_Demo_Data/data/ticket_classification_train.jsonl` comprising 43 samples across 16 canonical categories). While this demo dataset demonstrates functional correctness, deterministic routing, and zero-leakage splitting, production deployment requires training on representative, authentic, and high-volume college student inquiry data.

This document establishes the institutional standard operating procedure (SOP) for replacing synthetic ticket records with **real, consented, anonymized, and appropriately protected college student help desk data**, ensuring strict compliance with:
- **FERPA** (Family Educational Rights and Privacy Act)
- **DPDP Act** (Digital Personal Data Protection Act)
- **GDPR** (General Data Protection Regulation / Data Minimization Principles)
- **Institutional Review Board (IRB)** and University Ethics Guidelines

---

## 2. Student Consent & Ethical Data Governance

Real student communications contain personal academic situations, financial struggles, health concerns, and sensitive grievances. Under zero-trust data governance, **raw unconsented student tickets must never be ingested directly into training datasets**.

### 2.1 Consent Acquisition Framework (Opt-In Protocol)
1. **Explicit Granular Opt-In**:
   - On the SmartDesk ticket creation form (`CreateTicketPage.jsx`), an explicit, unbundled checkbox is provided:
     > *"Allow my anonymized inquiry text to be used to train and improve SmartDesk automated college assistance."*
   - The checkbox is **unchecked by default**. Silence, pre-ticked boxes, or inactivity do not constitute valid consent.
2. **Non-Conditioned Service**:
   - Access to student support, response turnaround time, and ticket SLA targets are strictly identical regardless of whether the student consents to AI training.
3. **Right to Withdraw (Erasure / Deletion)**:
   - In accordance with GDPR Article 17 and DPDP Section 12, students may withdraw consent at any time via their Profile Settings (`/settings/privacy`).
   - Withdrawing consent flags the student's historical ticket IDs with `consent_for_training = false`.
   - The automated dataset builder script excludes all records associated with revoked consent, and subsequent fine-tuning checkpoints purge those vectors.

### 2.2 Strict Exclusion of Sensitive Categories
Regardless of whether a student checked the opt-in box, the following categories and inquiry types are **strictly prohibited from ever entering AI training datasets**:
- **Confidential Student Grievances** (`GRIEVANCE` category)
- **Disciplinary Inquiries, Misconduct Reports & Ragging Complaints**
- **Personal Financial Bank Account / Credit Card / Transaction Disclosures**
- **Mental Health, Medical Records, or Special Needs Accommodations**
- **Tickets Marked Confidential** (`is_confidential = true` in PostgreSQL)

---

## 3. PII Scrubbing & Anonymization Pipeline

Before any consented ticket text is aggregated into `.jsonl` training files, it must undergo automated multi-pass redacting and sanitization.

### 3.1 Regular Expression & Pattern Scrubbing
The automated sanitization worker executes the following token replacements:

| Data Element | Raw Sample Pattern | Replacement Token |
| :--- | :--- | :--- |
| **Student Roll Number / PRN** | `2024BCSE0142`, `PRN-998124`, `REG12345` | `[STUDENT_ID]` |
| **Student / Staff Names** | `Alice Johnson`, `Dr. K. Sharma` | `[STUDENT_NAME]`, `[FACULTY_NAME]` |
| **Email Addresses** | `alice@student.college.edu`, `john@gmail.com` | `[EMAIL]` |
| **Phone Numbers** | `+91 9876543210`, `(555) 019-2834` | `[PHONE]` |
| **Fee Receipt / Bank Transaction** | `TXN-88492041`, `UPI-4819204192`, `UTR123456` | `[TRANSACTION_ID]` |
| **Credit / Debit Card Digits** | `4111 2222 3333 4444` | `[REDACTED_FINANCIAL]` |
| **Hall Ticket / Admit Card Number** | `HT-2026-NOV-8812` | `[HALL_TICKET_ID]` |
| **Hostel Room & Bed Allocation** | `Hostel Block B, Room 304, Bed 2` | `[HOSTEL_ROOM]` |

### 3.2 Named Entity Recognition (NER) Secondary Pass
A transformer-based NER model (`spacy` or `flair`) scans the token stream to detect names, physical locations, and specialized identifiers missed by regex heuristics.

### 3.3 Human Quality Assurance Spot-Check
- A data protection officer or authorized privacy auditor performs spot checks on **10% of every candidate training batch**.
- If a single unredacted piece of personally identifiable information (PII) is discovered, the entire candidate batch is quarantined and re-processed.

---

## 4. Dataset Schema & Canonical Taxonomy

The output dataset file must strictly follow the JSON Lines (`.jsonl`) format matching `SmartDesk_AI_Demo_Data/data/ticket_classification_train.jsonl`.

### 4.1 Schema Definition
Each line is a self-contained JSON object:
```json
{
  "id": "tkt-consented-2026-00184",
  "text": "Tuition fee payment debited from NetBanking but ERP portal status remains unpaid. Reference [TRANSACTION_ID].",
  "label": "FEE_PAYMENT",
  "split": "train"
}
```

### 4.2 Formatting Standard
- **Text Formulation**: The input text must represent the student's problem formulation:
  ```javascript
  const sampleText = `${ticket.title.trim()}. ${ticket.description.trim()}`;
  ```
- **Label Consistency**: Labels must strictly match the 16 canonical categories:
  1. `IT_ACCESS`
  2. `NETWORK_WIFI`
  3. `LMS_TECHNICAL`
  4. `EXAM_HALL_TICKET`
  5. `EXAM_RESULTS`
  6. `FEE_PAYMENT`
  7. `SCHOLARSHIP`
  8. `ATTENDANCE`
  9. `CERTIFICATE_RECORDS`
  10. `LIBRARY`
  11. `HOSTEL_MAINTENANCE`
  12. `CAMPUS_FACILITIES`
  13. `TRANSPORT`
  14. `GRIEVANCE`
  15. `ADMISSIONS`
  16. `OTHER`

### 4.3 Recommended Sample Sizes
- **Functional Prototype Baseline**: Current synthetic dataset (43 samples, ~2-4 per class).
- **Target Real-World Dataset**: **1,600 to 3,200 consented, verified samples** (minimum 100 to 200 samples per canonical class).
- **Class Balancing**: Ensure class imbalance ratios do not exceed 3:1 to avoid model bias against low-volume departments (e.g. `LIBRARY` or `TRANSPORT`).

---

## 5. Leakage Prevention & Stratification Standards

To ensure that reported evaluation metrics reflect real-world generalization:
1. **Stratified Split**:
   - 70% Training (`split: "train"`)
   - 15% Validation (`split: "val"`)
   - 15% Test (`split: "test"`)
2. **Zero-Leakage Enforcement**:
   - All splits must use seeded pseudo-random partitioning (`Mulberry32` seed 42).
   - Pairwise cross-split token Jaccard similarity must be computed across all pairs:
     $$\text{Jaccard}(A, B) = \frac{|A \cap B|}{|A \cup B|}$$
   - Any pair with Jaccard similarity $\ge 0.60$ (indicating near-duplicate inquiries across train and test) triggers automated quarantine.

---

## 6. Step-by-Step Replacement Workflow

Follow this procedure to replace the synthetic data pack with real college data:

### Step 1: Export Consented Resolved Tickets from Supabase
Execute the sanitized export query via the backend administration tool:
```sql
SELECT 
  t.id,
  t.title,
  t.description,
  c.code AS label
FROM tickets t
JOIN categories c ON t.category_id = c.id
JOIN profiles p ON t.created_by = p.id
WHERE 
  t.status IN ('RESOLVED', 'CLOSED')
  AND t.is_confidential = false
  AND c.code != 'GRIEVANCE'
  AND p.consent_for_training = true;
```

### Step 2: Run the PII Sanitization CLI
Execute the automated scrubber script:
```bash
node server/scripts/sanitize_real_tickets.js --input raw_export.json --output real_tickets_scrubbed.jsonl
```

### Step 3: Replace Dataset File
Backup the synthetic demo data and copy the scrubbed file into place:
```bash
# Backup demo pack
cp SmartDesk_AI_Demo_Data/data/ticket_classification_train.jsonl SmartDesk_AI_Demo_Data/data/ticket_classification_synthetic_backup.jsonl

# Copy verified real dataset
cp real_tickets_scrubbed.jsonl SmartDesk_AI_Demo_Data/data/ticket_classification_train.jsonl
```

### Step 4: Run Reproducible Evaluation Suite
Execute the automated evaluation runner:
```bash
npm run evaluate:classifier
```
Verify that:
- Total samples is $> 1,000$.
- Leakage test passes (max cross-split similarity $< 0.60$).
- Accuracy, per-class Precision, Recall, and Macro F1 are computed and updated in `docs/TICKET_CLASSIFICATION_REPORT.md`.

### Step 5: (Optional) Fine-Tune Pretrained DistilBERT Transformer
If dedicated GPU compute is available, train the transformer model:
```bash
cd server/src/ml/transformer
pip install -r requirements.txt
python distilbert_trainer.py \
  --data_path ../../../SmartDesk_AI_Demo_Data/data/ticket_classification_train.jsonl \
  --epochs 5 \
  --batch_size 16 \
  --learning_rate 2e-5 \
  --output_dir ./models/distilbert-smartdesk-production
```

### Step 6: Hot-Swap Classifier in Production
Update the environment variable in `server/.env`:
```env
TICKET_CLASSIFIER_MODE=transformer
TRANSFORMER_MODEL_PATH=./models/distilbert-smartdesk-production
```
Or switch dynamically via code:
```javascript
import { ticketClassificationService } from './src/ml/ticket_classification/ticket_classification_service.js';
ticketClassificationService.setClassifier('transformer');
```

### Step 7: Run Regression Tests
Verify that all 174 backend tests and 32 client tests pass:
```bash
npm test
```

---

## 7. Ongoing Performance & Drift Monitoring

1. **Telemetry Ingestion**: Every student classification is logged via `ClassificationAuditLogger` to `ai_interactions` and `audit_events` with scrubbed snippets and confidence scores.
2. **Student Override Tracking**: When a student manually changes the AI-suggested category on `CreateTicketPage.jsx`, an advisory discrepancy metric is recorded in admin analytics to identify emerging category confusion or terminology shifts.
3. **Periodic Re-training**: Re-train every academic semester to adapt to curriculum revisions, new online portal terminology, or updated administrative fee schedules.
