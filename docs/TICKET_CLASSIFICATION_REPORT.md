# SmartDesk Ticket Classification & Routing Evaluation Report

**Evaluation Timestamp**: `2026-10-30T11:04:33.311Z`  
**Dataset**: Synthetic Demo Dataset (`D:\smartdesk\SmartDesk_AI_Demo_Data_Pack\SmartDesk_AI_Demo_Data\data\ticket_classification_train.jsonl`)  
**Total Samples**: 43 samples across 16 canonical categories  
**Primary Baseline Model**: `SmartDesk-Baseline-Classifier-v1` (Deterministic TF-IDF Prototype Centroid + Softmax)  
**Transformer Architecture**: `DistilBERT-base-uncased-TicketClassifier` (Status: `Untrained Baseline`, fine-tuning pipeline documented)

---

## 1. Dataset Leakage & Statistical Limitation Audit

- **Leakage Prevention**: Passed (Zero Leakage)
- **Max Cross-Split Token Similarity**: `0.3333` (Threshold: `< 0.60`)
- **Statistical Limitation**: Dataset size (43 samples across 16 categories) is too small for a statistically reliable independent validation/test split without classes having 0 test samples. Reported as a functional demonstration dataset.

---

## 2. Classification Performance Metrics

### Summary (Empirical Results)
| Metric | Test Split (Unseen) | All Demo Samples (16 Classes) |
| :--- | :--- | :--- |
| **Accuracy** | **93.75%** | **97.67%** |
| **Macro Precision** | **90.63%** | **97.92%** |
| **Macro Recall** | **93.75%** | **97.92%** |
| **Macro F1-Score** | **91.67%** | **97.50%** |

### Per-Class Performance Table (All 16 Categories)
| Category Code | Precision | Recall | F1-Score | Support |
| :--- | :--- | :--- | :--- | :--- |
| `IT_ACCESS` | 100.0% | 100.0% | 100.0% | 4 |
| `NETWORK_WIFI` | 100.0% | 66.7% | 80.0% | 3 |
| `LMS_TECHNICAL` | 100.0% | 100.0% | 100.0% | 3 |
| `EXAM_HALL_TICKET` | 100.0% | 100.0% | 100.0% | 3 |
| `EXAM_RESULTS` | 100.0% | 100.0% | 100.0% | 3 |
| `FEE_PAYMENT` | 100.0% | 100.0% | 100.0% | 3 |
| `SCHOLARSHIP` | 100.0% | 100.0% | 100.0% | 2 |
| `ATTENDANCE` | 100.0% | 100.0% | 100.0% | 3 |
| `CERTIFICATE_RECORDS` | 100.0% | 100.0% | 100.0% | 3 |
| `LIBRARY` | 66.7% | 100.0% | 80.0% | 2 |
| `HOSTEL_MAINTENANCE` | 100.0% | 100.0% | 100.0% | 2 |
| `CAMPUS_FACILITIES` | 100.0% | 100.0% | 100.0% | 2 |
| `TRANSPORT` | 100.0% | 100.0% | 100.0% | 3 |
| `GRIEVANCE` | 100.0% | 100.0% | 100.0% | 2 |
| `ADMISSIONS` | 100.0% | 100.0% | 100.0% | 2 |
| `OTHER` | 100.0% | 100.0% | 100.0% | 3 |


---

## 3. Deterministic Routing & Human-Review Verification

| Test Scenario | Department | Priority | Human Review | Routing Mode | Test Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Known IT ticket | `IT` | `P2` | No | Direct | ✅ Passed |
| Fee payment discrepancy | `FEE` | `P1` | ⚠️ Yes | Direct | ✅ Passed |
| Urgent hall ticket issue | `EXAM` | `P1` | ⚠️ Yes | Direct | ✅ Passed |
| Sensitive grievance concern | `STU` | `P1` | ⚠️ Yes | Direct | ✅ Passed |
| Low confidence / Ambiguous inquiry | `STU` | `P3` | ⚠️ Yes | 🔄 Fallback | ✅ Passed |
| Out of domain unknown query | `STU` | `P2` | ⚠️ Yes | 🔄 Fallback | ✅ Passed |


---

## 4. Model Integrity & Non-Authoritative Guard

1. **Non-Authoritative Predictions**: Model predictions only suggest candidate category and confidence score. The deterministic engine in `routing_rules.json` exclusively controls permissions, department dispatch, and priority.
2. **Transformer Fine-Tuning Status (Requirement 3)**:
   - The DistilBERT transformer architecture and training pipeline are implemented in `server/src/ml/transformer/distilbert_trainer.py`.
   - In accordance with Requirement 3, the model is **NOT claimed as fine-tuned** because the dedicated PyTorch training loop was not executed in this session. The reproducible baseline classifier provides active operational predictions.
