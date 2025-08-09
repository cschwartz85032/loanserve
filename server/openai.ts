import OpenAI from "openai";
import fs from "fs/promises";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface DocumentAnalysisResult {
  documentType: string;
  extractedData: {
    // Property Information
    propertyAddress?: string;
    propertyType?: string;
    propertyValue?: number;
    
    // Loan Information
    loanAmount?: number;
    interestRate?: number;
    loanTerm?: number;
    loanType?: string;
    
    // Borrower Information
    borrowerName?: string;
    borrowerSSN?: string;
    borrowerIncome?: number;
    coborrowerId?: string;
    
    // Payment Information
    monthlyPayment?: number;
    escrowAmount?: number;
    hoaFees?: number;
    
    // Other Financial Details
    downPayment?: number;
    closingCosts?: number;
    pmi?: number;
    taxes?: number;
    insurance?: number;
    
    // Dates
    closingDate?: string;
    firstPaymentDate?: string;
  };
  confidence: number;
}

export async function analyzeDocument(filePath: string, fileName: string): Promise<DocumentAnalysisResult> {
  try {
    // Read the file
    const fileBuffer = await fs.readFile(filePath);
    const base64File = fileBuffer.toString('base64');
    
    // Determine file type and prepare content
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
    const isPDF = /\.pdf$/i.test(fileName);
    
    let content: any[] = [{
      type: "text",
      text: `Analyze this ${isImage ? 'image' : isPDF ? 'PDF document' : 'document'} and extract relevant mortgage loan information. 
      
      First, identify what type of document this is (e.g., loan application, property deed, insurance policy, tax return, income statement, credit report, appraisal, etc.).
      
      Then extract any relevant information including:
      - Property details (separate street address, city, state, zip, type, value)
      - Loan information (amount, rate, term, type, prepayment terms)
      - Borrower information (name, income, SSN, mailing address separate from property)
      - Payment details (monthly payment, escrow, HOA)
      - Financial details (down payment, closing costs, PMI, taxes, insurance)
      - Important dates (closing, first payment, prepayment expiration)
      
      IMPORTANT: Extract addresses with separate components - do not combine into single address field.
      The borrower's mailing address may be different from the property address.
      
      Return your response as JSON in this exact format:
      {
        "documentType": "document_category_here",
        "extractedData": {
          "propertyStreetAddress": "street_address_only_or_null",
          "propertyCity": "city_only_or_null",
          "propertyState": "state_only_or_null",
          "propertyZipCode": "zip_code_only_or_null",
          "propertyType": "extracted_value_or_null",
          "propertyValue": number_or_null,
          "borrowerName": "extracted_value_or_null",
          "borrowerSSN": "extracted_value_or_null",
          "borrowerIncome": number_or_null,
          "borrowerStreetAddress": "borrower_street_address_or_null",
          "borrowerCity": "borrower_city_or_null",
          "borrowerState": "borrower_state_or_null",
          "borrowerZipCode": "borrower_zip_code_or_null",
          "loanAmount": number_or_null,
          "interestRate": number_or_null,
          "loanTerm": number_or_null,
          "loanType": "extracted_value_or_null",
          "monthlyPayment": number_or_null,
          "escrowAmount": number_or_null,
          "hoaFees": number_or_null,
          "downPayment": number_or_null,
          "closingCosts": number_or_null,
          "pmi": number_or_null,
          "taxes": number_or_null,
          "insurance": number_or_null,
          "closingDate": "YYYY-MM-DD_or_null",
          "firstPaymentDate": "YYYY-MM-DD_or_null",
          "prepaymentExpirationDate": "YYYY-MM-DD_or_null"
        },
        "confidence": 0.85
      }`
    }];

    if (isImage) {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${base64File}`
        }
      });
    }

    console.log("AI PROMPT SENT TO GPT-4o:", JSON.stringify(content, null, 2));

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: content
      }],
      response_format: { type: "json_object" },
      max_tokens: 1500,
    });

    const rawResponse = response.choices[0].message.content;
    console.log("AI RESPONSE FROM GPT-4o:", rawResponse);

    const result = JSON.parse(rawResponse || "{}");
    
    return {
      documentType: result.documentType || "unknown",
      extractedData: result.extractedData || {},
      confidence: result.confidence || 0.5
    };

  } catch (error) {
    console.error("Error analyzing document:", error);
    return {
      documentType: "unknown",
      extractedData: {},
      confidence: 0.0
    };
  }
}