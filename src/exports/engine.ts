import { loadMapperConfig, buildXml, asMoney, asText, toBool } from "./mapperUtil";
import { createHash } from "crypto";

type Canonical = Record<string, any>;
type EvidenceMap = Record<string, { evidence_doc_id?: string, evidence_page?: number, evidence_text_hash?: string }>;

export async function generateExport(opts:{
  tenantId:string,
  loanId:string,
  template:'fannie'|'freddie'|'custom',
  canonical:Canonical,
  evidence: EvidenceMap,
  mapperVersion:string
}): Promise<{ bytes:Uint8Array, sha256:string, mime:string, filename:string }> {
  const cfg = loadMapperConfig();
  const tpl = cfg.templates[opts.template];
  if (!tpl) throw new Error(`Unknown template: ${opts.template}`);

  // Validate required keys exist in canonical
  const req:string[] = tpl.required || [];
  const missing = req.filter(k => opts.canonical[k]==null || opts.canonical[k]==="");
  if (missing.length) throw new Error(`Missing required keys: ${missing.join(", ")}`);

  let bytes:Uint8Array, mime:string, filename:string;

  if (tpl.format === "xml") {
    // Coerce known boolean/money fields before build if needed
    const data = { ...opts.canonical };
    if (data.EscrowRequired!=null) data.EscrowRequired = toBool(data.EscrowRequired);

    const xml = buildXml(tpl.root, tpl.sections, data, opts.evidence);
    bytes = Buffer.from(xml, "utf-8");
    mime = "application/xml";
    filename = `${opts.template.toUpperCase()}_${opts.loanId}.xml`;

  } else if (tpl.format === "csv") {
    const header:string[] = tpl.csv.header;
    const map:Record<string,string> = tpl.csv.mapping;
    const row:string[] = header.map(h => {
      const key = map[h] || h;
      const v = opts.canonical[key];
      return (v==null) ? "" : String(v);
    });
    const csv = header.join(",") + "\n" + row.map(escapeCsv).join(",") + "\n";
    bytes = Buffer.from(csv, "utf-8");
    mime = "text/csv";
    filename = `CUSTOM_${opts.loanId}.csv`;
  } else {
    throw new Error(`Unsupported format: ${tpl.format}`);
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { bytes, sha256, mime, filename };
}

function escapeCsv(s:string){
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
}

// Simple storage utility - in production integrate with your S3 service
export async function saveExport(tenantId:string, loanId:string, filename:string, bytes:Uint8Array){
  // This is a placeholder - in production you would save to actual S3
  // const key = `${process.env.S3_PREFIX || "tenants"}/${tenantId}/loans/${loanId}/${process.env.EXPORT_S3_PREFIX || "exports"}/${filename}`;
  // const uri = await putBytes(key, bytes, undefined);
  // return uri;
  
  // For now, return a mock S3 URI
  const mockUri = `s3://loanserve-exports/${tenantId}/loans/${loanId}/exports/${filename}`;
  console.log(`[Export] Mock save to ${mockUri} (${bytes.length} bytes)`);
  return mockUri;
}