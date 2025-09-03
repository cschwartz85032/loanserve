# Testing FNM Loan Import in LoanServe Pro

## Overview
To test the import of a new loan from an FNM (Fannie Mae) file, we need to exercise the complete loan boarding pipeline. Here's what we have set up and how to test it:

## System Components

### 1. Authentication System
- Users are stored in PostgreSQL with argon2 password hashing
- Current login endpoint: `POST /api/auth/login`
- Authentication required for most API operations

### 2. Document Processing Pipeline
- **Upload Endpoint**: `POST /api/documents/analyze`
- **AI Pipeline**: `src/ai-pipeline.ts` - processes MISMO, CSV, JSON, PDF files
- **File Types Supported**: 'mismo' | 'csv' | 'json' | 'pdf'
- **Frontend Component**: `ai-loan-creator.tsx` handles document upload and processing

### 3. Loan Boarding System
- **Boarding Service**: `src/servicing/boarding.ts` - creates servicing accounts
- **Boarding Worker**: `src/workers/BoardingWorker.ts` - queue-based processing
- **API Endpoint**: `POST /api/loans/:id/board` - manual boarding trigger

### 4. Complete Workflow
```
FNM File Upload → AI Processing → Data Extraction → QC Validation → Loan Creation → Finalization → Boarding → Servicing
```

## Test Files Created

### Sample FNM File: `test_fnm_sample.xml`
- MISMO XML format representing a conventional Fannie Mae loan
- Loan Amount: $475,000
- Interest Rate: 6.75%
- Term: 30 years (360 months)
- Escrow Instructions: Property tax and hazard insurance
- Property: Primary residence, single family

## Testing Steps

### Prerequisites
1. **Authentication**: Need working login credentials
   - Current issue: Password hashing mismatch between scrypt and argon2
   - Users in DB: loanatik, admin, borrower

### Manual Testing Process

1. **Login to System**
   ```bash
   curl -X POST "http://localhost:5000/api/auth/login" \
     -H "Content-Type: application/json" \
     -d '{"email": "cschwartz@loanatik.com", "password": "loanatik"}' \
     -c cookies.txt
   ```

2. **Upload FNM File for Analysis**
   ```bash
   curl -X POST "http://localhost:5000/api/documents/analyze" \
     -H "Accept: application/json" \
     -F "file=@test_fnm_sample.xml" \
     -b cookies.txt
   ```

3. **Check AI Processing Results**
   - The AI pipeline should extract loan data from the MISMO XML
   - Document type should be identified as 'loan_application' or similar
   - Extracted data should include borrower info, loan terms, property details

4. **Create Loan Record**
   - The extracted data should be used to create a loan record in the database
   - Loan should have 'pending' or 'processing' state initially

5. **QC and Validation**
   - QC rules should run against the extracted data
   - Any validation errors should be flagged for review

6. **Finalization**
   - Once QC passes, loan should be marked as 'finalized'
   - This triggers the boarding process

7. **Boarding to Servicing**
   ```bash
   curl -X POST "http://localhost:5000/api/loans/:id/board" \
     -H "Content-Type: application/json" \
     -b cookies.txt
   ```

8. **Verify Servicing Setup**
   ```bash
   curl -X GET "http://localhost:5000/api/loans/:id/servicing" \
     -H "Accept: application/json" \
     -b cookies.txt
   ```

## Expected Results

### Successful Processing Should Show:
1. **Document Analysis**: File identified as MISMO/FNM format
2. **Data Extraction**: Borrower, loan, and property information extracted
3. **Loan Creation**: New loan record in database with extracted data
4. **Servicing Account**: 
   - Principal balance: $475,000
   - Monthly P&I payment calculated
   - Escrow account with tax and insurance sub-accounts
   - Payment schedule generated for 360 months

### Database Changes Expected:
- New record in `loans` table
- Records in `svc_accounts` table (servicing account)
- Records in `svc_escrow_sub` table (escrow buckets)
- Records in `svc_schedule` table (payment schedule)
- GL entries for loan boarding

## Current Issues to Resolve

1. **Authentication Mismatch**: Password hashing systems don't match
   - Reset script uses scrypt
   - Login system expects argon2

2. **Missing Dependencies**: Some imports in workers have dependency issues

## Authentication Fix Needed

To properly test, we need to either:
1. Fix the password hashing mismatch
2. Create a new user with proper argon2 hash
3. Temporarily disable authentication for testing
4. Use the frontend interface directly (localhost:5000)

## Alternative Testing Through Frontend

Since authentication is working in the frontend (as evidenced by the metrics calls), you can:
1. Navigate to http://localhost:5000 in browser
2. Login with existing credentials
3. Use the AI Loan Creator component to upload the FNM file
4. Watch the complete pipeline process the loan

This will exercise the same backend APIs but through the authenticated web interface.