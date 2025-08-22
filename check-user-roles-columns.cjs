const { db } = require('./server/db');
const { sql } = require('drizzle-orm');

(async () => {
  try {
    const result = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user_roles'
      ORDER BY ordinal_position
    `);
    console.log('user_roles columns:', result.rows);
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
})();