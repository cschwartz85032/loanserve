/**
 * FNM (Fannie Mae) Fixed-Width File Parser
 * 
 * Parses Fannie Mae 3.2 format files for loan servicing data extraction.
 * Focuses on servicing-relevant data: loan terms, borrower info, collateral,
 * employment history, and contact references.
 */

import { z } from 'zod';

// FNM File Record Types
export const FNM_RECORD_TYPES = {
  LOAN: '01',
  BORROWER: '02',
  TRANSACTION: '03',
  PROPERTY: '04',
  MORTGAGE_TERMS: '05',
  EMPLOYMENT: '06',
  INCOME: '07',
  ASSETS: '08',
  LIABILITY: '09',
  DECLARATION: '10',
  REO: '11',
  GOVERNMENT_LOAN: '12',
  CONSTRUCTION_REFINANCE: '13',
  ADDITIONAL_LOAN: '14',
  CONTACT_POINT: '15',
  TITLE_HOLDER: '16',
} as const;

// Field definitions for each record type with [start, end) positions
const FIELD_DEFINITIONS = {
  [FNM_RECORD_TYPES.LOAN]: {
    recordType: [0, 2],
    loanNumber: [2, 35],
    loanPurposeType: [35, 37],
    loanType: [37, 39],
    propertyType: [39, 41],
    occupancyType: [41, 43],
    numberOfUnits: [43, 45],
    originalBalance: [45, 60],
    originalInterestRate: [60, 67],
    originalTerm: [67, 70],
    loanDate: [70, 78],
    firstPaymentDate: [78, 86],
    maturityDate: [86, 94],
    ltv: [94, 99],
    cltv: [99, 104],
    productType: [104, 134],
    documentationType: [134, 136],
    miRequired: [136, 137],
    prepaymentPenaltyIndicator: [137, 138],
  },
  [FNM_RECORD_TYPES.BORROWER]: {
    recordType: [0, 2],
    borrowerPosition: [2, 4],
    firstName: [4, 39],
    middleName: [39, 74],
    lastName: [74, 109],
    nameSuffix: [109, 113],
    ssn: [113, 122],
    dateOfBirth: [122, 130],
    homePhone: [130, 140],
    cellPhone: [140, 150],
    workPhone: [150, 160],
    phoneExtension: [160, 165],
    email: [165, 250],
    maritalStatus: [250, 252],
    dependentsCount: [252, 254],
    dependentsAges: [254, 282],
    streetAddress: [282, 332],
    city: [332, 357],
    state: [357, 359],
    zip: [359, 364],
    zipPlus4: [364, 368],
    country: [368, 370],
    mailingAddress: [370, 420],
    mailingCity: [420, 445],
    mailingState: [445, 447],
    mailingZip: [447, 452],
    mailingZipPlus4: [452, 456],
    mailingCountry: [456, 458],
    yearsAtAddress: [458, 460],
    monthsAtAddress: [460, 462],
    residenceType: [462, 464],
    monthlyRentPayment: [464, 479],
  },
  [FNM_RECORD_TYPES.PROPERTY]: {
    recordType: [0, 2],
    streetAddress: [2, 52],
    city: [52, 77],
    state: [77, 79],
    zip: [79, 84],
    zipPlus4: [84, 88],
    county: [88, 113],
    propertyType: [113, 115],
    numberOfUnits: [115, 117],
    yearBuilt: [117, 121],
    financedUnits: [121, 125],
    legalDescription: [125, 205],
    appraisedValue: [205, 220],
    appraisalDate: [220, 228],
    purchasePrice: [228, 243],
    purchaseDate: [243, 251],
    propertyAcquiredYear: [251, 255],
    propertyUsageType: [255, 257],
    propertyOccupancyType: [257, 259],
  },
  [FNM_RECORD_TYPES.EMPLOYMENT]: {
    recordType: [0, 2],
    borrowerPosition: [2, 4],
    employmentPosition: [4, 6],
    employerName: [6, 41],
    employerAddress: [41, 91],
    employerCity: [91, 116],
    employerState: [116, 118],
    employerZip: [118, 123],
    employerZipPlus4: [123, 127],
    employerPhone: [127, 137],
    employmentPositionDescription: [137, 162],
    employmentBusinessType: [162, 164],
    employmentStartDate: [164, 172],
    employmentEndDate: [172, 180],
    monthlyIncome: [180, 195],
    isSelfEmployed: [195, 196],
    isPrimaryEmployment: [196, 197],
    yearsOnJob: [197, 199],
    monthsOnJob: [199, 201],
    yearsInProfession: [201, 203],
    monthsInProfession: [203, 205],
  },
  [FNM_RECORD_TYPES.CONTACT_POINT]: {
    recordType: [0, 2],
    borrowerPosition: [2, 4],
    contactPointType: [4, 6],
    contactPointValue: [6, 256],
    contactPointPreference: [256, 258],
    contactPointBestTime: [258, 260],
    contactPointTimeZone: [260, 263],
  },
} as const;

