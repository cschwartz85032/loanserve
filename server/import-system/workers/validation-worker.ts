import { ConsumeMessage } from "amqplib";
import { rabbitmqClient } from "../../services/rabbitmq-unified";
import { ValidationService } from "../validation/validation-service";
import { publishImportMessage, IMPORT_TOPOLOGY } from "../rabbitmq-topology";
import path from "path";

export interface ValidationMessage {
  importId: string;
  filePath: string;
  type: "mismo" | "csv" | "json" | "pdf";
  tenantId: string;
  correlationId: string;
}

export class ValidationWorker {
  private validationService: ValidationService;
  private consumerTags: string[] = [];

  constructor() {
    this.validationService = new ValidationService();
  }

  /**
   * Start all validation workers
   */
  async start(): Promise<void> {
    console.log('[ValidationWorker] Starting validation workers...');

    try {
      // Start MISMO validation worker
      await this.startMISMOWorker();
      
      // Start CSV validation worker
      await this.startCSVWorker();
      
      // Start JSON validation worker
      await this.startJSONWorker();
      
      // Start PDF validation worker
      await this.startPDFWorker();

      console.log('[ValidationWorker] All validation workers started successfully');
    } catch (error) {
      console.error('[ValidationWorker] Failed to start workers:', error);
      throw error;
    }
  }

  /**
   * Stop all validation workers
   */
  async stop(): Promise<void> {
    console.log('[ValidationWorker] Stopping validation workers...');
    
    for (const tag of this.consumerTags) {
      try {
        await rabbitmqClient.cancelConsumer(tag);
      } catch (error) {
        console.error(`[ValidationWorker] Error stopping consumer ${tag}:`, error);
      }
    }
    
    this.consumerTags = [];
    console.log('[ValidationWorker] All validation workers stopped');
  }

  /**
   * Start MISMO XML validation worker
   */
  private async startMISMOWorker(): Promise<void> {
    const consumerTag = await rabbitmqClient.consume<ValidationMessage>(
      IMPORT_TOPOLOGY.queues.validateMismo,
      this.handleMISMOValidation.bind(this),
      {
        prefetch: 5,
        consumerTag: 'mismo-validation-worker'
      }
    );
    
    this.consumerTags.push(consumerTag);
    console.log('[ValidationWorker] MISMO validation worker started');
  }

  /**
   * Start CSV validation worker
   */
  private async startCSVWorker(): Promise<void> {
    const consumerTag = await rabbitmqClient.consume<ValidationMessage>(
      IMPORT_TOPOLOGY.queues.validateCsv,
      this.handleCSVValidation.bind(this),
      {
        prefetch: 10,
        consumerTag: 'csv-validation-worker'
      }
    );
    
    this.consumerTags.push(consumerTag);
    console.log('[ValidationWorker] CSV validation worker started');
  }

  /**
   * Start JSON validation worker
   */
  private async startJSONWorker(): Promise<void> {
    const consumerTag = await rabbitmqClient.consume<ValidationMessage>(
      IMPORT_TOPOLOGY.queues.validateJson,
      this.handleJSONValidation.bind(this),
      {
        prefetch: 10,
        consumerTag: 'json-validation-worker'
      }
    );
    
    this.consumerTags.push(consumerTag);
    console.log('[ValidationWorker] JSON validation worker started');
  }

  /**
   * Handle MISMO XML validation
   */
  private async handleMISMOValidation(
    message: ValidationMessage,
    raw: ConsumeMessage
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`[ValidationWorker] Processing MISMO validation for import ${message.importId}`);

      // Validate file existence
      if (!message.filePath) {
        throw new Error('File path is required for validation');
      }

      // Perform MISMO validation
      const result = await this.validationService.validateMISMO(message.filePath);
      
      // Save validation results to database
      await this.validationService.processValidationResult(message.importId, result);
      
