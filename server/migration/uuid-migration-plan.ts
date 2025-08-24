/**
 * UUID Migration Strategy for LoanServe Pro
 * 
 * CRITICAL: Cannot alter existing primary keys from serial to UUID
 * Solution: Create parallel UUID-based schema and migrate data
 */

export const UUID_MIGRATION_PHASES = {
  // Phase 1: Create new UUID-based tables with suffix "_v2"
  phase1_new_tables: [
    // Core payment pipeline tables (new, per specification)
    'payment_ingestions',      // UUID from start
    'payment_artifacts',        // UUID from start  
    'payment_events',          // UUID with hash chain
    'outbox_messages',         // UUID from start
    'reconciliations',         // UUID from start
    'exception_cases',         // UUID from start
    
    // Migrated tables (parallel to existing)
    'users_v2',                // UUID version of users
    'loans_v2',                // UUID version of loans
    'payments_v2',             // UUID version of payments
    'borrower_entities_v2',    // UUID version of borrower_entities
    'properties_v2',           // UUID version of properties
    'investors_v2',            // UUID version of investors
    // ... all 58 tables
  ],

  // Phase 2: Data migration approach
  phase2_migration: {
    strategy: 'DUAL_WRITE',
    steps: [
      '1. Deploy UUID schema alongside existing',
      '2. Create ID mapping table (serial <-> UUID)',
      '3. Implement dual-write to both schemas',
      '4. Backfill historical data to UUID tables',
      '5. Verify data integrity',
      '6. Switch reads to UUID tables',
      '7. Stop writes to old tables',
      '8. Archive old tables'
    ]
  },

  // Phase 3: ID Mapping structure
  phase3_mapping: {
    table: 'id_mappings',
    structure: {
      uuid: 'varchar(36) PRIMARY KEY',
      entity_type: 'varchar(50) NOT NULL',
      serial_id: 'integer NOT NULL',
      created_at: 'timestamp DEFAULT NOW()'
    }
  }
};

// Helper to generate UUID in PostgreSQL
export const UUID_GENERATION = {
  postgres: "gen_random_uuid()",
  node: "crypto.randomUUID()"
};

// Example UUID schema for new tables
export const UUID_SCHEMA_PATTERN = `
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql\`gen_random_uuid()\`),
`;

// Foreign key pattern for UUID references
export const UUID_FK_PATTERN = `
  loan_id: varchar("loan_id", { length: 36 })
    .notNull()
    .references(() => loans_v2.id),
`;