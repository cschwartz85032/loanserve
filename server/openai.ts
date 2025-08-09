import fs from "fs/promises";
import axios, { AxiosError } from "axios";
import { fromPath } from "pdf2pic";
import { v4 as uuidv4 } from "uuid";

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
    // New fields from Deed of Trust
    trusteeName?: string;
    trusteeStreetAddress?: string;
    trusteeCity?: string;
    trusteeState?: string;
    trusteeZipCode?: string;
    beneficiaryName?: string;
    beneficiaryStreetAddress?: string;
    beneficiaryCity?: string;
    beneficiaryState?: string;
    beneficiaryZipCode?: string;
    loanDocuments?: string[];
    defaultConditions?: string[];
    insuranceRequirements?: string[];
    crossDefaultParties?: string[];
  };
  confidence: number;
}

interface ApiConfig {
  baseURL: string;
  timeout: number;
  maxRetries: number;
  initialRetryDelay: number;
  maxFileSize: number;
  maxPagesToConvert: number;
}

export class DocumentAnalysisService {
  private readonly config: ApiConfig;
  private readonly apiKey: string;
  private readonly logger: {
    info: (message: string, meta?: Record<string, any>) => void;
    warn: (message: string, meta?: Record<string, any>) => void;
    error: (message: string, meta?: Record<string, any>) => void;
  };

  constructor() {
    const apiKey = process.env.XAI_API_KEY_NEW || process.env.XAI_API_KEY;

    if (!apiKey || apiKey.trim() === "") {
      throw new Error("XAI_API_KEY or XAI_API_KEY_NEW is missing or invalid");
    }

    this.apiKey = apiKey;
    this.config = {
      baseURL: "https://api.x.ai/v1",
      timeout: 180000,
      maxRetries: 3,
      initialRetryDelay: 500,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxPagesToConvert: 5,
    };

    this.logger = {
      info: (message, meta = {}) => console.log(`[INFO] ${message}`, meta),
      warn: (message, meta = {}) => console.warn(`[WARN] ${message}`, meta),
      error: (message, meta = {}) => console.error(`[ERROR] ${message}`, meta),
    };

    this.logger.info("DocumentAnalysisService initialized", {
      apiKeyLength: apiKey.length,
      config: this.config,
    });
  }

  private validateFile(fileName: string, fileBuffer: Buffer): void {
    if (!fileName) {
      throw new Error("File name is required");
    }
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error("File buffer is empty or invalid");
    }
    if (fileBuffer.length > this.config.maxFileSize) {
      throw new Error(
        `File size exceeds maximum limit of ${this.config.maxFileSize / (1024 * 1024)}MB`,
      );
    }
    if (!/\.(pdf|jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
      throw new Error(
        "Unsupported file type. Supported types: PDF, JPG, JPEG, PNG, GIF, WEBP",
      );
    }
  }

