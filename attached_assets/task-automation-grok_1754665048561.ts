import { db } from "./db";
import { tasks, taskRules, counterparties } from "@shared/counterparty-schema";
import { entities, ownerships } from "@shared/entity-schema";
import { eq } from "drizzle-orm";
import { counterpartyStorage } from "./counterparty-storage";
import OpenAI from "openai";
import axios, { AxiosError } from "axios";
import JSONStream from "jsonstream";
import { setTimeout } from "timers/promises";
import pino from "pino";

/**
 * Task automation using Grok with streaming for comprehensive task generation
 */
export class GrokTaskAutomationService {
  private grok: OpenAI;
  private logger = pino();
  private rulesCache: Record<string, any[]> = {};

  constructor() {
    if (!process.env.XAI_API_KEY || process.env.XAI_API_KEY.trim() === "") {
      throw new Error("XAI_API_KEY is missing or invalid");
    }
    this.grok = new OpenAI({
      baseURL: "https://api.x.ai/v1",
      apiKey: process.env.XAI_API_KEY,
      timeout: 180000,
    });
  }

  private async validateApiKeyAndModel(model: string): Promise<boolean> {
    try {
      const response = await axios({
        url: "https://api.x.ai/v1/models",
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.XAI_API_KEY}`,
        },
        timeout: 5000,
      });
      const availableModels = response.data.models || [];
      this.logger.info("Available models:", availableModels);
      if (!availableModels.includes(model)) {
        this.logger.warn(
          `Model ${model} not available. Available models:`,
          availableModels,
        );
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error("Failed to validate API key or model:", error.message);
      return false;
    }
  }

  private async getOwnershipTree(mainEntityId: number): Promise<any> {
    try {
      const [mainEntity] = await db
        .select()
        .from(entities)
        .where(eq(entities.entityId, mainEntityId));

      if (!mainEntity)
        return {
          mainEntity: { name: "Unknown", entityType: "Unknown" },
          owners: [],
        };

      const getEntityOwners = async (entityId: number): Promise<any[]> => {
        const entityOwnerships = await db
          .select({
            ownershipId: ownerships.ownershipId,
            ownershipPercentage: ownerships.ownershipPercentage,
            ownershipType: ownerships.ownershipType,
            ownerEntity: entities,
          })
          .from(ownerships)
          .innerJoin(entities, eq(ownerships.ownerEntityId, entities.entityId))
          .where(eq(ownerships.ownedEntityId, entityId));

        const ownersWithSubOwners = await Promise.all(
          entityOwnerships.map(async (owner) => ({
            ...owner,
            subOwners: await getEntityOwners(owner.ownerEntity.entityId),
          })),
        );

        return ownersWithSubOwners;
      };

      const owners = await getEntityOwners(mainEntityId);

      return {
        mainEntity,
        owners,
      };
    } catch (error) {
      this.logger.error("Error fetching ownership tree:", error);
      return {
        mainEntity: { name: "Unknown", entityType: "Unknown" },
        owners: [],
      };
    }
  }

  private formatOwnershipTree(tree: any, indent: string = ""): string {
    if (!tree) return "No ownership structure available";

    let result = `\nMain Entity: ${tree.mainEntity.name} (${tree.mainEntity.entityType}) [Entity ID: ${tree.mainEntity.entityId}]`;
    if (tree.mainEntity.taxId) result += `\n- Tax ID: [REDACTED]`;
    if (tree.mainEntity.registrationNumber)
      result += `\n- Registration: ${tree.mainEntity.registrationNumber}`;
    if (tree.mainEntity.goldHoldings)
      result += `\n- Gold Holdings: ${tree.mainEntity.goldHoldings} oz`;

    const formatOwners = (owners: any[], level: number = 1): string => {
      let output = "";
      owners.forEach((owner, index) => {
        const prefix = " ".repeat(level);
        output += `\n${prefix}Owner ${index + 1}: ${owner.ownerEntity.name} (${owner.ownerEntity.entityType}) [Entity ID: ${owner.ownerEntity.entityId}]`;
        output += `\n${prefix}- Ownership: ${owner.ownershipPercentage}%`;
        output += `\n${prefix}- Type: ${owner.ownershipType || "Direct"}`;

        if (owner.ownerEntity.taxId) {
          output += `\n${prefix}- Tax ID: [REDACTED]`;
        }
        if (owner.ownerEntity.ssn) {
          output += `\n${prefix}- SSN: Provided`;
        }
        if (owner.ownerEntity.dateOfBirth) {
          output += `\n${prefix}- DOB: ${owner.ownerEntity.dateOfBirth}`;
        }
        if (owner.ownerEntity.address) {
          output += `\n${prefix}- Address: ${owner.ownerEntity.address}`;
        }
        if (owner.ownerEntity.phone) {
          output += `\n${prefix}- Phone: ${owner.ownerEntity.phone}`;
        }
        if (owner.ownerEntity.email) {
          output += `\n${prefix}- Email: ${owner.ownerEntity.email}`;
        }
        if (owner.ownerEntity.goldHoldings) {
          output += `\n${prefix}- Gold Holdings: ${owner.ownerEntity.goldHoldings} oz`;
        }

        if (owner.subOwners && owner.subOwners.length > 0) {
          output += `\n${prefix}Sub-owners of ${owner.ownerEntity.name}:`;
          output += formatOwners(owner.subOwners, level + 1);
        }
      });
      return output;
    };

    if (tree.owners && tree.owners.length > 0) {
      result += "\n\nOwnership Hierarchy:";
      result += formatOwners(tree.owners);
    } else {
      result += "\n\nNo owners recorded";
    }

    return result;
  }

  async generateTasksWithAllRules(counterpartyId: number): Promise<string[]> {
    this.logger.info({ counterpartyId }, "Starting Grok task generation");
    if (!counterpartyId || isNaN(counterpartyId)) {
      this.logger.error("Invalid counterpartyId");
      return [];
    }

    try {
      const [counterparty, allRules, existingTasks] = await Promise.all([
        counterpartyStorage.getCounterparty(counterpartyId),
        this.getCachedRules(),
        db.select().from(tasks).where(eq(tasks.counterpartyId, counterpartyId)),
      ]);

      if (!counterparty) {
        this.logger.error(`Counterparty ${counterpartyId} not found`);
        return [];
      }

      let ownershipTree = null;
      if (counterparty.mainEntityId) {
        try {
          ownershipTree = await this.getOwnershipTree(
            counterparty.mainEntityId,
          );
        } catch (error) {
          this.logger.error("Failed to fetch ownership tree:", error);
        }
      }

      this.logger.info(`Processing ${allRules.length} rules with Grok`);

      const rulesByType = this.groupRulesByType(allRules);
      this.logger.info(
        "Rule batches:",
        Object.keys(rulesByType).map((type) => ({
          type,
          count: rulesByType[type].length,
        })),
      );
      const allGeneratedTasks: any[] = [];

      for (const [type, typeRules] of Object.entries(rulesByType)) {
        const prompt = this.buildComprehensivePrompt(
          counterparty,
          typeRules,
          existingTasks,
          ownershipTree,
        );
        const tasks = await this.generateTasksWithStreaming(prompt);
        allGeneratedTasks.push(...tasks);
      }

      this.logger.info(`Total generated ${allGeneratedTasks.length} tasks`);

      const validTaskList = allGeneratedTasks.filter((task: any) => {
        if (!task.title || !task.description) {
          this.logger.warn(
            "Skipping task with missing title or description:",
            task,
          );
          return false;
        }
        return true;
      });

      const createdTasks = await this.insertTasks(
        validTaskList,
        counterpartyId,
      );

      return createdTasks;
    } catch (error) {
      this.logger.error("Grok task generation failed:", error);
      return [];
    }
  }

  async generateTasksWithAllRulesAndProgress(
    counterpartyId: number,
    progressCallback?: (update: any) => void,
  ): Promise<string[]> {
    this.logger.info(
      { counterpartyId },
      "Starting Grok task generation with progress",
    );
    if (!counterpartyId || isNaN(counterpartyId)) {
      this.logger.error("Invalid counterpartyId");
      return [];
    }

    try {
      progressCallback?.({
        type: "status",
        message: "Loading counterparty data...",
      });
      const [counterparty, allRules, existingTasks] = await Promise.all([
        counterpartyStorage.getCounterparty(counterpartyId),
        this.getCachedRules(),
        db.select().from(tasks).where(eq(tasks.counterpartyId, counterpartyId)),
      ]);

      if (!counterparty) {
        this.logger.error(`Counterparty ${counterpartyId} not found`);
        return [];
      }

      progressCallback?.({
        type: "status",
        message: "Loading ownership structure...",
      });
      let ownershipTree = null;
      if (counterparty.mainEntityId) {
        try {
          ownershipTree = await this.getOwnershipTree(
            counterparty.mainEntityId,
          );
        } catch (error) {
          this.logger.error("Failed to fetch ownership tree:", error);
        }
      }

      progressCallback?.({
        type: "status",
        message: `Found ${allRules.length} active rules`,
      });
      progressCallback?.({
        type: "status",
        message: `Found ${existingTasks.length} existing tasks`,
      });

      const rulesByType = this.groupRulesByType(allRules);
      this.logger.info(
        "Rule batches:",
        Object.keys(rulesByType).map((type) => ({
          type,
          count: rulesByType[type].length,
        })),
      );
      const allGeneratedTasks: any[] = [];

      for (const [type, typeRules] of Object.entries(rulesByType)) {
        progressCallback?.({
          type: "status",
          message: `Processing ${type} rules (${typeRules.length})...`,
        });
        const prompt = this.buildComprehensivePrompt(
          counterparty,
          typeRules,
          existingTasks,
          ownershipTree,
        );
        const tasks = await this.generateTasksWithStreaming(
          prompt,
          progressCallback,
        );
        allGeneratedTasks.push(...tasks);
      }

      this.logger.info(`Total generated ${allGeneratedTasks.length} tasks`);

      const validTaskList = allGeneratedTasks.filter((task: any) => {
        if (!task.title || !task.description) {
          this.logger.warn(
            "Skipping task with missing title or description:",
            task,
          );
          return false;
        }
        return true;
      });

      progressCallback?.({
        type: "status",
        message: "Saving tasks to database...",
      });
      const createdTasks = await this.insertTasksWithProgress(
        validTaskList,
        counterpartyId,
        progressCallback,
      );

      return createdTasks;
    } catch (error) {
      this.logger.error("Grok task generation failed:", error);
      return [];
    }
  }

  private buildComprehensivePrompt(
    counterparty: any,
    rules: any[],
    existingTasks: any[],
    ownershipTree?: any,
  ): string {
    const compactCounterparty = {
      id: counterparty.id,
      name: counterparty.name || "Not provided",
      type: counterparty.type || "Not provided",
      taxId: counterparty.taxId ? "[REDACTED]" : "Not provided",
      address: counterparty.address?.street
        ? {
            street: counterparty.address.street,
            city: counterparty.address.city,
            state: counterparty.address.state,
            zip: counterparty.address.zip,
            country: counterparty.address.country || "USA",
          }
        : "Not provided",
      requestedCreditLimit: counterparty.requestedCreditLimit || 0,
      riskLevel: counterparty.riskLevel || "medium",
    };

    const rulesSummary = rules
      .map(
        (r, i) => `${i + 1}. ${r.name}: ${r.description.substring(0, 50)}...`,
      )
      .join("\n");

    const prompt = `Analyze this counterparty and generate tasks based on provided rules.
                  === COUNTERPARTY DATA ===
                  ${JSON.stringify(compactCounterparty, null, 2)}
                  === RULES ===
                  ${rulesSummary}
                  === EXISTING TASKS ===
                  ${existingTasks.length > 0 ? existingTasks.map((t) => `- ${t.title}`).join("\n") : "None"}
                  === OWNERSHIP ===
                  ${ownershipTree ? this.formatOwnershipTree(ownershipTree) : "No ownership information"}
                  Return a JSON object with tasks: { "tasks": [{ "title": string, "description": string, "entityId": number (the Entity ID from ownership tree), "priority": "high|medium|low", "assignedRole": string, "ruleReferences": string[], "estimatedHours": number }] }
                  IMPORTANT: Include entityId for each task matching the Entity ID shown in brackets above.`;

    this.logger.info(
      "Generated prompt (sanitized):",
      prompt.replace(/taxId: \w+/g, "taxId: [REDACTED]"),
    );
    return prompt;
  }

  private groupRulesByType(rules: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    for (const rule of rules) {
      const type = rule.type || "general";
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(rule);
    }

    return grouped;
  }

  private async getCachedRules(): Promise<any[]> {
    if (!this.rulesCache["active"]) {
      this.rulesCache["active"] = await db
        .select()
        .from(taskRules)
        .where(eq(taskRules.isActive, true));
    }
    return this.rulesCache["active"];
  }

  private async insertTasks(
    taskList: any[],
    counterpartyId: number,
  ): Promise<string[]> {
    const createdTasks: string[] = [];
    const batchSize = 50;
    const maxRetries = 3;

    for (let i = 0; i < taskList.length; i += batchSize) {
      const batch = taskList.slice(i, i + batchSize);
      let retries = 0;
      while (retries < maxRetries) {
        try {
          await db.insert(tasks).values(
            batch.map((task) => ({
              counterpartyId,
              entityId: task.entityId || null,
              taskType: "ai_generated" as const,
              title: task.title,
              description: `${task.description}\n\nRule References: ${task.ruleReferences?.join(", ") || "General"}`,
              priority: (task.priority || "medium").toLowerCase() as
                | "high"
                | "medium"
                | "low",
              status: "pending" as const,
              assignedTo: "Unassigned",
              assignedBy: "Grok AI",
              assignedRole: task.assignedRole || "analyst",
              dueDate: this.calculateDueDate(
                task.priority,
                task.estimatedHours,
              ),
            })),
          );
          createdTasks.push(...batch.map((task) => task.title));
          break;
        } catch (error) {
          if (retries === maxRetries - 1) {
            this.logger.error(
              `Failed to insert task batch after ${maxRetries} retries:`,
              error,
            );
            throw error;
          }
          retries++;
          await setTimeout(1000 * retries);
        }
      }
    }

    this.logger.info(`Successfully created ${createdTasks.length} tasks`);
    return createdTasks;
  }

  private async insertTasksWithProgress(
    taskList: any[],
    counterpartyId: number,
    progressCallback?: (update: any) => void,
  ): Promise<string[]> {
    const createdTasks: string[] = [];
    const batchSize = 50;
    const maxRetries = 3;

    for (let i = 0; i < taskList.length; i += batchSize) {
      const batch = taskList.slice(i, i + batchSize);
      let retries = 0;
      while (retries < maxRetries) {
        try {
          await db.insert(tasks).values(
            batch.map((task) => ({
              counterpartyId,
              entityId: task.entityId || null,
              taskType: "ai_generated" as const,
              title: task.title,
              description: `${task.description}\n\nRule References: ${task.ruleReferences?.join(", ") || "General"}`,
              priority: (task.priority || "medium").toLowerCase() as
                | "high"
                | "medium"
                | "low",
              status: "pending" as const,
              assignedTo: "Unassigned",
              assignedBy: "Grok AI",
              assignedRole: task.assignedRole || "analyst",
              dueDate: this.calculateDueDate(
                task.priority,
                task.estimatedHours,
              ),
            })),
          );
          createdTasks.push(...batch.map((task) => task.title));
          batch.forEach((task, index) => {
            progressCallback?.({
              type: "task_created",
              taskNumber: i + index + 1,
              totalTasks: taskList.length,
              taskTitle: task.title,
            });
          });
          break;
        } catch (error) {
          if (retries === maxRetries - 1) {
            this.logger.error(
              `Failed to insert task batch after ${maxRetries} retries:`,
              error,
            );
            throw error;
          }
          retries++;
          await setTimeout(1000 * retries);
        }
      }
    }

    this.logger.info(`Successfully created ${createdTasks.length} tasks`);
    return createdTasks;
  }

  private calculateDueDate(priority: string, estimatedHours: number = 8): Date {
    const baseDays = {
      high: 2,
      medium: 5,
      low: 10,
    };

    const days = Math.max(
      baseDays[priority as keyof typeof baseDays] || 5,
      Math.ceil(estimatedHours / 8),
    );
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private async generateTasksWithStreaming(
    prompt: string,
    progressCallback?: (update: any) => void
  ): Promise<any[]> {
    const modelsToTry = ["grok-4-0709", "grok-3", "grok-2-1212"];
    let lastError: any = null;

    for (const model of modelsToTry) {
      this.logger.info(`Attempting to use model: ${model}`);
      const maxRetries = 3; // Reduced from 5 to minimize delays
      let retryCount = 0;
      let delay = 500; // Reduced from 1000ms for faster retries

      while (retryCount < maxRetries) {
        try {
          // Skip validation and let the API call fail if model doesn't exist
          // This allows us to try the next model in the fallback chain
          const startTime = Date.now();
          const response = await axios({
            url: "https://api.x.ai/v1/chat/completions",
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.XAI_API_KEY}`,
            },
            data: {
              model: model,
              messages: [
                {
                  role: "system",
                  content: "You are an expert counterparty risk management AI. Generate comprehensive, specific tasks based on ALL provided rules.",
                },
                { role: "user", content: prompt },
              ],
              response_format: { type: "json_object" },
              temperature: 0.5, // Reduced for more consistent output
              max_tokens: 4000, // Lowered to align with successful grok-3 responses
              stream: true,
              // Removed cache_prompt - may not be supported by all models
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
          
          const tasks = await this.processStream(response, progressCallback);
          
          // Validate we got actual tasks
          if (!tasks || tasks.length === 0) {
            this.logger.warn(`No tasks generated with ${model}, treating as failure`);
            throw new Error('No tasks in response');
          }
          
          this.logger.info(`Successfully generated ${tasks.length} tasks with ${model}`);
          return tasks;
          
        } catch (error) {
          lastError = error;
          const axiosError = error as AxiosError;
          const errorMessage = (error as Error).message;
          
          // Handle empty response or no tasks - try next model immediately
          if (errorMessage === 'Empty response from API' || 
              errorMessage === 'No data received from API' ||
              errorMessage === 'No data received from API within timeout' ||
              errorMessage === 'No tasks in response' || 
              errorMessage === 'Invalid response format - no tasks array' ||
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
              break; // Exit retry loop for this model, try next model
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

  private async processStream(
    response: any,
    progressCallback?: (update: any) => void,
  ): Promise<any[]> {
    const allTasks: any[] = [];
    let buffer = '';
    let jsonContent = '';
    let hasData = false; // Track if meaningful data received

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
        
        this.logger.debug(`Received chunk: length=${chunkStr.length}, preview=${chunkStr.substring(0, 100)}${chunkStr.length > 100 ? '...' : ''}`);
        
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
              
              this.logger.debug(`First 500 chars of content: ${jsonContent.substring(0, 500)}`);
              
              try {
                const result = JSON.parse(jsonContent);
                if (result.tasks && Array.isArray(result.tasks)) {
                  this.logger.info(`Parsed ${result.tasks.length} tasks from response`);
                  result.tasks.forEach((task: any) => {
                    if (task.title && task.description) {
                      allTasks.push(task);
                      progressCallback?.({
                        type: "task_received",
                        taskCount: allTasks.length,
                        taskTitle: task.title,
                      });
                    }
                  });
                  
                  if (allTasks.length === 0) {
                    this.logger.error('No valid tasks in response');
                    reject(new Error('No tasks in response'));
                    return;
                  }
                } else {
                  this.logger.error('Response does not contain tasks array:', Object.keys(result));
                  reject(new Error('Invalid response format - no tasks array'));
                  return;
                }
              } catch (e: any) {
                this.logger.error('Failed to parse JSON:', e.message);
                this.logger.debug('Content that failed to parse:', jsonContent.substring(0, 1000));
                reject(new Error(`JSON parse error: ${e.message}`));
                return;
              }
              
              resolve(allTasks);
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              
              if (content) {
                jsonContent += content;
                
                // Periodic progress update
                if (jsonContent.length % 1000 === 0) {
                  progressCallback?.({ 
                    type: 'streaming', 
                    message: `Receiving data: ${Math.floor(jsonContent.length / 1000)}k characters...` 
                  });
                }
              }
            } catch (e) {
              // Not JSON, might be an error message
              this.logger.debug('Non-JSON data in stream:', data);
            }
          }
        }
      });

