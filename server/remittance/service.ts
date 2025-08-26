import { Pool } from '@neondatabase/serverless';
import { RemittanceRepository } from './repo.js';
import { PgLedgerRepository } from '../db/ledger-repository.js';
import {
  InvestorContract,
  InvestorWaterfallRule,
  RemittanceCycle,
  WaterfallCalculation,
  RemittanceReport
} from './types.js';
import { format, startOfMonth, endOfMonth, addMonths, isBefore } from 'date-fns';
import { Parser } from 'json2csv';

export class RemittanceService {
  private repo: RemittanceRepository;
  
  constructor(private pool: Pool, private ledgerRepo: PgLedgerRepository) {
    this.repo = new RemittanceRepository(pool, ledgerRepo);
  }

  // Contract management
  async createContract(data: {
    investorId: string;
    productCode: string;
    method: 'scheduled_p_i' | 'actual_cash' | 'scheduled_p_i_with_interest_shortfall';
    remittanceDay: number;
    cutoffDay: number;
    custodialBankAcctId: string;
    servicerFeeBps: number;
    lateFeeSpiltBps: number;
    waterfallRules: Array<{
      rank: number;
      bucket: 'interest' | 'principal' | 'late_fees' | 'escrow' | 'recoveries';
      capMinor?: string;
    }>;
  }): Promise<InvestorContract> {
    // Create contract
    const contract = await this.repo.createContract({
      investor_id: data.investorId,
      product_code: data.productCode,
      method: data.method,
      remittance_day: data.remittanceDay,
      cutoff_day: data.cutoffDay,
      custodial_bank_acct_id: data.custodialBankAcctId,
      servicer_fee_bps: data.servicerFeeBps,
      late_fee_split_bps: data.lateFeeSpiltBps
    });

    // Create waterfall rules
    for (const rule of data.waterfallRules) {
      await this.repo.createWaterfallRule({
        contract_id: contract.contract_id,
        rank: rule.rank,
        bucket: rule.bucket,
        cap_minor: rule.capMinor
      });
    }

    return contract;
  }

  // Cycle management
  async initiateCycle(contractId: string): Promise<RemittanceCycle> {
    const contract = await this.repo.getContract(contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }

    // Check for existing open cycle
    const existingCycle = await this.repo.getCurrentCycle(contractId);
    if (existingCycle && existingCycle.status === 'open') {
      throw new Error('An open cycle already exists');
    }

    // Calculate period based on cutoff day
    const now = new Date();
    const cutoffDate = new Date(now.getFullYear(), now.getMonth(), contract.cutoff_day);
    
    let periodStart: Date;
    let periodEnd: Date;
    
    if (isBefore(now, cutoffDate)) {
      // Use previous month
      periodStart = startOfMonth(addMonths(now, -1));
      periodEnd = endOfMonth(addMonths(now, -1));
    } else {
      // Use current month up to cutoff
      periodStart = startOfMonth(now);
      periodEnd = cutoffDate;
    }

    return await this.repo.createCycle({
      contractId,
      periodStart,
      periodEnd
    });
  }

