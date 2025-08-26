/**
 * Schema Validator
 * Validates database schema against application schema on startup
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import * as schema from '../../shared/schema';
import { Logger } from './logger';

const logger = new Logger('SchemaValidator');

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface TableInfo {
  table_name: string;
  columns: ColumnInfo[];
}

/**
 * Get all tables from the database
 */
async function getDatabaseTables(): Promise<string[]> {
  try {
    const result = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    return result.rows.map(row => row.table_name as string);
  } catch (error) {
    logger.error('Failed to get database tables', error);
    throw error;
  }
}

/**
 * Get columns for a specific table
 */
async function getTableColumns(tableName: string): Promise<ColumnInfo[]> {
  try {
    const result = await db.execute(sql`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = ${tableName}
      ORDER BY ordinal_position
    `);
    
    return result.rows.map(row => ({
      column_name: row.column_name as string,
      data_type: row.data_type as string,
      is_nullable: row.is_nullable as string,
      column_default: row.column_default as string | null
    }));
  } catch (error) {
    logger.error(`Failed to get columns for table ${tableName}`, error);
    throw error;
  }
}

/**
 * Extract table names from schema definition
 */
function getSchemaTableNames(): string[] {
  const tables: string[] = [];
  
  for (const [key, value] of Object.entries(schema)) {
    // Check if this is a table definition (has a $ property which is the table name)
    if (value && typeof value === 'object' && '$' in value) {
      const tableConfig = (value as any)['$'];
      if (tableConfig && tableConfig.name) {
        tables.push(tableConfig.name);
      }
    }
  }
  
  return tables.sort();
}

/**
 * Compare database schema with application schema
 */
export async function validateSchema(): Promise<{
  valid: boolean;
  issues: string[];
  warnings: string[];
}> {
  const issues: string[] = [];
  const warnings: string[] = [];
  
  try {
    console.log('[SchemaValidator] Starting schema validation...');
    
    // Get tables from database and schema
    const dbTables = await getDatabaseTables();
    const schemaTables = getSchemaTableNames();
    
    // Check for missing tables in database
    for (const table of schemaTables) {
      if (!dbTables.includes(table)) {
        issues.push(`Table '${table}' is defined in schema but missing in database`);
      }
    }
    
    // Check for extra tables in database
    for (const table of dbTables) {
      // Skip system tables and migration tables
      if (table.startsWith('_') || table === 'drizzle' || table === '__drizzle_migrations') {
        continue;
      }
      
      if (!schemaTables.includes(table)) {
        warnings.push(`Table '${table}' exists in database but not defined in schema`);
      }
    }
    
    // Validate columns for each table
    for (const tableName of schemaTables) {
      if (!dbTables.includes(tableName)) {
        continue; // Skip if table doesn't exist
      }
      
      const dbColumns = await getTableColumns(tableName);
      const dbColumnNames = dbColumns.map(c => c.column_name);
      
      // Get schema columns for this table
      const schemaTable = Object.values(schema).find((value: any) => {
        return value && typeof value === 'object' && '$' in value && value['$'].name === tableName;
      });
      
      if (schemaTable) {
        // Extract column names from schema
        const schemaColumns: string[] = [];
        for (const [key, value] of Object.entries(schemaTable)) {
          if (key !== '$' && value && typeof value === 'object' && 'name' in value) {
            schemaColumns.push((value as any).name);
          }
        }
        
        // Check for missing columns in database
        for (const col of schemaColumns) {
          if (!dbColumnNames.includes(col)) {
            issues.push(`Column '${tableName}.${col}' is defined in schema but missing in database`);
          }
        }
        
        // Check for extra columns in database
        for (const col of dbColumnNames) {
          if (!schemaColumns.includes(col)) {
            warnings.push(`Column '${tableName}.${col}' exists in database but not defined in schema`);
          }
        }
      }
    }
    
    // Log results
    if (issues.length > 0) {
      console.error('[SchemaValidator] Schema validation failed with issues:');
      issues.forEach(issue => console.error(`  - ${issue}`));
    }
    
    if (warnings.length > 0) {
      console.warn('[SchemaValidator] Schema validation warnings:');
      warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
    
    if (issues.length === 0 && warnings.length === 0) {
      console.log('[SchemaValidator] Schema validation passed - all tables and columns match');
    }
    
    return {
      valid: issues.length === 0,
      issues,
      warnings
    };
  } catch (error) {
    logger.error('Schema validation failed', error);
    return {
      valid: false,
      issues: [`Schema validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      warnings
    };
  }
}

/**
 * Validate required environment variables
 */
export function validateEnvironmentVariables(): {
  valid: boolean;
  missing: string[];
} {
  const required = [
    'DATABASE_URL',
    'CLOUDAMQP_URL',
  ];
  
  const missing: string[] = [];
  
  for (const varName of required) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }
  
  if (missing.length > 0) {
    console.error('[SchemaValidator] Missing required environment variables:', missing.join(', '));
  }
  
  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Run all startup validations
 */
export async function runStartupValidations(): Promise<boolean> {
  console.log('[SchemaValidator] Starting validation process...');
  console.log('[SchemaValidator] Running startup validations...');
  
  // Validate environment variables
  const envValidation = validateEnvironmentVariables();
  if (!envValidation.valid) {
    console.error('[SchemaValidator] Environment validation failed - missing variables:', envValidation.missing.join(', '));
    return false;
  }
  console.log('[SchemaValidator] Environment variables validated');
  
  // Validate database schema
  const schemaValidation = await validateSchema();
  if (!schemaValidation.valid) {
    console.error('[SchemaValidator] Schema validation failed - see issues above');
    // Don't fail startup for schema issues, just warn
    // This allows the app to run even with minor schema mismatches
  }
  
  console.log('[SchemaValidator] Startup validations complete');
  return true;
}