// Output schemas
export const ParsedLoanSchema = z.object({
  loanNumber: z.string(),
  loanPurposeType: z.string().optional(),
  loanType: z.string().optional(),
  propertyType: z.string().optional(),
  occupancyType: z.string().optional(),
  numberOfUnits: z.number().optional(),
  originalBalance: z.number().optional(),
  originalInterestRate: z.number().optional(),
  originalTerm: z.number().optional(),
  loanDate: z.string().optional(),
  firstPaymentDate: z.string().optional(),
  maturityDate: z.string().optional(),
  ltv: z.number().optional(),
  cltv: z.number().optional(),
  productType: z.string().optional(),
  documentationType: z.string().optional(),
  miRequired: z.boolean().optional(),
  prepaymentPenaltyIndicator: z.boolean().optional(),
});

export const ParsedBorrowerSchema = z.object({
  borrowerPosition: z.number(),
  firstName: z.string().optional(),
  middleName: z.string().optional(),
  lastName: z.string().optional(),
  nameSuffix: z.string().optional(),
  ssn: z.string().optional(),
  dateOfBirth: z.string().optional(),
  homePhone: z.string().optional(),
  cellPhone: z.string().optional(),
  workPhone: z.string().optional(),
  email: z.string().optional(),
  maritalStatus: z.string().optional(),
  streetAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  mailingAddress: z.string().optional(),
  mailingCity: z.string().optional(),
  mailingState: z.string().optional(),
  mailingZip: z.string().optional(),
  yearsAtAddress: z.number().optional(),
  monthsAtAddress: z.number().optional(),
});

export const ParsedPropertySchema = z.object({
  streetAddress: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  county: z.string().optional(),
  propertyType: z.string().optional(),
  numberOfUnits: z.number().optional(),
  yearBuilt: z.number().optional(),
  legalDescription: z.string().optional(),
  appraisedValue: z.number().optional(),
  appraisalDate: z.string().optional(),
  purchasePrice: z.number().optional(),
  purchaseDate: z.string().optional(),
});

export const ParsedEmploymentSchema = z.object({
  borrowerPosition: z.number(),
  employmentPosition: z.number(),
  employerName: z.string(),
  employerAddress: z.string().optional(),
  employerCity: z.string().optional(),
  employerState: z.string().optional(),
  employerZip: z.string().optional(),
  employerPhone: z.string().optional(),
  positionDescription: z.string().optional(),
  employmentStartDate: z.string().optional(),
  employmentEndDate: z.string().optional(),
  monthlyIncome: z.number().optional(),
  isSelfEmployed: z.boolean().optional(),
  isPrimaryEmployment: z.boolean().optional(),
  yearsOnJob: z.number().optional(),
  monthsOnJob: z.number().optional(),
});

export const ParsedContactSchema = z.object({
  borrowerPosition: z.number(),
  contactType: z.string(),
  contactValue: z.string(),
  contactPreference: z.string().optional(),
  bestTime: z.string().optional(),
  timeZone: z.string().optional(),
});

export const FNMParseResultSchema = z.object({
  loans: z.array(ParsedLoanSchema),
  borrowers: z.array(ParsedBorrowerSchema),
  properties: z.array(ParsedPropertySchema),
  employmentHistory: z.array(ParsedEmploymentSchema),
  contacts: z.array(ParsedContactSchema),
  parseErrors: z.array(z.object({
    line: z.number(),
    recordType: z.string(),
    error: z.string(),
  })),
  statistics: z.object({
    totalLines: z.number(),
    parsedLines: z.number(),
    errorCount: z.number(),
    loanCount: z.number(),
    borrowerCount: z.number(),
    propertyCount: z.number(),
    employmentCount: z.number(),
    contactCount: z.number(),
  }),
});

export type FNMParseResult = z.infer<typeof FNMParseResultSchema>;
export type ParsedLoan = z.infer<typeof ParsedLoanSchema>;
export type ParsedBorrower = z.infer<typeof ParsedBorrowerSchema>;
export type ParsedProperty = z.infer<typeof ParsedPropertySchema>;
export type ParsedEmployment = z.infer<typeof ParsedEmploymentSchema>;
export type ParsedContact = z.infer<typeof ParsedContactSchema>;

