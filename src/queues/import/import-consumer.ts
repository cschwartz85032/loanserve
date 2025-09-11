import amqp from 'amqplib';
import { startConsumer } from '../consumer-utils';
import { Queues } from '../topology';
import { auditAction } from '../../db/auditService';
import { publishEvent } from '../../db/eventOutboxService';
import { drizzle } from 'drizzle-orm/postgres-js';
import { loans, documents, properties } from '../../../shared/schema';
import { AIPipelineService } from '../../database/ai-pipeline-service';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { parseFNMFile, validateFNMFile } from '../../parsers/fnm-parser';
import { ImportMonitor } from '../../services/import-monitor';

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  } : undefined
});

export async function initImportConsumer(conn: amqp.Connection) {
  await startConsumer(conn, {
    queue: Queues.Import,
    handler: async (payload, { client }) => {
      const { importId, tenantId, s3Bucket, s3Key, fileType, sha256, fileBuffer, userId } = payload;
      const db = drizzle(client);
      const service = new AIPipelineService();
      const monitor = new ImportMonitor(client, importId, tenantId, userId);

      try {
        // Start monitoring
        await monitor.logEvent({
          eventType: 'stage_start',
          message: `Starting import processing for ${importId}`,
          severity: 'info',
          details: { fileType, s3Bucket, s3Key }
        });
        
        await monitor.startStage('validation', 1, { fileType, s3Bucket, s3Key });
        await service.updateImportProgress(importId, 'processing', {}, tenantId);
        await monitor.completeStage('validation', 'completed');

        let importContent: string;
        
        // Start upload/download stage
        await monitor.startStage('upload', 1, { source: s3Bucket ? 's3' : 'buffer' });
        
        // Support both S3 reference (new) and base64 buffer (legacy)
        if (s3Bucket && s3Key) {
          // Download from S3
          const getObjectCommand = new GetObjectCommand({
            Bucket: s3Bucket,
            Key: s3Key
          });
          
          const response = await s3Client.send(getObjectCommand);
          const stream = response.Body as Readable;
          const chunks: Buffer[] = [];
          
          for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk));
          }
          
          importContent = Buffer.concat(chunks).toString('utf-8');
          
          // Verify integrity
          const crypto = await import('crypto');
          const downloadedHash = crypto.createHash('sha256').update(importContent).digest('hex');
          if (sha256 && downloadedHash !== sha256) {
            await monitor.logError('upload', `File integrity check failed. Expected SHA256: ${sha256}, got: ${downloadedHash}`);
            await monitor.completeStage('upload', 'failed');
            throw new Error(`File integrity check failed. Expected SHA256: ${sha256}, got: ${downloadedHash}`);
          }
          
          await monitor.completeStage('upload', 'completed');
        } else if (fileBuffer) {
          // Legacy: decode from base64
          importContent = Buffer.from(fileBuffer, 'base64').toString('utf-8');
          await monitor.completeStage('upload', 'completed');
        } else {
          await monitor.logError('upload', 'No file content available: neither S3 location nor buffer provided');
          await monitor.completeStage('upload', 'failed');
          throw new Error('No file content available: neither S3 location nor buffer provided');
        }

        // Start parsing stage
        await monitor.startStage('parsing', 1, { fileType });
        
        let processedRecords;
        try {
          processedRecords = await processImportData(importContent, fileType);
          await monitor.updateProgress('parsing', {
            recordsTotal: processedRecords.length,
            recordsProcessed: processedRecords.length,
            recordsSuccess: processedRecords.length
          });
          await monitor.completeStage('parsing', 'completed');
        } catch (error) {
          await monitor.logError('parsing', error as Error, undefined, { fileType });
          await monitor.completeStage('parsing', 'failed', error);
          throw error;
        }

        // Start entity creation stage
        await monitor.startStage('entity_creation', processedRecords.length);
        
        for (let i = 0; i < processedRecords.length; i++) {
          const record = processedRecords[i];
          const recordId = record.loanNumber || `record_${i}`;
          
          try {
          // Create a property first (or find existing)
          const [property] = await db
            .insert(properties)
            .values({
              address: record.propertyAddress || '123 Main St',
              city: record.propertyCity || 'Unknown',
              state: record.propertyState || 'CA',
              zipCode: record.propertyZip || '00000',
              propertyType: 'single_family',
              occupancyType: 'primary',
              yearBuilt: 2020,
              squareFeet: 2000,
              lotSize: 0.25,
              bedrooms: 3,
              bathrooms: 2,
              currentValue: record.loanAmount || 100000,
              purchasePrice: record.loanAmount || 100000,
            })
            .returning()
            .onConflictDoNothing();

          const propertyId = property?.id || 1;

          const loan = await db
            .insert(loans)
            .values({
              loanNumber: record.loanNumber || `IMPORT-${Date.now()}`,
              status: 'application',
              loanType: record.loanType || 'conventional',
              propertyId: propertyId,
              originalAmount: String(record.loanAmount || 100000),
              principalBalance: String(record.loanAmount || 100000),
              interestRate: String(record.interestRate || 5.0),
              maturityDate: new Date(Date.now() + 365 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 years from now
              paymentAmount: String(record.paymentAmount || 500),
              rateType: 'fixed',
              loanTerm: 360, // 30 years in months
            })
            .returning();

          if (record.documents) {
            for (const doc of record.documents) {
              await db.insert(documents).values({
                loanId: loan[0].id,
                category: 'loan_application',
                title: doc.title || doc.fileName || 'Imported Document',
                fileName: doc.fileName || 'unknown',
                storageUrl: doc.url || doc.storageUrl || '',
                uploadedBy: doc.uploadedBy || 1,
              });
            }
          }
          
          await monitor.recordProcessed('entity_creation', recordId, true, { index: i });
          } catch (error) {
            await monitor.recordProcessed('entity_creation', recordId, false, {
              error: error instanceof Error ? error.message : String(error)
            });
            // Continue processing other records
          }
        }
        
        await monitor.completeStage('entity_creation', 'completed');
        await monitor.startStage('persistence', 1);

        await service.updateImportProgress(
          importId,
          'completed',
          { loanCount: processedRecords.length, parsedByVersion: '1.0.0' },
          tenantId
        );
        
        await monitor.completeStage('persistence', 'completed');
        await monitor.startStage('complete', 1);

        await auditAction(client, {
          tenantId,
          targetType: 'imports',
          targetId: importId,
          action: 'import_processed',
          changes: { status: 'completed', recordCount: processedRecords.length },
        });

        await publishEvent(client, {
          tenantId,
          aggregateId: importId,
          aggregateType: 'import',
          eventType: 'ImportCompleted',
          payload: { recordCount: processedRecords.length },
        });
        
        await monitor.completeStage('complete', 'completed');
        await monitor.updateMetrics();
        
        await monitor.logEvent({
          eventType: 'stage_complete',
          message: `Import ${importId} completed successfully`,
          severity: 'info',
          details: { totalRecords: processedRecords.length }
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        await monitor.logError('complete', error as Error, undefined, {
          importId,
          errorMessage
        });
        
        await service.updateImportProgress(
          importId,
          'failed',
          { errors: [errorMessage] },
          tenantId
        );
        
        await monitor.updateMetrics();
        throw error;
      }
    },
  });
}

