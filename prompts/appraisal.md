# ROLE
Extract appraisal facts. Return STRICT JSON only.

# OUTPUT_SCHEMA
{
  "docType": "APPRAISAL",
  "promptVersion": "v2025-09-03.appraisal.v1",
  "data": {
    "AppraisalDate": "YYYY-MM-DD",
    "AppraisedValue": "number",
    "AppraisalFormType": "string|null"
  },
  "evidence": {
    "AppraisalDate": {"docId":"uuid","page":1,"textHash":"sha256"},
    "AppraisedValue": {"docId":"uuid","page":1,"textHash":"sha256"},
    "AppraisalFormType": {"docId":"uuid","page":1,"textHash":"sha256"}
  }
}

# ANCHORS
"Uniform Residential Appraisal Report", "URAR", "Effective Date of Appraisal", "Appraised Value"

# RULES
- Value in dollars (no commas/symbols). Dates = YYYY-MM-DD.
- Evidence for EACH field.

# INPUT
{{DOC_TEXT_SLICE}}

# RETURN (JSON ONLY)