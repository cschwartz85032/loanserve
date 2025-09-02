# ROLE
Extract flood determination facts. Return STRICT JSON only.

# OUTPUT_SCHEMA
{
  "docType": "FLOOD",
  "promptVersion": "v2025-09-03.flood.v1",
  "data": {
    "FloodZone": "string",
    "FloodInsRequired": "boolean",
    "DeterminationIdentifier": "string|null"
  },
  "evidence": {
    "FloodZone": {"docId":"uuid","page":1,"textHash":"sha256"},
    "FloodInsRequired": {"docId":"uuid","page":1,"textHash":"sha256"},
    "DeterminationIdentifier": {"docId":"uuid","page":1,"textHash":"sha256"}
  }
}

# ANCHORS
"FLOOD HAZARD DETERMINATION", "SFHA", "ZONE", "INSURANCE REQUIRED", "DETERMINATION"

# RULES
- Map "IN/OUT OF SFHA" to FloodInsRequired true/false when present.
- Evidence for EACH field.

# INPUT
{{DOC_TEXT_SLICE}}

# RETURN (JSON ONLY)