  private buildDocumentAnalysisPrompt(
    fileName: string,
    fileBuffer: Buffer,
  ): string {
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
    const isPDF = /\.pdf$/i.test(fileName);

    return `Analyze this ${isImage ? "image" : "PDF document"} named "${fileName}" completely and extract all relevant mortgage loan information.
=== DOCUMENT ANALYSIS ===
Document: ${fileName}
Size: ${Math.round(fileBuffer.length / 1024)}KB
Type: ${isImage ? "Image" : "PDF"}
=== EXTRACTION REQUIREMENTS ===
First, identify what type of document this is (e.g., loan application, property deed, insurance policy, tax return, income statement, credit report, appraisal, etc.).
Then extract any relevant information from the COMPLETE document including:
- Property details (separate street address, city, state, zip, type, value)
- Loan information (amount, rate, term, type, prepayment terms)
- Borrower information (name, income, SSN, mailing address separate from property)
- Payment details (monthly payment, escrow, HOA)
- Financial details (down payment, closing costs, PMI, taxes, insurance)
- Important dates (closing, first payment, prepayment expiration)
- Trustee information (name, street address, city, state, zip)
- Beneficiary information (name, street address, city, state, zip)
- Loan documents mentioned (e.g., Note, Deed of Trust, etc.)
- Default conditions (key events that constitute default, summarized)
- Insurance requirements (specific types and coverage details)
- Cross-default parties (entities listed in cross-default clauses)
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
    "prepaymentExpirationDate": "YYYY-MM-DD_or_null",
    "trusteeName": "extracted_value_or_null",
    "trusteeStreetAddress": "street_address_only_or_null",
    "trusteeCity": "city_only_or_null",
    "trusteeState": "state_only_or_null",
    "trusteeZipCode": "zip_code_only_or_null",
    "beneficiaryName": "extracted_value_or_null",
    "beneficiaryStreetAddress": "street_address_only_or_null",
    "beneficiaryCity": "city_only_or_null",
    "beneficiaryState": "state_only_or_null",
    "beneficiaryZipCode": "zip_code_only_or_null",
    "loanDocuments": ["array_of_documents_or_null"],
    "defaultConditions": ["array_of_conditions_or_null"],
    "insuranceRequirements": ["array_of_requirements_or_null"],
    "crossDefaultParties": ["array_of_entities_or_null"]
  },
  "confidence": 0.85
}
IMPORTANT: Include the complete document context in the analysis.`;
  }

  private async convertPDFToImages(fileBuffer: Buffer): Promise<string[]> {
    const tempPdfPath = `/tmp/temp_${uuidv4()}.pdf`;
    const base64Images: string[] = [];

    try {
      await fs.writeFile(tempPdfPath, fileBuffer);
      const convert = fromPath(tempPdfPath, {
        density: 200,
        saveFilename: "page",
        savePath: "/tmp/",
        format: "png",
        width: 2000,
        height: 2800,
      });

      for (let i = 1; i <= this.config.maxPagesToConvert; i++) {
        try {
          const page = await convert(i, { responseType: "buffer" });
          if (page.buffer && page.buffer.length > 0) {
            const base64Image = page.buffer.toString("base64");
            if (base64Image && base64Image.length > 100) { // Ensure image has content
              base64Images.push(base64Image);
              this.logger.info(`Successfully converted PDF page ${i}, size: ${base64Image.length}`);
            } else {
              this.logger.warn(`PDF page ${i} converted to empty/small image`);
            }
          } else {
            this.logger.warn(`PDF page ${i} conversion returned empty buffer`);
          }
        } catch (pageError) {
          this.logger.warn(`Failed to convert PDF page ${i}`, {
            error: pageError.message,
          });
          break;
        }
      }
    } catch (error) {
      this.logger.error("PDF conversion failed", { error: error.message });
      throw error;
    } finally {
      await fs
        .unlink(tempPdfPath)
        .catch(() => this.logger.warn("Failed to clean up temp PDF file"));
    }

    return base64Images;
  }

  async analyzeDocumentWithGrok(
    fileName: string,
    fileBuffer: Buffer,
  ): Promise<DocumentAnalysisResult> {
    this.validateFile(fileName, fileBuffer);
    this.logger.info(`Processing document`, {
      fileName,
      size: fileBuffer.length,
    });

    const prompt = this.buildDocumentAnalysisPrompt(fileName, fileBuffer);
    const result = await this.generateDocumentAnalysisWithStreaming(prompt, fileName, fileBuffer);
    
    return {
      documentType: result.documentType || "unknown",
      extractedData: result.extractedData || {},
      confidence: result.confidence || 0.5,
    };
  }

