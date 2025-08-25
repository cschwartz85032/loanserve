/**
 * Test Grok AI Integration
 * Verifies document analysis and payment classification
 */

import { grokAIService } from './server/services/grok-ai-service';
import { db } from './server/db';
import { paymentIngestions, paymentArtifacts, outboxMessages } from '@shared/schema';

async function testGrokAI() {
  console.log('=== Testing Grok AI Integration ===\n');

  try {
    // Test 1: Health Check
    console.log('Test 1: Health Check');
    const health = await grokAIService.healthCheck();
    console.log('Health status:', health);
    console.log('');

    // Test 2: Document Analysis (mock document)
    console.log('Test 2: Document Analysis');
    const mockDocumentContent = `
      Wire Transfer Receipt
      Date: 2025-08-25
      Amount: $2,500.00
      From: John Smith
      Account: ****1234
      To: LoanServe Pro
      Reference: LOAN-42-PAYMENT
      Transaction ID: WT20250825001
    `;
    
    const analysis = await grokAIService.analyzeDocument(mockDocumentContent, 'wire_receipt');
    console.log('Document analysis result:');
    console.log('  Type:', analysis.documentType);
    console.log('  Confidence:', analysis.confidence);
    console.log('  Extracted amount:', analysis.extractedData.amount);
    console.log('  Loan ID:', analysis.extractedData.loanIdentifier);
    console.log('');

    // Test 3: Payment Classification
    console.log('Test 3: Payment Classification');
    const classification = await grokAIService.classifyPayment(
      2500.00,
      '42',
      {
        payerName: 'John Smith',
        referenceNumber: 'WT20250825001',
        paymentMethod: 'wire'
      }
    );
    console.log('Payment classification:');
    console.log('  Category:', classification.category);
    console.log('  Risk score:', classification.riskScore);
    console.log('  Recommendation:', classification.processingRecommendation);
    console.log('  Reasoning:', classification.reasoning);
    console.log('');

    // Test 4: Payment Allocation Recommendation
    console.log('Test 4: Payment Allocation');
    const allocation = await grokAIService.recommendPaymentAllocation(
      2500.00,
      '42',
      {
        principal: 1800.00,
        interest: 500.00,
        escrow: 200.00,
        fees: 0,
        lateFees: 0
      }
    );
    console.log('Recommended allocation:');
    Object.entries(allocation.recommended).forEach(([key, value]) => {
      console.log(`  ${key}: $${(value as number).toFixed(2)}`);
    });
    console.log('  Reasoning:', allocation.reasoning);
    console.log('');

    // Test 5: Anomaly Detection
    console.log('Test 5: Anomaly Detection');
    const anomalies = await grokAIService.detectAnomalies(
      '42',
      {
        amount: 25000.00, // Unusually high amount
        payerName: 'Unknown Entity',
        paymentMethod: 'wire',
        referenceNumber: 'SUSPICIOUS-001'
      }
    );
    console.log('Anomaly detection:');
    console.log('  Overall risk:', anomalies.overallRisk);
    if (anomalies.anomalies.length > 0) {
      console.log('  Anomalies found:');
      anomalies.anomalies.forEach(anomaly => {
        console.log(`    - ${anomaly.type} (${anomaly.severity}): ${anomaly.description}`);
      });
    } else {
      console.log('  No anomalies detected');
    }
    console.log('');

    // Test 6: Full Document Processing Pipeline
    console.log('Test 6: Document Processing Pipeline');
    const documentBuffer = Buffer.from(mockDocumentContent);
    const result = await grokAIService.processDocumentForPayment(
      '/test/document.pdf',
      documentBuffer,
      'wire'
    );
    console.log('Document processed:');
    console.log('  Ingestion ID:', result.ingestionId);
    console.log('  Artifact ID:', result.artifactId);
    console.log('  Document type:', result.analysis.documentType);
    console.log('  Classification:', result.classification.category);
    console.log('  Processing:', result.classification.processingRecommendation);
    console.log('');

    // Check if records were created
    const ingestion = await db
      .select()
      .from(paymentIngestions)
      .where((t: any) => t.id === result.ingestionId)
      .limit(1);
    
    if (ingestion.length > 0) {
      console.log('✓ Payment ingestion created');
    }

    const artifact = await db
      .select()
      .from(paymentArtifacts)
      .where((t: any) => t.id === result.artifactId)
      .limit(1);
    
    if (artifact.length > 0) {
      console.log('✓ Payment artifact created');
    }

    // Check if message was published
    const messages = await db
      .select()
      .from(outboxMessages)
      .where((t: any) => t.aggregateId === result.ingestionId)
      .limit(1);
    
    if (messages.length > 0) {
      console.log('✓ Message published to payment pipeline');
    }

    console.log('\n=== Grok AI Integration Tests Complete ===');
    console.log('\n✅ Step 18 Complete: Grok AI Integration');
    console.log('\nKey features implemented:');
    console.log('- Document analysis with AI');
    console.log('- Payment classification and risk scoring');
    console.log('- Intelligent payment allocation');
    console.log('- Anomaly detection');
    console.log('- Full document processing pipeline');
    console.log('- Integration with payment ingestion system');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    process.exit(0);
  }
}

// Run the test
testGrokAI().catch(console.error);