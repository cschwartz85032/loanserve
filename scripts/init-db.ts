import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function initializeDatabase() {
  try {
    console.log("Initializing database tables...");
    
    // Create users table if not exists
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        is_admin BOOLEAN DEFAULT false,
        last_login TIMESTAMP,
        password_reset_token TEXT,
        password_reset_expires TIMESTAMP,
        email_verified BOOLEAN DEFAULT false,
        email_verification_token TEXT,
        two_factor_enabled BOOLEAN DEFAULT false,
        two_factor_secret TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    
    // Create roles table if not exists
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        permissions JSONB,
        is_system BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    
    // Create user_roles junction table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_roles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) NOT NULL,
        role_id INTEGER REFERENCES roles(id) NOT NULL,
        assigned_by INTEGER REFERENCES users(id),
        assigned_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(user_id, role_id)
      )
    `);
    
    // Create borrower_entities table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS borrower_entities (
        id SERIAL PRIMARY KEY,
        entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('individual', 'company')),
        legal_name VARCHAR(255),
        first_name VARCHAR(100),
        middle_name VARCHAR(100),
        last_name VARCHAR(100),
        suffix VARCHAR(20),
        date_of_birth DATE,
        ssn_tin VARCHAR(20),
        driver_license_number VARCHAR(50),
        driver_license_state VARCHAR(2),
        email VARCHAR(255),
        phone VARCHAR(20),
        secondary_phone VARCHAR(20),
        mailing_address JSONB,
        employment_info JSONB,
        annual_income DECIMAL(12,2),
        credit_score INTEGER,
        bankruptcy_history JSONB,
        marital_status VARCHAR(20),
        is_deceased BOOLEAN DEFAULT false,
        death_date DATE,
        estate_contact JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    
    // Create properties table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS properties (
        id SERIAL PRIMARY KEY,
        street_address VARCHAR(255) NOT NULL,
        unit VARCHAR(50),
        city VARCHAR(100) NOT NULL,
        state VARCHAR(2) NOT NULL,
        zip_code VARCHAR(10) NOT NULL,
        county VARCHAR(100),
        property_type VARCHAR(50),
        year_built INTEGER,
        square_footage INTEGER,
        lot_size DECIMAL(10,2),
        bedrooms INTEGER,
        bathrooms DECIMAL(3,1),
        assessed_value DECIMAL(12,2),
        market_value DECIMAL(12,2),
        purchase_price DECIMAL(12,2),
        purchase_date DATE,
        property_tax_amount DECIMAL(10,2),
        property_tax_frequency VARCHAR(20),
        hoa_amount DECIMAL(10,2),
        hoa_frequency VARCHAR(20),
        insurance_amount DECIMAL(10,2),
        insurance_frequency VARCHAR(20),
        flood_zone VARCHAR(10),
        occupancy_status VARCHAR(50),
        is_primary_residence BOOLEAN,
        rental_income DECIMAL(10,2),
        legal_description TEXT,
        parcel_number VARCHAR(50),
        latitude DECIMAL(9,6),
        longitude DECIMAL(9,6),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    
    // Create investors table 
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS investors (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    
    // Create loans table (simplified for initial creation)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS loans (
        id SERIAL PRIMARY KEY,
        loan_number VARCHAR(50) UNIQUE NOT NULL,
        loan_type VARCHAR(50) NOT NULL,
        property_id INTEGER,
        origination_date DATE,
        maturity_date DATE,
        original_balance DECIMAL(12,2),
        current_principal_balance DECIMAL(12,2),
        interest_rate DECIMAL(5,4),
        payment_amount DECIMAL(10,2),
        payment_frequency VARCHAR(20),
        escrow_payment DECIMAL(10,2),
        next_due_date DATE,
        last_payment_date DATE,
        loan_status VARCHAR(50),
        is_escrowed BOOLEAN DEFAULT false,
        investor_id INTEGER REFERENCES investors(id),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    
    // Create additional core tables
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        loan_id INTEGER REFERENCES loans(id),
        payment_date DATE,
        effective_date DATE,
        amount DECIMAL(10,2),
        payment_type VARCHAR(50),
        payment_method VARCHAR(50),
        reference_number VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS escrow_accounts (
        id SERIAL PRIMARY KEY,
        loan_id INTEGER REFERENCES loans(id),
        account_number VARCHAR(50),
        current_balance DECIMAL(12,2),
        required_balance DECIMAL(12,2),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        type VARCHAR(50),
        title VARCHAR(255),
        message TEXT,
        data JSONB,
        is_read BOOLEAN DEFAULT false,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    
    // Create indexes for performance
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_loans_loan_number ON loans(loan_number)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_payments_loan_id ON payments(loan_id)`);
    
    // Insert default admin role
    await db.execute(sql`
      INSERT INTO roles (name, description, is_system, permissions)
      VALUES ('admin', 'System Administrator', true, '["*"]')
      ON CONFLICT (name) DO NOTHING
    `);
    
    // Insert default user role
    await db.execute(sql`
      INSERT INTO roles (name, description, is_system, permissions)
      VALUES ('user', 'Standard User', true, '["read:own", "write:own"]')
      ON CONFLICT (name) DO NOTHING
    `);
    
    console.log("Database initialization complete!");
    process.exit(0);
  } catch (error) {
    console.error("Error initializing database:", error);
    process.exit(1);
  }
}

initializeDatabase();