/**
 * Parse MISMO (Mortgage Industry Standards Maintenance Organization) XML data
 */
function parseMISMOData(xmlData: any): any[] {
  const records: any[] = [];
  
  // Navigate through MISMO structure (various versions have different structures)
  const deals = xmlData.DEAL_SETS?.DEAL_SET?.DEALS?.DEAL || 
                xmlData.MESSAGE?.DEAL_SETS?.DEAL_SET?.DEALS?.DEAL ||
                xmlData.DEAL || 
                [xmlData];
  
  const dealArray = Array.isArray(deals) ? deals : [deals];
  
  for (const deal of dealArray) {
    if (!deal) continue;
    
    // Extract loan data from MISMO structure
    const loans = deal.LOANS?.LOAN || deal.LOAN || [];
    const loanArray = Array.isArray(loans) ? loans : [loans];
    
    for (const loan of loanArray) {
      if (!loan) continue;
      
      // Extract parties (borrowers)
      const parties = deal.PARTIES?.PARTY || deal.PARTY || [];
      const partyArray = Array.isArray(parties) ? parties : [parties];
      const borrowers = partyArray.filter(p => p.ROLES?.ROLE?.BORROWER || p.BORROWER);
      
      // Extract property
      const collaterals = deal.COLLATERALS?.COLLATERAL || deal.COLLATERAL || [];
      const collateralArray = Array.isArray(collaterals) ? collaterals : [collaterals];
      const property = collateralArray[0]?.SUBJECT_PROPERTY || collateralArray[0]?.PROPERTY || {};
      
      // Build record
      const record: any = {
        // Loan identification
        loanNumber: loan.LOAN_IDENTIFIERS?.LOAN_IDENTIFIER?.LoanIdentifier ||
                   loan.LoanIdentifier ||
                   loan.LOAN_NUMBER ||
                   `MISMO-${Date.now()}`,
        
        // Borrower information (take first borrower)
        borrowerName: '',
        
        // Property information
        propertyAddress: property.ADDRESS?.AddressLineText || 
                        property.AddressLineText || 
                        property.STREET_ADDRESS || '',
        propertyCity: property.ADDRESS?.CityName || 
                     property.CityName || 
                     property.CITY || '',
        propertyState: property.ADDRESS?.StateCode || 
                      property.StateCode || 
                      property.STATE || '',
        propertyZip: property.ADDRESS?.PostalCode || 
                    property.PostalCode || 
                    property.ZIP || '',
        
        // Loan details
        loanAmount: parseFloat(
          loan.LOAN_DETAIL?.OriginalPrincipalAmount ||
          loan.OriginalPrincipalAmount ||
          loan.ORIGINAL_PRINCIPAL_AMOUNT ||
          loan.LOAN_AMOUNT ||
          '0'
        ),
        interestRate: parseFloat(
          loan.TERMS_OF_LOAN?.NoteRatePercent ||
          loan.NoteRatePercent ||
          loan.NOTE_RATE ||
          loan.INTEREST_RATE ||
          '0'
        ),
        loanType: loan.LOAN_DETAIL?.LoanPurposeType || 
                 loan.LoanPurposeType || 
                 loan.LOAN_PURPOSE || 
                 'conventional',
        loanTerm: parseInt(
          loan.TERMS_OF_LOAN?.LoanTermMonthsCount ||
          loan.LoanTermMonthsCount ||
          loan.LOAN_TERM ||
          '360'
        ),
        
        status: 'active',
        sourceFormat: 'mismo'
      };
      
      // Extract borrower name if available
      if (borrowers.length > 0) {
        const borrower = borrowers[0];
        const individual = borrower.INDIVIDUAL || borrower.BORROWER?.INDIVIDUAL || borrower;
        const name = individual.NAME || individual;
        
        record.borrowerName = [
          name.FirstName || name.FIRST_NAME || '',
          name.MiddleName || name.MIDDLE_NAME || '',
          name.LastName || name.LAST_NAME || ''
        ].filter(n => n).join(' ');
      }
      
      records.push(record);
    }
  }
  
  // If no structured loan data found, return a placeholder
  if (records.length === 0) {
    records.push({
      loanNumber: `MISMO-${Date.now()}`,
      borrowerName: 'Unknown',
      propertyAddress: 'Unknown',
      loanAmount: 0,
      interestRate: 0,
      loanType: 'conventional',
      status: 'active',
      sourceFormat: 'mismo',
      parseError: 'Could not extract loan data from MISMO XML'
    });
  }
  
  return records;
}

