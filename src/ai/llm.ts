type GenArgs = { prompt: string; model?: string; temperature?: number; maxTokens?: number; timeoutMs?: number; };
export type LlmOutput = { text: string };

export interface LlmProvider {
  generate(args: GenArgs): Promise<LlmOutput>;
}

class MockProvider implements LlmProvider {
  async generate({ prompt }: GenArgs): Promise<LlmOutput> {
    // Naive mock that returns a minimally valid JSON skeleton derived from prompt docType.
    // This is ONLY for local/dev. Real provider is below.
    const type = /"docType"\s*:\s*"(NOTE|CD|HOI|FLOOD|APPRAISAL)"/i.exec(prompt)?.[1] || "NOTE";
    const pver = `v${new Date().toISOString().slice(0,10)}.mock.v1`;

    const templates: Record<string,string> = {
      NOTE: JSON.stringify({
        docType: "NOTE", promptVersion: pver,
        data: { NoteAmount: 200000, InterestRate: 7.125, AmortTermMonths: 360, FirstPaymentDate: "2025-10-01", MaturityDate: "2055-10-01", LateChargePct: 5, LateChargeGraceDays: 15, BorrowerFullName: "John Q. Public" },
        evidence: {
          NoteAmount: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          InterestRate: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          AmortTermMonths: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          FirstPaymentDate: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          MaturityDate: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          LateChargePct: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          LateChargeGraceDays: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          BorrowerFullName: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) }
        }
      }),
      CD: JSON.stringify({
        docType: "CD", promptVersion: pver,
        data: { TotalLoanAmount: 200000, PAndIAmount: 1350.22, EscrowRequired: true, TaxEscrowMonthly: 250, InsuranceEscrowMonthly: 120.5, HOICarrier: "Acme Mutual", HOIPolicyNumber: "ABC-123", PropertyAddress: "123 Main St, Phoenix, AZ 85032" },
        evidence: {
          TotalLoanAmount: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          PAndIAmount: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          EscrowRequired: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          TaxEscrowMonthly: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          InsuranceEscrowMonthly: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          HOICarrier: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          HOIPolicyNumber: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          PropertyAddress: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) }
        }
      }),
      HOI: JSON.stringify({
        docType: "HOI", promptVersion: pver,
        data: { HomeownersInsCarrier: "Acme Mutual", HOIPolicyNumber: "ABC-123", HOIEffectiveDate: "2025-09-15", HOIExpirationDate: "2026-09-15", HOIPhone: null, HOIEmail: null },
        evidence: {
          HomeownersInsCarrier: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          HOIPolicyNumber: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          HOIEffectiveDate: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          HOIExpirationDate: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) }
        }
      }),
      FLOOD: JSON.stringify({
        docType: "FLOOD", promptVersion: pver,
        data: { FloodZone: "AE", FloodInsRequired: true, DeterminationIdentifier: "DET-123" },
        evidence: {
          FloodZone: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          FloodInsRequired: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) }
        }
      }),
      APPRAISAL: JSON.stringify({
        docType: "APPRAISAL", promptVersion: pver,
        data: { AppraisalDate: "2025-09-01", AppraisedValue: 450000, AppraisalFormType: "URAR" },
        evidence: {
          AppraisalDate: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) },
          AppraisedValue: { docId: "00000000-0000-0000-0000-000000000000", page: 1, textHash: "0".repeat(64) }
        }
      })
    };
    return { text: templates[type] || templates.NOTE };
  }
}

class OpenAIProvider implements LlmProvider {
  async generate({ prompt, model, temperature, maxTokens, timeoutMs }: GenArgs): Promise<LlmOutput> {
    const apiKey = process.env.OPENAI_API_KEY!;
    const mdl = model || process.env.LLM_MODEL || "gpt-5";
    const controller = new AbortController();
    const tmo = setTimeout(()=>controller.abort(), timeoutMs || Number(process.env.AI_REQUEST_TIMEOUT_MS || "60000"));

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type":"application/json" },
        body: JSON.stringify({
          model: mdl,
          temperature: Number(temperature ?? (process.env.AI_TEMPERATURE || "0")),
          max_tokens: Number(maxTokens ?? (process.env.AI_MAX_TOKENS || "2000")),
          messages: [
            { role: "system", content: "You are a precise data-extraction service. Output STRICT JSON, no commentary." },
            { role: "user", content: prompt }
          ]
        }),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
      const json = await res.json();
      const text = json.choices?.[0]?.message?.content?.trim() || "";
      return { text };
    } finally {
      clearTimeout(tmo);
    }
  }
}

class GrokProvider implements LlmProvider {
  async generate({ prompt, model, temperature, maxTokens, timeoutMs }: GenArgs): Promise<LlmOutput> {
    const apiKey = process.env.XAI_API_KEY!;
    const mdl = model || process.env.LLM_MODEL || "grok-4-0709";
    const controller = new AbortController();
    const tmo = setTimeout(()=>controller.abort(), timeoutMs || Number(process.env.AI_REQUEST_TIMEOUT_MS || "60000"));

    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type":"application/json" },
        body: JSON.stringify({
          model: mdl,
          temperature: Number(temperature ?? (process.env.AI_TEMPERATURE || "0")),
          max_tokens: Number(maxTokens ?? (process.env.AI_MAX_TOKENS || "2000")),
          messages: [
            { role: "system", content: "You are a precise data-extraction service. Output STRICT JSON, no commentary." },
            { role: "user", content: prompt }
          ]
        }),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`Grok error: ${res.status} ${await res.text()}`);
      const json = await res.json();
      const text = json.choices?.[0]?.message?.content?.trim() || "";
      return { text };
    } finally {
      clearTimeout(tmo);
    }
  }
}

export function getProvider(): LlmProvider {
  const p = (process.env.LLM_PROVIDER || "mock").toLowerCase();
  if (p === "openai") return new OpenAIProvider();
  if (p === "grok") return new GrokProvider();
  return new MockProvider();
}