/**
 * Extract a field from a fixed-width line
 */
function extractField(line: string, start: number, end: number): string {
  return line.substring(start, end).trim();
}

/**
 * Parse a numeric field
 */
function parseNumeric(value: string): number | undefined {
  const cleaned = value.replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

/**
 * Parse a decimal/currency field (assumed to be in cents or basis points)
 */
function parseDecimal(value: string, scale = 100): number | undefined {
  const num = parseNumeric(value);
  return num !== undefined ? num / scale : undefined;
}

/**
 * Parse a date field (YYYYMMDD format)
 */
function parseDate(value: string): string | undefined {
  if (value.length !== 8) return undefined;
  const year = value.substring(0, 4);
  const month = value.substring(4, 6);
  const day = value.substring(6, 8);
  if (year === '0000' || month === '00' || day === '00') return undefined;
  return `${year}-${month}-${day}`;
}

/**
 * Parse a boolean field (Y/N or 1/0)
 */
function parseBoolean(value: string): boolean | undefined {
  const upper = value.toUpperCase();
  if (upper === 'Y' || upper === '1' || upper === 'TRUE') return true;
  if (upper === 'N' || upper === '0' || upper === 'FALSE') return false;
  return undefined;
}

/**
 * Parse a single FNM record line
 */
function parseRecord(line: string, lineNumber: number): { type: string; data: any } | { error: string } {
  if (line.length < 2) {
    return { error: 'Line too short to determine record type' };
  }

  const recordType = line.substring(0, 2);
  
  if (!FIELD_DEFINITIONS[recordType as keyof typeof FIELD_DEFINITIONS]) {
    return { error: `Unknown record type: ${recordType}` };
  }

  const data: any = {};

  try {
    switch (recordType) {
      case FNM_RECORD_TYPES.LOAN: {
        const fields = FIELD_DEFINITIONS[FNM_RECORD_TYPES.LOAN];
        data.loanNumber = extractField(line, fields.loanNumber[0], fields.loanNumber[1]);
        data.loanPurposeType = extractField(line, fields.loanPurposeType[0], fields.loanPurposeType[1]);
        data.loanType = extractField(line, fields.loanType[0], fields.loanType[1]);
        data.propertyType = extractField(line, fields.propertyType[0], fields.propertyType[1]);
        data.occupancyType = extractField(line, fields.occupancyType[0], fields.occupancyType[1]);
        data.numberOfUnits = parseNumeric(extractField(line, fields.numberOfUnits[0], fields.numberOfUnits[1]));
        data.originalBalance = parseDecimal(extractField(line, fields.originalBalance[0], fields.originalBalance[1]), 100);
        data.originalInterestRate = parseDecimal(extractField(line, fields.originalInterestRate[0], fields.originalInterestRate[1]), 10000);
        data.originalTerm = parseNumeric(extractField(line, fields.originalTerm[0], fields.originalTerm[1]));
        data.loanDate = parseDate(extractField(line, fields.loanDate[0], fields.loanDate[1]));
        data.firstPaymentDate = parseDate(extractField(line, fields.firstPaymentDate[0], fields.firstPaymentDate[1]));
        data.maturityDate = parseDate(extractField(line, fields.maturityDate[0], fields.maturityDate[1]));
        data.ltv = parseDecimal(extractField(line, fields.ltv[0], fields.ltv[1]), 100);
        data.cltv = parseDecimal(extractField(line, fields.cltv[0], fields.cltv[1]), 100);
        data.productType = extractField(line, fields.productType[0], fields.productType[1]);
        data.documentationType = extractField(line, fields.documentationType[0], fields.documentationType[1]);
        data.miRequired = parseBoolean(extractField(line, fields.miRequired[0], fields.miRequired[1]));
        data.prepaymentPenaltyIndicator = parseBoolean(extractField(line, fields.prepaymentPenaltyIndicator[0], fields.prepaymentPenaltyIndicator[1]));
        break;
      }

      case FNM_RECORD_TYPES.BORROWER: {
        const fields = FIELD_DEFINITIONS[FNM_RECORD_TYPES.BORROWER];
        data.borrowerPosition = parseNumeric(extractField(line, fields.borrowerPosition[0], fields.borrowerPosition[1])) || 1;
        data.firstName = extractField(line, fields.firstName[0], fields.firstName[1]);
        data.middleName = extractField(line, fields.middleName[0], fields.middleName[1]);
        data.lastName = extractField(line, fields.lastName[0], fields.lastName[1]);
        data.nameSuffix = extractField(line, fields.nameSuffix[0], fields.nameSuffix[1]);
        data.ssn = extractField(line, fields.ssn[0], fields.ssn[1]);
        data.dateOfBirth = parseDate(extractField(line, fields.dateOfBirth[0], fields.dateOfBirth[1]));
        data.homePhone = extractField(line, fields.homePhone[0], fields.homePhone[1]);
        data.cellPhone = extractField(line, fields.cellPhone[0], fields.cellPhone[1]);
        data.workPhone = extractField(line, fields.workPhone[0], fields.workPhone[1]);
        data.email = extractField(line, fields.email[0], fields.email[1]);
        data.maritalStatus = extractField(line, fields.maritalStatus[0], fields.maritalStatus[1]);
        data.streetAddress = extractField(line, fields.streetAddress[0], fields.streetAddress[1]);
        data.city = extractField(line, fields.city[0], fields.city[1]);
        data.state = extractField(line, fields.state[0], fields.state[1]);
        data.zip = extractField(line, fields.zip[0], fields.zip[1]);
        data.country = extractField(line, fields.country[0], fields.country[1]);
        data.mailingAddress = extractField(line, fields.mailingAddress[0], fields.mailingAddress[1]);
        data.mailingCity = extractField(line, fields.mailingCity[0], fields.mailingCity[1]);
        data.mailingState = extractField(line, fields.mailingState[0], fields.mailingState[1]);
        data.mailingZip = extractField(line, fields.mailingZip[0], fields.mailingZip[1]);
        data.yearsAtAddress = parseNumeric(extractField(line, fields.yearsAtAddress[0], fields.yearsAtAddress[1]));
        data.monthsAtAddress = parseNumeric(extractField(line, fields.monthsAtAddress[0], fields.monthsAtAddress[1]));
        break;
      }

      case FNM_RECORD_TYPES.PROPERTY: {
        const fields = FIELD_DEFINITIONS[FNM_RECORD_TYPES.PROPERTY];
        data.streetAddress = extractField(line, fields.streetAddress[0], fields.streetAddress[1]);
        data.city = extractField(line, fields.city[0], fields.city[1]);
        data.state = extractField(line, fields.state[0], fields.state[1]);
        data.zip = extractField(line, fields.zip[0], fields.zip[1]);
        data.county = extractField(line, fields.county[0], fields.county[1]);
        data.propertyType = extractField(line, fields.propertyType[0], fields.propertyType[1]);
        data.numberOfUnits = parseNumeric(extractField(line, fields.numberOfUnits[0], fields.numberOfUnits[1]));
        data.yearBuilt = parseNumeric(extractField(line, fields.yearBuilt[0], fields.yearBuilt[1]));
        data.legalDescription = extractField(line, fields.legalDescription[0], fields.legalDescription[1]);
        data.appraisedValue = parseDecimal(extractField(line, fields.appraisedValue[0], fields.appraisedValue[1]), 100);
        data.appraisalDate = parseDate(extractField(line, fields.appraisalDate[0], fields.appraisalDate[1]));
        data.purchasePrice = parseDecimal(extractField(line, fields.purchasePrice[0], fields.purchasePrice[1]), 100);
        data.purchaseDate = parseDate(extractField(line, fields.purchaseDate[0], fields.purchaseDate[1]));
        break;
      }

      case FNM_RECORD_TYPES.EMPLOYMENT: {
        const fields = FIELD_DEFINITIONS[FNM_RECORD_TYPES.EMPLOYMENT];
        data.borrowerPosition = parseNumeric(extractField(line, fields.borrowerPosition[0], fields.borrowerPosition[1])) || 1;
        data.employmentPosition = parseNumeric(extractField(line, fields.employmentPosition[0], fields.employmentPosition[1])) || 1;
        data.employerName = extractField(line, fields.employerName[0], fields.employerName[1]);
        data.employerAddress = extractField(line, fields.employerAddress[0], fields.employerAddress[1]);
        data.employerCity = extractField(line, fields.employerCity[0], fields.employerCity[1]);
        data.employerState = extractField(line, fields.employerState[0], fields.employerState[1]);
        data.employerZip = extractField(line, fields.employerZip[0], fields.employerZip[1]);
        data.employerPhone = extractField(line, fields.employerPhone[0], fields.employerPhone[1]);
        data.positionDescription = extractField(line, fields.employmentPositionDescription[0], fields.employmentPositionDescription[1]);
        data.employmentStartDate = parseDate(extractField(line, fields.employmentStartDate[0], fields.employmentStartDate[1]));
        data.employmentEndDate = parseDate(extractField(line, fields.employmentEndDate[0], fields.employmentEndDate[1]));
        data.monthlyIncome = parseDecimal(extractField(line, fields.monthlyIncome[0], fields.monthlyIncome[1]), 100);
        data.isSelfEmployed = parseBoolean(extractField(line, fields.isSelfEmployed[0], fields.isSelfEmployed[1]));
        data.isPrimaryEmployment = parseBoolean(extractField(line, fields.isPrimaryEmployment[0], fields.isPrimaryEmployment[1]));
        data.yearsOnJob = parseNumeric(extractField(line, fields.yearsOnJob[0], fields.yearsOnJob[1]));
        data.monthsOnJob = parseNumeric(extractField(line, fields.monthsOnJob[0], fields.monthsOnJob[1]));
        break;
      }

      case FNM_RECORD_TYPES.CONTACT_POINT: {
        const fields = FIELD_DEFINITIONS[FNM_RECORD_TYPES.CONTACT_POINT];
        data.borrowerPosition = parseNumeric(extractField(line, fields.borrowerPosition[0], fields.borrowerPosition[1])) || 1;
        data.contactType = extractField(line, fields.contactPointType[0], fields.contactPointType[1]);
        data.contactValue = extractField(line, fields.contactPointValue[0], fields.contactPointValue[1]);
        data.contactPreference = extractField(line, fields.contactPointPreference[0], fields.contactPointPreference[1]);
        data.bestTime = extractField(line, fields.contactPointBestTime[0], fields.contactPointBestTime[1]);
        data.timeZone = extractField(line, fields.contactPointTimeZone[0], fields.contactPointTimeZone[1]);
        break;
      }

      default:
        // Skip other record types for now
        return { type: recordType, data: {} };
    }

    return { type: recordType, data };
  } catch (error) {
    return { error: `Failed to parse ${recordType} record: ${error}` };
  }
}

/**
 * Main FNM file parser
 */
export function parseFNMFile(content: string): FNMParseResult {
  const lines = content.split(/\r?\n/);
  const result: FNMParseResult = {
    loans: [],
    borrowers: [],
    properties: [],
    employmentHistory: [],
    contacts: [],
    parseErrors: [],
    statistics: {
      totalLines: lines.length,
      parsedLines: 0,
      errorCount: 0,
      loanCount: 0,
      borrowerCount: 0,
      propertyCount: 0,
      employmentCount: 0,
      contactCount: 0,
    },
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim().length === 0) continue;

    const parsed = parseRecord(line, i + 1);
    
    if ('error' in parsed) {
      result.parseErrors.push({
        line: i + 1,
        recordType: line.substring(0, 2),
        error: parsed.error,
      });
      result.statistics.errorCount++;
    } else {
      result.statistics.parsedLines++;
      
      switch (parsed.type) {
        case FNM_RECORD_TYPES.LOAN:
          result.loans.push(parsed.data);
          result.statistics.loanCount++;
          break;
        case FNM_RECORD_TYPES.BORROWER:
          result.borrowers.push(parsed.data);
          result.statistics.borrowerCount++;
          break;
        case FNM_RECORD_TYPES.PROPERTY:
          result.properties.push(parsed.data);
          result.statistics.propertyCount++;
          break;
        case FNM_RECORD_TYPES.EMPLOYMENT:
          result.employmentHistory.push(parsed.data);
          result.statistics.employmentCount++;
          break;
        case FNM_RECORD_TYPES.CONTACT_POINT:
          result.contacts.push(parsed.data);
          result.statistics.contactCount++;
          break;
      }
    }
  }

  return result;
}

/**
 * Validate FNM file format
 */
export function validateFNMFile(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const lines = content.split(/\r?\n/);
  
  if (lines.length === 0) {
    errors.push('File is empty');
    return { valid: false, errors };
  }

  // Check for valid record types
  const validRecordTypes = new Set(Object.values(FNM_RECORD_TYPES));
  let hasValidRecords = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim().length === 0) continue;
    
    if (line.length < 2) {
      errors.push(`Line ${i + 1}: Too short to determine record type`);
      continue;
    }

    const recordType = line.substring(0, 2);
    if (validRecordTypes.has(recordType)) {
      hasValidRecords = true;
    }
  }

  if (!hasValidRecords) {
    errors.push('No valid FNM record types found in file');
  }

  return { valid: errors.length === 0, errors };
}