async function processImportData(content: string, fileType?: string): Promise<any[]> {
  // Check if it's XML/MISMO format
  if (fileType === 'xml' || fileType === 'mismo' || content.trim().startsWith('<?xml') || content.trim().startsWith('<')) {
    try {
      // Parse XML using xmlbuilder2 (already imported in imports.routes.ts)
      const { convert } = await import('xmlbuilder2');
      const xmlData = convert(content, { format: 'object' }) as any;
      
      // Handle MISMO XML structure (loan data format)
      if (xmlData.LOAN_APPLICATION || xmlData.MESSAGE || xmlData.DEAL_SETS) {
        return parseMISMOData(xmlData);
      }
      
      // Handle generic XML data
      const records: any[] = [];
      function extractLoans(obj: any, depth = 0): void {
        if (depth > 10) return; // Prevent infinite recursion
        
        if (obj && typeof obj === 'object') {
          // Check if this looks like a loan record
          if (obj.loanNumber || obj.LoanNumber || obj.loan_number || obj.LOAN_IDENTIFIER) {
            records.push({
              loanNumber: obj.loanNumber || obj.LoanNumber || obj.loan_number || obj.LOAN_IDENTIFIER,
              borrowerName: obj.borrowerName || obj.BorrowerName || obj.BORROWER_NAME || '',
              propertyAddress: obj.propertyAddress || obj.PropertyAddress || obj.PROPERTY_ADDRESS || '',
              loanAmount: parseFloat(obj.loanAmount || obj.LoanAmount || obj.LOAN_AMOUNT || '0'),
              interestRate: parseFloat(obj.interestRate || obj.InterestRate || obj.INTEREST_RATE || '0'),
              loanType: obj.loanType || obj.LoanType || obj.LOAN_TYPE || 'conventional',
              status: 'active'
            });
          }
          
          // Recursively search for loan data
          for (const key in obj) {
            if (Array.isArray(obj[key])) {
              obj[key].forEach((item: any) => extractLoans(item, depth + 1));
            } else if (typeof obj[key] === 'object') {
              extractLoans(obj[key], depth + 1);
            }
          }
        }
      }
      
      extractLoans(xmlData);
      
      if (records.length === 0) {
        // If no loan-like structures found, treat as generic data
        if (Array.isArray(xmlData)) {
          return xmlData;
        } else {
          return [xmlData];
        }
      }
      
      return records;
    } catch (error) {
      throw new Error(`Invalid XML format: ${error.message}`);
    }
  }
  
  // Check if it's FNM format (starts with record type codes)
  if (fileType === 'fnm' || /^(01|02|03|04|05|06|07|08|09|10|11|12|13|14|15|16)/.test(content.trim())) {
    const validation = validateFNMFile(content);
    if (!validation.valid) {
      throw new Error(`Invalid FNM file: ${validation.errors.join(', ')}`);
    }
    
    const fnmResult = parseFNMFile(content);
    
    // Log parse statistics
    console.log('FNM Parse Statistics:', fnmResult.statistics);
    
    // Transform FNM data to loan records
    const records: any[] = [];
    
    // Process each loan with associated data
    // Note: FNM files typically have one loan per file, but can have multiple loans
    // For simplicity, we'll create a record for each loan and include the first property
    for (let i = 0; i < fnmResult.loans.length; i++) {
      const loan = fnmResult.loans[i];
      
      // Get the first property (FNM files typically have one property per loan)
      const property = fnmResult.properties[i] || fnmResult.properties[0];
      
      // Create a combined borrower name from the first primary borrower
      const primaryBorrower = fnmResult.borrowers.find(b => b.borrowerPosition === 1) || fnmResult.borrowers[0];
      const borrowerName = primaryBorrower ? 
        `${primaryBorrower.firstName || ''} ${primaryBorrower.lastName || ''}`.trim() : 
        '';
      
      const record: any = {
        // Standard loan fields expected by persistence layer
        loanNumber: loan.loanNumber,
        borrowerName: borrowerName,
        
        // Property fields expected by persistence layer (flattened)
        propertyAddress: property?.streetAddress || '',
        propertyCity: property?.city || '',
        propertyState: property?.state || '',
        propertyZip: property?.zip || '',
        propertyCounty: property?.county || '',
        propertyType: property?.propertyType || '',
        numberOfUnits: property?.numberOfUnits || 1,
        yearBuilt: property?.yearBuilt,
        appraisedValue: property?.appraisedValue,
        purchasePrice: property?.purchasePrice,
        
        // Loan financial details
        loanAmount: loan.originalBalance,
        interestRate: loan.originalInterestRate,
        loanType: loan.loanType || 'conventional',
        term: loan.originalTerm,
        loanDate: loan.loanDate,
        firstPaymentDate: loan.firstPaymentDate,
        maturityDate: loan.maturityDate,
        ltv: loan.ltv,
        productType: loan.productType,
        documentationType: loan.documentationType,
        miRequired: loan.miRequired,
        prepaymentPenalty: loan.prepaymentPenaltyIndicator,
        status: 'active',
        
        // Additional structured data (for separate processing)
        fnmData: {
          // All borrowers for this loan (in FNM, all borrowers are associated with the loan)
          borrowers: fnmResult.borrowers.map(b => ({
            position: b.borrowerPosition,
            firstName: b.firstName,
            middleName: b.middleName,
            lastName: b.lastName,
            ssn: b.ssn,
            dateOfBirth: b.dateOfBirth,
            email: b.email,
            homePhone: b.homePhone,
            cellPhone: b.cellPhone,
            workPhone: b.workPhone,
            address: b.streetAddress,
            city: b.city,
            state: b.state,
            zip: b.zip,
            mailingAddress: b.mailingAddress,
            mailingCity: b.mailingCity,
            mailingState: b.mailingState,
            mailingZip: b.mailingZip,
          })),
          
          // Employment history (linked by borrower position)
          employmentHistory: fnmResult.employmentHistory.map(e => ({
            borrowerPosition: e.borrowerPosition,
            employerName: e.employerName,
            employerAddress: e.employerAddress,
            employerCity: e.employerCity,
            employerState: e.employerState,
            employerZip: e.employerZip,
            employerPhone: e.employerPhone,
            position: e.positionDescription,
            startDate: e.employmentStartDate,
            endDate: e.employmentEndDate,
            monthlyIncome: e.monthlyIncome,
            isSelfEmployed: e.isSelfEmployed,
            isPrimary: e.isPrimaryEmployment,
          })),
          
          // Contact points (linked by borrower position)
          contacts: fnmResult.contacts.map(c => ({
            borrowerPosition: c.borrowerPosition,
            type: c.contactType,
            value: c.contactValue,
            preference: c.contactPreference,
            bestTime: c.bestTime,
            timeZone: c.timeZone,
          })),
        },
        
        // Metadata
        sourceFormat: 'fnm',
        parseErrors: fnmResult.parseErrors.slice(0, 10), // Limit errors to prevent huge records
      };
      
      records.push(record);
    }
    
    return records;
  }
  
  // Check if it's JSON format
  if (content.trim().startsWith('[') || content.trim().startsWith('{')) {
    try {
      const jsonData = JSON.parse(content);
      return Array.isArray(jsonData) ? jsonData : [jsonData];
    } catch (error) {
      throw new Error(`Invalid JSON format: ${error.message}`);
    }
  }
  
  // Parse as CSV
  const lines = content.trim().split('\n');
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const records: any[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const record: any = {};
    
    // Map CSV columns to record fields
    headers.forEach((header, index) => {
      const value = values[index] || '';
      
      // Map common CSV columns to loan fields
      switch (header.toLowerCase()) {
        case 'loan_number':
        case 'loannumber':
          record.loanNumber = value;
          break;
        case 'borrower_name':
        case 'borrowername':
          record.borrowerName = value;
          break;
        case 'property_address':
        case 'propertyaddress':
          record.propertyAddress = value;
          break;
        case 'loan_amount':
        case 'loanamount':
          record.loanAmount = parseFloat(value) || 0;
          break;
        case 'interest_rate':
        case 'interestrate':
          record.interestRate = parseFloat(value) || 0;
          break;
        case 'loan_type':
        case 'loantype':
          record.loanType = value.toLowerCase();
          break;
        case 'status':
          record.status = value.toLowerCase();
          break;
        default:
          record[header] = value;
      }
    });
    
    // Skip empty rows
    if (record.loanNumber) {
      records.push(record);
    }
  }
  
  return records;
}