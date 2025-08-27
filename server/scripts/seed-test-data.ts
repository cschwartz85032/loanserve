import { db } from '../db.js';
import { borrowerEntities, loans, properties } from '@shared/schema.js';

async function seed() {
  try {
    console.log('Creating test data...');
    
    // Create a property
    const [prop] = await db.insert(properties).values({
      propertyType: 'single_family',
      address: '123 Main Street',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62701',
      appraisedValue: 350000,
      purchasePrice: 325000,
      yearBuilt: 2005,
      squareFeet: 2100,
      bedrooms: 3,
      bathrooms: 2,
      isActive: true,
    }).returning();

    console.log('✅ Created property:', prop.address);

    // Create a borrower entity
    const [borrower] = await db.insert(borrowerEntities).values({
      entityType: 'individual',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '555-0100',
      mailingAddress: '123 Main Street',
      mailingCity: 'Springfield',
      mailingState: 'IL',
      mailingZip: '62701',
      creditScore: 720,
      isActive: true,
    }).returning();

    console.log('✅ Created borrower:', `${borrower.firstName} ${borrower.lastName}`);

    // Create a loan
    const [loan] = await db.insert(loans).values({
      loanNumber: 'LN-2025-001',
      status: 'current',
      loanType: 'conventional',
      purpose: 'purchase',
      propertyId: prop.id,
      primaryBorrowerId: borrower.id,
      originalAmount: 260000,
      principalBalance: 258750,
      interestRate: 6.75,
      rateType: 'fixed',
      loanTerm: 360,
      originationDate: '2025-01-15',
      firstPaymentDate: '2025-02-01', 
      maturityDate: '2055-01-01',
      paymentAmount: 1925.00,
      piPayment: 1683.50,
      escrowPayment: 241.50,
      paymentFrequency: 'monthly',
      paymentDueDay: 1,
      nextPaymentDate: '2025-02-01',
      lenderId: 1,
      isActive: true,
    }).returning();

    console.log('✅ Created loan:', loan.loanNumber);
    console.log('\nTest data created successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test data:', error);
    process.exit(1);
  }
}

seed();