// Template rendering system using Handlebars
// Provides safe template compilation and rendering for notifications

import Handlebars from "handlebars";

/**
 * Render notification template with Handlebars
 * @param subject Email subject template (null for SMS/webhook)
 * @param body Template body content
 * @param params Context variables for template rendering
 * @returns Rendered subject and body
 */
export function renderTemplate(subject: string | null, body: string, params: any) {
  try {
    const renderedSubject = subject 
      ? Handlebars.compile(subject, { noEscape: true })(params) 
      : null;
    
    const renderedBody = Handlebars.compile(body, { noEscape: false })(params);
    
    return { 
      subject: renderedSubject, 
      body: renderedBody 
    };
  } catch (error: any) {
    throw new Error(`Template rendering failed: ${error.message}`);
  }
}

/**
 * Register Handlebars helpers for common formatting
 */
export function registerTemplateHelpers() {
  // Format currency
  Handlebars.registerHelper('currency', function(amount: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  });

  // Format date
  Handlebars.registerHelper('date', function(date: string, format?: string) {
    const d = new Date(date);
    if (format === 'short') {
      return d.toLocaleDateString();
    }
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long', 
      day: 'numeric'
    });
  });

  // Conditional helper
  Handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
    return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
  });
}

// Initialize helpers on module load
registerTemplateHelpers();