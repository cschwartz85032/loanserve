/**
 * AI Pipeline Database Schema Integration
 * Type-safe database operations for AI servicing pipeline
 */

import { pgTable, uuid, text, timestamp, integer, numeric, jsonb, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { sql } from 'drizzle-orm';

// Loan candidates table
export const loanCandidates = pgTable('loan_candidates', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id').notNull(),
  status: text('status').notNull().default('new'),
  investorId: uuid('investor_id'),
  escrowId: uuid('escrow_id'),
  propertyId: uuid('property_id'),
  sourceImportId: uuid('source_import_id'),
  loanUrn: text('loan_urn'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Loan documents table
export const loanDocuments = pgTable('loan_documents', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  loanId: uuid('loan_id').notNull().references(() => loanCandidates.id, { onDelete: 'cascade' }),
  storageUri: text('storage_uri').notNull(),
  sha256: text('sha256').notNull(),
  docType: text('doc_type'),
  pageRange: text('page_range'), // int4range stored as text
  classConfidence: numeric('class_confidence', { precision: 5, scale: 4 }),
  ocrStatus: text('ocr_status'),
  version: integer('version').notNull().default(1),
  lineageParentId: uuid('lineage_parent_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Loan datapoints table - core AI extracted data
export const loanDatapoints = pgTable('loan_datapoints', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  loanId: uuid('loan_id').notNull().references(() => loanCandidates.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value'),
  normalizedValue: text('normalized_value'),
  confidence: numeric('confidence', { precision: 5, scale: 4 }),
  autofilledFrom: text('autofilled_from').notNull().default('payload'),
  ingestSource: text('ingest_source').notNull().default('payload'),
  evidenceDocId: uuid('evidence_doc_id').references(() => loanDocuments.id, { onDelete: 'set null' }),
  evidencePage: integer('evidence_page'),
  evidenceTextHash: text('evidence_text_hash'),
  evidenceBoundingBox: jsonb('evidence_bounding_box'),
  extractorVersion: text('extractor_version'),
  promptVersion: text('prompt_version'),
  authorityPriority: integer('authority_priority').notNull().default(500),
  authorityDecision: jsonb('authority_decision'),
  producedAt: timestamp('produced_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  uniqueLoanKey: uniqueIndex('unique_loan_key').on(table.loanId, table.key)
}));

// Loan conflicts table
export const loanConflicts = pgTable('loan_conflicts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  loanId: uuid('loan_id').notNull().references(() => loanCandidates.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  candidates: jsonb('candidates').notNull(),
  selectedValue: text('selected_value'),
  resolverId: uuid('resolver_id'),
  rationale: text('rationale'),
  authorityRule: text('authority_rule'),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true })
});

// Imports table
export const imports = pgTable('imports', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id').notNull(),
  type: text('type').notNull(),
  filename: text('filename').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  sha256: text('sha256').notNull(),
  // S3 storage fields
  s3Bucket: text('s3_bucket'),
  s3Key: text('s3_key'),
  s3VersionId: text('s3_version_id'),
  s3ETag: text('s3_etag'),
  contentType: text('content_type'),
  // Processing metadata
  docsetId: uuid('docset_id'),
  status: text('status').notNull(),
  errorCount: integer('error_count').notNull().default(0),
  progress: jsonb('progress').notNull().default({}),
  mappingVersion: text('mapping_version'),
  parsedByVersion: text('parsed_by_version'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  // Business metadata
  correlationId: text('correlation_id'),
  investorDirectives: jsonb('investor_directives').default([]),
  escrowInstructions: jsonb('escrow_instructions').default([]),
  // Audit fields
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  tenantStatusIdx: index('idx_imports_tenant_status_created').on(table.tenantId, table.status, table.createdAt),
  s3LocationIdx: index('idx_imports_s3_location').on(table.s3Bucket, table.s3Key)
}));

// Import errors table
export const importErrors = pgTable('import_errors', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  importId: uuid('import_id').notNull().references(() => imports.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  severity: text('severity').notNull(),
  pointer: text('pointer').notNull(),
  message: text('message').notNull(),
  rawFragment: jsonb('raw_fragment'),
  suggestedCorrection: jsonb('suggested_correction'),
  canAutoCorrect: boolean('can_auto_correct').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  importIdx: index('idx_import_errors_import').on(table.importId)
}));

// Import mappings table
export const importMappings = pgTable('import_mappings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  importId: uuid('import_id').notNull().references(() => imports.id, { onDelete: 'cascade' }),
  canonicalKey: text('canonical_key').notNull(),
  normalizedValue: text('normalized_value'),
  sourcePointer: text('source_pointer'),
  evidenceHash: text('evidence_hash'),
  confidence: numeric('confidence', { precision: 5, scale: 4 }),
  autofilledFrom: text('autofilled_from').notNull().default('payload'),
  transformationLog: jsonb('transformation_log').default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  importIdx: index('idx_import_mappings_import').on(table.importId)
}));

