/**
 * SmartDesk Ticket Classifier Interface
 * 
 * Abstract contract that all ticket classifiers (e.g. baseline prototype,
 * fine-tuned DistilBERT transformer, LLM few-shot) must implement.
 * 
 * Requirements:
 * - Accepts ticket title and description.
 * - Predicts a category and returns confidence score, model name, and alternatives.
 * - Remains strictly modular so model implementations can be hot-swapped without
 *   breaking the routing engine or upstream controllers.
 */

export class TicketClassifierInterface {
  constructor(options = {}) {
    if (new.target === TicketClassifierInterface) {
      throw new TypeError('Cannot construct TicketClassifierInterface directly; implement a subclass.');
    }
    this.modelName = options.modelName || 'AbstractTicketClassifier';
    this.modelVersion = options.modelVersion || '1.0.0';
  }

  /**
   * Train / fit the classifier on a labeled dataset.
   * 
   * @param {Array<{ text?: string, title?: string, description?: string, label: string }>} trainingData
   * @returns {Promise<{ isTrained: boolean, numSamples: number, numClasses: number }>}
   */
  async fit(trainingData) {
    throw new Error('Method fit() must be implemented by subclass.');
  }

  /**
   * Predict a category for a ticket given its title and description.
   * 
   * @param {{ title: string, description?: string }} ticket
   * @returns {Promise<{
   *   category: string,
   *   confidence: number,
   *   model_name: string,
   *   model_version: string,
   *   alternatives: Array<{ category: string, confidence: number }>,
   *   is_low_confidence: boolean
   * }>}
   */
  async predict(ticket) {
    throw new Error('Method predict() must be implemented by subclass.');
  }

  /**
   * Combined text representation for classifier input.
   * 
   * @param {{ title?: string, description?: string, text?: string }} ticket
   * @returns {string}
   */
  formatTicketText(ticket) {
    if (!ticket) return '';
    if (typeof ticket === 'string') return ticket.trim();
    if (ticket.text && typeof ticket.text === 'string') return ticket.text.trim();

    const title = (ticket.title || '').trim();
    const description = (ticket.description || '').trim();

    if (title && description) {
      return `${title}. ${description}`;
    }
    return title || description || '';
  }
}
