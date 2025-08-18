import fs from "fs/promises";
import axios, { AxiosError } from "axios";
import { setTimeout as promiseSetTimeout } from "timers/promises";
import { setTimeout as nodeSetTimeout, clearTimeout } from "timers";
import { v4 as uuidv4 } from "uuid";

// Use dynamic imports for pdf2pic and pdfjs-dist
let fromPath: any;
let getDocument: any;

try {
  ({ fromPath } = await import("pdf2pic"));
  console.log("[INFO] Successfully loaded pdf2pic module");
} catch (error) {
  console.error("[FATAL] Failed to load pdf2pic module", {
    error: error.message,
  });
  throw new Error("pdf2pic module is not installed. Run `npm install pdf2pic`");
}

try {
  ({ getDocument } = await import("pdfjs-dist/legacy/build/pdf.js"));
  console.log("[INFO] Successfully loaded pdfjs-dist module");
} catch (error) {
  console.error("[FATAL] Failed to load pdfjs-dist module", {
    error: error.message,
  });
  throw new Error(
    "pdfjs-dist module is not installed. Run `npm install pdfjs-dist@3.11.338`",
  );
}

export interface DocumentAnalysisResult {
  documentType: string;
  extractedData: {
    propertyStreetAddress?: string;
    propertyCity?: string;
    propertyState?: string;
    propertyZipCode?: string;
    propertyType?: string;
    propertyValue?: number;
    borrowerName?: string;
    borrowerSSN?: string;
    borrowerIncome?: number;
    borrowerStreetAddress?: string;
    borrowerCity?: string;
    borrowerState?: string;
    borrowerZipCode?: string;
    loanAmount?: number;
    interestRate?: number;
    loanTerm?: number;
    loanType?: string;
    monthlyPayment?: number;
    escrowAmount?: number;
    hoaFees?: number;
    downPayment?: number;
    closingCosts?: number;
    pmi?: number;
    taxes?: number;
    insurance?: number;
    closingDate?: string;
    firstPaymentDate?: string;
    prepaymentExpirationDate?: string;
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
  maxJsonContentSize: number;
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
      maxJsonContentSize: 1000000, // 1MB
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
    documentText?: string,
  ): string {
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
    const isPDF = /\.pdf$/i.test(fileName);
    const promptParts = [
      `Analyze this ${isImage ? "image" : "PDF document"} named "${fileName}" completely and extract all relevant mortgage loan information.`,
      "",
      "=== DOCUMENT ANALYSIS ===",
      `Document: ${fileName}`,
      `Size: ${Math.round(fileBuffer.length / 1024)}KB`,
      `Type: ${isImage ? "Image" : "PDF"}`,
      documentText ? `Content: ${documentText}` : "",  // Removed 5000 character limit
      "",
      "=== EXTRACTION REQUIREMENTS ===",
      "First, identify what type of document this is (e.g., loan application, property deed, insurance policy, tax return, income statement, credit report, appraisal, settlement statement, etc.).",
      "Then extract ALL relevant information from the COMPLETE document including:",
      "- Property details: Extract complete address (street, city, state, zip separately), property type, property value/appraisal value, purchase price if available",
      "- Loan information: Extract loan amount, interest rate (as percentage), loan term IN MONTHS (convert years to months), loan type, prepayment penalty terms and expiration date",
      "- Down payment: Calculate from purchase price minus loan amount if not explicitly stated",
      "- Borrower information: Full name (individual and/or company), phone, email, SSN if present, annual income, complete mailing address (may differ from property)",
      "- Payment details: Monthly payment amount (principal + interest), monthly escrow amount, HOA fees if applicable",
      "- Financial details: Property value, down payment amount, closing costs, PMI amount, property taxes (annual), hazard insurance (annual)",
      "- Important dates: Closing/origination date, first payment due date, maturity date (calculate from origination + term), prepayment penalty expiration date",
      "- Trustee/Title Company: Company name, contact name if available, phone, email, complete street address (street, city, state, zip)",
      "- Beneficiary/Lender: Company name, contact name if available, phone, email, complete street address (street, city, state, zip)",
      "- Escrow Company: Company name, ESCROW NUMBER (very important), phone, email, complete street address (street, city, state, zip)",
      "- Loan documents referenced: List all documents mentioned (Note, Deed of Trust, etc.)",
      "- Default conditions: Extract and summarize key events that constitute default",
      "- Insurance requirements: Specific types required and minimum coverage amounts",
      "- Cross-default parties: List any entities mentioned in cross-default clauses",
      "",
      "IMPORTANT EXTRACTION RULES:",
      "- Extract addresses with separate components (street, city, state, zip) - never combine into single field",
      "- The borrower's mailing address may be different from the property address - extract both",
      "- CALCULATE missing values when possible:",
      "  * If loan term is in years, convert to months (years × 12)",
      "  * If down payment not stated but purchase price and loan amount are present: down payment = purchase price - loan amount",
      "  * If maturity date not stated but origination date and term are present: maturity date = origination date + term",
      "  * If property value not stated, use purchase price or appraisal value if available",
      "- Extract ALL numeric values as numbers, not strings (e.g., 250000 not '250000')",
      "- Extract percentages as numbers (e.g., 5.5 for 5.5%, not '5.5%')",
      "- Extract dates in YYYY-MM-DD format",
      "- Extract the ESCROW NUMBER if present anywhere in the document (may be labeled as 'Escrow #', 'File #', 'Order #', etc.)",
      "- Only return null if information is truly not present and cannot be calculated",
      "- For PDF documents, use both text content and images to ensure nothing is missed",
      "",
      "Return a JSON object with extracted data: {",
      '  "documentType": "document_category_here",',
      '  "extractedData": {',
      '    "propertyStreetAddress": "street_address_only_or_null",',
      '    "propertyCity": "city_only_or_null",',
      '    "propertyState": "state_only_or_null",',
      '    "propertyZipCode": "zip_code_only_or_null",',
      '    "propertyType": "extracted_value_or_null",',
      '    "propertyValue": number_or_null,',
      '    "borrowerName": "extracted_value_or_null",',
      '    "borrowerCompanyName": "company_name_or_null",',
      '    "borrowerPhone": "phone_or_null",',
      '    "borrowerEmail": "email_or_null",',
      '    "borrowerSSN": "ssn_or_null",',
      '    "borrowerIncome": number_or_null,',
      '    "borrowerStreetAddress": "borrower_street_address_or_null",',
      '    "borrowerCity": "borrower_city_or_null",',
      '    "borrowerState": "borrower_state_or_null",',
      '    "borrowerZipCode": "borrower_zip_code_or_null",',
      '    "loanAmount": number_or_null,',
      '    "interestRate": number_or_null,',
      '    "loanTermMonths": number_in_months_or_null,',
      '    "loanType": "extracted_value_or_null",',
      '    "monthlyPayment": number_or_null,',
      '    "escrowAmount": number_or_null,',
      '    "hoaFees": number_or_null,',
      '    "downPayment": number_or_null,',
      '    "closingCosts": number_or_null,',
      '    "pmi": number_or_null,',
      '    "taxes": number_or_null,',
      '    "insurance": number_or_null,',
      '    "closingDate": "YYYY-MM-DD_or_null",',
      '    "firstPaymentDate": "YYYY-MM-DD_or_null",',
      '    "maturityDate": "YYYY-MM-DD_or_null",',
      '    "prepaymentExpirationDate": "YYYY-MM-DD_or_null",',
      '    "trusteeName": "extracted_value_or_null",',
      '    "trusteeCompanyName": "company_name_or_null",',
      '    "trusteePhone": "phone_or_null",',
      '    "trusteeEmail": "email_or_null",',
      '    "trusteeStreetAddress": "street_address_only_or_null",',
      '    "trusteeCity": "city_only_or_null",',
      '    "trusteeState": "state_only_or_null",',
      '    "trusteeZipCode": "zip_code_only_or_null",',
      '    "beneficiaryName": "extracted_value_or_null",',
      '    "beneficiaryCompanyName": "company_name_or_null",',
      '    "beneficiaryPhone": "phone_or_null",',
      '    "beneficiaryEmail": "email_or_null",',
      '    "beneficiaryStreetAddress": "street_address_only_or_null",',
      '    "beneficiaryCity": "city_only_or_null",',
      '    "beneficiaryState": "state_only_or_null",',
      '    "beneficiaryZipCode": "zip_code_only_or_null",',
      '    "escrowCompanyName": "name_or_null",',
      '    "escrowNumber": "escrow_number_or_null",',
      '    "escrowCompanyPhone": "phone_or_null",',
      '    "escrowCompanyEmail": "email_or_null",',
      '    "escrowCompanyStreetAddress": "street_or_null",',
      '    "escrowCompanyCity": "city_or_null",',
      '    "escrowCompanyState": "state_or_null",',
      '    "escrowCompanyZipCode": "zip_or_null",',
      '    "loanDocuments": ["array_of_documents_or_null"],',
      '    "defaultConditions": ["array_of_conditions_or_null"],',
      '    "insuranceRequirements": ["array_of_requirements_or_null"],',
      '    "crossDefaultParties": ["array_of_entities_or_null"]',
      "  },",
      '  "confidence": 0.85',
      "}",
      "",
      "IMPORTANT: Include the complete document context in the analysis and ensure accuracy with provided text.",
    ];

    const prompt = promptParts.join("\n");
    this.logger.info("Generated document analysis prompt", {
      length: prompt.length,
    });
    return prompt;
  }

