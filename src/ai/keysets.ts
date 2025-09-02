// The authoritative keys we ask the AI to extract per docType.
// Keep this aligned with your prompt packs and Authority Matrix.
//
// You can add more keys anytime; the AI runner will only attempt
// keys not already satisfied by deterministic extraction.

export const DOC_KEYSETS: Record<string, string[]> = {
  NOTE: [
    "NoteAmount","InterestRate","AmortTermMonths",
    "FirstPaymentDate","MaturityDate","LateChargePct","LateChargeGraceDays",
    "BorrowerFullName"
  ],
  CD: [
    "TotalLoanAmount","PAndIAmount","EscrowRequired",
    "TaxEscrowMonthly","InsuranceEscrowMonthly","HOICarrier","HOIPolicyNumber",
    "PropertyAddress"
  ],
  HOI: [
    "HomeownersInsCarrier","HOIPolicyNumber","HOIEffectiveDate","HOIExpirationDate","HOIPhone","HOIEmail"
  ],
  FLOOD: [
    "FloodZone","FloodInsRequired","DeterminationIdentifier"
  ],
  APPRAISAL: [
    "AppraisalDate","AppraisedValue","AppraisalFormType"
  ],
  DEED: [
    // no AI by default for deed; deterministic MIN finder + HITL if needed
  ]
};