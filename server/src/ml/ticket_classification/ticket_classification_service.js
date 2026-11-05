import { BaselineTicketClassifier } from './baseline_classifier.js';
import { TransformerTicketClassifier } from './transformer_classifier.js';
import { routingEngine } from './routing_engine.js';
import { ClassificationAuditLogger } from './audit_logger.js';
import { loadClassificationDataset } from './dataset_loader.js';
import { logger } from '../../utils/logger.js';

export class TicketClassificationService {
  constructor(options = {}) {
    this.baselineClassifier = new BaselineTicketClassifier();
    this.transformerClassifier = new TransformerTicketClassifier({
      fallbackClassifier: this.baselineClassifier,
    });
    // Default active classifier is the reproducible baseline
    this.activeClassifier = options.classifier || this.baselineClassifier;
    this.isInitialized = false;
  }

  /**
   * Initialize service with training data
   */
  async initialize() {
    if (this.isInitialized) return;
    try {
      const data = loadClassificationDataset();
      await this.baselineClassifier.fit(data.samples);
      this.isInitialized = true;
      logger.info(`[TicketClassificationService] Initialized with ${data.totalSamples} synthetic training samples across 16 categories.`);
    } catch (err) {
      logger.warn('[TicketClassificationService] Failed to load dataset from disk; using keyword anchors.', { error: err.message });
      await this.baselineClassifier.fit([]);
      this.isInitialized = true;
    }
  }

  /**
   * Set active classifier implementation (Modular hot-swapping)
   * 
   * @param {'baseline' | 'transformer' | Object} classifierType
   */
  setClassifier(classifierType) {
    if (typeof classifierType === 'string') {
      if (classifierType.toLowerCase() === 'transformer') {
        this.activeClassifier = this.transformerClassifier;
      } else {
        this.activeClassifier = this.baselineClassifier;
      }
    } else if (classifierType && typeof classifierType.predict === 'function') {
      this.activeClassifier = classifierType;
    }
  }

  /**
   * Classify ticket title and description and apply deterministic department routing.
   * 
   * Requirements fulfilled:
   * 1. Accepts title and description.
   * 6. Returns structured prediction with category, confidence, model name, human review required.
   * 7. Applies deterministic rules from routing_rules.json.
   * 8. Fallback workflow if confidence is below threshold.
   * 9. Handles sensitive grievances, fee-payment discrepancies, exam deadlines.
   * 10. Saves to audit log without secrets.
   * 
   * @param {{ title: string, description?: string }} ticketContext
   * @param {Object} [options]
   * @param {Object} [options.userProfile]
   * @param {string} [options.sessionId]
   * @param {string} [options.ticketId]
   */
  async classifyAndRoute(ticketContext, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const { userProfile, sessionId, ticketId } = options;

    // 1. Predict category using active classifier
    const modelPrediction = await this.activeClassifier.predict(ticketContext);

    // 2. Apply deterministic routing rules (model never assigns permissions directly)
    const routingOutcome = routingEngine.routeTicket(modelPrediction, ticketContext);

    // 3. Log audit event safely without secrets
    await ClassificationAuditLogger.logClassificationInteraction({
      ticketContext,
      routingOutcome,
      userProfile,
      sessionId,
      ticketId,
    });

    return routingOutcome;
  }
}

export const ticketClassificationService = new TicketClassificationService();
