import OpenAI from "openai";
import fs from "fs/promises";

export interface DocumentAnalysisResult {
  documentType: string;
  extractedData: {
    // Property details
    propertyStreetAddress?: string;
    propertyCity?: string;
    propertyState?: string;
    propertyZipCode?: string;
    propertyType?: string;
    propertyValue?: number;
    
    // Borrower information
    borrowerName?: string;
    borrowerSSN?: string;
    borrowerIncome?: number;
    borrowerStreetAddress?: string;
    borrowerCity?: string;
    borrowerState?: string;
    borrowerZipCode?: string;
    
    // Loan information
    loanAmount?: number;
    interestRate?: number;
    loanTerm?: number;
    loanType?: string;
    
    // Payment information
    monthlyPayment?: number;
    escrowAmount?: number;
    hoaFees?: number;
    downPayment?: number;
    closingCosts?: number;
    pmi?: number;
    taxes?: number;
    insurance?: number;
    
    // Dates
    closingDate?: string;
    firstPaymentDate?: string;
    prepaymentExpirationDate?: string;
  };
  confidence: number;
}

/**
 * Document analysis service using OpenAI GPT-4o - adapted from working Grok implementation
 */
export class DocumentAnalysisService {
  private openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim() === "") {
      throw new Error("OPENAI_API_KEY is missing or invalid");
    }
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 180000,
    });
  }

  private async validateApiKeyAndModel(model: string): Promise<boolean> {
    try {
      // Simple validation - just check if API key exists
      if (!process.env.OPENAI_API_KEY) {
        console.error("OPENAI_API_KEY not found");
        return false;
      }
      console.log(`Using model: ${model}`);
      return true;
    } catch (error) {
      console.error("Failed to validate API key:", error.message);
      return false;
    }
  }

  private buildDocumentAnalysisPrompt(fileName: string, fileBuffer: Buffer): string {
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
    const isPDF = /\.pdf$/i.test(fileName);
    
    const prompt = `Analyze this ${isImage ? 'image' : isPDF ? 'PDF document' : 'document'} named "${fileName}" completely and extract all relevant mortgage loan information.

=== DOCUMENT ANALYSIS ===
Document: ${fileName}
Size: ${Math.round(fileBuffer.length / 1024)}KB
Type: ${isImage ? 'Image' : isPDF ? 'PDF' : 'Document'}

=== EXTRACTION REQUIREMENTS ===
First, identify what type of document this is (e.g., loan application, property deed, insurance policy, tax return, income statement, credit report, appraisal, etc.).

Then extract any relevant information from the COMPLETE document including:
- Property details (separate street address, city, state, zip, type, value)
- Loan information (amount, rate, term, type, prepayment terms)
- Borrower information (name, income, SSN, mailing address separate from property)
- Payment details (monthly payment, escrow, HOA)
- Financial details (down payment, closing costs, PMI, taxes, insurance)
- Important dates (closing, first payment, prepayment expiration)

IMPORTANT: Extract addresses with separate components - do not combine into single address field.
The borrower's mailing address may be different from the property address.

Return a JSON object with extracted data: {
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
}

IMPORTANT: Include the complete document context in the analysis.`;

    console.log(
      "Generated prompt (sanitized):",
      prompt.replace(/API/g, "[REDACTED]"),
    );
    return prompt;
  }

  async analyzeDocumentWithOpenAI(fileName: string, fileBuffer: Buffer): Promise<DocumentAnalysisResult> {
    console.log(`Processing document: ${fileName}, size: ${fileBuffer.length} bytes`);

    if (!(await this.validateApiKeyAndModel("gpt-4o"))) {
      throw new Error("API key validation failed for gpt-4o model");
    }

    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
    const isPDF = /\.pdf$/i.test(fileName);
    
    const prompt = this.buildDocumentAnalysisPrompt(fileName, fileBuffer);
    
    try {
      let content: any[] = [{
        type: "text",
        text: prompt
      }];

      if (isImage) {
        const base64File = fileBuffer.toString('base64');
        content.push({
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${base64File}`
          }
        });
      }

      console.log("AI PROMPT SENT TO GPT-4o:", {
        contentType: isImage ? 'image' : isPDF ? 'pdf' : 'document',
        fileName,
        textPromptLength: prompt.length,
        hasImageData: isImage,
        fileSize: fileBuffer.length
      });

      const response = await this.openai.chat.completions.create({
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
      
      if (isPDF) {
        return {
          documentType: "pdf_document",
          extractedData: {},
          confidence: 0.0
        };
      }
      
      return {
        documentType: "unknown",
        extractedData: {},
        confidence: 0
      };
    }
  }
}

const documentAnalysisService = new DocumentAnalysisService();

export async function analyzeDocument(filePath: string, fileName: string): Promise<DocumentAnalysisResult> {
  try {
    const fileBuffer = await fs.readFile(filePath);
    return await documentAnalysisService.analyzeDocumentWithOpenAI(fileName, fileBuffer);
  } catch (error) {
    console.error("Error reading document file:", error);
    return {
      documentType: "unknown",
      extractedData: {},
      confidence: 0
    };
  }
}