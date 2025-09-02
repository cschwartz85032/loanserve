import fs from "fs";
import path from "path";
import { getProvider } from "./llm";
import { validateLLMResponse } from "../utils/ajv-validator";

type AiItem = {
  key: string;
  value: any;
  confidence: number;
  source: "ai_doc";
  prompt_version: string;
  // evidence attachment left to worker from returned payload
};

function loadPrompt(docType: string): string {
  const p = path.resolve(process.cwd(), `prompts/${docType.toLowerCase()}.md`);
  return fs.readFileSync(p, "utf-8");
}

/** Produce a single prompt by injecting the slice into the md template. */
function renderPrompt(docType: string, slice: string): string {
  const base = loadPrompt(docType);
  return base.replace("{{DOC_TEXT_SLICE}}", slice);
}

/** Light confidence heuristic from evidence richness (bbox/snippet) + key presence. */
function computeConfidence(validJson: any): number {
  // Baseline
  let conf = 0.80;
  const ev = validJson?.evidence || {};
  const keys = Object.keys(validJson?.data || {});
  let enriched = 0;
  for (const k of keys) {
    const e = ev[k];
    if (e && e.textHash) enriched += 1;
    if (e && e.bbox) enriched += 0.5;
  }
  conf += Math.min(0.15, enriched * 0.01); // +1% per evidence, max +15%
  return Math.max(0.60, Math.min(0.95, conf));
}

/**
 * Run AI on a docType + list of text slices.
 * - We call the LLM per slice until we obtain a valid JSON that passes schema.
 * - We pick the first valid result (you can extend to multi-slice merge later).
 */
export async function runPromptPackOnSlices(docType: string, slices: {slice:string, idx:number}[]): Promise<AiItem[] | null> {
  const provider = getProvider();
  for (const s of slices) {
    const prompt = renderPrompt(docType, s.slice);
    const out = await provider.generate({
      prompt,
      model: process.env.LLM_MODEL,
      temperature: Number(process.env.AI_TEMPERATURE || "0"),
      maxTokens: Number(process.env.AI_MAX_TOKENS || "2000"),
      timeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS || "60000")
    });

    let parsed: any = null;
    try {
      parsed = JSON.parse(out.text);
    } catch {
      continue; // try next slice
    }

    try {
      const validation = validateLLMResponse(out.text, docType);
      if (!validation.success) {
        console.warn(`[PromptRunner] Validation failed for ${docType}:`, validation.error);
        continue;
      }
      parsed = validation.data;
    } catch {
      continue; // try next slice
    }

    const keys = Object.keys(parsed.data || {});
    const conf = computeConfidence(parsed);
    const items: AiItem[] = keys.map(k => ({
      key: k,
      value: parsed.data[k],
      confidence: conf,
      source: "ai_doc",
      prompt_version: parsed.promptVersion || null
    }));

    // Attach evidence docId/page/hash at worker level from parsed.evidence
    // (we return the parsed object as symbol so worker can keep it)
    (items as any).__rawPromptOutput = parsed;
    return items;
  }
  return null;
}