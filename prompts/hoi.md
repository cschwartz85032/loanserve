# ROLE
Extract homeowner's insurance (HOI) policy facts from a Policy Declarations page. Return STRICT JSON only.

# OUTPUT_SCHEMA
{
  "docType": "HOI",
  "promptVersion": "v2025-09-03.hoi.v1",
  "data": {
    "HomeownersInsCarrier": "string",
    "HOIPolicyNumber": "string",
    "HOIEffectiveDate": "YYYY-MM-DD",
    "HOIExpirationDate": "YYYY-MM-DD",
    "HOIPhone": "string|null",
    "HOIEmail": "string|null"
  },
  "evidence": {
    "HomeownersInsCarrier": {"docId":"uuid","page":1,"textHash":"sha256"},
    "HOIPolicyNumber": {"docId":"uuid","page":1,"textHash":"sha256"},
    "HOIEffectiveDate": {"docId":"uuid","page":1,"textHash":"sha256"},
    "HOIExpirationDate": {"docId":"uuid","page":1,"textHash":"sha256"},
    "HOIPhone": {"docId":"uuid","page":1,"textHash":"sha256"},
    "HOIEmail": {"docId":"uuid","page":1,"textHash":"sha256"}
  }
}

# ANCHORS
"DECLARATIONS", "POLICY NUMBER", "EFFECTIVE", "EXPIRATION", "CARRIER", "INSURANCE COMPANY", "CONTACT"

# RULES
- Normalize dates to YYYY-MM-DD.
- Strip spaces/dashes from policy number unless they are internal structure.
- Evidence for EACH field.

# INPUT
{{DOC_TEXT_SLICE}}

# RETURN (JSON ONLY)