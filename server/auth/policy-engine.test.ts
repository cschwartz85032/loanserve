/**
 * Tests for Policy Engine
 * Verifies permission resolution, row-level security, and PII masking
 */

import { db } from "../db";
import { 
  users,
  roles,
  userRoles,
  permissions,
  rolePermissions
} from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  resolveUserPermissions,
  hasPermission,
  PermissionLevel,
  PIIMasker,
  buildRowLevelFilter,
  hasRowLevelRestrictions,
  getResourceForRoute
} from "./policy-engine";

// Test helper to create a test user with roles
async function createTestUser(
  username: string,
  roleNames: string[]
): Promise<number> {
  // Create user
  const [user] = await db.insert(users).values({
    username,
    password: 'test',
    email: `${username}@test.com`,
    firstName: 'Test',
    lastName: 'User',
    role: 'lender' as any
  }).returning({ id: users.id });

  // Assign roles
  for (const roleName of roleNames) {
    const [role] = await db.select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, roleName))
      .limit(1);
    
    if (role) {
      await db.insert(userRoles).values({
        userId: user.id,
        roleId: role.id
      });
    }
  }

  return user.id;
}

// Test cases
export async function runPolicyEngineTests() {
  console.log('Running Policy Engine Tests...\n');
  
  try {
    // Test 1: Admin has full access
    console.log('Test 1: Admin permissions');
    const adminId = await createTestUser('testadmin', ['admin']);
    const adminPolicy = await resolveUserPermissions(adminId);
    
    console.assert(adminPolicy.isAdmin === true, 'Admin flag should be true');
    console.assert(
      hasPermission(adminPolicy, 'Loans', PermissionLevel.Admin),
      'Admin should have admin access to Loans'
    );
    console.assert(
      hasPermission(adminPolicy, 'Settings', PermissionLevel.Admin),
      'Admin should have admin access to Settings'
    );
    console.log('✓ Admin permissions test passed\n');

    // Test 2: Lender permissions
    console.log('Test 2: Lender permissions');
    const lenderId = await createTestUser('testlender', ['lender']);
    const lenderPolicy = await resolveUserPermissions(lenderId);
    
    console.assert(
      hasPermission(lenderPolicy, 'Loans', PermissionLevel.Write),
      'Lender should have write access to Loans'
    );
    console.assert(
      hasPermission(lenderPolicy, 'Escrow and Disbursements', PermissionLevel.Read),
      'Lender should have read access to Escrow'
    );
    console.assert(
      !hasPermission(lenderPolicy, 'Settings', PermissionLevel.Read),
      'Lender should not have access to Settings'
    );
    console.log('✓ Lender permissions test passed\n');

    // Test 3: Borrower row-level security
    console.log('Test 3: Borrower row-level security');
    const borrowerId = await createTestUser('testborrower', ['borrower']);
    const borrowerPolicy = await resolveUserPermissions(borrowerId);
    
    const borrowerRestriction = hasRowLevelRestrictions(borrowerPolicy, 'Loans');
    console.assert(
      borrowerRestriction.restricted === true,
      'Borrower should have row-level restrictions on Loans'
    );
    
    const borrowerFilter = buildRowLevelFilter(borrowerPolicy, 'Loans', 'loans');
    console.assert(
      borrowerFilter?.borrowerId === borrowerId,
      'Borrower filter should restrict to their own records'
    );
    console.log('✓ Borrower row-level security test passed\n');

    // Test 4: Investor row-level security
    console.log('Test 4: Investor row-level security');
    const investorId = await createTestUser('testinvestor', ['investor']);
    const investorPolicy = await resolveUserPermissions(investorId);
    
    const investorRestriction = hasRowLevelRestrictions(
      investorPolicy, 
      'Investor Positions and Distributions'
    );
    console.assert(
      investorRestriction.restricted === true,
      'Investor should have row-level restrictions'
    );
    
    const investorFilter = buildRowLevelFilter(
      investorPolicy, 
      'Investor Positions and Distributions',
      'investor_positions'
    );
    console.assert(
      investorFilter?.investorId === investorId,
      'Investor filter should restrict to their own positions'
    );
    console.log('✓ Investor row-level security test passed\n');

    // Test 5: Regulator PII masking
    console.log('Test 5: Regulator PII masking');
    const regulatorId = await createTestUser('testregulator', ['regulator']);
    const regulatorPolicy = await resolveUserPermissions(regulatorId);
    
    const testData = {
      id: 1,
      email: 'john.doe@example.com',
      phone: '555-123-4567',
      ssn: '123-45-6789',
      address: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      zip_code: '12345',
      bank_account_number: '1234567890',
      routing_number: '987654321'
    };
    
    const masked = PIIMasker.applyMasking(testData, regulatorPolicy, 'Loans');
    console.assert(
      masked.email === 'j***@example.com',
      `Email should be masked: got ${masked.email}`
    );
    console.assert(
      masked.phone === '555-***-****',
      `Phone should be masked: got ${masked.phone}`
    );
    console.assert(
      masked.ssn === '***-**-6789',
      `SSN should be masked: got ${masked.ssn}`
    );
    console.assert(
      masked.address === '***',
      `Address should be masked: got ${masked.address}`
    );
    console.assert(
      masked.bank_account_number === '****7890',
      `Bank account should be masked: got ${masked.bank_account_number}`
    );
    console.log('✓ Regulator PII masking test passed\n');

    // Test 6: Legal read-all permissions
    console.log('Test 6: Legal permissions');
    const legalId = await createTestUser('testlegal', ['legal']);
    const legalPolicy = await resolveUserPermissions(legalId);
    
    console.assert(
      hasPermission(legalPolicy, 'Loans', PermissionLevel.Read),
      'Legal should have read access to Loans'
    );
    console.assert(
      hasPermission(legalPolicy, 'Audit Logs', PermissionLevel.Write),
      'Legal should have write access to Audit Logs'
    );
    console.assert(
      !hasPermission(legalPolicy, 'Settings', PermissionLevel.Read),
      'Legal should not have access to Settings'
    );
    console.log('✓ Legal permissions test passed\n');

    // Test 7: Title company permissions
    console.log('Test 7: Title company permissions');
    const titleId = await createTestUser('testtitle', ['title']);
    const titlePolicy = await resolveUserPermissions(titleId);
    
    console.assert(
      hasPermission(titlePolicy, 'Loans', PermissionLevel.Read),
      'Title should have read access to Loans'
    );
    console.assert(
      hasPermission(titlePolicy, 'Escrow and Disbursements', PermissionLevel.Write),
      'Title should have write access to Escrow'
    );
    console.assert(
      !hasPermission(titlePolicy, 'Users and Roles', PermissionLevel.Read),
      'Title should not have access to Users'
    );
    console.log('✓ Title company permissions test passed\n');

    // Test 8: Resource route mapping
    console.log('Test 8: Resource route mapping');
    console.assert(
      getResourceForRoute('/api/loans') === 'Loans',
      'Should map /api/loans to Loans resource'
    );
    console.assert(
      getResourceForRoute('/api/admin/users') === 'Users and Roles',
      'Should map /api/admin/users to Users and Roles resource'
    );
    console.assert(
      getResourceForRoute('/api/escrow/transactions') === 'Escrow and Disbursements',
      'Should map /api/escrow routes to Escrow resource'
    );
    console.log('✓ Resource route mapping test passed\n');

    // Test 9: Multiple roles
    console.log('Test 9: Multiple roles permission merging');
    const multiRoleId = await createTestUser('multirole', ['lender', 'title']);
    const multiRolePolicy = await resolveUserPermissions(multiRoleId);
    
    // Should have the highest permission from both roles
    console.assert(
      hasPermission(multiRolePolicy, 'Loans', PermissionLevel.Write),
      'Multi-role user should have write access to Loans (from lender)'
    );
    console.assert(
      hasPermission(multiRolePolicy, 'Escrow and Disbursements', PermissionLevel.Write),
      'Multi-role user should have write access to Escrow (from title)'
    );
    console.log('✓ Multiple roles test passed\n');

    // Clean up test users
    await db.delete(users).where(eq(users.username, 'testadmin'));
    await db.delete(users).where(eq(users.username, 'testlender'));
    await db.delete(users).where(eq(users.username, 'testborrower'));
    await db.delete(users).where(eq(users.username, 'testinvestor'));
    await db.delete(users).where(eq(users.username, 'testregulator'));
    await db.delete(users).where(eq(users.username, 'testlegal'));
    await db.delete(users).where(eq(users.username, 'testtitle'));
    await db.delete(users).where(eq(users.username, 'multirole'));

    console.log('✅ All Policy Engine tests passed!\n');
    return true;
  } catch (error) {
    console.error('❌ Policy Engine test failed:', error);
    return false;
  }
}

// Run tests if executed directly
if (require.main === module) {
  runPolicyEngineTests()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}