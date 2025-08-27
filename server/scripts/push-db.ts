import { sql } from "drizzle-orm";
import { db } from "../db.js";

async function pushDbChanges() {
  try {
    console.log("Creating borrower portal tables...");

    // Create borrower_users table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS borrower_users (
        id SERIAL PRIMARY KEY,
        borrower_entity_id INTEGER NOT NULL REFERENCES borrower_entities(id),
        email TEXT NOT NULL,
        phone TEXT,
        mfa_enabled BOOLEAN DEFAULT FALSE NOT NULL,
        status TEXT DEFAULT 'active' NOT NULL,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS borrower_users_email_idx ON borrower_users(email)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS borrower_users_entity_idx ON borrower_users(borrower_entity_id)
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS borrower_users_entity_email_uniq ON borrower_users(borrower_entity_id, email)
    `);

    // Create loan_borrower_links table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS loan_borrower_links (
        id SERIAL PRIMARY KEY,
        loan_id INTEGER NOT NULL REFERENCES loans(id),
        borrower_entity_id INTEGER NOT NULL REFERENCES borrower_entities(id),
        borrower_user_id INTEGER REFERENCES borrower_users(id),
        role TEXT NOT NULL,
        permissions JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS loan_borrower_loan_idx ON loan_borrower_links(loan_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS loan_borrower_entity_idx ON loan_borrower_links(borrower_entity_id)
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS loan_borrower_role_uniq ON loan_borrower_links(loan_id, borrower_entity_id, role)
    `);

    // Create borrower_payment_methods table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS borrower_payment_methods (
        id SERIAL PRIMARY KEY,
        borrower_user_id INTEGER NOT NULL REFERENCES borrower_users(id),
        type TEXT NOT NULL,
        processor_token TEXT NOT NULL,
        last4 TEXT,
        bank_name TEXT,
        account_type TEXT,
        name_on_account TEXT,
        status TEXT DEFAULT 'active' NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        verified_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS payment_methods_user_idx ON borrower_payment_methods(borrower_user_id)
    `);

    // Create borrower_notices table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS borrower_notices (
        id SERIAL PRIMARY KEY,
        loan_id INTEGER NOT NULL REFERENCES loans(id),
        borrower_user_id INTEGER REFERENCES borrower_users(id),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        payload JSONB,
        read_at TIMESTAMP,
        delivery_channels TEXT[],
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS notices_loan_idx ON borrower_notices(loan_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS notices_user_idx ON borrower_notices(borrower_user_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS notices_unread_idx ON borrower_notices(read_at)
    `);

    // Create borrower_preferences table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS borrower_preferences (
        id SERIAL PRIMARY KEY,
        borrower_user_id INTEGER NOT NULL UNIQUE REFERENCES borrower_users(id),
        statement_delivery TEXT DEFAULT 'paperless',
        paperless_consent BOOLEAN DEFAULT FALSE,
        email_notifications BOOLEAN DEFAULT TRUE,
        sms_notifications BOOLEAN DEFAULT FALSE,
        language TEXT DEFAULT 'en',
        timezone TEXT DEFAULT 'America/Phoenix',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS preferences_user_uniq ON borrower_preferences(borrower_user_id)
    `);

    console.log("✅ Borrower portal tables created successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating tables:", error);
    process.exit(1);
  }
}

pushDbChanges();