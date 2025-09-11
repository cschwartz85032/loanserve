/**
 * MISMO (Mortgage Industry Standards Maintenance Organization) XML Parser
 * 
 * Parses MISMO 3.4 XML format files for loan servicing data extraction.
 * Focuses on loan terms, borrower info, property details, and related data.
 */

import { z } from 'zod';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

// Output schemas
export const MISMOAddressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
});

export const MISMOBorrowerSchema = z.object({
  fullName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  middleName: z.string().optional(),
  ssn: z.string().optional(),
  dateOfBirth: z.string().optional(),
  phoneNumber: z.string().optional(),
  email: z.string().optional(),
  monthlyIncome: z.number().optional(),
  address: MISMOAddressSchema.optional(),
});

export const MISMOPropertySchema = z.object({
  address: MISMOAddressSchema.optional(),
  type: z.string().optional(),
  value: z.number().optional(),
  numberOfUnits: z.number().optional(),
  yearBuilt: z.number().optional(),
  legalDescription: z.string().optional(),
});

export const MISMOLoanSchema = z.object({
  loanNumber: z.string().optional(),
  amount: z.number().optional(),
  interestRate: z.number().optional(),
  termMonths: z.number().optional(),
  type: z.string().optional(),
  purpose: z.string().optional(),
  closingDate: z.string().optional(),
  firstPaymentDate: z.string().optional(),
  maturityDate: z.string().optional(),
  monthlyPayment: z.number().optional(),
});

export const MISMOParseResultSchema = z.object({
  loan: MISMOLoanSchema.optional(),
  borrower: MISMOBorrowerSchema.optional(),
  coBorrower: MISMOBorrowerSchema.optional(),
  property: MISMOPropertySchema.optional(),
  rawData: z.record(z.any()).optional(),
});

export type MISMOParseResult = z.infer<typeof MISMOParseResultSchema>;

export class MISMOParser {
  private xmlParser: XMLParser;

