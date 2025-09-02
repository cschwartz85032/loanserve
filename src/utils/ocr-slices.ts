import { getText } from "./storage";

/**
 * Return text slices for a doc.
 * Strategy: use pre-reflowed text if available; otherwise read page-text files
 * (you may extend this to page-by-page slicing if you store per-page text).
 */
export async function getDocTextSlices(docId: string, targetChars = Number(process.env.AI_SLICE_TARGET_CHARS || "8000")): Promise<{slice: string, idx: number}[]> {
  // default: load a single text file text/{docId}.txt
  try {
    const text = await getText(docId);
    return chunk(text, targetChars);
  } catch {
    // If not found, fall back to empty; worker will skip AI
    return [];
  }
}

function chunk(s: string, n: number): {slice: string, idx: number}[] {
  if (s.length <= n) return [{ slice: s, idx: 0 }];
  const out: {slice: string, idx: number}[] = [];
  let i = 0, idx = 0;
  while (i < s.length) {
    out.push({ slice: s.slice(i, i + n), idx });
    i += n;
    idx += 1;
  }
  return out;
}