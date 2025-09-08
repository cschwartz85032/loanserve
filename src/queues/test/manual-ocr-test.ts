/**
 * Manual OCR Test Script
 * 
 * This script allows you to test the OCR function directly
 * with a real document file.
 * 
 * Usage:
 * 1. Place a test PDF/image in the test-files directory
 * 2. Set your AWS credentials in environment variables
 * 3. Run: npm run test:ocr-manual
 */

import fs from 'fs/promises';
import path from 'path';

async function testOcrFunction() {
  try {
    // Import AWS SDK
    const AWS = require('aws-sdk');
    
    // Configure AWS (uses environment variables)
    if (!process.env.AWS_ACCESS_KEY_ID) {
      console.error('AWS_ACCESS_KEY_ID not set. Please configure AWS credentials.');
      process.exit(1);
    }
    
    const textract = new AWS.Textract({ 
      region: process.env.AWS_REGION || 'us-east-1' 
    });
    
    // Load test document
    const testFilePath = process.argv[2] || 'test-files/sample.pdf';
    
    console.log(`Loading test document: ${testFilePath}`);
    
    const documentBuffer = await fs.readFile(testFilePath);
    console.log(`Document size: ${documentBuffer.length} bytes`);
    
    // Call Textract
    console.log('Calling AWS Textract...');
    const startTime = Date.now();
    
    const params = {
      Document: {
        Bytes: documentBuffer
      },
      FeatureTypes: ['TABLES', 'FORMS']
    };
    
    const result = await textract.detectDocumentText(params).promise();
    const duration = Date.now() - startTime;
    
    console.log(`Textract completed in ${duration}ms`);
    console.log(`Found ${result.Blocks?.length || 0} blocks`);
    
    // Process results
    let extractedText = '';
    let totalConfidence = 0;
    let lineCount = 0;
    
    for (const block of result.Blocks || []) {
      if (block.BlockType === 'LINE') {
        extractedText += block.Text + '\n';
        totalConfidence += block.Confidence || 0;
        lineCount++;
        
        console.log(`LINE (${block.Confidence}%): ${block.Text}`);
      }
    }
    
    const averageConfidence = lineCount > 0 ? totalConfidence / lineCount : 0;
    
    console.log('\n--- OCR RESULTS ---');
    console.log(`Lines extracted: ${lineCount}`);
    console.log(`Average confidence: ${averageConfidence.toFixed(2)}%`);
    console.log(`Total text length: ${extractedText.length} characters`);
    
    console.log('\n--- EXTRACTED TEXT ---');
    console.log(extractedText);
    
    // Write results to file
    const outputPath = `ocr-output-${Date.now()}.txt`;
    await fs.writeFile(outputPath, extractedText);
    console.log(`\nResults saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('OCR test failed:', error);
    
    if (error.code === 'ENOENT') {
      console.error('Test file not found. Please provide a valid file path.');
    } else if (error.code === 'InvalidParameterException') {
      console.error('Invalid document format. Textract supports PDF, PNG, JPEG, and TIFF.');
    } else if (error.code === 'ThrottlingException') {
      console.error('AWS Textract rate limit exceeded. Please wait and try again.');
    }
    
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  console.log('Starting manual OCR test...');
  testOcrFunction();
}