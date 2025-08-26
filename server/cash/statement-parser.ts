/**
 * Bank Statement Parser Service
 * Handles BAI2 and CAMT.053 format parsing
 */

import { 
  BankStmtFormat,
  CanonicalBankTxn,
  BankTxnType
} from './types';

export class StatementParser {
  /**
   * Parse bank statement based on format
   */
  async parseStatement(
    rawBytes: Buffer,
    format: BankStmtFormat,
    bankAcctId: string
  ): Promise<CanonicalBankTxn[]> {
    switch (format) {
      case 'bai2':
        return this.parseBAI2(rawBytes.toString('utf-8'), bankAcctId);
      case 'camt.053':
        return this.parseCAMT053(rawBytes.toString('utf-8'), bankAcctId);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Parse BAI2 format statement
   */
  private parseBAI2(content: string, bankAcctId: string): CanonicalBankTxn[] {
    const transactions: CanonicalBankTxn[] = [];
    const lines = content.split(/\r?\n/);
    
    let currentAccount = '';
    let currentDate = '';

    for (const line of lines) {
      if (!line.trim()) continue;

      const recordCode = line.substring(0, 2);

      switch (recordCode) {
        case '01': // File Header
          // Extract date from file header if needed
          break;

        case '02': // Group Header
          // Extract group-level information
          break;

        case '03': // Account Identifier
          const parts = line.split(',');
          currentAccount = parts[1] || '';
          break;

        case '16': // Transaction Detail
          const txnParts = line.split(',');
          if (txnParts.length >= 5) {
            const typeCode = txnParts[1];
            const amount = parseFloat(txnParts[2]) / 100;
            const reference = txnParts[3];
            const description = txnParts[4];
            const date = txnParts[5] || currentDate;

            transactions.push({
              bankAcctId,
              postedDate: this.formatBAI2Date(date),
              amountMinor: BigInt(Math.round(Math.abs(amount) * 100)),
              type: this.mapBAI2TypeCode(typeCode),
              bankRef: reference,
              description: description
            });
          }
          break;

        case '88': // Continuation Record
          // Handle multi-line transactions
          break;

        case '49': // Account Trailer
          // Account summary information
          break;

        case '98': // Group Trailer
          break;

        case '99': // File Trailer
          break;
      }
    }

    return transactions;
  }

  /**
   * Parse CAMT.053 XML format statement
   */
  private parseCAMT053(content: string, bankAcctId: string): CanonicalBankTxn[] {
    const transactions: CanonicalBankTxn[] = [];
    
    // Simplified XML parsing - in production use proper XML parser
    const entries = content.match(/<Ntry>.*?<\/Ntry>/gs) || [];

    for (const entry of entries) {
      const amount = this.extractXMLValue(entry, 'Amt');
      const creditDebit = this.extractXMLValue(entry, 'CdtDbtInd');
      const bookingDate = this.extractXMLValue(entry, 'BookgDt');
      const valueDate = this.extractXMLValue(entry, 'ValDt');
      const reference = this.extractXMLValue(entry, 'AcctSvcrRef');
      const description = this.extractXMLValue(entry, 'AddtlNtryInf');

      if (amount && creditDebit && bookingDate) {
        transactions.push({
          bankAcctId,
          postedDate: this.formatCAMTDate(bookingDate),
          valueDate: valueDate ? this.formatCAMTDate(valueDate) : undefined,
          amountMinor: BigInt(Math.round(parseFloat(amount) * 100)),
          type: creditDebit === 'CRDT' ? 'credit' : 'debit',
          bankRef: reference,
          description: description
        });
      }
    }

    return transactions;
  }

  /**
   * Map BAI2 type codes to transaction types
   */
  private mapBAI2TypeCode(code: string): BankTxnType {
    // BAI2 type codes mapping
    const firstChar = code.charAt(0);
    switch (firstChar) {
      case '1': // Credits
      case '2': // Credits
        return 'credit';
      case '4': // Debits
      case '5': // Debits
        return 'debit';
      case '6': // Fees
        return 'fee';
      case '7': // Returns
        return 'return';
      default:
        return 'credit';
    }
  }

  /**
   * Format BAI2 date (YYMMDD or YYYYMMDD)
   */
  private formatBAI2Date(dateStr: string): string {
    if (!dateStr) return new Date().toISOString().split('T')[0];

    if (dateStr.length === 6) {
      // YYMMDD format
      const year = parseInt(dateStr.substring(0, 2));
      const fullYear = year < 50 ? 2000 + year : 1900 + year;
      const month = dateStr.substring(2, 4);
      const day = dateStr.substring(4, 6);
      return `${fullYear}-${month}-${day}`;
    } else if (dateStr.length === 8) {
      // YYYYMMDD format
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      return `${year}-${month}-${day}`;
    }

    return new Date().toISOString().split('T')[0];
  }

  /**
   * Format CAMT date (YYYY-MM-DD)
   */
  private formatCAMTDate(dateStr: string): string {
    // CAMT dates are usually already in ISO format
    return dateStr.split('T')[0];
  }

  /**
   * Extract value from XML
   */
  private extractXMLValue(xml: string, tag: string): string {
    const regex = new RegExp(`<${tag}[^>]*>(.*?)<\/${tag}>`, 's');
    const match = xml.match(regex);
    return match ? match[1].trim() : '';
  }
}