      response.data.on("end", () => {
        clearTimeout(timeoutId); // Clear timeout when stream ends
        
        if (!hasData || (!jsonContent && allTasks.length === 0)) {
          this.logger.error('Stream ended with no meaningful data');
          reject(new Error('No data received from API'));
          return;
        }
        
        // Try to parse even if [DONE] wasn't received
        if (jsonContent && allTasks.length === 0) {
          try {
            const result = JSON.parse(jsonContent);
            if (result.tasks && Array.isArray(result.tasks)) {
              result.tasks.forEach((task: any) => {
                if (task.title && task.description) {
                  allTasks.push(task);
                }
              });
            }
          } catch (e: any) {
            this.logger.error('Failed to parse final content:', e.message);
            this.extractTasksFromPartialJSON(jsonContent, allTasks);
          }
        }
        
        if (allTasks.length === 0) {
          this.logger.error('No tasks generated');
          reject(new Error('No tasks in response'));
          return;
        }
        
        this.logger.info(`Total generated ${allTasks.length} tasks`);
        resolve(allTasks);
      });

      response.data.on("error", (error: any) => {
        clearTimeout(timeoutId); // Clear timeout on error
        this.logger.error("Stream error:", error.message);
        reject(error);
      });
    });
  }

  private extractTasksFromPartialJSON(content: string, allTasks: any[]): void {
    if (!content.trim()) {
      this.logger.warn("No content to parse in partial JSON");
      return;
    }
    try {
      const tasksStart = content.indexOf('"tasks":[');
      if (tasksStart >= 0) {
        const tasksContent = "{" + content.substring(tasksStart);
        const parsed = JSON.parse(tasksContent);
        if (parsed.tasks && Array.isArray(parsed.tasks)) {
          const validTasks = parsed.tasks.filter(
            (task: any) => task.title && task.description,
          );
          this.logger.info(
            `Recovered ${validTasks.length} tasks from partial JSON`,
          );
          allTasks.push(...validTasks);
        }
      }
    } catch (e) {
      this.logger.error(
        "Failed to extract tasks from partial JSON:",
        e.message,
      );
      this.logger.debug("Partial content:", content);
    }
  }
}

export default new GrokTaskAutomationService();