  // Process collections and calculate waterfall
  async calculateWaterfall(cycleId: string): Promise<WaterfallCalculation> {
    const cycle = await this.repo.getCycle(cycleId);
    if (!cycle) {
      throw new Error('Cycle not found');
    }

    const contract = await this.repo.getContract(cycle.contract_id);
    if (!contract) {
      throw new Error('Contract not found');
    }

    const rules = await this.repo.getWaterfallRules(contract.contract_id);
    const collections = await this.repo.getLoanCollections(
      contract.contract_id,
      cycle.period_start,
      cycle.period_end
    );

    // Process loan-level aggregations and waterfall
    let totalPrincipalToInvestor = 0n;
    let totalInterestToInvestor = 0n;
    let totalFeesToInvestor = 0n;
    let totalServicerFee = 0n;
    let totalInvestorDue = 0n;
    
    for (const loan of collections) {
      const principalCollected = BigInt(Math.round(Number(loan.principal_collected || 0)));
      const interestCollected = BigInt(Math.round(Number(loan.interest_collected || 0)));
      const lateFeesCollected = BigInt(Math.round(Number(loan.late_fees_collected || 0)));
      
      // Calculate servicer fee on interest collected
      const servicerFeeOnInterest = (interestCollected * BigInt(contract.servicer_fee_bps)) / 10000n;
      
      // Apply waterfall rules per loan
      let loanInvestorPrincipal = 0n;
      let loanInvestorInterest = 0n;
      let loanInvestorFees = 0n;
      let loanServicerFee = servicerFeeOnInterest;
      
      // Sort rules by rank to ensure proper sequence
      const sortedRules = rules.sort((a, b) => a.rank - b.rank);
      
      for (const rule of sortedRules) {
        switch (rule.bucket) {
          case 'interest':
            // Apply interest to investor up to cap, less servicer fee
            let interestToInvestor = interestCollected - servicerFeeOnInterest;
            if (rule.cap_minor) {
              const cap = BigInt(rule.cap_minor);
              interestToInvestor = interestToInvestor > cap ? cap : interestToInvestor;
            }
            loanInvestorInterest = interestToInvestor;
            break;
            
          case 'principal':
            // Apply principal to investor
            loanInvestorPrincipal = principalCollected;
            if (rule.cap_minor) {
              const cap = BigInt(rule.cap_minor);
              loanInvestorPrincipal = loanInvestorPrincipal > cap ? cap : loanInvestorPrincipal;
            }
            break;
            
          case 'late_fees':
            // Apply late fees split by late_fee_split_bps to investor
            const investorFeePortion = (lateFeesCollected * BigInt(contract.late_fee_split_bps)) / 10000n;
            const servicerFeePortion = lateFeesCollected - investorFeePortion;
            loanInvestorFees = investorFeePortion;
            loanServicerFee += servicerFeePortion;
            break;
        }
      }
      
      const loanInvestorShare = loanInvestorPrincipal + loanInvestorInterest + loanInvestorFees;
      
      // Create remittance item for this loan
      await this.repo.createItem({
        cycle_id: cycleId,
        loan_id: loan.loan_id,
        principal_minor: loanInvestorPrincipal.toString(),
        interest_minor: loanInvestorInterest.toString(),
        fees_minor: loanInvestorFees.toString(),
        investor_share_minor: loanInvestorShare.toString(),
        servicer_fee_minor: loanServicerFee.toString()
      });
      
      // Update totals
      totalPrincipalToInvestor += loanInvestorPrincipal;
      totalInterestToInvestor += loanInvestorInterest;
      totalFeesToInvestor += loanInvestorFees;
      totalServicerFee += loanServicerFee;
      totalInvestorDue += loanInvestorShare;
    }

    // Update cycle totals
    await this.repo.updateCycleTotals(cycleId, {
      principal: totalPrincipalToInvestor.toString(),
      interest: totalInterestToInvestor.toString(),
      fees: totalFeesToInvestor.toString(),
      servicerFee: totalServicerFee.toString(),
      investorDue: totalInvestorDue.toString()
    });

    return {
      contractId: contract.contract_id,
      totalCollected: (totalInvestorDue + totalServicerFee).toString(),
      buckets: {
        interest: totalInterestToInvestor.toString(),
        principal: totalPrincipalToInvestor.toString(),
        late_fees: totalFeesToInvestor.toString(),
        escrow: '0',
        recoveries: '0'
      },
      servicerFee: totalServicerFee.toString(),
      investorDue: totalInvestorDue.toString()
    };
  }

  // Lock cycle for processing
  async lockCycle(cycleId: string): Promise<void> {
    const cycle = await this.repo.getCycle(cycleId);
    if (!cycle || cycle.status !== 'open') {
      throw new Error('Cycle must be open to lock');
    }
    
    await this.repo.updateCycleStatus(cycleId, 'locked');
  }