  private async generateDocumentAnalysisWithStreaming(
    prompt: string,
    fileName: string,
    fileBuffer: Buffer,
  ): Promise<any> {
    const modelsToTry = ["grok-4-0709", "grok-3", "grok-2-1212"];
    let lastError: any = null;

    for (const model of modelsToTry) {
      this.logger.info(`Attempting to use model: ${model}`);
      const maxRetries = 3;
      let retryCount = 0;
      let delay = 500;

      while (retryCount < maxRetries) {
        try {
          const startTime = Date.now();
          
          const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
          const isPDF = /\.pdf$/i.test(fileName);
          
          const content: any[] = [{ type: "text", text: prompt }];

          // Add image data for images or convert PDF to images for all Grok models
          if (isImage) {
            content.push({
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${fileBuffer.toString("base64")}`,
              },
            });
          } else if (isPDF) {
            try {
              const images = await this.convertPDFToImages(fileBuffer);
              if (images.length > 0) {
                this.logger.info(`Adding ${images.length} PDF images to request`);
                images.forEach((base64Image) => {
                  if (base64Image && base64Image.length > 100) {
                    content.push({
                      type: "image_url",
                      image_url: { url: `data:image/png;base64,${base64Image}` },
                    });
                  }
                });
              } else {
                this.logger.warn('No valid images extracted from PDF, continuing with text-only analysis');
              }
            } catch (pdfError) {
              this.logger.error('PDF conversion failed:', pdfError);
              // Continue without images
            }
          }

          const response = await axios({
            url: "https://api.x.ai/v1/chat/completions",
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.apiKey}`,
            },
            data: {
              model: model,
              messages: [
                {
                  role: "system",
                  content: "You are an expert mortgage document analysis AI. Extract all relevant loan, property, borrower, trustee, beneficiary, and related information from the provided document with high accuracy.",
                },
                { role: "user", content },
              ],
              response_format: { type: "json_object" },
              temperature: 0.1,
              max_tokens: 4000,
              stream: true,
            },
            responseType: "stream",
            timeout: 180000,
            validateStatus: (status) => status === 200,
          });

          this.logger.info({ 
            duration: Date.now() - startTime,
            headers: response.headers,
            model,
            promptLength: prompt.length 
          }, `API call initiated successfully with ${model}`);
          
          const result = await this.processDocumentStream(response);
          
          // Validate we got actual data
          if (!result || (!result.documentType && !result.extractedData)) {
            this.logger.warn(`No valid data generated with ${model}, treating as failure`);
            throw new Error('No valid data in response');
          }
          
          this.logger.info(`Successfully analyzed document with ${model}`);
          return result;
          
        } catch (error) {
          lastError = error;
          const axiosError = error as AxiosError;
          const errorMessage = (error as Error).message;
          
          // Handle empty response or no data - try next model immediately
          if (errorMessage === 'Empty response from API' || 
              errorMessage === 'No data received from API' ||
              errorMessage === 'No data received from API within timeout' ||
              errorMessage === 'No valid data in response' || 
              errorMessage === 'Invalid response format' ||
              errorMessage.startsWith('JSON parse error:')) {
            this.logger.warn(`Model ${model} returned empty/invalid response, trying next model...`);
            break; // Exit retry loop for this model, try next model
          }
          
          if (axiosError.response) {
            this.logger.error(`API error for ${model}:`, {
              status: axiosError.response.status,
              data: axiosError.response.data,
            });
            
            // Model not found or invalid - try next model
            if (axiosError.response.status === 400 || axiosError.response.status === 404) {
              this.logger.warn(`Model ${model} not available, trying next model...`);
              break;
            }
            
            // Rate limit - retry same model
            if (axiosError.response.status === 429) {
              this.logger.warn(`Rate limit for ${model}, retrying in ${delay}ms...`);
              retryCount++;
              await new Promise(resolve => global.setTimeout(resolve, delay));
              delay *= 2;
              continue;
            }
            
            // Server error - retry same model
            if (axiosError.response.status >= 500) {
              this.logger.warn(`Server error for ${model}, retrying in ${delay}ms...`);
              retryCount++;
              await new Promise(resolve => global.setTimeout(resolve, delay));
              delay *= 2;
              continue;
            }
          } else if (axiosError.code === "ECONNABORTED") {
            this.logger.warn(`Timeout for ${model} attempt ${retryCount + 1}. Retrying in ${delay}ms...`);
            retryCount++;
            await new Promise(resolve => global.setTimeout(resolve, delay));
            delay *= 2;
            continue;
          }
          
          // Unexpected error - try next model
          this.logger.error(`Unexpected error for ${model}:`, errorMessage);
          break;
        }
      }
    }
    
    // All models failed
    this.logger.error("All models failed. Last error:", lastError);
    throw lastError || new Error("All model attempts failed");
  }

