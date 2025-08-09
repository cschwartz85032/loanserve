import fs from "fs/promises";
import pdf2pic from "pdf2pic";
import axios, { AxiosError } from "axios";
import { v4 as uuidv4 } from "uuid";

export interface DocumentAnalysisResult {
  documentType: string;
  extractedData: Record<string, any>;
  confidence: number;
}

interface Logger {
  info: (message: string, meta?: Record<string, any>) => void;
  warn: (message: string, meta?: Record<string, any>) => void;
  error: (message: string, meta?: Record<string, any>) => void;
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
  private readonly logger: Logger;

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

  private buildDocumentAnalysisPrompt(): string {
    return `Analyze this loan document image and extract ALL the loan information completely and accurately. Extract ACTUAL values from the document - DO NOT use generic placeholders.

CRITICAL INSTRUCTIONS:
- This is a REAL document with REAL data
- Extract the ACTUAL values you see in the document
- DO NOT use placeholder values like "123 Main St", "John Doe", "Unknown", etc.
- If you cannot read a specific field clearly, leave it as null
- Be thorough and comprehensive in your extraction

Extract all available information and return it in this exact JSON format:

{
  "documentType": "type of document (e.g., Deed of Trust, Promissory Note, Loan Application)",
  "extractedData": {
    "propertyStreetAddress": "actual street address from document",
    "propertyCity": "actual city name",
    "propertyState": "actual state",
    "propertyZipCode": "actual zip code",
    "propertyType": "Single Family Residence/Condominium/Townhouse/etc",
    "propertyValue": numerical_value_or_null,
    "borrowerName": "actual borrower name from document",
    "borrowerSSN": "actual SSN if visible or null",
    "borrowerIncome": numerical_value_or_null,
    "borrowerStreetAddress": "borrower mailing address street",
    "borrowerCity": "borrower mailing address city", 
    "borrowerState": "borrower mailing address state",
    "borrowerZipCode": "borrower mailing address zip",
    "loanAmount": numerical_value_or_null,
    "interestRate": numerical_percentage_or_null,
    "loanTerm": numerical_months_or_null,
    "loanType": "Fixed Rate Mortgage/ARM/FHA/VA/etc",
    "monthlyPayment": numerical_value_or_null,
    "escrowAmount": numerical_value_or_null,
    "hoaFees": numerical_value_or_null,
    "downPayment": numerical_value_or_null,
    "closingCosts": numerical_value_or_null,
    "pmi": numerical_value_or_null,
    "taxes": numerical_value_or_null,
    "insurance": numerical_value_or_null,
    "closingDate": "YYYY-MM-DD format or null",
    "firstPaymentDate": "YYYY-MM-DD format or null", 
    "prepaymentExpirationDate": "YYYY-MM-DD format or null",
    "trusteeName": "actual trustee name from document",
    "trusteeStreetAddress": "trustee address street",
    "trusteeCity": "trustee address city",
    "trusteeState": "trustee address state", 
    "trusteeZipCode": "trustee address zip",
    "beneficiaryName": "actual beneficiary/lender name",
    "beneficiaryStreetAddress": "beneficiary address street",
    "beneficiaryCity": "beneficiary address city",
    "beneficiaryState": "beneficiary address state",
    "beneficiaryZipCode": "beneficiary address zip",
    "loanDocuments": ["array", "of", "document", "types", "mentioned"],
    "defaultConditions": ["array", "of", "default", "conditions"],
    "insuranceRequirements": ["array", "of", "insurance", "requirements"],
    "crossDefaultParties": ["array", "of", "cross", "default", "parties"]
  },
  "confidence": numerical_confidence_score_0_to_1
}

IMPORTANT: Return ONLY the JSON object, no additional text or explanation.`;
  }