  // Generate remittance export
  async generateExport(cycleId: string, format: 'csv' | 'xml'): Promise<string> {
    const cycle = await this.repo.getCycle(cycleId);
    if (!cycle) {
      throw new Error('Cycle not found');
    }

    const items = await this.repo.getItems(cycleId);
    
    if (format === 'csv') {
      const fields = [
        'loan_id',
        'principal_minor',
        'interest_minor',
        'fees_minor',
        'investor_share_minor',
        'servicer_fee_minor'
      ];
      
      const parser = new Parser({ fields });
      const csv = parser.parse(items);
      const buffer = Buffer.from(csv);
      
      const exportRecord = await this.repo.createExport(cycleId, format, buffer);
      await this.repo.updateCycleStatus(cycleId, 'file_generated');
      
      return exportRecord.export_id;
    } else {
      // XML format
      const xml = this.generateXML(cycle, items);
      const buffer = Buffer.from(xml);
      
      const exportRecord = await this.repo.createExport(cycleId, format, buffer);
      await this.repo.updateCycleStatus(cycleId, 'file_generated');
      
      return exportRecord.export_id;
    }
  }

  private generateXML(cycle: RemittanceCycle, items: any[]): string {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RemittanceReport>
  <CycleId>${cycle.cycle_id}</CycleId>
  <ContractId>${cycle.contract_id}</ContractId>
  <PeriodStart>${format(cycle.period_start, 'yyyy-MM-dd')}</PeriodStart>
  <PeriodEnd>${format(cycle.period_end, 'yyyy-MM-dd')}</PeriodEnd>
  <TotalPrincipal>${cycle.total_principal_minor}</TotalPrincipal>
  <TotalInterest>${cycle.total_interest_minor}</TotalInterest>
  <TotalFees>${cycle.total_fees_minor}</TotalFees>
  <ServicerFee>${cycle.servicer_fee_minor}</ServicerFee>
  <InvestorDue>${cycle.investor_due_minor}</InvestorDue>
  <Items>
    ${items.map(item => `
    <Item>
      <LoanId>${item.loan_id || 'N/A'}</LoanId>
      <Principal>${item.principal_minor}</Principal>
      <Interest>${item.interest_minor}</Interest>
      <Fees>${item.fees_minor}</Fees>
      <InvestorShare>${item.investor_share_minor}</InvestorShare>
      <ServicerFee>${item.servicer_fee_minor}</ServicerFee>
    </Item>`).join('')}
  </Items>
</RemittanceReport>`;
    return xml;
  }

  // Process remittance settlement with proper ledger entries
  async settleRemittance(cycleId: string): Promise<void> {
    const cycle = await this.repo.getCycle(cycleId);
    if (!cycle || cycle.status !== 'locked') {
      throw new Error('Cycle must be locked before settling');
    }

    const contract = await this.repo.getContract(cycle.contract_id);
    if (!contract) {
      throw new Error('Contract not found');
    }

    // Import postEvent from domain/posting
    const { postEvent } = await import('../domain/posting');
    const { LedgerRepository } = await import('../db/ledger-repository');
    const ledgerRepo = new LedgerRepository(this.pool);

    // Calculate amounts
    const principalMinor = BigInt(cycle.total_principal_minor);
    const interestMinor = BigInt(cycle.total_interest_minor);
    const feesMinor = BigInt(cycle.total_fees_minor);
    const servicerFeeMinor = BigInt(cycle.servicer_fee_minor);
    const investorDueMinor = BigInt(cycle.investor_due_minor);
    
    // Calculate interest portion of servicer fee (interest * servicer_fee_bps / 10000)
    const interestCollected = interestMinor + servicerFeeMinor; // Total interest collected before servicer fee
    const servicerFeeFromInterest = (interestCollected * BigInt(contract.servicer_fee_bps)) / 10000n;
    const interestToInvestor = interestMinor; // Already net of servicer fee based on our waterfall calc
    
    // Prepare posting lines for settlement
    const lines: any[] = [];
    
    // First, create payables if not already created
    // (In practice, these might be created earlier during the cycle)
    
    // Settlement entries:
    // Debit investor_payable_principal for principal amount
    if (principalMinor > 0n) {
      lines.push({
        account: 'investor_payable_principal',
        debitMinor: principalMinor,
        memo: `Settle principal remittance cycle ${cycleId}`
      });
    }
    
    // Debit investor_payable_interest for interest (net of servicer fee)
    if (interestToInvestor > 0n) {
      lines.push({
        account: 'investor_payable_interest',
        debitMinor: interestToInvestor,
        memo: `Settle interest remittance cycle ${cycleId}`
      });
    }
    
    // Debit investor_payable_fees for fee portion to investor
    if (feesMinor > 0n) {
      lines.push({
        account: 'investor_payable_fees',
        debitMinor: feesMinor,
        memo: `Settle fees remittance cycle ${cycleId}`
      });
    }
    
    // Credit cash from custodial account for total investor due
    if (investorDueMinor > 0n) {
      lines.push({
        account: 'cash',
        creditMinor: investorDueMinor,
        memo: `Cash payment to investor for cycle ${cycleId}`
      });
    }
    
    // Credit servicer_fee_income for servicer fee
    if (servicerFeeMinor > 0n) {
      lines.push({
        account: 'servicer_fee_income',
        creditMinor: servicerFeeMinor,
        memo: `Servicer fee income for cycle ${cycleId}`
      });
    }
    
    // If lines array is not empty, post the event
    if (lines.length > 0) {
      // We need a loan_id for the posting - use 0 for portfolio-level entries
      await postEvent(ledgerRepo, {
        loanId: 0, // Portfolio-level entry
        effectiveDate: new Date().toISOString().split('T')[0],
        correlationId: `remit:${cycleId}`,
        schema: 'posting.remittance.v1',
        currency: 'USD',
        lines
      });
    }
    
    // Update cycle status to settled
    await this.repo.updateCycleStatus(cycleId, 'settled');
  }

  // Get remittance report
  async getReport(cycleId: string): Promise<RemittanceReport> {
    const cycle = await this.repo.getCycle(cycleId);
    if (!cycle) {
      throw new Error('Cycle not found');
    }

    const contract = await this.repo.getContract(cycle.contract_id);
    if (!contract) {
      throw new Error('Contract not found');
    }

    const items = await this.repo.getItems(cycleId);
    
    // Get investor details
    const investorResult = await this.pool.query(
      'SELECT name FROM investor WHERE investor_id = $1',
      [contract.investor_id]
    );
    const investorName = investorResult.rows[0]?.name || 'Unknown';

    // Calculate loan count and UPB
    const loanCount = new Set(items.filter(i => i.loan_id).map(i => i.loan_id)).size;
    const loanData = await this.repo.getLoanCollections(
      contract.contract_id,
      cycle.period_start,
      cycle.period_end
    );
    
    const beginningUPB = loanData.reduce((sum, loan) => sum + BigInt(loan.current_balance_minor || 0), 0n);
    const totalPrincipal = BigInt(cycle.total_principal_minor);
    const endingUPB = beginningUPB - totalPrincipal;

    return {
      cycleId: cycle.cycle_id,
      contractId: cycle.contract_id,
      investorName,
      periodStart: cycle.period_start,
      periodEnd: cycle.period_end,
      loanCount,
      beginningUPB: beginningUPB.toString(),
      endingUPB: endingUPB.toString(),
      scheduledInterest: '0', // Would need schedule data
      scheduledPrincipal: '0', // Would need schedule data
      actualInterest: cycle.total_interest_minor,
      actualPrincipal: cycle.total_principal_minor,
      lateFees: cycle.total_fees_minor,
      servicerFee: cycle.servicer_fee_minor,
      investorRemittance: cycle.investor_due_minor
    };
  }

  // Get export file
  async getExportFile(exportId: string): Promise<Buffer | null> {
    const exportRecord = await this.repo.getExport(exportId);
    return exportRecord ? exportRecord.bytes : null;
  }
}