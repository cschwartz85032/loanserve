#!/usr/bin/env node

/**
 * Topology Drift Validator
 * 
 * Compares actual RabbitMQ topology with expected definitions.
 * Detects drift and reports mismatches to prevent deployment issues.
 */

import amqp from 'amqplib';
import { topologyManager } from '../messaging/topology.js';
import chalk from 'chalk';

interface QueueInfo {
  name: string;
  durable: boolean;
  arguments: Record<string, any>;
  bindings?: Array<{
    exchange: string;
    routingKey: string;
  }>;
}

interface ExchangeInfo {
  name: string;
  type: string;
  durable: boolean;
  arguments?: Record<string, any>;
}

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

class TopologyValidator {
  private url = process.env.CLOUDAMQP_URL || 'amqp://localhost';
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    // Extract API URL and credentials from AMQP URL
    const match = this.url.match(/amqps?:\/\/([^:]+):([^@]+)@([^\/]+)/);
    if (match) {
      const [, user, pass, host] = match;
      this.apiKey = `${user}:${pass}`;
      // CloudAMQP management API uses HTTPS on port 443
      this.apiUrl = `https://${host}/api`;
    } else {
      // Local RabbitMQ management API
      this.apiUrl = 'http://localhost:15672/api';
      this.apiKey = 'guest:guest';
    }
  }

  /**
   * Fetch actual queues from RabbitMQ management API
   */
  private async fetchActualQueues(): Promise<Map<string, QueueInfo>> {
    try {
      const response = await fetch(`${this.apiUrl}/queues`, {
        headers: {
          Authorization: `Basic ${Buffer.from(this.apiKey).toString('base64')}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch queues: ${response.statusText}`);
      }

      const queues = await response.json();
      const queueMap = new Map<string, QueueInfo>();

      for (const queue of queues) {
        // Skip internal/system queues
        if (queue.name.startsWith('amq.')) continue;

        queueMap.set(queue.name, {
          name: queue.name,
          durable: queue.durable,
          arguments: queue.arguments || {},
        });
      }

      // Fetch bindings for each queue
      for (const queue of queueMap.values()) {
        const bindingsResponse = await fetch(
          `${this.apiUrl}/queues/%2F/${encodeURIComponent(queue.name)}/bindings`,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(this.apiKey).toString('base64')}`,
            },
          }
        );

        if (bindingsResponse.ok) {
          const bindings = await bindingsResponse.json();
          queue.bindings = bindings
            .filter((b: any) => b.source !== '') // Exclude default exchange
            .map((b: any) => ({
              exchange: b.source,
              routingKey: b.routing_key,
            }));
        }
      }

      return queueMap;
    } catch (error) {
      console.error(chalk.red('Failed to fetch actual queues:'), error);
      // Return empty map if API is not accessible
      return new Map();
    }
  }

  /**
   * Fetch actual exchanges from RabbitMQ management API
   */
  private async fetchActualExchanges(): Promise<Map<string, ExchangeInfo>> {
    try {
      const response = await fetch(`${this.apiUrl}/exchanges`, {
        headers: {
          Authorization: `Basic ${Buffer.from(this.apiKey).toString('base64')}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch exchanges: ${response.statusText}`);
      }

      const exchanges = await response.json();
      const exchangeMap = new Map<string, ExchangeInfo>();

      for (const exchange of exchanges) {
        // Skip internal/system exchanges
        if (exchange.name === '' || exchange.name.startsWith('amq.')) continue;

        exchangeMap.set(exchange.name, {
          name: exchange.name,
          type: exchange.type,
          durable: exchange.durable,
          arguments: exchange.arguments || {},
        });
      }

      return exchangeMap;
    } catch (error) {
      console.error(chalk.red('Failed to fetch actual exchanges:'), error);
      // Return empty map if API is not accessible
      return new Map();
    }
  }

  /**
   * Get expected topology from our definitions
   */
  private getExpectedTopology(): {
    queues: Map<string, QueueInfo>;
    exchanges: Map<string, ExchangeInfo>;
  } {
    const queues = new Map<string, QueueInfo>();
    const exchanges = new Map<string, ExchangeInfo>();

    // Get queue names from topology manager
    const queueNames = topologyManager.getQueueNames();
    const stats = topologyManager.getStats();

    console.log(chalk.cyan('\nExpected Topology Statistics:'));
    console.log(`  Exchanges: ${stats.exchanges}`);
    console.log(`  Queues: ${stats.queues}`);
    console.log(`  Quorum Queues: ${stats.quorumQueues}`);
    console.log(`  DLQs: ${stats.dlqs}`);

    // For now, we'll return what we can extract from the topology manager
    // In a real implementation, we'd need to expose more details from the manager
    for (const name of queueNames) {
      queues.set(name, {
        name,
        durable: true, // Most of our queues are durable
        arguments: {},
      });
    }

    return { queues, exchanges };
  }

  /**
   * Compare actual vs expected topology
   */
  private compareTopology(
    actualQueues: Map<string, QueueInfo>,
    expectedQueues: Map<string, QueueInfo>,
    actualExchanges: Map<string, ExchangeInfo>,
    expectedExchanges: Map<string, ExchangeInfo>
  ): ValidationResult {
    const result: ValidationResult = {
      passed: true,
      errors: [],
      warnings: [],
    };

    // Check for missing queues
    for (const [name, expected] of expectedQueues) {
      if (!actualQueues.has(name)) {
        result.warnings.push(`Queue '${name}' is expected but not found in RabbitMQ`);
      } else {
        const actual = actualQueues.get(name)!;
        
        // Check durability
        if (actual.durable !== expected.durable) {
          result.errors.push(
            `Queue '${name}' durability mismatch: expected=${expected.durable}, actual=${actual.durable}`
          );
          result.passed = false;
        }

        // Check queue type
        const expectedType = expected.arguments?.['x-queue-type'];
        const actualType = actual.arguments?.['x-queue-type'];
        if (expectedType && actualType && expectedType !== actualType) {
          result.errors.push(
            `Queue '${name}' type mismatch: expected=${expectedType}, actual=${actualType}`
          );
          result.passed = false;
        }

        // Check DLX configuration
        const expectedDLX = expected.arguments?.['x-dead-letter-exchange'];
        const actualDLX = actual.arguments?.['x-dead-letter-exchange'];
        if (expectedDLX && !actualDLX) {
          result.errors.push(`Queue '${name}' missing DLX configuration`);
          result.passed = false;
        }
      }
    }

    // Check for unexpected queues
    for (const [name] of actualQueues) {
      if (!expectedQueues.has(name) && !name.startsWith('amq.')) {
        result.warnings.push(`Queue '${name}' exists in RabbitMQ but not in topology definitions`);
      }
    }

    // Check for conflicting queues (ones that exist but with wrong arguments)
    const conflictingQueues = [
      'q.escrow.dlq', // Known conflict
      'audit.events', // Known conflict
      'servicing.daily.tasks.0', // Known conflict
    ];

    for (const queueName of conflictingQueues) {
      if (actualQueues.has(queueName)) {
        result.warnings.push(
          `Queue '${queueName}' exists with potentially conflicting arguments. Consider migration to versioned queue.`
        );
      }
    }

    // Check for critical DLQ presence
    const criticalDLQs = ['q.escrow.dlq.v2', 'dlq.payments', 'dlq.general'];
    for (const dlqName of criticalDLQs) {
      if (!actualQueues.has(dlqName)) {
        result.errors.push(`Critical DLQ '${dlqName}' is missing!`);
        result.passed = false;
      }
    }

    return result;
  }

  /**
   * Run validation
   */
  async validate(): Promise<boolean> {
    console.log(chalk.yellow('\n🔍 RabbitMQ Topology Validator\n'));
    console.log(chalk.gray(`API URL: ${this.apiUrl}`));

    // Fetch actual topology
    console.log(chalk.cyan('Fetching actual topology from RabbitMQ...'));
    const actualQueues = await this.fetchActualQueues();
    const actualExchanges = await this.fetchActualExchanges();

    if (actualQueues.size === 0 && actualExchanges.size === 0) {
      console.log(chalk.yellow('⚠️  Could not connect to RabbitMQ management API'));
      console.log(chalk.gray('  Ensure RabbitMQ is running and management plugin is enabled'));
      return false;
    }

    console.log(chalk.green(`✓ Found ${actualQueues.size} queues, ${actualExchanges.size} exchanges`));

    // Get expected topology
    console.log(chalk.cyan('\nLoading expected topology...'));
    const { queues: expectedQueues, exchanges: expectedExchanges } = this.getExpectedTopology();
    console.log(chalk.green(`✓ Loaded ${expectedQueues.size} expected queues`));

    // Compare topologies
    console.log(chalk.cyan('\nComparing topologies...'));
    const result = this.compareTopology(
      actualQueues,
      expectedQueues,
      actualExchanges,
      expectedExchanges
    );

    // Report results
    console.log(chalk.yellow('\n📊 Validation Results:\n'));

    if (result.errors.length > 0) {
      console.log(chalk.red('❌ ERRORS:'));
      for (const error of result.errors) {
        console.log(chalk.red(`   • ${error}`));
      }
    }

    if (result.warnings.length > 0) {
      console.log(chalk.yellow('\n⚠️  WARNINGS:'));
      for (const warning of result.warnings) {
        console.log(chalk.yellow(`   • ${warning}`));
      }
    }

    if (result.passed) {
      console.log(chalk.green('\n✅ Topology validation PASSED\n'));
    } else {
      console.log(chalk.red('\n❌ Topology validation FAILED'));
      console.log(chalk.gray('   Fix errors before deploying to avoid runtime failures\n'));
    }

    // Generate drift report
    this.generateDriftReport(actualQueues, expectedQueues);

    return result.passed;
  }

  /**
   * Generate a drift report for documentation
   */
  private generateDriftReport(
    actualQueues: Map<string, QueueInfo>,
    expectedQueues: Map<string, QueueInfo>
  ): void {
    const report = {
      timestamp: new Date().toISOString(),
      actualCount: actualQueues.size,
      expectedCount: expectedQueues.size,
      missing: Array.from(expectedQueues.keys()).filter(q => !actualQueues.has(q)),
      unexpected: Array.from(actualQueues.keys()).filter(q => !expectedQueues.has(q)),
      conflicts: ['q.escrow.dlq', 'audit.events', 'servicing.daily.tasks.0'].filter(q =>
        actualQueues.has(q)
      ),
    };

    // Write report to file for CI/CD
    const fs = require('fs');
    const path = require('path');
    const reportPath = path.join(process.cwd(), 'topology-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(chalk.gray(`\n📄 Drift report written to: ${reportPath}`));
  }
}

// Run validation if executed directly
if (require.main === module) {
  const validator = new TopologyValidator();
  validator.validate().then(passed => {
    process.exit(passed ? 0 : 1);
  });
}

export { TopologyValidator };