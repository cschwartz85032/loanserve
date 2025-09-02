import fs from "fs";
import yaml from "js-yaml";
import { create } from "xmlbuilder2";

export type MapperConfig = any;

export function loadMapperConfig(p = "config/mappers.v2025-09-03.yaml"): MapperConfig {
  return yaml.load(fs.readFileSync(p,"utf-8")) as any;
}

// Simple coercions
export function toBool(v:any){ if (v===true||v==="true"||v==="1"||v===1) return "true"; return "false"; }
export function asMoney(v:any){ if (v==null) return ""; return String(v).replace(/[^\d.]/g,""); }
export function asText(v:any){ return v==null ? "" : String(v); }

export function lineageComment(key:string, ev:any){
  const parts = [`canonical:${key}`];
  if (ev?.evidence_doc_id) parts.push(`doc:${ev.evidence_doc_id}`);
  if (ev?.evidence_page!=null) parts.push(`page:${ev.evidence_page}`);
  if (ev?.evidence_text_hash) parts.push(`hash:${ev.evidence_text_hash}`);
  return `LINEAGE ${parts.join(" | ")}`;
}

// minimal XML builder using mapping path "SECTION/Field"
export function buildXml(root:{name:string, ns?:string}, sections:any, data:Record<string,any>, evidence:Record<string,any>) {
  const doc = create({ version:"1.0", encoding:"UTF-8" }).ele(root.name);
  if (root.ns) doc.att("xmlns", root.ns);

  for (const [section, fields] of Object.entries<any>(sections)) {
    const node = doc.ele(section);
    for (const [key, path] of Object.entries<string>(fields)) {
      const val = data[key];
      if (val==null) continue;
      // lineage comment
      node.com(lineageComment(key, evidence[key]));
      const leaf = path.split("/").pop()!;
      node.ele(leaf).txt(String(val));
    }
  }
  return doc.end({ prettyPrint: true });
}