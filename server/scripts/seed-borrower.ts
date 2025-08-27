import { db } from "../db.js";
import { 
  borrowerUsers,
  loanBorrowerLinks,
  borrowerNotices,
  loans,
  borrowerEntities
} from "@shared/schema.js";
import { eq } from "drizzle-orm";

async function seedBorrowerPortal() {
  try {
    console.log("Setting up borrower portal test data...");

    // Get the first borrower entity and loan
    const [firstBorrowerEntity] = await db
      .select()
      .from(borrowerEntities)
      .limit(1);

    const [firstLoan] = await db
      .select()
      .from(loans)
      .limit(1);

    if (!firstBorrowerEntity || !firstLoan) {
      console.log("No existing borrower entities or loans found. Please create some first.");
      return;
    }

    // Check if borrower user already exists
    const existingBorrowerUser = await db
      .select()
      .from(borrowerUsers)
      .where(eq(borrowerUsers.email, 'borrower@example.com'))
      .limit(1);

    let borrowerUserId;
    
    if (existingBorrowerUser.length === 0) {
      // Create a borrower user
      const [newBorrowerUser] = await db
        .insert(borrowerUsers)
        .values({
          borrowerEntityId: firstBorrowerEntity.id,
          email: 'borrower@example.com',
          phone: '555-0123',
          mfaEnabled: false,
          status: 'active',
        })
        .returning();
      
      borrowerUserId = newBorrowerUser.id;
      console.log(`✅ Created borrower user: ${newBorrowerUser.email}`);
    } else {
      borrowerUserId = existingBorrowerUser[0].id;
      console.log(`✅ Borrower user already exists: ${existingBorrowerUser[0].email}`);
    }

    // Link borrower to loan
    const existingLink = await db
      .select()
      .from(loanBorrowerLinks)
      .where(eq(loanBorrowerLinks.loanId, firstLoan.id))
      .limit(1);

    if (existingLink.length === 0) {
      await db
        .insert(loanBorrowerLinks)
        .values({
          loanId: firstLoan.id,
          borrowerEntityId: firstBorrowerEntity.id,
          borrowerUserId: borrowerUserId,
          role: 'primary',
          permissions: { 
            viewLoan: true, 
            makePayments: true, 
            viewDocuments: true,
            updateContact: true 
          },
        });
      
      console.log(`✅ Linked borrower to loan: ${firstLoan.loanNumber}`);
    } else {
      console.log(`✅ Borrower already linked to loan: ${firstLoan.loanNumber}`);
    }

    // Create some sample notices
    const notices = [
      {
        loanId: firstLoan.id,
        borrowerUserId: borrowerUserId,
        type: 'statement_ready',
        title: 'Your monthly statement is ready',
        message: 'Your loan statement for this month is now available for viewing and download.',
      },
      {
        loanId: firstLoan.id,
        borrowerUserId: borrowerUserId,
        type: 'payment_received',
        title: 'Payment received successfully',
        message: 'We have received your payment of $1,925.00. Thank you!',
      },
      {
        loanId: firstLoan.id,
        borrowerUserId: borrowerUserId,
        type: 'escrow_analysis',
        title: 'Annual escrow analysis complete',
        message: 'Your annual escrow analysis has been completed. No changes to your monthly payment at this time.',
      },
    ];

    for (const notice of notices) {
      await db.insert(borrowerNotices).values(notice);
    }

    console.log(`✅ Created ${notices.length} sample notices`);

    // Create a user account for the borrower to login
    // Note: The password should be handled by the existing auth system
    // We'll need to create a user in the users table with role 'borrower'
    const { users } = await import("@shared/schema.js");
    
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, 'borrower@example.com'))
      .limit(1);

    if (existingUser.length === 0) {
      await db
        .insert(users)
        .values({
          username: 'borrower',
          email: 'borrower@example.com',
          password: '$argon2id$v=19$m=65536,t=3,p=4$jXiXZBcJ2bwsOq640ZBEWg$HH3XOZqVz96uxG+xe84yOQPvEqESxitK8KjJMoP5ulE', // password: "password"
          firstName: 'John',
          lastName: 'Doe',
          role: 'borrower',
          isActive: true,
          emailVerified: true,
        });
      
      console.log(`✅ Created borrower user account for login (email: borrower@example.com, password: password)`);
    } else {
      // Update role to borrower if needed
      if (existingUser[0].role !== 'borrower') {
        await db
          .update(users)
          .set({ role: 'borrower' })
          .where(eq(users.id, existingUser[0].id));
        console.log(`✅ Updated existing user role to 'borrower'`);
      } else {
        console.log(`✅ Borrower login account already exists (email: borrower@example.com)`);
      }
    }

    console.log("\n✨ Borrower portal setup complete!");
    console.log("\n📝 Login credentials:");
    console.log("   Email: borrower@example.com");
    console.log("   Password: password");
    console.log("\n🌐 Access the borrower portal at: /portal");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error setting up borrower portal:", error);
    process.exit(1);
  }
}

seedBorrowerPortal();