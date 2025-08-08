import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
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
        oldValues: existingBorrower,
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
      
      await storage.createAuditLog({
        userId: req.user?.id,
        action: "CREATE_PROPERTY",
        entityType: "property",
        entityId: property.id,
        newValues: property
      });

      res.status(201).json(property);
    } catch (error) {
      console.error("Error creating property:", error);
      res.status(400).json({ error: "Invalid property data" });
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
        oldValues: existingProperty,
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
      
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId: loan.id,
        action: "CREATE_LOAN",
        entityType: "loan",
        entityId: loan.id,
        newValues: loan
      });

      res.status(201).json(loan);
    } catch (error) {
      console.error("Error creating loan:", error);
      res.status(400).json({ error: "Invalid loan data" });
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
      
      await storage.createAuditLog({
        userId: req.user?.id,
        loanId: loan.id,
        action: "UPDATE_LOAN",
        entityType: "loan",
        entityId: loan.id,
        oldValues: existingLoan,
        newValues: loan
      });

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

  // Serve document file content
  app.get("/api/documents/:id/file", async (req, res) => {
    try {
      const document = await storage.getDocument(parseInt(req.params.id));
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // In a real application, this would serve the actual file from storage
      // For now, we'll return a mock response based on the file type
      const mimeType = document.mimeType || 'application/octet-stream';
      
      // Set appropriate headers
      res.set({
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${document.fileName}"`,
        'Cache-Control': 'public, max-age=3600'
      });

      // Return mock content based on file type
      if (mimeType.includes('pdf')) {
        // Return a simple PDF placeholder using dynamic import
        try {
          const PDFKit = require('pdfkit');
          const doc = new PDFKit();
          res.type('application/pdf');
          doc.pipe(res);
          doc.fontSize(20).text(`Document: ${document.title || document.fileName}`, 100, 100);
          doc.fontSize(14).text(`Type: ${document.category || 'Document'}`, 100, 150);
          doc.fontSize(12).text(`Created: ${new Date(document.createdAt).toLocaleDateString()}`, 100, 200);
          doc.fontSize(12).text(`Description: ${document.description || 'No description available'}`, 100, 250);
          doc.text(`File Size: ${document.fileSize ? Math.round(document.fileSize / 1024) + ' KB' : 'Unknown'}`, 100, 300);
          doc.text(`This is a placeholder PDF generated by the system.`, 100, 350);
          doc.end();
        } catch (error) {
          console.error('PDF generation error:', error);
          // Fallback to text if PDF generation fails
          res.type('text/plain');
          res.send(`PDF Document: ${document.title || document.fileName}\n\nType: ${document.category}\n\nDescription: ${document.description || 'No description available'}\n\nThis document preview is temporarily unavailable.`);
        }
      } else if (mimeType.startsWith('image/')) {
        // Return a placeholder image
        res.redirect('https://via.placeholder.com/600x400/e2e8f0/64748b?text=' + encodeURIComponent(document.fileName));
      } else if (mimeType.includes('text') || mimeType.includes('doc')) {
        // Return text content
        res.type('text/plain');
        res.send(`Document: ${document.title || document.fileName}\n\nType: ${document.category}\n\nDescription: ${document.description || 'No description available'}\n\nThis is a placeholder for the actual document content.`);
      } else {
        // For other types, return basic info
        res.type('text/plain');
        res.send(`Document placeholder for: ${document.fileName}`);
      }
    } catch (error) {
      console.error("Error serving document file:", error);
      res.status(500).json({ error: "Failed to serve document file" });
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
        oldValues: existingDocument,
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
        oldValues: document
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

  const httpServer = createServer(app);
  return httpServer;
}