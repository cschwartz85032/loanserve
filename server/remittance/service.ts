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

    // Aggregate collections
    let totalPrincipal = 0n;
    let totalInterest = 0n;
    let totalFees = 0n;
    
    for (const loan of collections) {
      totalPrincipal += BigInt(loan.principal_minor || 0);
      totalInterest += BigInt(loan.interest_minor || 0);
      totalFees += BigInt(loan.fees_minor || 0);
    }

    // Apply waterfall rules
    const buckets = {
      interest: 0n,
      principal: 0n,
      late_fees: 0n,
      escrow: 0n,
      recoveries: 0n
    };

    let remainingCash = totalPrincipal + totalInterest + totalFees;
    
    for (const rule of rules) {
      const bucket = rule.bucket as keyof typeof buckets;
      let amount = 0n;
      
      switch (bucket) {
        case 'interest':
          amount = totalInterest;
          break;
        case 'principal':
          amount = totalPrincipal;
          break;
        case 'late_fees':
          amount = totalFees;
          break;
        default:
          amount = 0n;
      }

      // Apply cap if defined
      if (rule.cap_minor) {
        amount = amount > BigInt(rule.cap_minor) ? BigInt(rule.cap_minor) : amount;
      }

      // Apply to bucket
      if (amount <= remainingCash) {
        buckets[bucket] = amount;
        remainingCash -= amount;
      } else {
        buckets[bucket] = remainingCash;
        remainingCash = 0n;
      }
    }

    // Calculate servicer fee
    const totalCollected = totalPrincipal + totalInterest + totalFees;
    const servicerFee = (totalCollected * BigInt(contract.servicer_fee_bps)) / 10000n;
    const investorDue = totalCollected - servicerFee;

    // Create remittance items
    for (const loan of collections) {
      const loanServicerFee = (BigInt(loan.collected_minor || 0) * BigInt(contract.servicer_fee_bps)) / 10000n;
      const loanInvestorShare = BigInt(loan.collected_minor || 0) - loanServicerFee;
      
      await this.repo.createItem({
        cycle_id: cycleId,
        loan_id: loan.loan_id,
        principal_minor: loan.principal_minor || '0',
        interest_minor: loan.interest_minor || '0',
        fees_minor: loan.fees_minor || '0',
        investor_share_minor: loanInvestorShare.toString(),
        servicer_fee_minor: loanServicerFee.toString()
      });
    }

    // Update cycle totals
    await this.repo.updateCycleTotals(cycleId, {
      principal: totalPrincipal.toString(),
      interest: totalInterest.toString(),
      fees: totalFees.toString(),
      servicerFee: servicerFee.toString(),
      investorDue: investorDue.toString()
    });

    return {
      contractId: contract.contract_id,
      totalCollected: totalCollected.toString(),
      buckets: {
        interest: buckets.interest.toString(),
        principal: buckets.principal.toString(),
        late_fees: buckets.late_fees.toString(),
        escrow: buckets.escrow.toString(),
        recoveries: buckets.recoveries.toString()
      },
      servicerFee: servicerFee.toString(),
      investorDue: investorDue.toString()
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

  // Process remittance and update ledger
  async processRemittance(cycleId: string): Promise<void> {
    await this.repo.processRemittance(cycleId);
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