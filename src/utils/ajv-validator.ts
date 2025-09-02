/**
 * AJV Schema Validator for AI Pipeline Prompt Outputs
 * Validates LLM responses against document-specific schemas
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { join } from 'path';

// Schema definitions
import unionSchema from '../../schemas/prompt-outputs/union.schema.json';
import noteSchema from '../../schemas/prompt-outputs/note.schema.json';
import cdSchema from '../../schemas/prompt-outputs/cd.schema.json';
import hoiSchema from '../../schemas/prompt-outputs/hoi.schema.json';
import floodSchema from '../../schemas/prompt-outputs/flood.schema.json';
import appraisalSchema from '../../schemas/prompt-outputs/appraisal.schema.json';

export interface ValidationResult {
  isValid: boolean;
  errors?: any[];
  errorMessage?: string;
  docType?: string;
}

export interface ExtractedData {
  docType: string;
  promptVersion: string;
  data: Record<string, any>;
  evidence: Record<string, any>;
}

/**
 * AJV-based validator for prompt outputs
 */
export class PromptOutputValidator {
  private ajv: Ajv;
  private validators: Map<string, any>;

  constructor() {
    // Initialize AJV with proper configuration
    this.ajv = new Ajv({
      strict: true,
      strictNumbers: true,
      strictRequired: true,
      strictSchema: true,
      strictTypes: true,
      allErrors: true,
      verbose: true,
      discriminator: true,
      allowMatchingProperties: false
    });

    // Add format validators (email, date, uuid, etc.)
    addFormats(this.ajv);

    // Add custom formats if needed
    this.addCustomFormats();

    // Compile all schemas
    this.validators = new Map();
    this.loadSchemas();
  }

  /**
   * Add custom format validators
   */
  private addCustomFormats(): void {
    // Add custom SHA-256 hash format
    this.ajv.addFormat('sha256', {
      type: 'string',
      validate: (data: string) => /^[A-Fa-f0-9]{64}$/.test(data)
    });

    // Add custom prompt version format
    this.ajv.addFormat('promptVersion', {
      type: 'string',
      validate: (data: string) => /^v\d{4}-\d{2}-\d{2}\.[A-Za-z0-9.-]+$/.test(data)
    });
  }

