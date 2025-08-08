import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { 
  insertLoanSchema, 
  insertPaymentSchema, 
  insertEscrowAccountSchema,
  insertEscrowPaymentSchema,
  insertDocumentSchema,
  insertNotificationSchema 
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  await setupAuth(app);

  // Loan routes
  app.get("/api/loans", async (req, res) => {
    try {
      const { 
        lenderId, 
        borrowerId, 
        investorId, 
        status, 
        limit = "50", 
        offset = "0" 
      } = req.query as Record<string, string>;

      const loans = await storage.getLoans({
        lenderId: lenderId || undefined,
        borrowerId: borrowerId || undefined,
        investorId: investorId || undefined,
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

  // Loan metrics - must be defined before :id route
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
      const loan = await storage.getLoan(req.params.id);
      if (!loan) {
        return res.status(404).json({ error: "Loan not found" });
      }
      res.json(loan);
    } catch (error) {
      console.error("Error fetching loan:", error);
      res.status(500).json({ error: "Failed to fetch loan" });
    }
  });

  app.post("/api/loans", async (req, res) => {
    try {
      const validatedData = insertLoanSchema.parse(req.body);
      const loan = await storage.createLoan(validatedData);
      
      // Create audit log
      await storage.createAuditLog({
        userId: (req.user as any)?.id,
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

  app.put("/api/loans/:id", async (req, res) => {
    try {
      const existingLoan = await storage.getLoan(req.params.id);
      if (!existingLoan) {
        return res.status(404).json({ error: "Loan not found" });
      }

      const loan = await storage.updateLoan(req.params.id, req.body);
      
      // Create audit log
      await storage.createAuditLog({
        userId: (req.user as any)?.id,
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

  // Payment routes
  app.get("/api/loans/:loanId/payments", async (req, res) => {
    try {
      const { limit = "50" } = req.query as Record<string, string>;
      const payments = await storage.getPayments(req.params.loanId, parseInt(limit));
      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });

  app.post("/api/payments", async (req, res) => {
    try {
      const validatedData = insertPaymentSchema.parse(req.body);
      const payment = await storage.createPayment(validatedData);

      // Create audit log
      await storage.createAuditLog({
        userId: (req.user as any)?.id,
        loanId: payment.loanId || undefined,
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

  // Escrow routes
  app.get("/api/loans/:loanId/escrow-accounts", async (req, res) => {
    try {
      const escrowAccounts = await storage.getEscrowAccounts(req.params.loanId);
      res.json(escrowAccounts);
    } catch (error) {
      console.error("Error fetching escrow accounts:", error);
      res.status(500).json({ error: "Failed to fetch escrow accounts" });
    }
  });

  app.post("/api/escrow-accounts", async (req, res) => {
    try {
      const validatedData = insertEscrowAccountSchema.parse(req.body);
      const escrowAccount = await storage.createEscrowAccount(validatedData);
      
      // Create audit log
      await storage.createAuditLog({
        userId: (req.user as any)?.id,
        loanId: escrowAccount.loanId || undefined,
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

  app.get("/api/escrow-payments", async (req, res) => {
    try {
      const { loanId, escrowAccountId, status, limit = "50" } = req.query as Record<string, string>;
      const payments = await storage.getEscrowPayments({
        loanId: loanId || undefined,
        escrowAccountId: escrowAccountId || undefined,
        status: status || undefined,
        limit: parseInt(limit)
      });
      res.json(payments);
    } catch (error) {
      console.error("Error fetching escrow payments:", error);
      res.status(500).json({ error: "Failed to fetch escrow payments" });
    }
  });

  app.post("/api/escrow-payments", async (req, res) => {
    try {
      const validatedData = insertEscrowPaymentSchema.parse(req.body);
      const escrowPayment = await storage.createEscrowPayment(validatedData);
      
      // Create audit log
      await storage.createAuditLog({
        userId: (req.user as any)?.id,
        loanId: escrowPayment.loanId || undefined,
        action: "CREATE_ESCROW_PAYMENT",
        entityType: "escrow_payment",
        entityId: escrowPayment.id,
        newValues: escrowPayment
      });

      res.status(201).json(escrowPayment);
    } catch (error) {
      console.error("Error creating escrow payment:", error);
      res.status(400).json({ error: "Invalid escrow payment data" });
    }
  });

  // Escrow metrics
  app.get("/api/escrow/metrics", async (req, res) => {
    try {
      const metrics = await storage.getEscrowMetrics();
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching escrow metrics:", error);
      res.status(500).json({ error: "Failed to fetch escrow metrics" });
    }
  });

  // Document routes
  app.get("/api/documents", async (req, res) => {
    try {
      const { loanId, borrowerId, documentType } = req.query as Record<string, string>;
      const documents = await storage.getDocuments({
        loanId: loanId || undefined,
        borrowerId: borrowerId || undefined,
        documentType: documentType || undefined
      });
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/:id", async (req, res) => {
    try {
      const document = await storage.getDocument(req.params.id);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      console.error("Error fetching document:", error);
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  app.post("/api/documents", async (req, res) => {
    try {
      const validatedData = insertDocumentSchema.parse(req.body);
      const document = await storage.createDocument(validatedData);
      
      // Create audit log
      await storage.createAuditLog({
        userId: (req.user as any)?.id,
        loanId: document.loanId || undefined,
        action: "UPLOAD_DOCUMENT",
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

  app.delete("/api/documents/:id", async (req, res) => {
    try {
      const document = await storage.getDocument(req.params.id);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      await storage.deleteDocument(req.params.id);
      
      // Create audit log
      await storage.createAuditLog({
        userId: (req.user as any)?.id,
        loanId: document.loanId || undefined,
        action: "DELETE_DOCUMENT",
        entityType: "document",
        entityId: document.id,
        oldValues: document
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // Document file endpoint for PDF preview
  app.get("/api/documents/:id/file", async (req, res) => {
    try {
      const document = await storage.getDocument(req.params.id);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // In production, this would serve the actual file from object storage
      // For now, we'll return a sample PDF for demonstration
      res.setHeader('Content-Type', document.mimeType || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${document.fileName}"`);
      
      // Sample PDF content for demonstration
      // This creates a simple PDF with the document title
      const samplePdfContent = Buffer.from(`%PDF-1.3
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Count 1
/Kids [3 0 R]
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 5 0 R
>>
>>
>>
endobj
4 0 obj
<<
/Length 150
>>
stream
BT
/F1 24 Tf
50 700 Td
(Document: ${document.title || document.fileName}) Tj
0 -30 Td
/F1 14 Tf
(Type: ${document.documentType || 'General'}) Tj
0 -20 Td
(Status: ${document.status || 'Active'}) Tj
0 -30 Td
/F1 12 Tf
(This is a sample preview. In production, the actual file would be displayed.) Tj
ET
endstream
endobj
5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000260 00000 n
0000000467 00000 n
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
544
%%EOF`, 'utf-8');
      
      res.send(samplePdfContent);
    } catch (error) {
      console.error("Error fetching document file:", error);
      res.status(500).json({ error: "Failed to fetch document file" });
    }
  });

  // Notification routes
  app.get("/api/notifications", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { limit = "50" } = req.query as Record<string, string>;
      const notifications = await storage.getNotifications(req.user.id, parseInt(limit));
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      const validatedData = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification(validatedData);
      res.status(201).json(notification);
    } catch (error) {
      console.error("Error creating notification:", error);
      res.status(400).json({ error: "Invalid notification data" });
    }
  });

  app.put("/api/notifications/:id/read", async (req, res) => {
    try {
      await storage.markNotificationAsRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to update notification" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