  private async extractPDFText(
    fileBuffer: Buffer,
  ): Promise<string | undefined> {
    try {
      // Convert Buffer to Uint8Array for pdfjs-dist
      const uint8Array = new Uint8Array(fileBuffer);
      const pdf = await getDocument({ data: uint8Array }).promise;
      let text = "";
      const numPages = pdf.numPages;
      this.logger.info("Extracting text from PDF", { numPages });
      for (
        let i = 1;
        i <= numPages && i <= this.config.maxPagesToConvert;
        i++
      ) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: any) => item.str)
          .join(" ")
          .trim();
        text += pageText + "\n";
        this.logger.info(`Extracted text from page ${i}`, {
          length: pageText.length,
        });
      }
      text = text.trim();
      if (text.length > 0) {
        this.logger.info("Successfully extracted text from PDF", {
          length: text.length,
        });
        return text;
      } else {
        this.logger.warn("Extracted PDF text is empty");
        return undefined;
      }
    } catch (error) {
      this.logger.error("PDF text extraction failed", { error: error.message });
      return undefined;
    }
  }

  private async convertPDFToImages(
    fileBuffer: Buffer,
  ): Promise<{ images: string[]; text?: string }> {
    const tempPdfPath = `/tmp/temp_${uuidv4()}.pdf`;
    const base64Images: string[] = [];
    let extractedText: string | undefined;

    try {
      // First attempt text extraction with pdfjs-dist
      extractedText = await this.extractPDFText(fileBuffer);

      // Attempt image conversion with pdf2pic
      this.logger.info("Attempting PDF to image conversion", {
        fileSize: fileBuffer.length,
      });
      await fs.writeFile(tempPdfPath, fileBuffer);
      const convert = fromPath(tempPdfPath, {
        density: 300,
        saveFilename: "page",
        savePath: "/tmp/",
        format: "png",
        width: 2000,
        height: 2800,
      });

      for (let i = 1; i <= this.config.maxPagesToConvert; i++) {
        try {
          const page = await convert(i, { responseType: "buffer" });
          if (page.buffer && page.buffer.length > 1000) {
            const base64Image = page.buffer.toString("base64");
            base64Images.push(base64Image);
            this.logger.info(`Converted PDF page ${i}`, {
              size: base64Image.length,
            });
          } else {
            this.logger.warn(`PDF page ${i} has insufficient data`, {
              size: page.buffer?.length || 0,
            });
          }
        } catch (pageError) {
          this.logger.warn(`Failed to convert PDF page ${i}`, {
            error: pageError.message,
          });
          break;
        }
      }
    } catch (error) {
      this.logger.error("PDF image conversion failed", {
        error: error.message,
      });
      // Ensure text extraction is attempted if not already done
      if (!extractedText) {
        extractedText = await this.extractPDFText(fileBuffer);
      }
    } finally {
      await fs
        .unlink(tempPdfPath)
        .catch(() => this.logger.warn("Failed to clean up temp PDF file"));
    }

    if (!extractedText && base64Images.length === 0) {
      throw new Error("Failed to extract text or images from PDF");
    }

    return { images: base64Images, text: extractedText };
  }

  async analyzeDocumentWithGrok(
    fileName: string,
    fileBuffer: Buffer,
  ): Promise<DocumentAnalysisResult> {
    try {
      this.validateFile(fileName, fileBuffer);
      this.logger.info(`Processing document`, {
        fileName,
        size: fileBuffer.length,
      });

      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
      const isPDF = /\.pdf$/i.test(fileName);
      let documentText: string | undefined;

      if (isPDF) {
        const { text } = await this.convertPDFToImages(fileBuffer);
        documentText = text;
      }

      const prompt = this.buildDocumentAnalysisPrompt(
        fileName,
        fileBuffer,
        documentText,
      );
      const result = await this.generateDocumentAnalysisWithStreaming(
        prompt,
        fileName,
        fileBuffer,
      );

      return {
        documentType: result.documentType || "unknown",
        extractedData: result.extractedData || {},
        confidence: result.confidence || 0.5,
      };
    } catch (error) {
      this.logger.error("Failed to analyze document", { error: error.message });
      return {
        documentType: "unknown",
        extractedData: {},
        confidence: 0,
      };
    }
  }

  private async generateDocumentAnalysisWithStreaming(
    prompt: string,
    fileName: string,
    fileBuffer: Buffer,
  ): Promise<DocumentAnalysisResult> {
    const modelsToTry = ["grok-4-0709"];
    let lastError: Error | null = null;

    for (const model of modelsToTry) {
      this.logger.info(`Attempting analysis with model`, { model });

      for (
        let retryCount = 0;
        retryCount < this.config.maxRetries;
        retryCount++
      ) {
        try {
          const startTime = Date.now();
          const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
          const isPDF = /\.pdf$/i.test(fileName);
          const content: any[] = [{ type: "text", text: prompt }];

          if (isImage) {
            content.push({
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${fileBuffer.toString("base64")}`,
              },
            });
          } else if (isPDF) {
            const { images } = await this.convertPDFToImages(fileBuffer);
            if (images.length > 0) {
              images.forEach((base64Image) => {
                if (base64Image && base64Image.length > 1000) {
                  content.push({
                    type: "image_url",
                    image_url: { url: `data:image/png;base64,${base64Image}` },
                  });
                }
              });
              this.logger.info(`Added images to request`, {
                count: images.length,
              });
            } else {
              this.logger.warn(
                "No valid images extracted, using text-only prompt",
              );
            }
          }

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
                  role: "system",
                  content:
                    "You are an expert mortgage document analysis AI. Extract all relevant loan, property, borrower, trustee, beneficiary, and related information from the provided document with high accuracy. Do not generate fictitious data; return null for missing information.",
                },
                {
                  role: "user",
                  content,
                },
              ],
              response_format: { type: "json_object" },
              temperature: 0.1,
              max_tokens: 8000, // Increased to avoid truncation
              stream: true,
            },
            responseType: "stream",
            timeout: this.config.timeout,
            validateStatus: (status) => status === 200,
          });

          this.logger.info(`API call initiated`, {
            model,
            duration: Date.now() - startTime,
            promptLength: prompt.length,
            contentItems: content.length,
          });

          const result = await this.processDocumentStream(response);

          if (!result || (!result.documentType && !result.extractedData)) {
            throw new Error("No valid data in response");
          }

          this.logger.info(`Document analyzed successfully`, {
            model,
            documentType: result.documentType,
          });
          return result;
        } catch (error) {
          lastError = error as Error;
          const axiosError = error as AxiosError;

          this.logger.error(`Analysis attempt failed`, {
            model,
            retry: retryCount + 1,
            error: lastError.message,
          });

          if (axiosError.response?.status === 429) {
            const delay =
              this.config.initialRetryDelay * Math.pow(2, retryCount);
            this.logger.warn(`Rate limited, retrying after ${delay}ms`, {
              model,
              retry: retryCount + 1,
            });
            await promiseSetTimeout(delay);
            continue;
          }

          if (
            axiosError.response?.status === 400 ||
            axiosError.response?.status === 404
          ) {
            this.logger.warn(`Model ${model} not available, trying next model`);
            break;
          }

          if (axiosError.code === "ECONNABORTED") {
            this.logger.warn(
              `Timeout for ${model} attempt ${retryCount + 1}. Retrying in ${delay}ms`,
            );
            const delay =
              this.config.initialRetryDelay * Math.pow(2, retryCount);
            await promiseSetTimeout(delay);
            continue;
          }

          if (retryCount === this.config.maxRetries - 1) {
            this.logger.warn(
              `Retries exhausted for ${model}, trying next model`,
            );
            break;
          }

          const delay = this.config.initialRetryDelay * Math.pow(2, retryCount);
          await promiseSetTimeout(delay);
        }
      }
    }

    this.logger.error("All models failed", { lastError: lastError?.message });
    throw new Error(lastError?.message || "All model attempts failed");
  }

  private async processDocumentStream(
    response: any,
  ): Promise<DocumentAnalysisResult> {
    let jsonContent = "";
    let buffer = "";
    let hasData = false;
    let chunkCount = 0;

    return new Promise((resolve, reject) => {
      const timeoutId = nodeSetTimeout(() => {
        if (!hasData) {
          this.logger.error(
            "No data received within 20 seconds, treating as failure",
          );
          reject(new Error("No data received from API within timeout"));
        }
      }, 20000);

      response.data.on("data", (chunk: Buffer) => {
        if (!hasData) clearTimeout(timeoutId);
        hasData = true;
        chunkCount++;

        const chunkStr = chunk.toString();
        buffer += chunkStr;

        if (chunkStr.trim()) hasData = true;
        this.logger.info(`Received chunk`, {
          length: chunkStr.length,
          chunkCount,
        });

        if (
          jsonContent.length + chunkStr.length >
          this.config.maxJsonContentSize
        ) {
          this.logger.error("JSON content size exceeds maximum limit", {
            currentSize: jsonContent.length,
            maxSize: this.config.maxJsonContentSize,
          });
          reject(new Error("JSON content size exceeds maximum limit"));
          return;
        }

        // Process complete SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              this.logger.info(
                `Stream completed. JSON content length: ${jsonContent.length}`,
              );
              if (!jsonContent || jsonContent.length === 0) {
                this.logger.error("Empty response received from API");
                reject(new Error("Empty response from API"));
                return;
              }

              try {
                const cleanContent = jsonContent.replace(
                  /data: \[DONE\]\s*$/,
                  "",
                );
                const result = JSON.parse(cleanContent);
                if (result && (result.documentType || result.extractedData)) {
                  this.logger.info("Stream processing completed", {
                    resultLength: cleanContent.length,
                  });
                  resolve(result);
                } else {
                  this.logger.error(
                    "Response lacks valid document analysis data",
                    {
                      contentSnippet: cleanContent.substring(0, 200),
                    },
                  );
                  reject(new Error("Invalid response format"));
                }
                return;
              } catch (e) {
                this.logger.error("JSON parse error in stream", {
                  error: e.message,
                  contentSnippet: jsonContent.substring(
                    Math.max(0, jsonContent.length - 200),
                  ),
                });
                this.extractResultFromPartialJSON(jsonContent, resolve, reject);
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
              this.logger.warn("Non-JSON data in stream", {
                data: data.substring(0, 100),
              });
            }
          }
        }
      });

      response.data.on("end", () => {
        clearTimeout(timeoutId);
        if (!hasData || !jsonContent) {
          this.logger.error("Stream ended with no meaningful data");
          reject(new Error("No data received from API"));
          return;
        }

        try {
          const cleanContent = jsonContent.replace(/data: \[DONE\]\s*$/, "");
          const result = JSON.parse(cleanContent);
          if (result && (result.documentType || result.extractedData)) {
            this.logger.info("Stream completed", {
              resultLength: cleanContent.length,
            });
            resolve(result);
          } else {
            this.logger.error(
              "Final response lacks valid document analysis data",
              {
                contentSnippet: cleanContent.substring(0, 200),
              },
            );
            reject(new Error("Invalid response format"));
          }
        } catch (e) {
          this.logger.error("Final JSON parse error", {
            error: e.message,
            contentSnippet: jsonContent.substring(
              Math.max(0, jsonContent.length - 200),
            ),
          });
          this.extractResultFromPartialJSON(jsonContent, resolve, reject);
        }
      });

      response.data.on("error", (error: Error) => {
        clearTimeout(timeoutId);
        this.logger.error("Stream error", { error: error.message });
        reject(new Error(`Stream error: ${error.message}`));
      });
    });
  }

  private extractResultFromPartialJSON(
    content: string,
    resolve: (value: DocumentAnalysisResult) => void,
    reject: (reason: any) => void,
  ): void {
    if (!content.trim()) {
      this.logger.warn("No content to parse in partial JSON");
      reject(new Error("No content to parse in partial JSON"));
      return;
    }
    try {
      const jsonStart = content.indexOf("{");
      const jsonEnd = content.lastIndexOf("}");
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        const jsonStr = content.substring(jsonStart, jsonEnd + 1);
        const result = JSON.parse(jsonStr);
        if (result && (result.documentType || result.extractedData)) {
          this.logger.info("Recovered result from partial JSON", {
            resultLength: jsonStr.length,
          });
          resolve(result);
        } else {
          this.logger.error("Partial JSON lacks valid document analysis data", {
            contentSnippet: jsonStr.substring(0, 200),
          });
          reject(new Error("Invalid partial JSON format"));
        }
      } else {
        this.logger.error("No valid JSON structure in partial content", {
          contentSnippet: content.substring(0, 200),
        });
        reject(new Error("No valid JSON structure in partial content"));
      }
    } catch (e) {
      this.logger.error("Failed to extract result from partial JSON", {
        error: e.message,
        contentSnippet: content.substring(0, 200),
      });
      reject(new Error(`Failed to parse partial JSON: ${e.message}`));
    }
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