      // Publish next step based on validation result
      if (result.success) {
        // Move to mapping stage
        await publishImportMessage(
          'map.canonical',
          {
            importId: message.importId,
            tenantId: message.tenantId,
            correlationId: message.correlationId,
            validationResult: result
          },
          'mapping'
        );
        console.log(`[ValidationWorker] MISMO validation succeeded for import ${message.importId}, moved to mapping`);
      } else {
        // Check if errors are fatal
        const fatalErrors = result.errors.filter(e => e.severity === 'fatal');
        if (fatalErrors.length > 0) {
          console.log(`[ValidationWorker] MISMO validation failed with fatal errors for import ${message.importId}`);
        } else {
          // Move to mapping with warnings
          await publishImportMessage(
            'map.canonical',
            {
              importId: message.importId,
              tenantId: message.tenantId,
              correlationId: message.correlationId,
              validationResult: result
            },
            'mapping'
          );
          console.log(`[ValidationWorker] MISMO validation completed with warnings for import ${message.importId}, moved to mapping`);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[ValidationWorker] MISMO validation completed in ${duration}ms`);

    } catch (error) {
      console.error(`[ValidationWorker] MISMO validation failed:`, error);
      
      // Send to error queue
      await publishImportMessage(
        'validation.failed',
        {
          importId: message.importId,
          error: error.message,
          type: 'mismo',
          originalMessage: message
        },
        'dlq'
      );
      
      throw error; // This will trigger message nack
    }
  }

  /**
   * Handle CSV validation
   */
  private async handleCSVValidation(
    message: ValidationMessage,
    raw: ConsumeMessage
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`[ValidationWorker] Processing CSV validation for import ${message.importId}`);

      // Validate file existence
      if (!message.filePath) {
        throw new Error('File path is required for validation');
      }

      // Perform CSV validation
      const result = await this.validationService.validateCSV(message.filePath);
      
      // Save validation results to database
      await this.validationService.processValidationResult(message.importId, result);
      
      // Publish next step based on validation result
      if (result.success) {
        // Move to mapping stage
        await publishImportMessage(
          'map.canonical',
          {
            importId: message.importId,
            tenantId: message.tenantId,
            correlationId: message.correlationId,
            validationResult: result
          },
          'mapping'
        );
        console.log(`[ValidationWorker] CSV validation succeeded for import ${message.importId}, moved to mapping`);
      } else {
        // Check if errors are fatal
        const fatalErrors = result.errors.filter(e => e.severity === 'fatal');
        if (fatalErrors.length > 0) {
          console.log(`[ValidationWorker] CSV validation failed with fatal errors for import ${message.importId}`);
        } else {
          // Move to mapping with warnings
          await publishImportMessage(
            'map.canonical',
            {
              importId: message.importId,
              tenantId: message.tenantId,
              correlationId: message.correlationId,
              validationResult: result
            },
            'mapping'
          );
          console.log(`[ValidationWorker] CSV validation completed with warnings for import ${message.importId}, moved to mapping`);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[ValidationWorker] CSV validation completed in ${duration}ms`);

    } catch (error) {
      console.error(`[ValidationWorker] CSV validation failed:`, error);
      
      // Send to error queue
      await publishImportMessage(
        'validation.failed',
        {
          importId: message.importId,
          error: error.message,
          type: 'csv',
          originalMessage: message
        },
        'dlq'
      );
      
      throw error; // This will trigger message nack
    }
  }

  /**
   * Handle JSON validation
   */
  private async handleJSONValidation(
    message: ValidationMessage,
    raw: ConsumeMessage
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`[ValidationWorker] Processing JSON validation for import ${message.importId}`);

      // Validate file existence
      if (!message.filePath) {
        throw new Error('File path is required for validation');
      }

      // Perform JSON validation
      const result = await this.validationService.validateJSON(message.filePath);
      
      // Save validation results to database
      await this.validationService.processValidationResult(message.importId, result);
      
      // Publish next step based on validation result
      if (result.success) {
        // Move to mapping stage
        await publishImportMessage(
          'map.canonical',
          {
            importId: message.importId,
            tenantId: message.tenantId,
            correlationId: message.correlationId,
            validationResult: result
          },
          'mapping'
        );
        console.log(`[ValidationWorker] JSON validation succeeded for import ${message.importId}, moved to mapping`);
      } else {
        // Check if errors are fatal
        const fatalErrors = result.errors.filter(e => e.severity === 'fatal');
        if (fatalErrors.length > 0) {
          console.log(`[ValidationWorker] JSON validation failed with fatal errors for import ${message.importId}`);
        } else {
          // Move to mapping with warnings
          await publishImportMessage(
            'map.canonical',
            {
              importId: message.importId,
              tenantId: message.tenantId,
              correlationId: message.correlationId,
              validationResult: result
            },
            'mapping'
          );
          console.log(`[ValidationWorker] JSON validation completed with warnings for import ${message.importId}, moved to mapping`);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[ValidationWorker] JSON validation completed in ${duration}ms`);

    } catch (error) {
      console.error(`[ValidationWorker] JSON validation failed:`, error);
      
      // Send to error queue
      await publishImportMessage(
        'validation.failed',
        {
          importId: message.importId,
          error: error.message,
          type: 'json',
          originalMessage: message
        },
        'dlq'
      );
      
      throw error; // This will trigger message nack
    }
  }

  /**
   * Start PDF validation worker
   */
  private async startPDFWorker(): Promise<void> {
    const consumerTag = await rabbitmqClient.consume<ValidationMessage>(
      IMPORT_TOPOLOGY.queues.validatePdf,
      this.handlePDFValidation.bind(this),
      {
        prefetch: 2, // Lower prefetch for PDF processing
        consumerTag: 'pdf-validation-worker'
      }
    );
    
    this.consumerTags.push(consumerTag);
    console.log('[ValidationWorker] PDF validation worker started');
  }

  /**
   * Handle PDF validation message
   */
  private async handlePDFValidation(message: ValidationMessage, rawMessage: ConsumeMessage): Promise<void> {
    const startTime = Date.now();
    console.log(`[ValidationWorker] Processing PDF validation for import ${message.importId}`);
    
    try {
      // Perform PDF validation
      const result = await this.validationService.validatePDF(message.filePath);
      
      // Save validation results to database
      await this.validationService.processValidationResult(message.importId, result);
      
      // Publish next step based on validation result
      if (result.success) {
        // Move to mapping stage
        await publishImportMessage(
          'map.canonical',
          {
            importId: message.importId,
            tenantId: message.tenantId,
            correlationId: message.correlationId,
            validationResult: result
          },
          'mapping'
        );
        console.log(`[ValidationWorker] PDF validation succeeded for import ${message.importId}, moved to mapping`);
      } else {
        // Check if errors are fatal
        const fatalErrors = result.errors.filter(e => e.severity === 'fatal');
        if (fatalErrors.length > 0) {
          console.log(`[ValidationWorker] PDF validation failed with fatal errors for import ${message.importId}`);
        } else {
          // Move to mapping with warnings
          await publishImportMessage(
            'map.canonical',
            {
              importId: message.importId,
              tenantId: message.tenantId,
              correlationId: message.correlationId,
              validationResult: result
            },
            'mapping'
          );
          console.log(`[ValidationWorker] PDF validation completed with warnings for import ${message.importId}, moved to mapping`);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[ValidationWorker] PDF validation completed in ${duration}ms`);

    } catch (error) {
      console.error(`[ValidationWorker] PDF validation failed:`, error);
      
      // Send to error queue
      await publishImportMessage(
        'validation.failed',
        {
          importId: message.importId,
          error: error.message,
          type: 'pdf',
          originalMessage: message
        },
        'dlq'
      );
      
      throw error; // This will trigger message nack
    }
  }
}