// QC rules table
export const qcRules = pgTable('qc_rules', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  severity: text('severity').notNull(),
  engineType: text('engine_type').notNull(),
  fieldName: text('field_name'),
  params: jsonb('params').notNull().default({}),
  programSpecific: text('program_specific').array(),
  enabled: boolean('enabled').notNull().default(true),
  autoCorrect: boolean('auto_correct').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// QC defects table
export const qcDefects = pgTable('qc_defects', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  loanId: uuid('loan_id').notNull().references(() => loanCandidates.id, { onDelete: 'cascade' }),
  ruleId: uuid('rule_id').notNull().references(() => qcRules.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('open'),
  message: text('message').notNull(),
  evidenceDocId: uuid('evidence_doc_id').references(() => loanDocuments.id),
  originalValue: text('original_value'),
  suggestedValue: text('suggested_value'),
  canAutoCorrect: boolean('can_auto_correct').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  waiverId: uuid('waiver_id')
});

// Lineage records table
export const lineageRecords = pgTable('lineage_records', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  lineageId: text('lineage_id').notNull().unique(),
  fieldName: text('field_name').notNull(),
  value: text('value').notNull(),
  source: text('source').notNull(),
  confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull(),
  documentId: uuid('document_id').references(() => loanDocuments.id),
  pageNumber: integer('page_number'),
  textHash: text('text_hash').notNull(),
  boundingBox: jsonb('bounding_box'),
  extractorVersion: text('extractor_version'),
  promptVersion: text('prompt_version'),
  operatorId: uuid('operator_id'),
  vendorName: text('vendor_name'),
  derivedFrom: text('derived_from').array(),
  transformations: jsonb('transformations').default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  fieldNameIdx: index('idx_lineage_field_name').on(table.fieldName),
  sourceIdx: index('idx_lineage_source').on(table.source),
  documentIdx: index('idx_lineage_document').on(table.documentId)
}));

// Worker status table
export const workerStatus = pgTable('worker_status', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workerName: text('worker_name').notNull(),
  workerType: text('worker_type').notNull(),
  status: text('status').notNull(),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }).notNull().defaultNow(),
  workItemsProcessed: integer('work_items_processed').notNull().default(0),
  workItemsFailed: integer('work_items_failed').notNull().default(0),
  cacheSize: integer('cache_size').notNull().default(0),
  metadata: jsonb('metadata').default({})
});

// Pipeline alerts table
export const pipelineAlerts = pgTable('pipeline_alerts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  alertId: text('alert_id').notNull().unique(),
  type: text('type').notNull(),
  severity: text('severity').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  resolved: boolean('resolved').notNull().default(false),
  resolvedBy: text('resolved_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true })
});

// Monitoring events table
export const monitoringEvents = pgTable('monitoring_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  metric: text('metric').notNull(),
  dim: jsonb('dim').notNull().default({}),
  value: numeric('value').notNull(),
  tenantId: uuid('tenant_id'),
  correlationId: text('correlation_id'),
  ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  metricTsIdx: index('idx_monitoring_events_metric_ts').on(table.metric, table.ts)
}));

// Type definitions
export type LoanCandidate = typeof loanCandidates.$inferSelect;
export type NewLoanCandidate = typeof loanCandidates.$inferInsert;

export type LoanDocument = typeof loanDocuments.$inferSelect;
export type NewLoanDocument = typeof loanDocuments.$inferInsert;

export type LoanDatapoint = typeof loanDatapoints.$inferSelect;
export type NewLoanDatapoint = typeof loanDatapoints.$inferInsert;

export type LoanConflict = typeof loanConflicts.$inferSelect;
export type NewLoanConflict = typeof loanConflicts.$inferInsert;

export type Import = typeof imports.$inferSelect;
export type NewImport = typeof imports.$inferInsert;

export type ImportError = typeof importErrors.$inferSelect;
export type NewImportError = typeof importErrors.$inferInsert;

export type ImportMapping = typeof importMappings.$inferSelect;
export type NewImportMapping = typeof importMappings.$inferInsert;

export type QcRule = typeof qcRules.$inferSelect;
export type NewQcRule = typeof qcRules.$inferInsert;

export type QcDefect = typeof qcDefects.$inferSelect;
export type NewQcDefect = typeof qcDefects.$inferInsert;

export type LineageRecord = typeof lineageRecords.$inferSelect;
export type NewLineageRecord = typeof lineageRecords.$inferInsert;

export type WorkerStatus = typeof workerStatus.$inferSelect;
export type NewWorkerStatus = typeof workerStatus.$inferInsert;

export type PipelineAlert = typeof pipelineAlerts.$inferSelect;
export type NewPipelineAlert = typeof pipelineAlerts.$inferInsert;

export type MonitoringEvent = typeof monitoringEvents.$inferSelect;
export type NewMonitoringEvent = typeof monitoringEvents.$inferInsert;

// Zod schemas for validation
export const insertLoanCandidateSchema = createInsertSchema(loanCandidates);
export const selectLoanCandidateSchema = createSelectSchema(loanCandidates);

export const insertLoanDocumentSchema = createInsertSchema(loanDocuments);
export const selectLoanDocumentSchema = createSelectSchema(loanDocuments);

export const insertLoanDatapointSchema = createInsertSchema(loanDatapoints);
export const selectLoanDatapointSchema = createSelectSchema(loanDatapoints);

export const insertImportSchema = createInsertSchema(imports);
export const selectImportSchema = createSelectSchema(imports);

export const insertLineageRecordSchema = createInsertSchema(lineageRecords);
export const selectLineageRecordSchema = createSelectSchema(lineageRecords);

// Export all tables for use in queries
export const aiPipelineSchema = {
  loanCandidates,
  loanDocuments,
  loanDatapoints,
  loanConflicts,
  imports,
  importErrors,
  importMappings,
  qcRules,
  qcDefects,
  lineageRecords,
  workerStatus,
  pipelineAlerts,
  monitoringEvents
};