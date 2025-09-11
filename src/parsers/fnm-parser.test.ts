/**
 * Tests for FNM (Fannie Mae) Fixed-Width File Parser
 */

import { describe, it, expect } from 'vitest';
import { parseFNMFile, validateFNMFile, FNM_RECORD_TYPES } from './fnm-parser';

describe('FNM Parser', () => {
  describe('validateFNMFile', () => {
    it('should validate a proper FNM file', () => {
      const content = `01TEST_LOAN_123456789012345     01011000000000150000005.2500360202401012024020120540101080.0085.00FIXED RATE 30 YEAR             FU Y`;
      const result = validateFNMFile(content);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty files', () => {
      const result = validateFNMFile('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('File is empty');
    });

    it('should reject files with no valid record types', () => {
      const content = 'ZZINVALID RECORD TYPE LINE';
      const result = validateFNMFile(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No valid FNM record types found in file');
    });

    it('should report lines that are too short', () => {
      const content = '0\n01VALID_LINE';
      const result = validateFNMFile(content);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Line 1: Too short');
    });
  });

  describe('parseFNMFile - Loan Records', () => {
    it('should parse loan record (01)', () => {
      // Create a fixed-width loan record
      const loanNumber = 'LOAN123456789'.padEnd(33, ' ');
      const loanPurpose = '01'; // Purchase
      const loanType = '01'; // Conventional
      const propertyType = '01'; // Single Family
      const occupancyType = '01'; // Primary Residence
      const numberOfUnits = '01';
      const originalBalance = '00000025000000'; // $250,000.00
      const interestRate = '0052500'; // 5.25%
      const term = '360'; // 30 years
      const loanDate = '20240101';
      const firstPaymentDate = '20240201';
      const maturityDate = '20540101';
      const ltv = '08000'; // 80%
      const cltv = '08000'; // 80%
      const productType = 'FIXED RATE 30 YEAR'.padEnd(30, ' ');
      const docType = 'FU'; // Full Doc
      const miRequired = 'Y';
      const prepayPenalty = 'N';

      const content = `01${loanNumber}${loanPurpose}${loanType}${propertyType}${occupancyType}${numberOfUnits}${originalBalance}${interestRate}${term}${loanDate}${firstPaymentDate}${maturityDate}${ltv}${cltv}${productType}${docType}${miRequired}${prepayPenalty}`;
      
      const result = parseFNMFile(content);
      
      expect(result.loans).toHaveLength(1);
      expect(result.loans[0]).toMatchObject({
        loanNumber: 'LOAN123456789',
        loanPurposeType: '01',
        loanType: '01',
        propertyType: '01',
        occupancyType: '01',
        numberOfUnits: 1,
        originalBalance: 250000,
        originalInterestRate: 5.25,
        originalTerm: 360,
        loanDate: '2024-01-01',
        firstPaymentDate: '2024-02-01',
        maturityDate: '2054-01-01',
        ltv: 80,
        cltv: 80,
        productType: 'FIXED RATE 30 YEAR',
        documentationType: 'FU',
        miRequired: true,
        prepaymentPenaltyIndicator: false,
      });
      expect(result.statistics.loanCount).toBe(1);
      expect(result.statistics.errorCount).toBe(0);
    });
  });

  describe('parseFNMFile - Borrower Records', () => {
    it('should parse borrower record (02)', () => {
      const recordType = '02';
      const borrowerPos = '01';
      const firstName = 'JOHN'.padEnd(35, ' ');
      const middleName = 'MICHAEL'.padEnd(35, ' ');
      const lastName = 'SMITH'.padEnd(35, ' ');
      const suffix = 'JR  ';
      const ssn = '123456789';
      const dob = '19800515';
      const homePhone = '5551234567';
      const cellPhone = '5559876543';
      const workPhone = '5551112222';
      const phoneExt = '12345';
      const email = 'john.smith@email.com'.padEnd(85, ' ');
      const maritalStatus = 'M '; // Married
      const dependentsCount = '02';
      const dependentsAges = '05,03'.padEnd(28, ' ');
      const streetAddress = '123 Main Street'.padEnd(50, ' ');
      const city = 'Springfield'.padEnd(25, ' ');
      const state = 'IL';
      const zip = '62701';
      const zipPlus4 = '1234';
      const country = 'US';
      const mailingAddress = '123 Main Street'.padEnd(50, ' ');
      const mailingCity = 'Springfield'.padEnd(25, ' ');
      const mailingState = 'IL';
      const mailingZip = '62701';
      const mailingZipPlus4 = '1234';
      const mailingCountry = 'US';
      const yearsAtAddress = '05';
      const monthsAtAddress = '06';
      const residenceType = '01'; // Own
      const monthlyRent = '00000000000000 '; // $0 (owns)

      const content = `${recordType}${borrowerPos}${firstName}${middleName}${lastName}${suffix}${ssn}${dob}${homePhone}${cellPhone}${workPhone}${phoneExt}${email}${maritalStatus}${dependentsCount}${dependentsAges}${streetAddress}${city}${state}${zip}${zipPlus4}${country}${mailingAddress}${mailingCity}${mailingState}${mailingZip}${mailingZipPlus4}${mailingCountry}${yearsAtAddress}${monthsAtAddress}${residenceType}${monthlyRent}`;

      const result = parseFNMFile(content);
      
      expect(result.borrowers).toHaveLength(1);
      expect(result.borrowers[0]).toMatchObject({
        borrowerPosition: 1,
        firstName: 'JOHN',
        middleName: 'MICHAEL',
        lastName: 'SMITH',
        nameSuffix: 'JR',
        ssn: '123456789',
        dateOfBirth: '1980-05-15',
        homePhone: '5551234567',
        cellPhone: '5559876543',
        workPhone: '5551112222',
        email: 'john.smith@email.com',
        maritalStatus: 'M',
        streetAddress: '123 Main Street',
        city: 'Springfield',
        state: 'IL',
        zip: '62701',
        country: 'US',
        yearsAtAddress: 5,
        monthsAtAddress: 6,
      });
      expect(result.statistics.borrowerCount).toBe(1);
      expect(result.statistics.errorCount).toBe(0);
    });
  });

  describe('parseFNMFile - Property Records', () => {
    it('should parse property record (04)', () => {
      const recordType = '04';
      const streetAddress = '456 Oak Avenue'.padEnd(50, ' ');
      const city = 'Chicago'.padEnd(25, ' ');
      const state = 'IL';
      const zip = '60601';
      const zipPlus4 = '5678';
      const county = 'Cook County'.padEnd(25, ' ');
      const propertyType = '01'; // Single Family
      const numberOfUnits = '01';
      const yearBuilt = '1995';
      const financedUnits = '0001';
      const legalDescription = 'LOT 15 BLOCK 3 OAKWOOD SUBDIVISION'.padEnd(80, ' ');
      const appraisedValue = '00000032500000'; // $325,000
      const appraisalDate = '20231215';
      const purchasePrice = '00000031000000'; // $310,000
      const purchaseDate = '20240101';
      const propertyAcquiredYear = '2024';
      const propertyUsageType = '01'; // Primary
      const propertyOccupancyType = '01'; // Owner Occupied

      const content = `${recordType}${streetAddress}${city}${state}${zip}${zipPlus4}${county}${propertyType}${numberOfUnits}${yearBuilt}${financedUnits}${legalDescription}${appraisedValue}${appraisalDate}${purchasePrice}${purchaseDate}${propertyAcquiredYear}${propertyUsageType}${propertyOccupancyType}`;

      const result = parseFNMFile(content);
      
      expect(result.properties).toHaveLength(1);
      expect(result.properties[0]).toMatchObject({
        streetAddress: '456 Oak Avenue',
        city: 'Chicago',
        state: 'IL',
        zip: '60601',
        county: 'Cook County',
        propertyType: '01',
        numberOfUnits: 1,
        yearBuilt: 1995,
        legalDescription: 'LOT 15 BLOCK 3 OAKWOOD SUBDIVISION',
        appraisedValue: 325000,
        appraisalDate: '2023-12-15',
        purchasePrice: 310000,
        purchaseDate: '2024-01-01',
      });
      expect(result.statistics.propertyCount).toBe(1);
      expect(result.statistics.errorCount).toBe(0);
    });
  });

  describe('parseFNMFile - Employment Records', () => {
    it('should parse employment record (06)', () => {
      const recordType = '06';
      const borrowerPos = '01';
      const employmentPos = '01';
      const employerName = 'ACME CORPORATION'.padEnd(35, ' ');
      const employerAddress = '789 Business Blvd'.padEnd(50, ' ');
      const employerCity = 'Chicago'.padEnd(25, ' ');
      const employerState = 'IL';
      const employerZip = '60602';
      const employerZipPlus4 = '9999';
      const employerPhone = '3125551234';
      const positionDesc = 'Senior Manager'.padEnd(25, ' ');
      const businessType = '01'; // Corporation
      const startDate = '20180315';
      const endDate = '00000000'; // Current
      const monthlyIncome = '00000000850000'; // $8,500/month
      const isSelfEmployed = 'N';
      const isPrimary = 'Y';
      const yearsOnJob = '05';
      const monthsOnJob = '09';
      const yearsInProfession = '10';
      const monthsInProfession = '03';

      const content = `${recordType}${borrowerPos}${employmentPos}${employerName}${employerAddress}${employerCity}${employerState}${employerZip}${employerZipPlus4}${employerPhone}${positionDesc}${businessType}${startDate}${endDate}${monthlyIncome}${isSelfEmployed}${isPrimary}${yearsOnJob}${monthsOnJob}${yearsInProfession}${monthsInProfession}`;

      const result = parseFNMFile(content);
      
      expect(result.employmentHistory).toHaveLength(1);
      expect(result.employmentHistory[0]).toMatchObject({
        borrowerPosition: 1,
        employmentPosition: 1,
        employerName: 'ACME CORPORATION',
        employerAddress: '789 Business Blvd',
        employerCity: 'Chicago',
        employerState: 'IL',
        employerZip: '60602',
        employerPhone: '3125551234',
        positionDescription: 'Senior Manager',
        employmentStartDate: '2018-03-15',
        monthlyIncome: 8500,
        isSelfEmployed: false,
        isPrimaryEmployment: true,
        yearsOnJob: 5,
        monthsOnJob: 9,
      });
      expect(result.statistics.employmentCount).toBe(1);
      expect(result.statistics.errorCount).toBe(0);
    });
  });

  describe('parseFNMFile - Contact Point Records', () => {
    it('should parse contact point record (15)', () => {
      const recordType = '15';
      const borrowerPos = '01';
      const contactType = '01'; // Email
      const contactValue = 'john.alternate@email.com'.padEnd(250, ' ');
      const contactPref = '01'; // Primary
      const bestTime = '09'; // 9 AM
      const timeZone = 'CST';

      const content = `${recordType}${borrowerPos}${contactType}${contactValue}${contactPref}${bestTime}${timeZone}`;

      const result = parseFNMFile(content);
      
      expect(result.contacts).toHaveLength(1);
      expect(result.contacts[0]).toMatchObject({
        borrowerPosition: 1,
        contactType: '01',
        contactValue: 'john.alternate@email.com',
        contactPreference: '01',
        bestTime: '09',
        timeZone: 'CST',
      });
      expect(result.statistics.contactCount).toBe(1);
      expect(result.statistics.errorCount).toBe(0);
    });
  });

  describe('parseFNMFile - Multi-record file', () => {
    it('should parse a complete FNM file with multiple record types', () => {
      // Create a multi-record FNM file
      const loanRecord = '01' + 'LOAN123'.padEnd(33, ' ') + '01'.repeat(10) + '0'.padEnd(120, '0');
      const borrowerRecord = '02' + '01' + 'JOHN'.padEnd(35, ' ') + ' '.padEnd(430, ' ');
      const propertyRecord = '04' + '123 Main St'.padEnd(50, ' ') + 'Chicago'.padEnd(25, ' ') + 'IL60601' + ' '.padEnd(180, ' ');
      const employmentRecord = '06' + '01' + '01' + 'ACME CORP'.padEnd(35, ' ') + ' '.padEnd(165, ' ');
      
      const content = [loanRecord, borrowerRecord, propertyRecord, employmentRecord].join('\n');
      
      const result = parseFNMFile(content);
      
      expect(result.loans).toHaveLength(1);
      expect(result.borrowers).toHaveLength(1);
      expect(result.properties).toHaveLength(1);
      expect(result.employmentHistory).toHaveLength(1);
      expect(result.statistics.parsedLines).toBe(4);
      expect(result.statistics.errorCount).toBe(0);
      expect(result.statistics.totalLines).toBe(4);
    });

    it('should handle files with errors gracefully', () => {
      const validRecord = '01' + 'LOAN123'.padEnd(33, ' ') + '01'.repeat(10) + '0'.padEnd(120, '0');
      const invalidRecord = 'XXINVALID_RECORD_TYPE';
      const shortRecord = '0';
      
      const content = [validRecord, invalidRecord, shortRecord, ''].join('\n');
      
      const result = parseFNMFile(content);
      
      expect(result.loans).toHaveLength(1);
      expect(result.parseErrors).toHaveLength(2);
      expect(result.parseErrors[0].error).toContain('Unknown record type: XX');
      expect(result.parseErrors[1].error).toContain('Line too short');
      expect(result.statistics.parsedLines).toBe(1);
      expect(result.statistics.errorCount).toBe(2);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty numeric fields', () => {
      const loanRecord = '01' + 'LOAN123'.padEnd(33, ' ') + '  ' + '  ' + '  ' + '  ' + '  ' + ' '.padEnd(15, ' ') + ' '.padEnd(120, ' ');
      const result = parseFNMFile(loanRecord);
      
      expect(result.loans).toHaveLength(1);
      expect(result.loans[0].numberOfUnits).toBeUndefined();
      expect(result.loans[0].originalBalance).toBeUndefined();
    });

    it('should handle invalid dates', () => {
      const loanRecord = '01' + 'LOAN123'.padEnd(33, ' ') + '01'.repeat(5) + '0'.padEnd(30, '0') + '00000000' + '20240201' + '00000000' + '0'.padEnd(80, '0');
      const result = parseFNMFile(loanRecord);
      
      expect(result.loans).toHaveLength(1);
      expect(result.loans[0].loanDate).toBeUndefined();
      expect(result.loans[0].firstPaymentDate).toBe('2024-02-01');
      expect(result.loans[0].maturityDate).toBeUndefined();
    });

    it('should trim whitespace from text fields', () => {
      const borrowerRecord = '02' + '01' + '  JOHN  '.padEnd(35, ' ') + '  MICHAEL  '.padEnd(35, ' ') + '  SMITH  '.padEnd(35, ' ') + ' '.padEnd(355, ' ');
      const result = parseFNMFile(borrowerRecord);
      
      expect(result.borrowers).toHaveLength(1);
      expect(result.borrowers[0].firstName).toBe('JOHN');
      expect(result.borrowers[0].middleName).toBe('MICHAEL');
      expect(result.borrowers[0].lastName).toBe('SMITH');
    });
  });
});