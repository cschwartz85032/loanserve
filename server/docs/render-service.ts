/**
 * Phase 4: Document Rendering Service
 * Deterministic PDF generation using Handlebars and pdfkit
 */

import Handlebars from 'handlebars';
import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import type { 
  BillingStatementPayload, 
  EscrowAnalysisDocPayload, 
  YearEnd1098Payload,
  NoticePayload,
  RenderRequest,
  Minor
} from './types';

// Register deterministic Handlebars helpers
Handlebars.registerHelper('formatMinor', (value: Minor | undefined) => {
  if (!value) return '0.00';
  const num = Number(value) / 100;
  return num.toFixed(2);
});

Handlebars.registerHelper('formatDateISO', (date: string | Date) => {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
});

// No other helpers allowed for determinism

export class RenderService {
  /**
   * Render HTML template with data
   */
  renderHTML(htmlSource: string, cssSource: string, data: any): string {
    // Compile template
    const template = Handlebars.compile(htmlSource, { 
      noEscape: false,
      strict: true 
    });
    
    // Render with data
    const body = template(data);
    
    // Combine with CSS
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>${cssSource}</style>
      </head>
      <body>${body}</body>
      </html>
    `;
  }

  /**
   * Generate deterministic PDF from HTML (simplified version)
   * In production, would use puppeteer with specific settings for byte-stable output
   */
  async generatePDF(html: string, fontFamily: string = 'Helvetica'): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      
      // Create PDF document with deterministic settings
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: 72, // 1 inch margins
        bufferPages: true,
        autoFirstPage: false,
        info: {
          Producer: 'LoanServe Pro',
          Creator: 'LoanServe Pro Document Service'
        }
      });

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Add page
      doc.addPage();
      
      // Parse HTML to extract text (simplified - in production use proper HTML parser)
      const textContent = this.extractTextFromHTML(html);
      
      // Set font
      doc.font(fontFamily);
      doc.fontSize(12);
      
      // Add content
      doc.text(textContent, {
        align: 'left',
        width: doc.page.width - 144, // Account for margins
        height: doc.page.height - 144
      });
      
      doc.end();
    });
  }

  /**
   * Extract text from HTML (simplified version)
   */
  private extractTextFromHTML(html: string): string {
    // Strip HTML tags (very simplified - use proper parser in production)
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate deterministic hash of inputs
   */
  calculateInputsHash(
    payloadJson: any, 
    templateId: string, 
    cssSource: string, 
    engine: string, 
    version: number
  ): string {
    const input = JSON.stringify({
      payload: payloadJson,
      template: templateId,
      css: cssSource,
      engine,
      version
    });
    
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  /**
   * Calculate hash of PDF bytes
   */
  calculatePDFHash(pdfBytes: Buffer): string {
    return crypto.createHash('sha256').update(pdfBytes).digest('hex');
  }

  /**
   * Full rendering pipeline
   */
  async renderDocument<T>(request: RenderRequest<T>, template: {
    engine: string;
    html_source: string;
    css_source: string;
    font_family: string;
    version: number;
  }): Promise<{
    html: string;
    pdf_bytes: Buffer;
    inputs_hash: string;
    pdf_hash: string;
    size_bytes: number;
  }> {
    // Validate engine
    if (template.engine !== 'handlebars-html') {
      throw new Error(`Unsupported engine: ${template.engine}`);
    }

    // Render HTML
    const html = this.renderHTML(
      template.html_source,
      template.css_source,
      request.payload
    );

    // Generate PDF
    const pdf_bytes = await this.generatePDF(html, template.font_family);

    // Calculate hashes
    const inputs_hash = this.calculateInputsHash(
      request.payload,
      request.template_id,
      template.css_source,
      template.engine,
      template.version
    );

    const pdf_hash = this.calculatePDFHash(pdf_bytes);

    return {
      html,
      pdf_bytes,
      inputs_hash,
      pdf_hash,
      size_bytes: pdf_bytes.length
    };
  }
}