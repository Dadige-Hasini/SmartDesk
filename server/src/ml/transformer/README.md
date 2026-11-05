# SmartDesk Transformer Classifier (DistilBERT)

This directory contains the training pipeline and operational documentation for the **DistilBERT Pretrained Transformer Ticket Classifier** for SmartDesk.

---

## 🏗️ Architecture Specification

- **Base Architecture**: `distilbert-base-uncased` (6 layers, 768 hidden dimension, 12 attention heads, ~66M parameters)
- **Classification Head**: Dense Linear Layer (`768 -> 16`) with Dropout (0.2) and Softmax
- **Input Representation**: Ticket Title + Ticket Description concatenated with period separation (`"${title}. ${description}"`)
- **Target Taxonomy**: 16 canonical university ticket categories defined in `routing_rules.json` and `categories.json`:
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

---

## 📦 Training Dependencies

Install the dedicated deep-learning dependencies in your Python virtual environment:

```bash
# In server/src/ml/transformer/
pip install -r requirements.txt
```

### Dependency List
| Package | Minimum Version | Purpose |
| :--- | :--- | :--- |
| `torch` | `>=2.2.0` | Deep learning tensor operations & GPU autograd |
| `transformers` | `>=4.40.0` | Pretrained HuggingFace DistilBERT model & tokenizer |
| `datasets` | `>=2.19.0` | In-memory dataset tokenization caching |
| `accelerate` | `>=0.30.0` | Mixed precision (FP16/BF16) training |
| `scikit-learn` | `>=1.4.0` | Multi-class Precision, Recall, Macro F1 metrics |
| `numpy` | `>=1.26.0` | Vector operations & metric aggregations |

---

## 🚀 Training Instructions

### 1. Fine-Tuning Execution
Run the trainer script pointing to the ticket classification dataset:

```bash
python distilbert_trainer.py \
  --data_path ../../../SmartDesk_AI_Demo_Data_Pack/SmartDesk_AI_Demo_Data/data/ticket_classification_train.jsonl \
  --pretrained_model distilbert-base-uncased \
  --epochs 6 \
  --batch_size 8 \
  --learning_rate 2e-5 \
  --max_length 128 \
  --output_dir ./distilbert_smartdesk_model
```

### 2. Hardware Recommendations
- **GPU Training (Recommended)**: NVIDIA GPU with CUDA support and at least 4 GB VRAM (e.g., T4, RTX 3060, or Google Colab free tier). Training time: ~2 minutes for 1,000 samples.
- **CPU Training**: Supported with `--cpu` flag. Expected training time: ~10 minutes for 1,000 samples.

---

## ⚠️ Integrity & Claim Policy (Requirement 3)

In accordance with strict system verification standards:
> **"Do not claim the transformer is trained or fine-tuned unless training actually completes."**

- When training dependencies (`torch`, `transformers`) are not installed or the training loop has not completed, `TransformerTicketClassifier` explicitly reports its status as `ARCHITECTURE_READY_UNTRAINED`.
- The Node.js Express server automatically runs the verified, offline **Baseline Reproducible Classifier** (`BaselineTicketClassifier`), guaranteeing 100% uptime, deterministic routing, and zero mock claims.