  /**
   * Load and compile all schemas
   */
  private loadSchemas(): void {
    try {
      // Add schemas to AJV registry
      this.ajv.addSchema(noteSchema, 'note');
      this.ajv.addSchema(cdSchema, 'cd');
      this.ajv.addSchema(hoiSchema, 'hoi');
      this.ajv.addSchema(floodSchema, 'flood');
      this.ajv.addSchema(appraisalSchema, 'appraisal');
      this.ajv.addSchema(unionSchema, 'union');

      // Compile validators for each document type
      this.validators.set('NOTE', this.ajv.compile(noteSchema));
      this.validators.set('CD', this.ajv.compile(cdSchema));
      this.validators.set('HOI', this.ajv.compile(hoiSchema));
      this.validators.set('FLOOD', this.ajv.compile(floodSchema));
      this.validators.set('APPRAISAL', this.ajv.compile(appraisalSchema));
      this.validators.set('UNION', this.ajv.compile(unionSchema));

      console.log('[AJV] All schemas loaded and compiled successfully');
    } catch (error) {
      console.error('[AJV] Failed to load schemas:', error);
      throw new Error(`Schema compilation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate prompt output against appropriate schema
   */
  validate(data: any, expectedDocType?: string): ValidationResult {
    try {
      // First, try to determine document type
      const docType = expectedDocType || this.detectDocumentType(data);
      
      if (!docType) {
        return {
          isValid: false,
          errorMessage: 'Cannot determine document type from data'
        };
      }

      // Get appropriate validator
      const validator = this.validators.get(docType);
      if (!validator) {
        return {
          isValid: false,
          errorMessage: `No validator found for document type: ${docType}`
        };
      }

      // Validate against specific schema
      const isValid = validator(data);

      if (isValid) {
        return {
          isValid: true,
          docType
        };
      } else {
        return {
          isValid: false,
          errors: validator.errors || [],
          errorMessage: this.formatErrorMessage(validator.errors || []),
          docType
        };
      }

    } catch (error) {
      return {
        isValid: false,
        errorMessage: `Validation error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Validate against union schema (any document type)
   */
  validateUnion(data: any): ValidationResult {
    try {
      const validator = this.validators.get('UNION');
      if (!validator) {
        throw new Error('Union validator not found');
      }

      const isValid = validator(data);
      const docType = this.detectDocumentType(data) || undefined;

      if (isValid) {
        return {
          isValid: true,
          docType
        };
      } else {
        return {
          isValid: false,
          errors: validator.errors || [],
          errorMessage: this.formatErrorMessage(validator.errors || []),
          docType
        };
      }

    } catch (error) {
      return {
        isValid: false,
        errorMessage: `Union validation error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Detect document type from data
   */
  private detectDocumentType(data: any): string | null {
    if (typeof data === 'object' && data !== null && typeof data.docType === 'string') {
      return data.docType.toUpperCase();
    }
    return null;
  }

  /**
   * Format AJV errors into readable message
   */
  private formatErrorMessage(errors: any[]): string {
    if (!errors || errors.length === 0) {
      return 'Unknown validation error';
    }

    const messages = errors.map(error => {
      const path = error.instancePath || 'root';
      const message = error.message || 'validation failed';
      const allowedValues = error.params?.allowedValues 
        ? ` (allowed: ${error.params.allowedValues.join(', ')})` 
        : '';
      
      return `${path}: ${message}${allowedValues}`;
    });

    return messages.join('; ');
  }

  /**
   * Get schema for document type
   */
  getSchema(docType: string): any {
    const schemas: Record<string, any> = {
      'NOTE': noteSchema,
      'CD': cdSchema,
      'HOI': hoiSchema,
      'FLOOD': floodSchema,
      'APPRAISAL': appraisalSchema
    };

    return schemas[docType.toUpperCase()] || null;
  }

  /**
   * Validate specific field evidence
   */
  validateEvidence(evidence: any, fieldName: string): ValidationResult {
    try {
      // Evidence schema from note.schema.json $defs
      const evidenceSchema = {
        type: 'object',
        additionalProperties: false,
        properties: {
          docId: { type: 'string', format: 'uuid' },
          page: { type: 'integer', minimum: 1 },
          bbox: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 },
          textHash: { type: 'string', pattern: '^[A-Fa-f0-9]{64}$' },
          snippet: { type: 'string', maxLength: 1000 }
        },
        required: ['docId', 'page', 'textHash']
      };

      const validator = this.ajv.compile(evidenceSchema);
      const isValid = validator(evidence);

      if (isValid) {
        return { isValid: true };
      } else {
        return {
          isValid: false,
          errors: validator.errors,
          errorMessage: `Evidence validation failed for ${fieldName}: ${this.formatErrorMessage(validator.errors)}`
        };
      }

    } catch (error) {
      return {
        isValid: false,
        errorMessage: `Evidence validation error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Extract and validate data from LLM response
   */
  extractAndValidate(llmResponse: string, expectedDocType?: string): {
    success: boolean;
    data?: ExtractedData;
    validation?: ValidationResult;
    error?: string;
  } {
    try {
      // Try to parse JSON from LLM response
      let jsonData: any;
      
      try {
        // Handle cases where LLM might return JSON wrapped in markdown or other text
        const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonData = JSON.parse(jsonMatch[0]);
        } else {
          jsonData = JSON.parse(llmResponse);
        }
      } catch (parseError) {
        return {
          success: false,
          error: `Failed to parse JSON from LLM response: ${parseError instanceof Error ? parseError.message : String(parseError)}`
        };
      }

      // Validate the parsed data
      const validation = this.validate(jsonData, expectedDocType);

      if (validation.isValid) {
        return {
          success: true,
          data: jsonData as ExtractedData,
          validation
        };
      } else {
        return {
          success: false,
          validation,
          error: validation.errorMessage
        };
      }

    } catch (error) {
      return {
        success: false,
        error: `Extract and validate error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get validation statistics
   */
  getValidatorStats(): {
    schemaCount: number;
    compiledValidators: string[];
    supportedDocTypes: string[];
  } {
    return {
      schemaCount: this.validators.size,
      compiledValidators: Array.from(this.validators.keys()),
      supportedDocTypes: ['NOTE', 'CD', 'HOI', 'FLOOD', 'APPRAISAL']
    };
  }
}

// Export singleton instance
export const promptValidator = new PromptOutputValidator();

// Export utility functions
export function validatePromptOutput(data: any, expectedDocType?: string): ValidationResult {
  return promptValidator.validate(data, expectedDocType);
}

export function validateLLMResponse(response: string, expectedDocType?: string): {
  success: boolean;
  data?: ExtractedData;
  validation?: ValidationResult;
  error?: string;
} {
  return promptValidator.extractAndValidate(response, expectedDocType);
}

export function getSchemaForDocType(docType: string): any {
  return promptValidator.getSchema(docType);
}