  constructor() {
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
      parseTagValue: true,
      trimValues: true,
      parseTrueNumberOnly: true,
    });
  }

  /**
   * Parse MISMO XML content
   */
  parse(xmlContent: string): MISMOParseResult {
    try {
      // Parse XML to JavaScript object
      const parsedXML = this.xmlParser.parse(xmlContent);
      
      // Navigate common MISMO XML structures
      const message = this.findNode(parsedXML, ['MESSAGE', 'MENSAJE']);
      const deal = this.findNode(message || parsedXML, ['DEAL', 'DEALS', 'DEAL_SET']);
      const loan = this.findNode(deal || parsedXML, ['LOAN', 'LOANS']);
      const parties = this.findNode(deal || parsedXML, ['PARTIES', 'PARTY']);
      const collaterals = this.findNode(deal || parsedXML, ['COLLATERAL', 'COLLATERALS']);
      
      // Extract loan information
      const loanData = this.extractLoanData(loan);
      
      // Extract borrower information
      const borrowers = this.extractBorrowers(parties);
      
      // Extract property information
      const propertyData = this.extractPropertyData(collaterals);
      
      return {
        loan: loanData,
        borrower: borrowers.primary,
        coBorrower: borrowers.coBorrower,
        property: propertyData,
        rawData: parsedXML,
      };
    } catch (error) {
      console.error('[MISMO Parser] Failed to parse XML:', error);
      throw new Error(`Failed to parse MISMO XML: ${error.message}`);
    }
  }

  /**
   * Find a node in the XML structure by multiple possible paths
   */
  private findNode(obj: any, paths: string[]): any {
    if (!obj) return null;
    
    for (const path of paths) {
      if (obj[path]) return obj[path];
      
      // Check nested structures
      for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          const found = this.findNode(obj[key], [path]);
          if (found) return found;
        }
      }
    }
    
    return null;
  }

  /**
   * Extract loan data from MISMO XML
   */
  private extractLoanData(loanNode: any): MISMOLoanSchema | undefined {
    if (!loanNode) return undefined;
    
    // Handle both single loan and array of loans
    const loan = Array.isArray(loanNode) ? loanNode[0] : loanNode;
    
    // Extract loan identifiers
    const loanIdentifiers = this.findNode(loan, ['LOAN_IDENTIFIERS', 'LOAN_IDENTIFIER']);
    const loanNumber = this.extractValue(loanIdentifiers, ['LoanIdentifier', 'LoanIdentifierValue']);
    
    // Extract loan detail
    const loanDetail = this.findNode(loan, ['LOAN_DETAIL']);
    const amount = this.extractNumberValue(loanDetail, ['LoanAmount', 'BaseLoanAmount', 'OriginalPrincipalAmount']);
    
    // Extract terms of loan
    const termsOfLoan = this.findNode(loan, ['TERMS_OF_LOAN']);
    const interestRate = this.extractNumberValue(termsOfLoan, ['NoteRatePercent', 'InterestRatePercent']);
    const termMonths = this.extractNumberValue(termsOfLoan, ['LoanTermMonthsCount', 'LoanTermMonths']);
    const monthlyPayment = this.extractNumberValue(termsOfLoan, ['ScheduledMonthlyPaymentAmount']);
    
    // Extract loan type and purpose
    const loanType = this.extractValue(loanDetail, ['LoanType', 'MortgageType']);
    const loanPurpose = this.extractValue(loanDetail, ['LoanPurposeType']);
    
    // Extract dates
    const closingInfo = this.findNode(loan, ['CLOSING_INFORMATION']);
    const closingDate = this.extractDateValue(closingInfo, ['ClosingDate']);
    const firstPaymentDate = this.extractDateValue(loanDetail, ['FirstPaymentDate']);
    const maturityDate = this.extractDateValue(loanDetail, ['MaturityDate', 'LoanMaturityDate']);
    
    return {
      loanNumber,
      amount,
      interestRate,
      termMonths,
      type: loanType,
      purpose: loanPurpose,
      closingDate,
      firstPaymentDate,
      maturityDate,
      monthlyPayment,
    };
  }

  /**
   * Extract borrower data from parties
   */
  private extractBorrowers(partiesNode: any): { primary?: MISMOBorrowerSchema; coBorrower?: MISMOBorrowerSchema } {
    if (!partiesNode) return {};
    
    const parties = Array.isArray(partiesNode) ? partiesNode : [partiesNode];
    const borrowers: MISMOBorrowerSchema[] = [];
    
    for (const party of parties) {
      // Check if this is a borrower party
      const roles = this.findNode(party, ['ROLES', 'ROLE']);
      const isBorrower = this.hasRole(roles, 'Borrower');
      
      if (isBorrower) {
        const individual = this.findNode(party, ['INDIVIDUAL']);
        const name = this.findNode(individual, ['NAME']);
        const contact = this.findNode(individual, ['CONTACT_POINTS', 'CONTACT_POINT']);
        
        // Extract name
        const firstName = this.extractValue(name, ['FirstName']);
        const lastName = this.extractValue(name, ['LastName']);
        const middleName = this.extractValue(name, ['MiddleName']);
        const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
        
        // Extract SSN
        const taxpayerIdentifiers = this.findNode(party, ['TAXPAYER_IDENTIFIERS', 'TAXPAYER_IDENTIFIER']);
        const ssn = this.extractValue(taxpayerIdentifiers, ['TaxpayerIdentifierValue']);
        
        // Extract contact info
        const phoneNumber = this.extractPhoneNumber(contact);
        const email = this.extractEmail(contact);
        
        // Extract address
        const addresses = this.findNode(party, ['ADDRESSES', 'ADDRESS']);
        const address = this.extractAddress(addresses);
        
        // Extract income
        const currentIncome = this.findNode(party, ['CURRENT_INCOME', 'CURRENT_INCOME_ITEM']);
        const monthlyIncome = this.extractNumberValue(currentIncome, ['CurrentIncomeMonthlyTotalAmount']);
        
        borrowers.push({
          fullName,
          firstName,
          lastName,
          middleName,
          ssn,
          phoneNumber,
          email,
          monthlyIncome,
          address,
        });
      }
    }
    
    return {
      primary: borrowers[0],
      coBorrower: borrowers[1],
    };
  }

  /**
   * Extract property data from collateral
   */
  private extractPropertyData(collateralNode: any): MISMOPropertySchema | undefined {
    if (!collateralNode) return undefined;
    
    const collateral = Array.isArray(collateralNode) ? collateralNode[0] : collateralNode;
    
    // Extract subject property
    const subjectProperty = this.findNode(collateral, ['SUBJECT_PROPERTY']);
    
    // Extract address
    const address = this.findNode(subjectProperty, ['ADDRESS']);
    const propertyAddress = this.extractAddress(address);
    
    // Extract property detail
    const propertyDetail = this.findNode(subjectProperty, ['PROPERTY_DETAIL']);
    const propertyType = this.extractValue(propertyDetail, ['PropertyType']);
    const numberOfUnits = this.extractNumberValue(propertyDetail, ['NumberOfUnitsCount', 'AttachedPropertyUnitsCount']);
    const yearBuilt = this.extractNumberValue(propertyDetail, ['PropertyStructureBuiltYear']);
    
    // Extract property value
    const propertyValuation = this.findNode(subjectProperty, ['PROPERTY_VALUATIONS', 'PROPERTY_VALUATION']);
    const propertyValue = this.extractNumberValue(propertyValuation, ['PropertyValuationAmount', 'AppraisalAmount']);
    
    // Extract legal description
    const legalDescription = this.extractValue(propertyDetail, ['LegalDescriptionText']);
    
    return {
      address: propertyAddress,
      type: propertyType,
      value: propertyValue,
      numberOfUnits,
      yearBuilt,
      legalDescription,
    };
  }

  /**
   * Extract address from address node
   */
  private extractAddress(addressNode: any): MISMOAddressSchema | undefined {
    if (!addressNode) return undefined;
    
    const address = Array.isArray(addressNode) ? addressNode[0] : addressNode;
    
    return {
      street: this.extractValue(address, ['AddressLineText', 'StreetAddress']),
      city: this.extractValue(address, ['CityName']),
      state: this.extractValue(address, ['StateCode', 'StateAbbreviation']),
      zip: this.extractValue(address, ['PostalCode', 'ZIPCode']),
      country: this.extractValue(address, ['CountryCode', 'CountryName']),
    };
  }

  /**
   * Extract phone number from contact points
   */
  private extractPhoneNumber(contactNode: any): string | undefined {
    if (!contactNode) return undefined;
    
    const contacts = Array.isArray(contactNode) ? contactNode : [contactNode];
    
    for (const contact of contacts) {
      const contactDetail = this.findNode(contact, ['CONTACT_POINT_DETAIL']);
      const phoneValue = this.extractValue(contactDetail, ['ContactPointValue', 'ContactPointTelephoneValue']);
      if (phoneValue) return phoneValue;
    }
    
    return undefined;
  }

  /**
   * Extract email from contact points
   */
  private extractEmail(contactNode: any): string | undefined {
    if (!contactNode) return undefined;
    
    const contacts = Array.isArray(contactNode) ? contactNode : [contactNode];
    
    for (const contact of contacts) {
      const contactDetail = this.findNode(contact, ['CONTACT_POINT_DETAIL']);
      const contactType = this.extractValue(contactDetail, ['ContactPointType']);
      if (contactType === 'Email') {
        return this.extractValue(contactDetail, ['ContactPointValue', 'ContactPointEmailValue']);
      }
    }
    
    return undefined;
  }

  /**
   * Check if a role node contains a specific role type
   */
  private hasRole(roleNode: any, roleType: string): boolean {
    if (!roleNode) return false;
    
    const roles = Array.isArray(roleNode) ? roleNode : [roleNode];
    
    for (const role of roles) {
      const borrowerRole = this.findNode(role, ['BORROWER']);
      if (borrowerRole) return true;
      
      const roleDetail = this.findNode(role, ['ROLE_DETAIL']);
      const partyRoleType = this.extractValue(roleDetail, ['PartyRoleType']);
      if (partyRoleType === roleType) return true;
    }
    
    return false;
  }

  /**
   * Extract a value from multiple possible paths
   */
  private extractValue(node: any, paths: string[]): string | undefined {
    if (!node) return undefined;
    
    for (const path of paths) {
      if (node[path] !== undefined && node[path] !== null) {
        return String(node[path]);
      }
    }
    
    return undefined;
  }

  /**
   * Extract a numeric value from multiple possible paths
   */
  private extractNumberValue(node: any, paths: string[]): number | undefined {
    const value = this.extractValue(node, paths);
    if (value === undefined) return undefined;
    
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  }

  /**
   * Extract a date value from multiple possible paths
   */
  private extractDateValue(node: any, paths: string[]): string | undefined {
    const value = this.extractValue(node, paths);
    if (!value) return undefined;
    
    // Try to parse and format date
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return value; // Return original if not parseable
      return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
    } catch {
      return value;
    }
  }
}