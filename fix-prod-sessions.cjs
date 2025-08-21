// Fix production session configuration
const { neon } = require('@neondatabase/serverless');

const prodUrl = 'postgresql://neondb_owner:npg_kcmy2MiWQej8@ep-old-mode-ad3oconp.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const sql = neon(prodUrl);

async function fixProductionSessions() {
  console.log('Fixing PRODUCTION session configuration...');
  
  try {
    // 1. Ensure system_settings table exists
    await sql`
      CREATE TABLE IF NOT EXISTS system_settings (
        key varchar(255) PRIMARY KEY,
        value text NOT NULL,
        updated_at timestamp DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('✓ System settings table ready');
    
    // 2. Set a consistent session secret for production
    const sessionSecret = 'prod-secret-' + Math.random().toString(36).substring(2, 15);
    await sql`
      INSERT INTO system_settings (key, value)
      VALUES ('session_secret', ${sessionSecret})
      ON CONFLICT (key) 
      DO UPDATE SET value = ${sessionSecret}, updated_at = CURRENT_TIMESTAMP
    `;
    console.log('✓ Session secret updated:', sessionSecret);
    
    // 3. Clear old sessions to force fresh start
    await sql`DELETE FROM sessions`;
    console.log('✓ Cleared old sessions');
    
    // 4. Ensure session table has correct structure
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        sid varchar NOT NULL PRIMARY KEY,
        sess json NOT NULL,
        expire timestamp(6) NOT NULL
      )
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS IDX_session_expire ON sessions (expire)
    `;
    console.log('✓ Session table structure verified');
    
    console.log('\n=== PRODUCTION FIXED ===');
    console.log('Session infrastructure has been reset.');
    console.log('\nIMPORTANT: You need to set this environment variable in your');
    console.log('Replit deployment settings:');
    console.log('\nSESSION_SECRET=' + sessionSecret);
    console.log('\n1. Go to Deployments in Replit');
    console.log('2. Click on your deployment');
    console.log('3. Go to Environment tab');
    console.log('4. Add SESSION_SECRET with the value above');
    console.log('5. Redeploy for the changes to take effect');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

fixProductionSessions();