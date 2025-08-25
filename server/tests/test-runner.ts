/**
 * Programmatic Test Runner
 * Orchestrates test execution with proper sequencing and reporting
 */

import { startVitest } from 'vitest/node';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import chalk from 'chalk';

interface TestSuite {
  name: string;
  pattern: string;
  type: 'unit' | 'integration' | 'replay' | 'chaos';
  critical: boolean;
}

interface TestResult {
  suite: string;
  passed: boolean;
  duration: number;
  tests: number;
  failures: number;
  errors: any[];
}

class TestRunner {
  private suites: TestSuite[] = [
    // Unit tests - run first, fast, no external dependencies
    {
      name: 'Envelope Validation',
      pattern: 'server/tests/unit/envelope-validation.test.ts',
      type: 'unit',
      critical: true
    },
    {
      name: 'Waterfall Math',
      pattern: 'server/tests/unit/waterfall-math.test.ts',
      type: 'unit',
      critical: true
    },
    {
      name: 'Idempotency',
      pattern: 'server/tests/unit/idempotency.test.ts',
      type: 'unit',
      critical: true
    },
    
    // Integration tests - require services
    {
      name: 'Webhook to Posting',
      pattern: 'server/tests/integration/webhook-to-posting.test.ts',
      type: 'integration',
      critical: true
    },
    
    // Replay tests - verify determinism
    {
      name: 'Historical Replay',
      pattern: 'server/tests/replay/historical-replay.test.ts',
      type: 'replay',
      critical: true
    },
    
    // Chaos tests - optional but important
    {
      name: 'Broker Failure',
      pattern: 'server/tests/chaos/broker-failure.test.ts',
      type: 'chaos',
      critical: false
    }
  ];

  private results: TestResult[] = [];

  async run(): Promise<boolean> {
    console.log(chalk.bold.blue('\n🧪 Payment System Test Suite\n'));
    
    // Check prerequisites
    if (!await this.checkPrerequisites()) {
      return false;
    }

    // Run test suites in order
    for (const suite of this.suites) {
      if (suite.type === 'chaos' && !process.env.RUN_CHAOS_TESTS) {
        console.log(chalk.yellow(`⚠️  Skipping ${suite.name} (set RUN_CHAOS_TESTS=true to run)`));
        continue;
      }

      const result = await this.runSuite(suite);
      this.results.push(result);

      if (!result.passed && suite.critical) {
        console.log(chalk.red(`\n❌ Critical test suite failed: ${suite.name}`));
        break;
      }
    }

    // Generate report
    this.generateReport();

    // Return overall status
    return this.results.every(r => r.passed);
  }

  private async checkPrerequisites(): Promise<boolean> {
    console.log(chalk.cyan('Checking prerequisites...\n'));

    // Check database connection
    try {
      await db.execute(sql`SELECT 1`);
      console.log(chalk.green('✓ Database connection established'));
    } catch (error) {
      console.log(chalk.red('✗ Database connection failed'));
      return false;
    }

    // Check RabbitMQ (warning only)
    if (!process.env.CLOUDAMQP_URL) {
      console.log(chalk.yellow('⚠️  RabbitMQ not configured (some tests may fail)'));
    } else {
      console.log(chalk.green('✓ RabbitMQ configured'));
    }

    console.log('');
    return true;
  }

  private async runSuite(suite: TestSuite): Promise<TestResult> {
    const startTime = Date.now();
    console.log(chalk.bold(`\n📦 ${suite.name} (${suite.type})`));
    console.log(chalk.gray('─'.repeat(40)));

    try {
      const vitest = await startVitest('test', [], {
        run: true,
        include: [suite.pattern],
        reporter: 'json',
        outputFile: `test-results-${suite.name.toLowerCase().replace(/ /g, '-')}.json`
      });

      const passed = vitest?.state.getCountOfFailedTests() === 0;
      const duration = Date.now() - startTime;

      const result: TestResult = {
        suite: suite.name,
        passed,
        duration,
        tests: vitest?.state.getCountOfTests() || 0,
        failures: vitest?.state.getCountOfFailedTests() || 0,
        errors: []
      };

      if (passed) {
        console.log(chalk.green(`✓ ${suite.name} passed (${duration}ms)`));
      } else {
        console.log(chalk.red(`✗ ${suite.name} failed (${duration}ms)`));
      }

      return result;
    } catch (error) {
      console.log(chalk.red(`✗ ${suite.name} error: ${error}`));
      
      return {
        suite: suite.name,
        passed: false,
        duration: Date.now() - startTime,
        tests: 0,
        failures: 1,
        errors: [error]
      };
    }
  }

  private generateReport(): void {
    console.log(chalk.bold.blue('\n📊 Test Report\n'));
    console.log(chalk.gray('═'.repeat(50)));

    const totalTests = this.results.reduce((sum, r) => sum + r.tests, 0);
    const totalFailures = this.results.reduce((sum, r) => sum + r.failures, 0);
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    // Suite summary
    console.log(chalk.bold('\nSuite Results:'));
    for (const result of this.results) {
      const status = result.passed ? chalk.green('✓') : chalk.red('✗');
      const stats = chalk.gray(`(${result.tests} tests, ${result.duration}ms)`);
      console.log(`  ${status} ${result.suite} ${stats}`);
    }

    // Overall summary
    console.log(chalk.bold('\nOverall:'));
    console.log(`  Total tests: ${totalTests}`);
    console.log(`  Passed: ${chalk.green(totalTests - totalFailures)}`);
    console.log(`  Failed: ${totalFailures > 0 ? chalk.red(totalFailures) : '0'}`);
    console.log(`  Duration: ${totalDuration}ms`);

    // Acceptance criteria
    console.log(chalk.bold('\n✅ Acceptance Criteria:'));
    
    const allPassed = this.results.every(r => r.passed);
    const replayPassed = this.results.find(r => r.suite === 'Historical Replay')?.passed;
    const chaosPassed = this.results.find(r => r.suite === 'Broker Failure')?.passed;

    console.log(`  ${allPassed ? chalk.green('✓') : chalk.red('✗')} Green pipeline`);
    console.log(`  ${replayPassed ? chalk.green('✓') : chalk.yellow('⚠')} Deterministic replays`);
    console.log(`  ${chaosPassed !== false ? chalk.green('✓') : chalk.yellow('⚠')} Chaos resilience`);

    // Final status
    console.log(chalk.gray('\n' + '═'.repeat(50)));
    if (allPassed) {
      console.log(chalk.bold.green('\n🎉 All tests passed! System verified.\n'));
    } else {
      console.log(chalk.bold.red('\n❌ Some tests failed. Please review.\n'));
    }
  }
}

// Run if executed directly
if (require.main === module) {
  const runner = new TestRunner();
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

export { TestRunner };