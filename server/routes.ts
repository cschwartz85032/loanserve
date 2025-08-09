import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { analyzeDocument } from "./openai";
import { 
  insertLoanSchema, 
  insertPaymentSchema, 
  insertEscrowAccountSchema,
  insertEscrowTransactionSchema,
  insertDocumentSchema,
  insertNotificationSchema,
  insertBorrowerEntitySchema,
  insertPropertySchema,
  insertLoanBorrowerSchema,
  insertPaymentScheduleSchema,
  insertEscrowItemSchema
} from "@shared/schema";

function isAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}

// Configure multer for file uploads
const uploadStorage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const uploadDir = 'server/uploads';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
    } catch (error) {
      console.error('Error creating upload directory:', error);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: uploadStorage });

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  await setupAuth(app);

  // ============= BORROWER ENTITY ROUTES =============
  app.get("/api/borrowers", async (req, res) => {
    try {
      const borrowers = await storage.getBorrowerEntities();
      res.json(borrowers);
    } catch (error) {
      console.error("Error fetching borrowers:", error);
      res.status(500).json({ error: "Failed to fetch borrowers" });
    }
  });

  app.get("/api/borrowers/:id", async (req, res) => {
    try {
      const borrower = await storage.getBorrowerEntity(parseInt(req.params.id));
      if (!borrower) {
        return res.status(404).json({ error: "Borrower not found" });
      }
      res.json(borrower);
    } catch (error) {
      console.error("Error fetching borrower:", error);
      res.status(500).json({ error: "Failed to fetch borrower" });
    }
  });

  app.post("/api/borrowers", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertBorrowerEntitySchema.parse(req.body);
      const borrower = await storage.createBorrowerEntity(validatedData);
      
      await storage.createAuditLog({
        userId: req.user?.id,
        action: "CREATE_BORROWER",
        entityType: "borrower",
        entityId: borrower.id,
        newValues: borrower
      });

      res.status(201).json(borrower);
    } catch (error) {
      console.error("Error creating borrower:", error);
      res.status(400).json({ error: "Invalid borrower data" });
    }
  });

  app.put("/api/borrowers/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingBorrower = await storage.getBorrowerEntity(id);
      if (!existingBorrower) {
        return res.status(404).json({ error: "Borrower not found" });
      }

      const borrower = await storage.updateBorrowerEntity(id, req.body);
      
      await storage.createAuditLog({
        userId: req.user?.id,
        action: "UPDATE_BORROWER",
        entityType: "borrower",
        entityId: borrower.id,
        previousValues: existingBorrower,
        newValues: borrower
      });

      res.json(borrower);
    } catch (error) {
      console.error("Error updating borrower:", error);
      res.status(400).json({ error: "Failed to update borrower" });
    }
  });

  // ============= PROPERTY ROUTES =============
  app.get("/api/properties", async (req, res) => {
    try {
      const properties = await storage.getProperties();
      res.json(properties);
    } catch (error) {
      console.error("Error fetching properties:", error);
      res.status(500).json({ error: "Failed to fetch properties" });
    }
  });

  app.get("/api/properties/:id", async (req, res) => {
    try {
      const property = await storage.getProperty(parseInt(req.params.id));
      if (!property) {
        return res.status(404).json({ error: "Property not found" });
      }
      res.json(property);
    } catch (error) {
      console.error("Error fetching property:", error);
      res.status(500).json({ error: "Failed to fetch property" });
    }
  });

  app.post("/api/properties", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertPropertySchema.parse(req.body);
      const property = await storage.createProperty(validatedData);
      
      // Temporarily skip audit log until database schema is updated
      // await storage.createAuditLog({
      //   userId: req.user?.id,
      //   action: "CREATE_PROPERTY",
      //   entityType: "property",
      //   entityId: property.id,
      //   newValues: property
      // });

      res.status(201).json(property);
    } catch (error: any) {
      console.error("Error creating property:", error);
      const errorMessage = error.issues ? error.issues[0].message : error.message || "Invalid property data";
      res.status(400).json({ error: errorMessage, details: error.issues || error.message });
    }
  });

  app.put("/api/properties/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingProperty = await storage.getProperty(id);
      if (!existingProperty) {
        return res.status(404).json({ error: "Property not found" });
      }

      const property = await storage.updateProperty(id, req.body);
      
      await storage.createAuditLog({
        userId: req.user?.id,
        action: "UPDATE_PROPERTY",
        entityType: "property",
        entityId: property.id,
        previousValues: existingProperty,
        newValues: property
      });

      res.json(property);
    } catch (error) {
      console.error("Error updating property:", error);
      res.status(400).json({ error: "Failed to update property" });
    }
  });

  // ============= LOAN ROUTES =============
  app.get("/api/loans", async (req, res) => {
    try {
      const { 
        lenderId, 
        servicerId, 
        investorId, 
        status, 
        limit = "50", 
        offset = "0" 
      } = req.query as Record<string, string>;

      const loans = await storage.getLoans({
        lenderId: lenderId ? parseInt(lenderId) : undefined,
        servicerId: servicerId ? parseInt(servicerId) : undefined,
        investorId: investorId ? parseInt(investorId) : undefined,
        status: status || undefined,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json(loans);
    } catch (error) {
      console.error("Error fetching loans:", error);
      res.status(500).json({ error: "Failed to fetch loans" });
    }
  });

  app.get("/api/loans/metrics", async (req, res) => {
    try {
      const userId = req.user?.id;
      const metrics = await storage.getLoanMetrics(userId);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching loan metrics:", error);
      res.status(500).json({ error: "Failed to fetch metrics" });
    }
  });

  app.get("/api/loans/:id", async (req, res) => {
    try {
      const loan = await storage.getLoan(parseInt(req.params.id));
      if (!loan) {
        return res.status(404).json({ error: "Loan not found" });
      }
      res.json(loan);
    } catch (error) {
      console.error("Error fetching loan:", error);
      res.status(500).json({ error: "Failed to fetch loan" });
    }
  });

  app.post("/api/loans", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertLoanSchema.parse(req.body);
      const loan = await storage.createLoan(validatedData);
      
      // Temporarily skip audit log until database schema is updated
      // await storage.createAuditLog({
      //   userId: req.user?.id,
      //   loanId: loan.id,
      //   action: "CREATE_LOAN",
      //   entityType: "loan",
      //   entityId: loan.id,
      //   newValues: loan
      // });

      res.status(201).json(loan);
    } catch (error: any) {
      console.error("Error creating loan:", error);
      const errorMessage = error.issues ? error.issues[0].message : error.message || "Invalid loan data";
      res.status(400).json({ error: errorMessage, details: error.issues || error.message });
    }
  });

  app.put("/api/loans/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingLoan = await storage.getLoan(id);
      if (!existingLoan) {
        return res.status(404).json({ error: "Loan not found" });
      }

      const loan = await storage.updateLoan(id, req.body);
      
      // Temporarily skip audit log until database schema is updated
      // await storage.createAuditLog({
      //   userId: req.user?.id,
      //   loanId: loan.id,
      //   action: "UPDATE_LOAN",
      //   entityType: "loan",
      //   entityId: loan.id,
      //   previousValues: existingLoan,
      //   newValues: loan
      // });

      res.json(loan);
    } catch (error) {
      console.error("Error updating loan:", error);
      res.status(400).json({ error: "Failed to update loan" });
    }
  });

  // ============= LOAN BORROWER ROUTES =============
  app.get("/api/loans/:loanId/borrowers", async (req, res) => {
    try {
      const loanBorrowers = await storage.getLoanBorrowers(parseInt(req.params.loanId));
      res.json(loanBorrowers);
    } catch (error) {
      console.error("Error fetching loan borrowers:", error);
      res.status(500).json({ error: "Failed to fetch loan borrowers" });
    }
  });

  app.post("/api/loans/:loanId/borrowers", isAuthenticated, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const validatedData = insertLoanBorrowerSchema.parse({
        ...req.body,
        loanId
      });
      const loanBorrower = await storage.createLoanBorrower(validatedData);
      res.status(201).json(loanBorrower);
    } catch (error) {
      console.error("Error creating loan borrower:", error);
      res.status(400).json({ error: "Invalid loan borrower data" });
    }
  });

  app.delete("/api/loan-borrowers/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteLoanBorrower(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting loan borrower:", error);
      res.status(400).json({ error: "Failed to delete loan borrower" });
    }
  });

  // ============= PAYMENT ROUTES =============
  app.get("/api/loans/:loanId/payments", async (req, res) => {
    try {
      const { limit = "50" } = req.query as Record<string, string>;
      const payments = await storage.getPayments(parseInt(req.params.loanId), parseInt(limit));
      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });

  app.post("/api/loans/:loanId/payments", isAuthenticated, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const validatedData = insertPaymentSchema.parse({
        ...req.body,
        loanId
      });
      const payment = await storage.createPayment(validatedData);
      
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId: loanId,
        action: "CREATE_PAYMENT",
        entityType: "payment",
        entityId: payment.id,
        newValues: payment
      });

      res.status(201).json(payment);
    } catch (error) {
      console.error("Error creating payment:", error);
      res.status(400).json({ error: "Invalid payment data" });
    }
  });

  app.put("/api/payments/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const payment = await storage.updatePayment(id, req.body);
      
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId: payment.loanId,
        action: "UPDATE_PAYMENT",
        entityType: "payment",
        entityId: payment.id,
        newValues: payment
      });

      res.json(payment);
    } catch (error) {
      console.error("Error updating payment:", error);
      res.status(400).json({ error: "Failed to update payment" });
    }
  });

  // ============= PAYMENT SCHEDULE ROUTES =============
  app.get("/api/loans/:loanId/payment-schedule", async (req, res) => {
    try {
      const schedule = await storage.getPaymentSchedule(parseInt(req.params.loanId));
      res.json(schedule);
    } catch (error) {
      console.error("Error fetching payment schedule:", error);
      res.status(500).json({ error: "Failed to fetch payment schedule" });
    }
  });

  app.post("/api/loans/:loanId/payment-schedule", isAuthenticated, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const validatedData = insertPaymentScheduleSchema.parse({
        ...req.body,
        loanId
      });
      const schedule = await storage.createPaymentSchedule(validatedData);
      res.status(201).json(schedule);
    } catch (error) {
      console.error("Error creating payment schedule:", error);
      res.status(400).json({ error: "Invalid payment schedule data" });
    }
  });

  app.post("/api/loans/:loanId/payment-schedule/generate", isAuthenticated, async (req, res) => {
    try {
      const schedule = await storage.generatePaymentSchedule(parseInt(req.params.loanId));
      res.json(schedule);
    } catch (error) {
      console.error("Error generating payment schedule:", error);
      res.status(500).json({ error: "Failed to generate payment schedule" });
    }
  });

  // ============= ESCROW ROUTES =============
  app.get("/api/loans/:loanId/escrow", async (req, res) => {
    try {
      const escrowAccount = await storage.getEscrowAccount(parseInt(req.params.loanId));
      if (!escrowAccount) {
        return res.status(404).json({ error: "Escrow account not found" });
      }
      res.json(escrowAccount);
    } catch (error) {
      console.error("Error fetching escrow account:", error);
      res.status(500).json({ error: "Failed to fetch escrow account" });
    }
  });

  app.post("/api/loans/:loanId/escrow", isAuthenticated, async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const validatedData = insertEscrowAccountSchema.parse({
        ...req.body,
        loanId
      });
      const escrowAccount = await storage.createEscrowAccount(validatedData);
      
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId: loanId,
        action: "CREATE_ESCROW_ACCOUNT",
        entityType: "escrow_account",
        entityId: escrowAccount.id,
        newValues: escrowAccount
      });

      res.status(201).json(escrowAccount);
    } catch (error) {
      console.error("Error creating escrow account:", error);
      res.status(400).json({ error: "Invalid escrow account data" });
    }
  });

  app.put("/api/escrow/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const escrowAccount = await storage.updateEscrowAccount(id, req.body);
      
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId: escrowAccount.loanId,
        action: "UPDATE_ESCROW_ACCOUNT",
        entityType: "escrow_account",
        entityId: escrowAccount.id,
        newValues: escrowAccount
      });

      res.json(escrowAccount);
    } catch (error) {
      console.error("Error updating escrow account:", error);
      res.status(400).json({ error: "Failed to update escrow account" });
    }
  });

  app.get("/api/escrow/metrics", async (req, res) => {
    try {
      const metrics = await storage.getEscrowMetrics();
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching escrow metrics:", error);
      res.status(500).json({ error: "Failed to fetch escrow metrics" });
    }
  });

  // ============= ESCROW PAYMENTS ROUTES (for legacy compatibility) =============
  app.get("/api/escrow-payments", async (req, res) => {
    try {
      const { limit = "10" } = req.query as Record<string, string>;
      // Return recent escrow transactions across all accounts
      const transactions = await storage.getEscrowTransactions({
        limit: parseInt(limit)
      });
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching escrow payments:", error);
      res.status(500).json({ error: "Failed to fetch escrow payments" });
    }
  });

  // ============= ESCROW TRANSACTION ROUTES =============
  app.get("/api/escrow/:escrowId/transactions", async (req, res) => {
    try {
      const { limit = "50" } = req.query as Record<string, string>;
      const transactions = await storage.getEscrowTransactions({
        escrowAccountId: parseInt(req.params.escrowId),
        limit: parseInt(limit)
      });
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching escrow transactions:", error);
      res.status(500).json({ error: "Failed to fetch escrow transactions" });
    }
  });

  app.post("/api/escrow/:escrowId/transactions", isAuthenticated, async (req, res) => {
    try {
      const escrowAccountId = parseInt(req.params.escrowId);
      const validatedData = insertEscrowTransactionSchema.parse({
        ...req.body,
        escrowAccountId
      });
      const transaction = await storage.createEscrowTransaction(validatedData);
      
      await storage.createAuditLog({
        userId: req.user?.id,
        action: "CREATE_ESCROW_TRANSACTION",
        entityType: "escrow_transaction",
        entityId: transaction.id,
        newValues: transaction
      });

      res.status(201).json(transaction);
    } catch (error) {
      console.error("Error creating escrow transaction:", error);
      res.status(400).json({ error: "Invalid escrow transaction data" });
    }
  });

  // ============= ESCROW ITEM ROUTES =============
  app.get("/api/escrow/:escrowId/items", async (req, res) => {
    try {
      const items = await storage.getEscrowItems(parseInt(req.params.escrowId));
      res.json(items);
    } catch (error) {
      console.error("Error fetching escrow items:", error);
      res.status(500).json({ error: "Failed to fetch escrow items" });
    }
  });

  app.post("/api/escrow/:escrowId/items", isAuthenticated, async (req, res) => {
    try {
      const escrowAccountId = parseInt(req.params.escrowId);
      const validatedData = insertEscrowItemSchema.parse({
        ...req.body,
        escrowAccountId
      });
      const item = await storage.createEscrowItem(validatedData);
      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating escrow item:", error);
      res.status(400).json({ error: "Invalid escrow item data" });
    }
  });

  // ============= DOCUMENT ROUTES =============
  
  // Document upload endpoint with multipart/form-data support
  app.post("/api/documents/upload", isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const { loanId, category, description } = req.body;
      
      if (!loanId) {
        return res.status(400).json({ error: "Loan ID is required" });
      }

      // Create document record in database
      const document = await storage.createDocument({
        loanId: parseInt(loanId),
        category: category || 'loan_document',
        title: req.file.originalname,
        description: description || `Uploaded ${req.file.originalname}`,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        storageUrl: `/uploads/${req.file.filename}`,
        uploadedBy: req.user?.id
      });

      res.status(201).json(document);
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  app.get("/api/documents", async (req, res) => {
    try {
      const { loanId, borrowerId, category } = req.query as Record<string, string>;
      const documents = await storage.getDocuments({
        loanId: loanId ? parseInt(loanId) : undefined,
        borrowerId: borrowerId ? parseInt(borrowerId) : undefined,
        category: category || undefined
      });
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/:id", async (req, res) => {
    try {
      const document = await storage.getDocument(parseInt(req.params.id));
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      console.error("Error fetching document:", error);
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  app.delete("/api/documents/:id", isAuthenticated, async (req, res) => {
    try {
      const document = await storage.getDocument(parseInt(req.params.id));
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      await storage.deleteDocument(parseInt(req.params.id));
      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // Serve document file content
  app.get("/api/documents/:id/file", async (req, res) => {
    try {
      const document = await storage.getDocument(parseInt(req.params.id));
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Get the file path from storageUrl
      let filePath = '';
      if (document.storageUrl.startsWith('/documents/')) {
        // Handle local file storage
        filePath = path.join('server/uploads', document.storageUrl.replace('/documents/', ''));
      } else {
        return res.status(404).json({ error: "File not found" });
      }

      try {
        // Check if file exists
        await fs.access(filePath);
        
        // Set headers for proper file serving
        const fileName = document.fileName || document.originalFileName || 'document';
        const mimeType = document.mimeType || 'application/octet-stream';
        
        res.set({
          'Content-Type': mimeType,
          'Content-Disposition': `inline; filename="${fileName}"`,
          'Cache-Control': 'public, max-age=3600',
          'X-Frame-Options': 'SAMEORIGIN',
          'X-Content-Type-Options': 'nosniff'
        });

        // Stream the file
        const fileStream = await fs.readFile(filePath);
        res.send(fileStream);
        
      } catch (fileError) {
        console.error("File not found:", filePath);
        
        // Fallback: Return a sample document if actual file doesn't exist
        const fileName = document.fileName || document.originalFileName || 'document';
        const mimeType = document.mimeType || 'application/octet-stream';
        
        res.set({
          'Content-Type': 'text/plain',
          'Content-Disposition': `inline; filename="${fileName}.txt"`,
          'Cache-Control': 'public, max-age=3600',
        });

        const fallbackContent = `DOCUMENT: ${document.title || fileName}

This document was uploaded to the system but the file content is not available for preview.

Document Information:
- Type: ${document.category || 'Document'}
- Created: ${new Date(document.createdAt).toLocaleDateString()}  
- File Size: ${document.fileSize ? Math.round(document.fileSize / 1024) + ' KB' : 'Unknown'}
- MIME Type: ${mimeType}
- Description: ${document.description || 'No description available'}

To implement full file serving:
1. Upload actual files using the file upload endpoint
2. Store files in the server/uploads directory
3. Reference the correct file path in the database`;

        res.send(fallbackContent);
      }
    } catch (error) {
      console.error("Error serving document file:", error);
      res.status(500).json({ error: "Failed to serve document file" });
    }
  });

  // Helper function to determine document category
  function determineCategory(fileName: string): string {
    const lowerName = fileName.toLowerCase();
    if (lowerName.includes('loan') || lowerName.includes('application')) return 'loan_application';
    if (lowerName.includes('agreement')) return 'loan_agreement';
    if (lowerName.includes('note')) return 'promissory_note';
    if (lowerName.includes('deed')) return 'deed_of_trust';
    if (lowerName.includes('mortgage')) return 'mortgage';
    if (lowerName.includes('insurance') || lowerName.includes('policy')) return 'insurance_policy';
    if (lowerName.includes('tax')) return 'tax_document';
    if (lowerName.includes('escrow')) return 'escrow_statement';
    if (lowerName.includes('title')) return 'title_report';
    if (lowerName.includes('appraisal')) return 'appraisal';
    if (lowerName.includes('inspection')) return 'inspection';
    if (lowerName.includes('financial') || lowerName.includes('statement')) return 'financial_statement';
    if (lowerName.includes('income')) return 'income_verification';
    if (lowerName.includes('closing')) return 'closing_disclosure';
    if (lowerName.includes('settlement')) return 'settlement_statement';
    return 'other';
  }

  // File upload endpoint for documents
  app.post("/api/documents/upload", isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      // Determine document category based on file type or filename
      const category = determineCategory(req.file.originalname);
      
      // Create document record in database
      const documentData = {
        title: req.body.title || req.file.originalname.split('.')[0],
        fileName: req.file.originalname,
        category: req.body.category || category,
        storageUrl: `/documents/${req.file.filename}`,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        description: req.body.description || 'Uploaded via file upload',
        uploadedBy: req.user?.id,
        version: 1,
        isActive: true,
        loanId: req.body.loanId ? parseInt(req.body.loanId) : null,
        borrowerId: req.body.borrowerId ? parseInt(req.body.borrowerId) : null,
      };

      const validatedData = insertDocumentSchema.parse(documentData);
      const document = await storage.createDocument(validatedData);
      
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId: document.loanId,
        action: "CREATE_DOCUMENT",
        entityType: "document",
        entityId: document.id,
        newValues: document
      });

      res.status(201).json(document);
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(400).json({ error: "Failed to upload document" });
    }
  });

  app.post("/api/documents", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertDocumentSchema.parse({
        ...req.body,
        uploadedBy: req.user?.id
      });
      const document = await storage.createDocument(validatedData);
      
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId: document.loanId,
        action: "CREATE_DOCUMENT",
        entityType: "document",
        entityId: document.id,
        newValues: document
      });

      res.status(201).json(document);
    } catch (error) {
      console.error("Error creating document:", error);
      res.status(400).json({ error: "Invalid document data" });
    }
  });

  app.put("/api/documents/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingDocument = await storage.getDocument(id);
      if (!existingDocument) {
        return res.status(404).json({ error: "Document not found" });
      }

      const document = await storage.updateDocument(id, req.body);
      
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId: document.loanId,
        action: "UPDATE_DOCUMENT",
        entityType: "document",
        entityId: document.id,
        previousValues: existingDocument,
        newValues: document
      });

      res.json(document);
    } catch (error) {
      console.error("Error updating document:", error);
      res.status(400).json({ error: "Failed to update document" });
    }
  });

  app.delete("/api/documents/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      await storage.deleteDocument(id);
      
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId: document.loanId,
        action: "DELETE_DOCUMENT",
        entityType: "document",
        entityId: document.id,
        previousValues: document
      });

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(400).json({ error: "Failed to delete document" });
    }
  });

  // ============= NOTIFICATION ROUTES =============
  app.get("/api/notifications", isAuthenticated, async (req, res) => {
    try {
      const { limit = "20" } = req.query as Record<string, string>;
      const notifications = await storage.getNotifications(req.user!.id, parseInt(limit));
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", isAuthenticated, async (req, res) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.user!.id);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread notification count:", error);
      res.status(500).json({ error: "Failed to fetch notification count" });
    }
  });

  app.post("/api/notifications", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification(validatedData);
      res.status(201).json(notification);
    } catch (error) {
      console.error("Error creating notification:", error);
      res.status(400).json({ error: "Invalid notification data" });
    }
  });

  app.put("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    try {
      await storage.markNotificationAsRead(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(400).json({ error: "Failed to mark notification as read" });
    }
  });

  // ============= AUDIT LOG ROUTES =============
  app.get("/api/audit-logs/:entityType/:entityId", isAuthenticated, async (req, res) => {
    try {
      const logs = await storage.getAuditLogs(req.params.entityType, parseInt(req.params.entityId));
      res.json(logs);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  // ============= AI DOCUMENT ANALYSIS ROUTES =============
  app.post("/api/documents/analyze", upload.single('file'), isAuthenticated, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const result = await analyzeDocument(req.file.path, req.file.originalname || req.file.filename);
      
      res.json(result);
    } catch (error) {
      console.error("Error analyzing document:", error);
      res.status(500).json({ error: "Failed to analyze document" });
    }
  });

  app.post("/api/loans/create-from-documents", isAuthenticated, async (req, res) => {
    try {
      const { extractedData, documentTypes } = req.body;
      
      // Create loan with AI-extracted data
      const loanData = {
        borrowerName: extractedData.borrowerName || "Unknown",
        propertyAddress: extractedData.propertyAddress || "Unknown",
        loanAmount: extractedData.loanAmount || 0,
        interestRate: extractedData.interestRate || 0,
        loanTerm: extractedData.loanTerm || 30,
        monthlyPayment: extractedData.monthlyPayment || 0,
        loanStatus: "active" as const,
        originationDate: new Date().toISOString().split('T')[0],
        maturityDate: new Date(Date.now() + (extractedData.loanTerm || 30) * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        remainingBalance: extractedData.loanAmount || 0,
        nextPaymentDate: extractedData.firstPaymentDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        nextPaymentAmount: extractedData.monthlyPayment || 0,
        servicingFee: 25, // Default servicing fee
        // Additional extracted fields
        loanType: extractedData.loanType || "conventional",
        propertyType: extractedData.propertyType || "single_family",
        propertyValue: extractedData.propertyValue || 0,
        downPayment: extractedData.downPayment || 0,
        closingCosts: extractedData.closingCosts || 0,
        pmiAmount: extractedData.pmi || 0,
        hazardInsurance: extractedData.insurance || 0,
        propertyTaxes: extractedData.taxes || 0,
        hoaFees: extractedData.hoaFees || 0,
        escrowAmount: extractedData.escrowAmount || 0,
      };

      const validatedData = insertLoanSchema.parse(loanData);
      const loan = await storage.createLoan(validatedData);

      // Create audit log
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId: loan.id,
        action: "CREATE_LOAN_AI",
        entityType: "loan",
        entityId: loan.id,
        newValues: { ...loan, documentTypes }
      });

      res.status(201).json(loan);
    } catch (error) {
      console.error("Error creating loan from documents:", error);
      res.status(400).json({ error: "Failed to create loan from extracted data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}