  private async processDocumentStream(response: any): Promise<any> {
    let buffer = '';
    let jsonContent = '';
    let hasData = false;

    return new Promise((resolve, reject) => {
      // Set timeout for initial data - if no data in 20 seconds, reject
      const timeoutId = global.setTimeout(() => {
        if (!hasData) {
          this.logger.error("No data received within 20 seconds, treating as failure");
          reject(new Error("No data received from API within timeout"));
        }
      }, 20000); // 20-second timeout for initial data

      response.data.on("data", (chunk: Buffer) => {
        if (!hasData) clearTimeout(timeoutId); // Clear timeout on first data
        
        const chunkStr = chunk.toString();
        buffer += chunkStr;
        
        // Check if we have meaningful data (not just whitespace)
        if (chunkStr.trim()) hasData = true;
        
        this.logger.info(`Received chunk: length=${chunkStr.length}`);
        
        // Process complete SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              // Stream completed, parse the accumulated JSON
              this.logger.info(`Stream completed. JSON content length: ${jsonContent.length}`);
              
              if (!jsonContent || jsonContent.length === 0) {
                this.logger.error('Empty response received from API - no content accumulated');
                reject(new Error('Empty response from API'));
                return;
              }
              
              try {
                const result = JSON.parse(jsonContent);
                if (result && (result.documentType || result.extractedData)) {
                  this.logger.info(`Successfully parsed document analysis result`);
                  resolve(result);
                } else {
                  this.logger.error('Response does not contain valid document analysis data');
                  reject(new Error('Invalid response format'));
                }
                return;
              } catch (e: any) {
                this.logger.error('Failed to parse JSON:', e.message);
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
              // Not JSON, might be an error message
              this.logger.info('Non-JSON data in stream:', data);
            }
          }
        }
      });

      response.data.on("end", () => {
        clearTimeout(timeoutId); // Clear timeout when stream ends
        
        if (!hasData || !jsonContent) {
          this.logger.error('Stream ended with no meaningful data');
          reject(new Error('No data received from API'));
          return;
        }
        
        // Try to parse even if [DONE] wasn't received
        if (jsonContent) {
          try {
            const result = JSON.parse(jsonContent);
            if (result && (result.documentType || result.extractedData)) {
              this.logger.info(`Successfully parsed final document analysis result`);
              resolve(result);
              return;
            }
          } catch (e: any) {
            this.logger.error('Failed to parse final content:', e.message);
          }
        }
        
        this.logger.error('No valid analysis result generated');
        reject(new Error('No valid data in response'));
      });

      response.data.on("error", (error: any) => {
        clearTimeout(timeoutId); // Clear timeout on error
        this.logger.error("Stream error:", error.message);
        reject(error);
      });
    });
  }
}

export async function analyzeDocument(
  filePath: string,
  fileName: string,
): Promise<DocumentAnalysisResult> {
  const service = new DocumentAnalysisService();
  try {
    const fileBuffer = await fs.readFile(filePath);
    return await service.analyzeDocumentWithGrok(fileName, fileBuffer);
  } catch (error) {
    service.logger.error("Error reading document file", {
      error: error.message,
    });
    return {
      documentType: "unknown",
      extractedData: {},
      confidence: 0,
    };
  }
}
