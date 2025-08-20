const { Pool } = require('pg');

async function createCRMTables() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('Creating CRM tables...');

    // Create CRM Notes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_notes (
        id SERIAL PRIMARY KEY,
        loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        is_private BOOLEAN DEFAULT FALSE,
        mentioned_users JSONB DEFAULT '[]',
        attachments JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✓ Created crm_notes table');

    // Create indexes for notes
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_notes_loan_idx ON crm_notes(loan_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_notes_user_idx ON crm_notes(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_notes_created_at_idx ON crm_notes(created_at)`);

    // Create CRM Tasks table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_tasks (
        id SERIAL PRIMARY KEY,
        loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
        created_by INTEGER NOT NULL REFERENCES users(id),
        assigned_to INTEGER REFERENCES users(id),
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT DEFAULT 'medium',
        due_date TIMESTAMP,
        completed_at TIMESTAMP,
        tags JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✓ Created crm_tasks table');

    // Create indexes for tasks
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_tasks_loan_idx ON crm_tasks(loan_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_tasks_assigned_to_idx ON crm_tasks(assigned_to)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_tasks_status_idx ON crm_tasks(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_tasks_due_date_idx ON crm_tasks(due_date)`);

    // Create CRM Appointments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_appointments (
        id SERIAL PRIMARY KEY,
        loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
        created_by INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        description TEXT,
        location TEXT,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        attendees JSONB DEFAULT '[]',
        reminder_minutes INTEGER DEFAULT 15,
        status TEXT DEFAULT 'scheduled',
        meeting_link TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✓ Created crm_appointments table');

    // Create indexes for appointments
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_appointments_loan_idx ON crm_appointments(loan_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_appointments_start_time_idx ON crm_appointments(start_time)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_appointments_status_idx ON crm_appointments(status)`);

    // Create CRM Calls table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_calls (
        id SERIAL PRIMARY KEY,
        loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        contact_name TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        direction TEXT NOT NULL,
        status TEXT NOT NULL,
        duration INTEGER,
        outcome TEXT,
        notes TEXT,
        scheduled_for TIMESTAMP,
        completed_at TIMESTAMP,
        recording_url TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✓ Created crm_calls table');

    // Create indexes for calls
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_calls_loan_idx ON crm_calls(loan_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_calls_user_idx ON crm_calls(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_calls_status_idx ON crm_calls(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_calls_scheduled_for_idx ON crm_calls(scheduled_for)`);

    // Create CRM Activity table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_activity (
        id SERIAL PRIMARY KEY,
        loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        activity_type TEXT NOT NULL,
        activity_data JSONB NOT NULL,
        related_id INTEGER,
        is_system BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✓ Created crm_activity table');

    // Create indexes for activity
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_activity_loan_idx ON crm_activity(loan_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_activity_user_idx ON crm_activity(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_activity_type_idx ON crm_activity(activity_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_activity_created_at_idx ON crm_activity(created_at)`);

    // Create CRM Collaborators table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_collaborators (
        id SERIAL PRIMARY KEY,
        loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        role TEXT NOT NULL,
        permissions JSONB DEFAULT '{}',
        added_by INTEGER NOT NULL REFERENCES users(id),
        added_at TIMESTAMP DEFAULT NOW() NOT NULL,
        last_activity_at TIMESTAMP
      )
    `);
    console.log('✓ Created crm_collaborators table');

    // Create indexes for collaborators
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS crm_collaborators_loan_user_idx ON crm_collaborators(loan_id, user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_collaborators_loan_idx ON crm_collaborators(loan_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_collaborators_user_idx ON crm_collaborators(user_id)`);

    // Create CRM Deals table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_deals (
        id SERIAL PRIMARY KEY,
        loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        value DECIMAL(12, 2),
        stage TEXT NOT NULL,
        probability INTEGER DEFAULT 0,
        expected_close_date DATE,
        actual_close_date DATE,
        lost_reason TEXT,
        notes TEXT,
        created_by INTEGER NOT NULL REFERENCES users(id),
        assigned_to INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✓ Created crm_deals table');

    // Create indexes for deals
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_deals_loan_idx ON crm_deals(loan_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_deals_stage_idx ON crm_deals(stage)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_deals_assigned_to_idx ON crm_deals(assigned_to)`);

    console.log('✅ All CRM tables created successfully!');

  } catch (error) {
    console.error('Error creating CRM tables:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

createCRMTables().catch(console.error);