  private async convertPdfToImages(
    fileBuffer: Buffer,
    maxPages: number = 5,
  ): Promise<string[]> {
    try {
      const tempId = uuidv4();
      const tempPdfPath = `/tmp/temp_${tempId}.pdf`;
      
      await fs.writeFile(tempPdfPath, fileBuffer);
      
      const convert = pdf2pic.fromPath(tempPdfPath, {
        density: 150,
        saveFilename: `page_${tempId}`,
        savePath: "/tmp/",
        format: "png",
        width: 1200,
        height: 1600,
      });

      const images: string[] = [];
      
      for (let i = 1; i <= maxPages; i++) {
        try {
          const result = await convert(i, { responseType: "base64" });
          if (result && result.base64) {
            this.logger.info(`Converted PDF page ${i}`, { size: result.base64.length });
            images.push(result.base64);
          } else {
            this.logger.warn(`PDF page ${i} has insufficient data`, { size: 0 });
          }
        } catch (pageError) {
          this.logger.warn(`Failed to convert PDF page ${i}`, { error: pageError.message });
          break;
        }
      }

      // Cleanup
      try {
        await fs.unlink(tempPdfPath);
      } catch (cleanupError) {
        this.logger.warn("Failed to cleanup temp PDF file", { error: cleanupError.message });
      }

      return images;
    } catch (error) {
      this.logger.warn("Failed to extract text from PDF", { error: error.message });
      return [];
    }
  }

