#!/usr/bin/env python3
"""
SmartDesk DistilBERT Ticket Classifier Fine-Tuning Pipeline
-----------------------------------------------------------
This script trains and evaluates a pretrained DistilBERT transformer
(distilbert-base-uncased) on college student support ticket data.

Usage:
    python distilbert_trainer.py --data_path ../../SmartDesk_AI_Demo_Data/data/ticket_classification_train.jsonl
"""

import os
import sys
import json
import argparse
import logging
from typing import Dict, List, Tuple

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [%(levelname)s] %(message)s")
logger = logging.getLogger("DistilBertTrainer")

CANONICAL_CATEGORIES = [
    "IT_ACCESS",
    "NETWORK_WIFI",
    "LMS_TECHNICAL",
    "EXAM_HALL_TICKET",
    "EXAM_RESULTS",
    "FEE_PAYMENT",
    "SCHOLARSHIP",
    "ATTENDANCE",
    "CERTIFICATE_RECORDS",
    "LIBRARY",
    "HOSTEL_MAINTENANCE",
    "CAMPUS_FACILITIES",
    "TRANSPORT",
    "GRIEVANCE",
    "ADMISSIONS",
    "OTHER",
]

LABEL_TO_ID = {cat: idx for idx, cat in enumerate(CANONICAL_CATEGORIES)}
ID_TO_LABEL = {idx: cat for idx, cat in enumerate(CANONICAL_CATEGORIES)}


def load_dataset_jsonl(filepath: str) -> List[Dict]:
    """Load JSONL dataset from disk."""
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Dataset file not found at: {filepath}")

    samples = []
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                text = data.get("text", "").strip()
                label = data.get("label", "").strip()
                if text and label and label in LABEL_TO_ID:
                    samples.append({"text": text, "label": label, "label_id": LABEL_TO_ID[label]})
            except json.JSONDecodeError:
                continue
    logger.info(f"Loaded {len(samples)} valid samples from {filepath}")
    return samples


def check_dependencies() -> bool:
    """Verify PyTorch and HuggingFace Transformers installation."""
    missing = []
    try:
        import torch
    except ImportError:
        missing.append("torch")

    try:
        import transformers
    except ImportError:
        missing.append("transformers")

    try:
        import sklearn
    except ImportError:
        missing.append("scikit-learn")

    if missing:
        logger.error(
            "Missing required deep-learning training dependencies: %s\n"
            "Please install using:\n    pip install -r requirements.txt",
            ", ".join(missing),
        )
        return False
    return True


def train_model(args):
    """Fine-tune DistilBERT sequence classifier."""
    if not check_dependencies():
        logger.warning(
            "Training halted: Training dependencies are not installed in the current Python environment.\n"
            "SmartDesk will continue operating with the verified Baseline Reproducible Classifier."
        )
        sys.exit(1)

    import torch
    from torch.utils.data import Dataset, DataLoader
    from transformers import (
        AutoTokenizer,
        AutoModelForSequenceClassification,
        AdamW,
        get_linear_schedule_with_warmup,
    )
    from sklearn.metrics import classification_report, accuracy_score, f1_score

    # 1. Load data
    samples = load_dataset_jsonl(args.data_path)
    if len(samples) < len(CANONICAL_CATEGORIES) * 2:
        logger.warning(
            f"Dataset only has {len(samples)} samples. With 16 classes, this is a small functional demo.\n"
            "A minimum of 500-1000 labeled samples is recommended for production transformer fine-tuning."
        )

    # 2. Initialize Tokenizer & Model
    model_name = args.pretrained_model
    logger.info(f"Loading pretrained transformer weights: {model_name}")
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(
        model_name,
        num_labels=len(CANONICAL_CATEGORIES),
        id2label=ID_TO_LABEL,
        label2id=LABEL_TO_ID,
    )

    device = torch.device("cuda" if torch.cuda.is_available() and not args.cpu else "cpu")
    logger.info(f"Target compute device: {device}")
    model.to(device)

    # Simple text tokenization
    texts = [s["text"] for s in samples]
    labels = [s["label_id"] for s in samples]

    encodings = tokenizer(
        texts,
        truncation=True,
        padding=True,
        max_length=args.max_length,
        return_tensors="pt",
    )

    class TicketDataset(Dataset):
        def __init__(self, encodings, labels):
            self.encodings = encodings
            self.labels = labels

        def __getitem__(self, idx):
            item = {key: val[idx] for key, val in self.encodings.items()}
            item["labels"] = torch.tensor(self.labels[idx])
            return item

        def __len__(self):
            return len(self.labels)

    dataset = TicketDataset(encodings, labels)
    train_loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True)

    optimizer = AdamW(model.parameters(), lr=args.learning_rate, weight_decay=0.01)
    total_steps = len(train_loader) * args.epochs
    scheduler = get_linear_schedule_with_warmup(
        optimizer,
        num_warmup_steps=int(total_steps * 0.1),
        num_training_steps=total_steps,
    )

    # 3. Fine-tuning Loop
    model.train()
    logger.info(f"Beginning fine-tuning across {args.epochs} epochs (Batch size: {args.batch_size})...")

    for epoch in range(1, args.epochs + 1):
        total_loss = 0.0
        for batch in train_loader:
            optimizer.zero_grad()
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            b_labels = batch["labels"].to(device)

            outputs = model(input_ids, attention_mask=attention_mask, labels=b_labels)
            loss = outputs.loss
            loss.backward()

            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            total_loss += loss.item()

        avg_loss = total_loss / len(train_loader)
        logger.info(f"Epoch {epoch}/{args.epochs} — Average Loss: {avg_loss:.4f}")

    # 4. Save checkpoint
    os.makedirs(args.output_dir, exist_ok=True)
    model.save_pretrained(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    logger.info(f"Fine-tuned DistilBERT checkpoint saved successfully to: {args.output_dir}")

    # Save metadata
    meta = {
        "model_name": "SmartDesk-DistilBERT-v1",
        "base_model": model_name,
        "num_classes": len(CANONICAL_CATEGORIES),
        "classes": CANONICAL_CATEGORIES,
        "training_samples": len(samples),
        "epochs": args.epochs,
        "learning_rate": args.learning_rate,
        "batch_size": args.batch_size,
    }
    with open(os.path.join(args.output_dir, "training_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    logger.info("Training process completed.")


def main():
    parser = argparse.ArgumentParser(description="Fine-tune DistilBERT for college ticket classification")
    parser.add_argument("--data_path", type=str, default="../../SmartDesk_AI_Demo_Data/data/ticket_classification_train.jsonl")
    parser.add_argument("--pretrained_model", type=str, default="distilbert-base-uncased")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch_size", type=int, default=8)
    parser.add_argument("--learning_rate", type=float, default=2e-5)
    parser.add_argument("--max_length", type=int, default=128)
    parser.add_argument("--output_dir", type=str, default="./distilbert_smartdesk_model")
    parser.add_argument("--cpu", action="store_true", help="Force CPU training")

    args = parser.parse_args()
    train_model(args)


if __name__ == "__main__":
    main()
