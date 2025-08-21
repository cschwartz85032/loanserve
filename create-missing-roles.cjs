const { Pool } = require('pg');

async function createMissingRoles() {
  let connectionString = process.env.DATABASE_URL;
  if (connectionString && connectionString.includes('sslmode=requir')) {
    connectionString = connectionString.replace('sslmode=requir', 'sslmode=require');
  }
  
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Creating missing roles in the database...\n');
    
    // Define all roles with descriptions and their default permissions
    const roleDefinitions = [
      {
        name: 'lender',
        description: 'Loan originator and lender',
        permissions: [
          { resource: 'Loans', permission: 'admin' },
          { resource: 'Payments', permission: 'write' },
          { resource: 'Reports', permission: 'read' },
          { resource: 'Investor Positions', permission: 'read' }
        ]
      },
      {
        name: 'borrower',
        description: 'Loan borrower with limited access',
        permissions: [
          { resource: 'Loans', permission: 'read' },
          { resource: 'Payments', permission: 'read' },
          { resource: 'Reports', permission: 'read' }
        ]
      },
      {
        name: 'investor',
        description: 'Investor with portfolio access',
        permissions: [
          { resource: 'Loans', permission: 'read' },
          { resource: 'Investor Positions', permission: 'read' },
          { resource: 'Reports', permission: 'read' },
          { resource: 'Payments', permission: 'read' }
        ]
      },
      {
        name: 'escrow_officer',
        description: 'Escrow and disbursement manager',
        permissions: [
          { resource: 'Loans', permission: 'read' },
          { resource: 'Escrow', permission: 'admin' },
          { resource: 'Payments', permission: 'write' },
          { resource: 'Reports', permission: 'read' }
        ]
      },
      {
        name: 'legal',
        description: 'Legal team with compliance access',
        permissions: [
          { resource: 'Loans', permission: 'read' },
          { resource: 'Reports', permission: 'read' },
          { resource: 'Audit Logs', permission: 'read' },
          { resource: 'Settings', permission: 'read' }
        ]
      },
      {
        name: 'servicer',
        description: 'Loan servicing team',
        permissions: [
          { resource: 'Loans', permission: 'write' },
          { resource: 'Payments', permission: 'admin' },
          { resource: 'Escrow', permission: 'write' },
          { resource: 'Reports', permission: 'write' },
          { resource: 'Investor Positions', permission: 'write' }
        ]
      }
    ];
    
    // Check existing roles
    const existingRoles = await pool.query(`
      SELECT name FROM roles
    `);
    const existingRoleNames = existingRoles.rows.map(r => r.name);
    
    // Insert missing roles
    for (const roleDef of roleDefinitions) {
      if (!existingRoleNames.includes(roleDef.name)) {
        console.log(`Creating role: ${roleDef.name}`);
        
        // Insert the role
        const roleResult = await pool.query(`
          INSERT INTO roles (name, description, created_at, updated_at)
          VALUES ($1, $2, NOW(), NOW())
          RETURNING id
        `, [roleDef.name, roleDef.description]);
        
        const roleId = roleResult.rows[0].id;
        console.log(`  ✅ Role created with ID: ${roleId}`);
        
        // Insert permissions for this role
        for (const perm of roleDef.permissions) {
          await pool.query(`
            INSERT INTO role_permissions (role_id, resource, permission, created_at, updated_at)
            VALUES ($1, $2, $3, NOW(), NOW())
          `, [roleId, perm.resource, perm.permission]);
          console.log(`    - Added permission: ${perm.resource} (${perm.permission})`);
        }
      } else {
        console.log(`⏭️  Role '${roleDef.name}' already exists, skipping...`);
      }
    }
    
    // Verify all roles now exist
    console.log('\n=====================================');
    console.log('Verifying all roles:');
    console.log('=====================================');
    
    const allRoles = await pool.query(`
      SELECT name, description 
      FROM roles 
      ORDER BY name
    `);
    
    console.log(`\nTotal roles in database: ${allRoles.rows.length}`);
    allRoles.rows.forEach(role => {
      console.log(`  ✅ ${role.name}: ${role.description || 'No description'}`);
    });
    
    console.log('\n✅ All roles have been created successfully!');
    
  } catch (error) {
    console.error('Error creating roles:', error);
  } finally {
    await pool.end();
  }
}

createMissingRoles();