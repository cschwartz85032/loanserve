import fs from "fs/promises";
import axios, { AxiosError } from "axios";
import { setTimeout } from "timers/promises";
import { fromPath } from "pdf2pic";

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
    // Try both environment variable names to handle caching issues
    const apiKey = process.env.XAI_API_KEY_NEW || process.env.XAI_API_KEY;
    
    console.log("XAI API KEY environment check:", {
      XAI_API_KEY: !!process.env.XAI_API_KEY,
      XAI_API_KEY_NEW: !!process.env.XAI_API_KEY_NEW,
      usingKey: apiKey?.substring(0, 8) + "...",
      length: apiKey?.length
    });
    
    if (!apiKey || apiKey.trim() === "") {
      throw new Error("XAI_API_KEY or XAI_API_KEY_NEW is missing or invalid");
    }
    this.apiKey = apiKey;
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
    
    // Use your exact model fallback system
    const modelsToTry = ["grok-4-0709", "grok-3", "grok-2-1212"];
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

          // Add image data for images or convert PDF to image for vision models
          if (isImage) {
            const base64File = fileBuffer.toString('base64');
            content.push({
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64File}`
              }
            });
          } else if (isPDF && (model.includes('vision') || model.includes('grok-4') || model.includes('grok-3'))) {
            // Convert PDF to images for vision-capable models
            try {
              const tempPdfPath = `/tmp/temp_${Date.now()}.pdf`;
              await fs.writeFile(tempPdfPath, fileBuffer);
              
              const convert = fromPath(tempPdfPath, {
                density: 200,
                saveFilename: "page",
                savePath: "/tmp/",
                format: "png",
                width: 2000,
                height: 2800
              });
              
              // Convert first few pages (limit to avoid token limits)
              const pageLimit = 5;
              for (let i = 1; i <= pageLimit; i++) {
                try {
                  const page = await convert(i, { responseType: "buffer" });
                  const base64Image = page.buffer.toString('base64');
                  content.push({
                    type: "image_url",
                    image_url: {
                      url: `data:image/png;base64,${base64Image}`
                    }
                  });
                } catch (pageError) {
                  // If page doesn't exist, stop converting
                  break;
                }
              }
              
              // Clean up temp file
              await fs.unlink(tempPdfPath).catch(() => {});
              
            } catch (pdfError) {
              console.error('PDF conversion failed:', pdfError);
              // Fallback: continue without images
            }
          }

          console.log("AI PROMPT SENT TO GROK:", {
            contentType: isImage ? 'image' : isPDF ? 'pdf' : 'document',
            fileName,
            textPromptLength: prompt.length,
            hasImageData: isImage,
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
              temperature: 0.1,
              max_tokens: 2000,
              stream: true,
            },
            responseType: "stream",
            timeout: this.timeout,
            validateStatus: (status) => status === 200,
          });

          console.log({
            duration: Date.now() - startTime,
            headers: response.headers,
            model,
            promptLength: prompt.length
          }, `API call initiated successfully with ${model}`);

          const result = await this.processDocumentStream(response);
          
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

  private async processDocumentStream(response: any): Promise<any> {
    let buffer = '';
    let jsonContent = '';
    let hasData = false;

    return new Promise((resolve, reject) => {
      // Set timeout for initial data - if no data in 20 seconds, reject
      const timeoutId = global.setTimeout(() => {
        if (!hasData) {
          console.error("No data received within 20 seconds, treating as failure");
          reject(new Error("No data received from API within timeout"));
        }
      }, 20000);

      response.data.on("data", (chunk: Buffer) => {
        if (!hasData) global.clearTimeout(timeoutId);
        
        const chunkStr = chunk.toString();
        buffer += chunkStr;
        
        // Check if we have meaningful data (not just whitespace)
        if (chunkStr.trim()) hasData = true;
        
        // Process complete SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              // Stream completed, parse the accumulated JSON
              console.log(`Stream completed. JSON content length: ${jsonContent.length}`);
              
              if (!jsonContent || jsonContent.length === 0) {
                console.error('Empty response received from API - no content accumulated');
                reject(new Error('Empty response from API'));
                return;
              }
              
              try {
                const result = JSON.parse(jsonContent);
                console.log("AI RESPONSE FROM GROK:", JSON.stringify(result));
                resolve(result);
                return;
              } catch (e: any) {
                console.error('Failed to parse JSON:', e.message);
                reject(new Error(`JSON parse error: ${e.message}`));
                return;
              }
            }
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              
              if (content) {
                jsonContent += content;
              }
            } catch (e) {
              // Skip invalid JSON chunks
            }
          }
        }
      });

      response.data.on("end", () => {
        if (jsonContent) {
          try {
            const result = JSON.parse(jsonContent);
            console.log("AI RESPONSE FROM GROK:", JSON.stringify(result));
            resolve(result);
          } catch (e: any) {
            console.error('Failed to parse final JSON:', e.message);
            reject(new Error(`Final JSON parse error: ${e.message}`));
          }
        } else {
          reject(new Error('No content received from stream'));
        }
      });

      response.data.on("error", (error: any) => {
        console.error('Stream error:', error);
        reject(new Error(`Stream error: ${error.message}`));
      });
    });
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