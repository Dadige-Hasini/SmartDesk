import mammoth from 'mammoth';
import { logger } from '../../utils/logger.js';

export class DocumentProcessor {
  /**
   * Extract plain text from supported document buffers.
   * @param {Buffer} buffer - File buffer
   * @param {string} fileType - 'PDF' | 'DOCX' | 'TXT' | 'MD'
   * @returns {Promise<string>} Extracted normalized text
   */
  static async extractText(buffer, fileType) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error('Invalid file buffer supplied for text extraction.');
    }

    const type = (fileType || '').toUpperCase();

    switch (type) {
      case 'PDF':
        return await this.extractPdf(buffer);
      case 'DOCX':
        return await this.extractDocx(buffer);
      case 'TXT':
      case 'MD':
      default:
        return buffer.toString('utf-8');
    }
  }

  /**
   * PDF text extraction using pdf-parse with fallback
   */
  static async extractPdf(buffer) {
    try {
      // Dynamic import to handle pdf-parse CJS module cleanly in ESM
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      return data?.text || '';
    } catch (err) {
      logger.warn('[DocumentProcessor] pdf-parse failed, attempting text stream fallback', { error: err.message });
      // Fallback: extract ASCII/UTF-8 readable sequences from PDF stream
      const raw = buffer.toString('utf-8');
      const textMatches = raw.match(/\(([^()]+)\)[\s]*Tj/g) || [];
      if (textMatches.length > 0) {
        return textMatches.map((m) => m.replace(/^[(\s]+|[)\s]+Tj$/g, '')).join(' ');
      }
      return raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ');
    }
  }

  /**
   * DOCX text extraction using mammoth
   */
  static async extractDocx(buffer) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result?.value || '';
    } catch (err) {
      logger.error('[DocumentProcessor] mammoth DOCX extraction failed', { error: err.message });
      throw new Error(`DOCX text extraction error: ${err.message}`);
    }
  }

  /**
   * Normalize text by removing control characters, normalizing whitespace and line endings.
   */
  static normalizeText(rawText) {
    if (!rawText) return '';
    return rawText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
      .replace(/\t/g, ' ')
      .replace(/[ ]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Split document text into coherent chunks with overlap and section awareness.
   * @param {string} text - Normalized full document text
   * @param {Object} [options]
   * @param {number} [options.chunkSize=700] - Target character count per chunk
   * @param {number} [options.overlap=100] - Overlap character count
   * @returns {Array<{ chunkIndex: number, content: string, section: string, tokenCount: number }>}
   */
  static chunkText(text, options = {}) {
    const chunkSize = options.chunkSize || 700;
    const overlap = options.overlap || 100;
    const normalized = this.normalizeText(text);

    if (!normalized || normalized.length === 0) {
      return [];
    }

    // Identify natural section headings (e.g. "### Title", "Section 1", "1. Policy Name")
    const paragraphs = normalized.split(/\n\n+/);
    const chunks = [];
    let currentChunk = '';
    let currentSection = 'General';
    let chunkIndex = 0;

    for (const para of paragraphs) {
      const trimmedPara = para.trim();
      if (!trimmedPara) continue;

      // Check if paragraph looks like a section header
      const headerMatch = trimmedPara.match(/^(?:#{1,4}\s+|section\s+\d+[:.]?\s*|\d+\.\s+)([^\n]{3,80})/i);
      if (headerMatch) {
        currentSection = headerMatch[1].trim();
      }

      // If adding this paragraph exceeds target chunk size, finalize current chunk
      if (currentChunk.length + trimmedPara.length > chunkSize && currentChunk.length > 0) {
        chunks.push({
          chunkIndex,
          content: currentChunk.trim(),
          section: currentSection,
          tokenCount: Math.ceil(currentChunk.length / 4),
        });
        chunkIndex++;

        // Keep trailing overlap from previous chunk
        const overlapText = currentChunk.slice(-overlap);
        currentChunk = overlapText + '\n\n' + trimmedPara;
      } else {
        currentChunk = currentChunk ? `${currentChunk}\n\n${trimmedPara}` : trimmedPara;
      }
    }

    // Push final remaining chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        chunkIndex,
        content: currentChunk.trim(),
        section: currentSection,
        tokenCount: Math.ceil(currentChunk.length / 4),
      });
    }

    return chunks;
  }
}
