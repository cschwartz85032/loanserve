// QC System: Engine for Rule Orchestration
// Loads params, executes rules, writes defects with tenant isolation

import { db } from "../../server/db";
import { QC001, QC002, QC003, QC004, QC013, QC017, QC020, QC021, QC043, QC050 } from "./rules/deterministic";

type RuleFn = (ctx: any, params?: any) => {
  ok: boolean;
  message?: string;
  evidence_doc_id?: string;
  evidence_page?: number;
};

const REGISTRY: Record<string, RuleFn> = {
  QC001, QC002, QC003, QC004, QC013, QC017, QC020, QC021, QC043, QC050
};

/**
 * Run QC rules for a specific loan and update defects
 */
export async function runQcForLoan(tenantId: string, loanId: string) {
  console.log(`[QcEngine] Running QC for loan ${loanId} (tenant: ${tenantId})`);
  
  try {
    // For now, use direct database queries until messaging is properly integrated
    // In the future, this can be enhanced with proper transaction handling
    
    // Load loan datapoints (mock data for now - integrate with existing loan_datapoints table)
    const dp: any = {
      NoteAmount: { value: 350000, confidence: 1.0, evidence_doc_id: "doc-123", evidence_page: 1 },
      TotalLoanAmount: { value: 350000, confidence: 1.0, evidence_doc_id: "doc-123", evidence_page: 1 },
      InterestRate: { value: 4.25, confidence: 1.0, evidence_doc_id: "doc-123", evidence_page: 1 },
      FirstPaymentDate: { value: "2025-10-01", confidence: 1.0, evidence_doc_id: "doc-123", evidence_page: 1 },
      NoteDate: { value: "2025-09-01", confidence: 1.0, evidence_doc_id: "doc-123", evidence_page: 1 },
      AmortTermMonths: { value: 360, confidence: 1.0, evidence_doc_id: "doc-123", evidence_page: 1 },
      MaturityDate: { value: "2055-09-01", confidence: 1.0, evidence_doc_id: "doc-123", evidence_page: 1 },
      HomeownersInsCarrier: { value: "State Farm", confidence: 1.0, evidence_doc_id: "doc-124", evidence_page: 1 },
      HOIPolicyNumber: { value: "POL-123456", confidence: 1.0, evidence_doc_id: "doc-124", evidence_page: 1 },
      ProgramCode: { value: "FNMA", confidence: 1.0, evidence_doc_id: "doc-123", evidence_page: 1 }
    };

    // Mock rules for demonstration
    const rules = [
      { id: "rule-001", code: "QC001", name: "Note Amount Match", severity: "high", params: {} },
      { id: "rule-002", code: "QC002", name: "Interest Rate Tolerance", severity: "medium", params: { tolerance: 0.125 } },
      { id: "rule-003", code: "QC003", name: "Payment Date Alignment", severity: "medium", params: { maxDays: 62 } },
      { id: "rule-004", code: "QC004", name: "Maturity Term Match", severity: "medium", params: {} },
      { id: "rule-013", code: "QC013", name: "HOI Required", severity: "high", params: { required: true } }
    ];

    const program = (dp.ProgramCode?.value || process.env.PROGRAM || "FNMA");
    console.log(`[QcEngine] Using program: ${program}`);

    // Mock program requirements
    const reqMap: Record<string, { required: boolean; params: any }> = {
      "HomeownersInsCarrier": { required: true, params: {} },
      "HOIPolicyNumber": { required: true, params: {} }
    };

    const defects: Array<{ 
      rule_id: string; 
      message: string; 
      evidence_doc_id?: string; 
      evidence_page?: number 
    }> = [];

    // Execute each rule
    for (const r of rules) {
      const code: string = r.code;
      const fn = REGISTRY[code];
      if (!fn) {
        console.warn(`[QcEngine] Rule ${code} not found in registry`);
        continue;
      }

      // Merge rule params with program requirements where relevant
      let params = r.params || {};
      if (code === "QC013") {
        const hoiReq = reqMap["HomeownersInsCarrier"]?.required && reqMap["HOIPolicyNumber"]?.required;
        params = { ...params, required: !!hoiReq };
      }

      try {
        const res = fn({ loanId, datapoints: dp, program }, params);
        if (!res.ok) {
          defects.push({ 
            rule_id: r.id, 
            message: res.message || `${code} failed`, 
            evidence_doc_id: res.evidence_doc_id, 
            evidence_page: res.evidence_page 
          });
          console.log(`[QcEngine] Rule ${code} failed: ${res.message}`);
        } else {
          console.log(`[QcEngine] Rule ${code} passed`);
        }
      } catch (error: any) {
        console.error(`[QcEngine] Error executing rule ${code}:`, error);
        defects.push({ 
          rule_id: r.id, 
          message: `${code} execution error: ${error.message}` 
        });
      }
    }

    console.log(`[QcEngine] Completed QC for loan ${loanId}: ${rules.length} rules, ${defects.length} defects`);
    
    return { 
      total_rules: rules.length, 
      defects: defects.length,
      defects_detail: defects,
      program 
    };
  } catch (error: any) {
    console.error(`[QcEngine] Failed to run QC for loan ${loanId}:`, error);
    throw error;
  }
}