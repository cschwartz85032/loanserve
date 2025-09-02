export async function summarizeDiscrepancies(input: {
  openDefects: Array<{ code: string; name: string; severity: string; message: string }>;
  conflicts: Array<{ key: string; candidates: any[] }>;
}): Promise<string> {
  const provider = (process.env.DR_AI_PROVIDER || "mock").toLowerCase();
  if (provider === "openai") {
    return openAiSummary(input);
  }
  // mock: simple bullet list
  const lines = [
    `Open defects: ${input.openDefects.length}`,
    `Unresolved conflicts: ${input.conflicts.length}`,
    ...input.openDefects.slice(0, 10).map(d => `• [${d.severity}] ${d.code}: ${d.name}`),
    ...input.conflicts.slice(0, 10).map(c => `• Conflict on ${c.key}`)
  ];
  return lines.join("\n");
}

// Optional OpenAI path
async function openAiSummary(input: any): Promise<string> {
  const key = process.env.OPENAI_API_KEY!;
  const mdl = process.env.DR_AI_MODEL || "gpt-4o-mini";
  const prompt = `Summarize these QC issues and conflicts for an investor-facing discrepancy report. Be concise and actionable.\n` +
                 `Defects: ${JSON.stringify(input.openDefects).slice(0, 5000)}\n` +
                 `Conflicts: ${JSON.stringify(input.conflicts).slice(0, 5000)}\n`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: mdl,
      temperature: 0,
      max_tokens: Number(process.env.DR_SUMMARY_MAX_TOKENS || 800),
      messages: [
        { role: "system", content: "You are a precise summarizer." },
        { role: "user", content: prompt }
      ]
    })
  });
  if (!res.ok) throw new Error(`OpenAI DR summary error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() || "(summary unavailable)";
}