  private async generateDocumentAnalysisWithStreaming(
    model: string,
    images: string[],
  ): Promise<DocumentAnalysisResult> {
    const contentItems: any[] = [
      {
        type: "text",
        text: this.buildDocumentAnalysisPrompt(),
      },
    ];

    if (images.length > 0) {
      this.logger.info("Added images to request", { count: images.length });
      images.forEach((base64Image) => {
        contentItems.push({
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${base64Image}`,
          },
        });
      });
    } else {
      this.logger.warn("No valid images extracted, using text-only prompt");
    }

    const apiStartTime = Date.now();
    const response = await axios({
      url: `${this.config.baseURL}/chat/completions`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      data: {
        model,
        messages: [
          {
            role: "user",
            content: contentItems,
          },
        ],
        stream: true,
        max_tokens: 4000,
        temperature: 0.1,
      },
      responseType: "stream",
      timeout: this.config.timeout,
    });

    this.logger.info("API call initiated", {
      model,
      duration: Date.now() - apiStartTime,
      promptLength: this.buildDocumentAnalysisPrompt().length,
      contentItems: contentItems.length,
    });

    return this.processDocumentStream(response);
  }

  async analyzeDocumentWithGrok(
    fileName: string,
    fileBuffer: Buffer,
  ): Promise<DocumentAnalysisResult> {
    this.logger.info("Processing document", { fileName, size: fileBuffer.length });
    
    this.validateFile(fileName, fileBuffer);
    
    const models = ["grok-4-0709", "grok-3", "grok-2-1212"];
    let lastError: Error | null = null;

    for (const model of models) {
      for (let retryCount = 0; retryCount < this.config.maxRetries; retryCount++) {
        try {
          const images = await this.convertPdfToImages(
            fileBuffer,
            this.config.maxPagesToConvert,
          );

          this.logger.info("Attempting analysis with model", { model });
          const result = await this.generateDocumentAnalysisWithStreaming(
            model,
            images,
          );

          if (result && result.documentType && result.extractedData) {
            return result;
          }
        } catch (error: any) {
          lastError = error;
          this.logger.error("Analysis attempt failed", {
            model,
            retry: retryCount + 1,
            error: error.message,
          });

          if (
            error.response?.status === 400 &&
            error.response?.data?.error?.message?.includes("model")
          ) {
            this.logger.warn(`Model ${model} not available, skipping`);
            break;
          }

          if (retryCount === this.config.maxRetries - 1) {
            this.logger.warn(`Retries exhausted for ${model}`);
            break;
          }

          const delay = this.config.initialRetryDelay * Math.pow(2, retryCount);
          await new Promise(resolve => global.setTimeout(resolve, delay));
        }
      }
    }

    this.logger.error("All models failed", { lastError: lastError?.message });
    return {
      documentType: "unknown",
      extractedData: {},
      confidence: 0,
    };
  }

  private async processDocumentStream(
    response: any,
  ): Promise<DocumentAnalysisResult> {
    let jsonContent = "";
    let hasData = false;

    return new Promise((resolve, reject) => {
      const timeoutId = global.setTimeout(() => {
        if (!hasData) {
          this.logger.error("No data received within timeout");
          reject(new Error("No data received from API within timeout"));
        }
      }, 20000);

      response.data.on("data", (chunk: Buffer) => {
        if (!hasData) global.clearTimeout(timeoutId);
        hasData = true;

        const chunkStr = chunk.toString();
        jsonContent += chunkStr;

        this.logger.info(`Received chunk`, { length: chunkStr.length });

        if (chunkStr.includes("[DONE]")) {
          try {
            // Clean the JSON content by removing any streaming artifacts
            let cleanContent = jsonContent.replace(/data:\s*\{/g, '{');
            cleanContent = cleanContent.replace(/data:\s*/g, '');
            cleanContent = cleanContent.replace(/\[DONE\]/g, '');
            cleanContent = cleanContent.trim();
            
            const jsonStart = cleanContent.indexOf("{");
            const jsonEnd = cleanContent.lastIndexOf("}");
            if (jsonStart === -1 || jsonEnd === -1) {
              this.logger.error("Invalid JSON structure in stream");
              reject(new Error("Invalid JSON structure"));
              return;
            }

            const jsonStr = cleanContent.slice(jsonStart, jsonEnd + 1);
            this.logger.info("Stream completed. JSON content length:", jsonStr.length);
            this.logger.info("Successfully parsed document analysis result");
            
            const result = JSON.parse(jsonStr);
            this.logger.info("Full Grok analysis JSON:", JSON.stringify(result, null, 2));
            
            if (result && (result.documentType || result.extractedData)) {
              this.logger.info("Successfully analyzed document with grok-4-0709");
              this.logger.info("Successfully parsed final document analysis result");
              resolve(result);
            } else {
              this.logger.error("Response lacks valid document analysis data");
              reject(new Error("Invalid response format"));
            }
          } catch (e) {
            this.logger.error("JSON parse error", { error: e.message });
            reject(new Error(`JSON parse error: ${e.message}`));
          }
          return;
        }
      });

      response.data.on("end", () => {
        global.clearTimeout(timeoutId);
        if (!hasData || !jsonContent) {
          this.logger.error("Stream ended with no meaningful data");
          reject(new Error("No data received from API"));
          return;
        }

        try {
          // Clean the JSON content by removing any streaming artifacts
          let cleanContent = jsonContent.replace(/data:\s*\{/g, '{');
          cleanContent = cleanContent.replace(/data:\s*/g, '');
          cleanContent = cleanContent.replace(/\[DONE\]/g, '');
          cleanContent = cleanContent.trim();
          
          const jsonStart = cleanContent.indexOf("{");
          const jsonEnd = cleanContent.lastIndexOf("}");
          if (jsonStart === -1 || jsonEnd === -1) {
            this.logger.error("Invalid JSON structure in final content");
            reject(new Error("Invalid JSON structure"));
            return;
          }

          const jsonStr = cleanContent.slice(jsonStart, jsonEnd + 1);
          this.logger.info("Stream completed. JSON content length:", jsonStr.length);
          this.logger.info("Successfully parsed document analysis result");
          
          const result = JSON.parse(jsonStr);
          this.logger.info("Full Grok analysis JSON:", JSON.stringify(result, null, 2));
          
          if (result && (result.documentType || result.extractedData)) {
            this.logger.info("Successfully analyzed document with grok-4-0709");
            this.logger.info("Successfully parsed final document analysis result");
            resolve(result);
          } else {
            this.logger.error(
              "Final response lacks valid document analysis data",
            );
            reject(new Error("Invalid response format"));
          }
        } catch (e) {
          this.logger.error("Final JSON parse error", { error: e.message });
          reject(new Error(`Final JSON parse error: ${e.message}`));
        }
      });

      response.data.on("error", (error: Error) => {
        global.clearTimeout(timeoutId);
        this.logger.error("Stream error", { error: error.message });
        reject(new Error(`Stream error: ${error.message}`));
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