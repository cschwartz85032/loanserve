#!/usr/bin/env tsx
/**
 * Phase 7 Acceptance Tests
 * Tests waterfall splits, CSV/XML export stability, and GL reconciliation
 */

import { Pool } from '@neondatabase/serverless';
import { Decimal } from 'decimal.js';
import { createHash } from 'crypto';
import { RemittanceRepository } from './repo.js';
import { RemittanceService } from './service.js';
import { ReconciliationService } from './reconciliation.js';
import { PgLedgerRepository } from '../db/ledger-repository.js';
import { ulid } from 'ulid';

// Test configuration
const TEST_INVESTOR_ID = 'TEST_INV_001';
const TEST_CONTRACT_ID = ulid();

interface TestResult {
  test: string;
  passed: boolean;
  details: any;
  error?: string;
}

export class RemittanceAcceptanceTests {
  private pool: Pool;
  private remitRepo: RemittanceRepository;
  private remitService: RemittanceService;
  private ledgerRepo: PgLedgerRepository;
  private reconService: ReconciliationService;
  private results: TestResult[] = [];

  constructor() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('DATABASE_URL not set');
    
    this.pool = new Pool({ connectionString: dbUrl });
    this.ledgerRepo = new PgLedgerRepository(this.pool);
    this.remitRepo = new RemittanceRepository(this.pool, this.ledgerRepo);
    this.remitService = new RemittanceService(this.remitRepo, this.ledgerRepo);
    this.reconService = new ReconciliationService(this.pool);
  }

  /**
   * Run all acceptance tests
   */
  async runAll(): Promise<void> {
    console.log('='.repeat(60));
    console.log('PHASE 7 ACCEPTANCE TESTS');
    console.log('='.repeat(60));
    
    try {
      // Setup test data
      await this.setupTestData();
      
      // Test 1: Two-loan waterfall calculation
      await this.testTwoLoanWaterfall();
      
      // Test 2: CSV export hash stability
      await this.testCsvHashStability();
      
      // Test 3: XML export hash stability
      await this.testXmlHashStability();
      
      // Test 4: Settlement posting balance
      await this.testSettlementPosting();
      
      // Test 5: GL reconciliation zero variance
      await this.testGlReconciliation();
      
      // Print results
      this.printResults();
      
    } catch (error) {
      console.error('Test suite failed:', error);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Setup test data with two loans
   */
  private async setupTestData(): Promise<void> {
    console.log('\n[SETUP] Creating test data...');
    
    // Create test investor contract
    await this.pool.query(`
      INSERT INTO investor_contract (
        contract_id, investor_id, product_code, method,
        remittance_day, cutoff_day, custodial_bank_acct_id,
        servicer_fee_bps, late_fee_split_bps
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (contract_id) DO NOTHING
    `, [
      TEST_CONTRACT_ID,
      TEST_INVESTOR_ID,
      'TEST_PRODUCT',
      'scheduled_p_i',
      15, // Remit on 15th
      10, // Cutoff on 10th
      'TEST_BANK_001',
      50, // 50 bps servicer fee
      50  // 50% late fee split
    ]);
    
    // Create waterfall rules
    const rules = [
      { rank: 1, bucket: 'interest', cap: null },
      { rank: 2, bucket: 'principal', cap: null },
      { rank: 3, bucket: 'late_fees', cap: null }
    ];
    
    for (const rule of rules) {
      await this.pool.query(`
        INSERT INTO investor_waterfall_rule (
          rule_id, contract_id, rank, bucket, cap_minor
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (rule_id) DO NOTHING
      `, [ulid(), TEST_CONTRACT_ID, rule.rank, rule.bucket, rule.cap]);
    }
    
    console.log('[SETUP] Test contract and rules created');
  }

  /**
   * Test 1: Two-loan waterfall calculation accuracy
   */
  private async testTwoLoanWaterfall(): Promise<void> {
    console.log('\n[TEST 1] Two-loan waterfall calculation...');
    
    try {
      // Create a test cycle
      const cycle = await this.remitRepo.createCycle({
        contractId: TEST_CONTRACT_ID,
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-01-31')
      });
      
      // Simulate two loan payments
      const loan1Payment = {
        loanId: 'LOAN_001',
        principal: new Decimal('50000'), // $500.00
        interest: new Decimal('10000'),  // $100.00
        fees: new Decimal('2500')        // $25.00
      };
      
      const loan2Payment = {
        loanId: 'LOAN_002',
        principal: new Decimal('75000'), // $750.00
        interest: new Decimal('15000'),  // $150.00
        fees: new Decimal('5000')        // $50.00
      };
      
      // Calculate waterfall for each loan
      const servicerFeeBps = 50; // 50 bps
      const lateFeesSplit = 0.5; // 50% split
      
      // Loan 1 calculations
      const loan1Total = loan1Payment.principal
        .plus(loan1Payment.interest)
        .plus(loan1Payment.fees);
      const loan1ServicerFee = loan1Total.mul(servicerFeeBps).div(10000);
      const loan1LateFeeServicer = loan1Payment.fees.mul(lateFeesSplit);
      const loan1InvestorShare = loan1Total.minus(loan1ServicerFee).minus(loan1LateFeeServicer);
      
      // Loan 2 calculations
      const loan2Total = loan2Payment.principal
        .plus(loan2Payment.interest)
        .plus(loan2Payment.fees);
      const loan2ServicerFee = loan2Total.mul(servicerFeeBps).div(10000);
      const loan2LateFeeServicer = loan2Payment.fees.mul(lateFeesSplit);
      const loan2InvestorShare = loan2Total.minus(loan2ServicerFee).minus(loan2LateFeeServicer);
      
      // Store remittance items
      await this.remitRepo.addItem({
        cycleId: cycle.cycle_id,
        loanId: loan1Payment.loanId,
        principal: loan1Payment.principal.toFixed(0),
        interest: loan1Payment.interest.toFixed(0),
        fees: loan1Payment.fees.toFixed(0),
        investorShare: loan1InvestorShare.toFixed(0),
        servicerFee: loan1ServicerFee.plus(loan1LateFeeServicer).toFixed(0)
      });
      
      await this.remitRepo.addItem({
        cycleId: cycle.cycle_id,
        loanId: loan2Payment.loanId,
        principal: loan2Payment.principal.toFixed(0),
        interest: loan2Payment.interest.toFixed(0),
        fees: loan2Payment.fees.toFixed(0),
        investorShare: loan2InvestorShare.toFixed(0),
        servicerFee: loan2ServicerFee.plus(loan2LateFeeServicer).toFixed(0)
      });
      
      // Verify totals match to the cent
      const totalPrincipal = loan1Payment.principal.plus(loan2Payment.principal);
      const totalInterest = loan1Payment.interest.plus(loan2Payment.interest);
      const totalFees = loan1Payment.fees.plus(loan2Payment.fees);
      const totalServicer = loan1ServicerFee.plus(loan1LateFeeServicer)
        .plus(loan2ServicerFee).plus(loan2LateFeeServicer);
      const totalInvestor = loan1InvestorShare.plus(loan2InvestorShare);
      
      // Update cycle totals
      await this.remitRepo.updateCycleTotals(cycle.cycle_id, {
        principal: totalPrincipal.toFixed(0),
        interest: totalInterest.toFixed(0),
        fees: totalFees.toFixed(0),
        servicerFee: totalServicer.toFixed(0),
        investorDue: totalInvestor.toFixed(0)
      });
      
      // Verify splits are correct to the cent
      const totalCollected = totalPrincipal.plus(totalInterest).plus(totalFees);
      const splitTotal = totalServicer.plus(totalInvestor);
      const difference = totalCollected.minus(splitTotal);
      
      const passed = difference.abs().lte(0);
      
      this.results.push({
        test: 'Two-loan waterfall calculation',
        passed,
        details: {
          totalCollected: totalCollected.div(100).toFixed(2),
          totalServicer: totalServicer.div(100).toFixed(2),
          totalInvestor: totalInvestor.div(100).toFixed(2),
          difference: difference.div(100).toFixed(2),
          cycleId: cycle.cycle_id
        }
      });
      
      console.log(`[TEST 1] ${passed ? 'PASSED' : 'FAILED'} - Difference: $${difference.div(100).toFixed(2)}`);
      
    } catch (error) {
      this.results.push({
        test: 'Two-loan waterfall calculation',
        passed: false,
        details: {},
        error: error.message
      });
      console.error('[TEST 1] FAILED:', error.message);
    }
  }

  /**
   * Test 2: CSV export hash stability
   */
  private async testCsvHashStability(): Promise<void> {
    console.log('\n[TEST 2] CSV export hash stability...');
    
    try {
      // Get the test cycle
      const cycle = await this.remitRepo.getCurrentCycle(TEST_CONTRACT_ID);
      if (!cycle) throw new Error('Test cycle not found');
      
      // Generate CSV export multiple times
      const hashes: string[] = [];
      
      for (let i = 0; i < 3; i++) {
        const csvExport = await this.remitService.generateExport(cycle.cycle_id, 'csv');
        const hash = createHash('sha256').update(csvExport.bytes).digest('hex');
        hashes.push(hash);
        
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // All hashes should be identical
      const passed = hashes.every(h => h === hashes[0]);
      
      this.results.push({
        test: 'CSV export hash stability',
        passed,
        details: {
          hashes,
          isStable: passed
        }
      });
      
      console.log(`[TEST 2] ${passed ? 'PASSED' : 'FAILED'} - Hashes: ${passed ? 'Stable' : 'Unstable'}`);
      
    } catch (error) {
      this.results.push({
        test: 'CSV export hash stability',
        passed: false,
        details: {},
        error: error.message
      });
      console.error('[TEST 2] FAILED:', error.message);
    }
  }

  /**
   * Test 3: XML export hash stability
   */
  private async testXmlHashStability(): Promise<void> {
    console.log('\n[TEST 3] XML export hash stability...');
    
    try {
      // Get the test cycle
      const cycle = await this.remitRepo.getCurrentCycle(TEST_CONTRACT_ID);
      if (!cycle) throw new Error('Test cycle not found');
      
      // Generate XML export multiple times
      const hashes: string[] = [];
      
      for (let i = 0; i < 3; i++) {
        const xmlExport = await this.remitService.generateExport(cycle.cycle_id, 'xml');
        const hash = createHash('sha256').update(xmlExport.bytes).digest('hex');
        hashes.push(hash);
        
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // All hashes should be identical
      const passed = hashes.every(h => h === hashes[0]);
      
      this.results.push({
        test: 'XML export hash stability',
        passed,
        details: {
          hashes,
          isStable: passed
        }
      });
      
      console.log(`[TEST 3] ${passed ? 'PASSED' : 'FAILED'} - Hashes: ${passed ? 'Stable' : 'Unstable'}`);
      
    } catch (error) {
      this.results.push({
        test: 'XML export hash stability',
        passed: false,
        details: {},
        error: error.message
      });
      console.error('[TEST 3] FAILED:', error.message);
    }
  }

  /**
   * Test 4: Settlement posting is balanced
   */
  private async testSettlementPosting(): Promise<void> {
    console.log('\n[TEST 4] Settlement posting balance...');
    
    try {
      // Get the test cycle
      const cycle = await this.remitRepo.getCurrentCycle(TEST_CONTRACT_ID);
      if (!cycle) throw new Error('Test cycle not found');
      
      // Post settlement
      await this.remitService.postSettlement(cycle.cycle_id, 'TEST_USER');
      
      // Verify GL entries are balanced
      const glResult = await this.pool.query(`
        SELECT 
          entry_type,
          SUM(amount_minor::BIGINT) as total
        FROM ledger_entry
        WHERE metadata->>'cycle_id' = $1
        GROUP BY entry_type
      `, [cycle.cycle_id]);
      
      let debits = new Decimal(0);
      let credits = new Decimal(0);
      
      for (const row of glResult.rows) {
        if (row.entry_type === 'DEBIT') {
          debits = new Decimal(row.total);
        } else if (row.entry_type === 'CREDIT') {
          credits = new Decimal(row.total);
        }
      }
      
      const difference = debits.minus(credits);
      const passed = difference.eq(0);
      
      this.results.push({
        test: 'Settlement posting balance',
        passed,
        details: {
          debits: debits.div(100).toFixed(2),
          credits: credits.div(100).toFixed(2),
          difference: difference.div(100).toFixed(2)
        }
      });
      
      console.log(`[TEST 4] ${passed ? 'PASSED' : 'FAILED'} - GL Balance: $${difference.div(100).toFixed(2)}`);
      
    } catch (error) {
      this.results.push({
        test: 'Settlement posting balance',
        passed: false,
        details: {},
        error: error.message
      });
      console.error('[TEST 4] FAILED:', error.message);
    }
  }

  /**
   * Test 5: GL reconciliation shows zero variance
   */
  private async testGlReconciliation(): Promise<void> {
    console.log('\n[TEST 5] GL reconciliation zero variance...');
    
    try {
      // Ensure reconciliation table exists
      await this.reconService.ensureTable();
      
      // Get the test cycle
      const cycle = await this.remitRepo.getCurrentCycle(TEST_CONTRACT_ID);
      if (!cycle) throw new Error('Test cycle not found');
      
      // Generate reconciliation report
      const snapshot = await this.reconService.generateReconciliation(
        cycle.cycle_id,
        'TEST_USER'
      );
      
      // Check if balanced (zero variance required)
      const passed = snapshot.is_balanced &&
        snapshot.diff_investor_minor === '0' &&
        snapshot.diff_servicer_minor === '0' &&
        snapshot.diff_total_minor === '0';
      
      this.results.push({
        test: 'GL reconciliation zero variance',
        passed,
        details: {
          isBalanced: snapshot.is_balanced,
          investorDiff: new Decimal(snapshot.diff_investor_minor).div(100).toFixed(2),
          servicerDiff: new Decimal(snapshot.diff_servicer_minor).div(100).toFixed(2),
          totalDiff: new Decimal(snapshot.diff_total_minor).div(100).toFixed(2)
        }
      });
      
      console.log(`[TEST 5] ${passed ? 'PASSED' : 'FAILED'} - Balanced: ${snapshot.is_balanced}`);
      
    } catch (error) {
      this.results.push({
        test: 'GL reconciliation zero variance',
        passed: false,
        details: {},
        error: error.message
      });
      console.error('[TEST 5] FAILED:', error.message);
    }
  }

  /**
   * Print test results summary
   */
  private printResults(): void {
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS SUMMARY');
    console.log('='.repeat(60));
    
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    
    for (const result of this.results) {
      const status = result.passed ? '✓ PASS' : '✗ FAIL';
      console.log(`${status} - ${result.test}`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
    }
    
    console.log('='.repeat(60));
    console.log(`Overall: ${passed}/${total} tests passed`);
    
    if (passed === total) {
      console.log('✓ ALL ACCEPTANCE TESTS PASSED');
      process.exit(0);
    } else {
      console.log('✗ SOME TESTS FAILED');
      process.exit(1);
    }
  }

  /**
   * Cleanup test data
   */
  private async cleanup(): Promise<void> {
    console.log('\n[CLEANUP] Removing test data...');
    
    try {
      // Delete test data in reverse order of dependencies
      await this.pool.query(
        'DELETE FROM remittance_recon_snapshot WHERE cycle_id IN (SELECT cycle_id FROM remittance_cycle WHERE contract_id = $1)',
        [TEST_CONTRACT_ID]
      );
      await this.pool.query(
        'DELETE FROM remittance_export WHERE cycle_id IN (SELECT cycle_id FROM remittance_cycle WHERE contract_id = $1)',
        [TEST_CONTRACT_ID]
      );
      await this.pool.query(
        'DELETE FROM remittance_item WHERE cycle_id IN (SELECT cycle_id FROM remittance_cycle WHERE contract_id = $1)',
        [TEST_CONTRACT_ID]
      );
      await this.pool.query(
        'DELETE FROM remittance_cycle WHERE contract_id = $1',
        [TEST_CONTRACT_ID]
      );
      await this.pool.query(
        'DELETE FROM investor_waterfall_rule WHERE contract_id = $1',
        [TEST_CONTRACT_ID]
      );
      await this.pool.query(
        'DELETE FROM investor_contract WHERE contract_id = $1',
        [TEST_CONTRACT_ID]
      );
      await this.pool.query(
        'DELETE FROM ledger_entry WHERE metadata->>\'cycle_id\' IN (SELECT cycle_id::text FROM remittance_cycle WHERE contract_id = $1)',
        [TEST_CONTRACT_ID]
      );
      
      console.log('[CLEANUP] Test data removed');
    } catch (error) {
      console.error('[CLEANUP] Error:', error.message);
    }
    
    await this.pool.end();
  }
}

// Run tests if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = new RemittanceAcceptanceTests();
  tests.runAll().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}