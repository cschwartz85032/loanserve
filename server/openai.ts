import fs from "fs/promises";
import axios, { AxiosError } from "axios";
import { setTimeout } from "timers/promises";

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
 * Document analysis service using Grok - based on your working implementation
 */
export class DocumentAnalysisService {
  private apiKey: string;
  private baseURL: string;
  private timeout: number;

  constructor() {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim() === "") {
      throw new Error("OPENAI_API_KEY is missing or invalid");
    }
    this.apiKey = process.env.OPENAI_API_KEY;
    this.baseURL = "https://api.x.ai/v1";
    this.timeout = 180000;
  }

  private async validateApiKeyAndModel(model: string): Promise<boolean> {
    try {
      const response = await axios({
        url: `${this.baseURL}/models`,
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        timeout: 5000,
      });
      const availableModels = response.data.data || [];
      console.log("Available models:", availableModels.map((m: any) => m.id));
      if (!availableModels.find((m: any) => m.id === model)) {
        console.warn(
          `Model ${model} not available. Available models:`,
          availableModels.map((m: any) => m.id),
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error("Failed to validate API key or model:", error.message);
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

  async analyzeDocumentWithGrok(fileName: string, fileBuffer: Buffer): Promise<DocumentAnalysisResult> {
    console.log(`Processing document: ${fileName}, size: ${fileBuffer.length} bytes`);

    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
    const isPDF = /\.pdf$/i.test(fileName);
    
    const prompt = this.buildDocumentAnalysisPrompt(fileName, fileBuffer);
    
    // Use your model fallback system
    const modelsToTry = ["grok-vision-beta", "grok-beta", "grok-2-vision-1212", "grok-2-1212"];
    let lastError: any = null;

    for (const model of modelsToTry) {
      console.log(`Attempting to use model: ${model}`);
      const maxRetries = 3;
      let retryCount = 0;
      let delay = 500;

      while (retryCount < maxRetries) {
        try {
          // Skip validation and let the API call fail if model doesn't exist
          // This allows us to try the next model in the fallback chain
          const startTime = Date.now();
          
          let content: any[] = [{
            type: "text",
            text: prompt
          }];

          // Add image data for vision models or if it's an image
          if (isImage && (model.includes('vision') || model === 'grok-beta')) {
            const base64File = fileBuffer.toString('base64');
            content.push({
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64File}`
              }
            });
          }

          console.log("AI PROMPT SENT TO GROK:", {
            contentType: isImage ? 'image' : isPDF ? 'pdf' : 'document',
            fileName,
            textPromptLength: prompt.length,
            hasImageData: isImage && (model.includes('vision') || model === 'grok-beta'),
            fileSize: fileBuffer.length,
            model: model
          });

          const response = await axios({
            url: `${this.baseURL}/chat/completions`,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${this.apiKey}`,
            },
            data: {
              model: model,
              messages: [{
                role: "system",
                content: "You are an expert mortgage document analysis AI. Extract all relevant loan, property, and borrower information from the provided document with high accuracy."
              }, {
                role: "user",
                content: content
              }],
              response_format: { type: "json_object" },
              temperature: 0.1, // Very low for consistency
              max_tokens: 2000,
            },
            timeout: this.timeout,
            validateStatus: (status) => status === 200,
          });

          console.log({
            duration: Date.now() - startTime,
            model,
            promptLength: prompt.length
          }, `API call completed successfully with ${model}`);

          const rawResponse = response.data?.choices?.[0]?.message?.content;
          console.log("AI RESPONSE FROM GROK:", rawResponse);

          if (!rawResponse) {
            throw new Error('Empty response from API');
          }

          const result = JSON.parse(rawResponse);
          
          // Validate we got actual data
          if (!result || (!result.documentType && !result.extractedData)) {
            console.warn(`No valid data extracted with ${model}, treating as failure`);
            throw new Error('No valid data in response');
          }
          
          console.log(`Successfully analyzed document with ${model}`);
          return {
            documentType: result.documentType || "unknown",
            extractedData: result.extractedData || {},
            confidence: result.confidence || 0.5
          };

        } catch (error) {
          lastError = error;
          const axiosError = error as AxiosError;
          const errorMessage = (error as Error).message;
          
          // Handle empty response or no data - try next model immediately
          if (errorMessage === 'Empty response from API' || 
              errorMessage === 'No data received from API' ||
              errorMessage === 'No valid data in response' || 
              errorMessage.startsWith('JSON parse error:')) {
            console.warn(`Model ${model} returned empty/invalid response, trying next model...`);
            break; // Exit retry loop for this model, try next model
          }
          
          if (axiosError.response) {
            console.error(`API error for ${model}:`, {
              status: axiosError.response.status,
              data: axiosError.response.data,
            });
            
            // Model not found or invalid - try next model
            if (axiosError.response.status === 400 || axiosError.response.status === 404) {
              console.warn(`Model ${model} not available, trying next model...`);
              break; // Exit retry loop for this model, try next model
            }
            
            // Rate limit - wait and retry
            if (axiosError.response.status === 429) {
              console.warn(`Rate limited for ${model}, retrying in ${delay}ms...`);
              retryCount++;
              if (retryCount < maxRetries) {
                await setTimeout(delay);
                delay *= 2; // Exponential backoff
                continue;
              }
            }
            
            // Server error - retry
            if (axiosError.response.status >= 500) {
              console.warn(`Server error for ${model}, retrying...`);
              retryCount++;
              if (retryCount < maxRetries) {
                await setTimeout(delay);
                continue;
              }
            }
          }
          
          console.error(`Request failed for ${model}:`, errorMessage);
          retryCount++;
          if (retryCount < maxRetries) {
            console.info(`Retrying ${model} in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
            await setTimeout(delay);
          }
        }
      }
      
      console.warn(`All retries exhausted for ${model}, trying next model...`);
    }
    
    console.error("All models failed, returning empty result");
    console.error("Last error:", lastError);
    
    // Return appropriate fallback based on file type
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

const documentAnalysisService = new DocumentAnalysisService();

export async function analyzeDocument(filePath: string, fileName: string): Promise<DocumentAnalysisResult> {
  try {
    const fileBuffer = await fs.readFile(filePath);
    return await documentAnalysisService.analyzeDocumentWithGrok(fileName, fileBuffer);
  } catch (error) {
    console.error("Error reading document file:", error);
    return {
      documentType: "unknown",
      extractedData: {},
      confidence: 0
    };
  }
}