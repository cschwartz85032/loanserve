export type AllocationInput = {
  pmt_amount: number;
  pmt_date: string;
  installment_no?: number | null;
  // Context for current due amounts
  principal_due: number;
  interest_due: number;
  escrow_due: number;
  fees_due: number;
};

export type AllocationResult = {
  alloc_principal: number;
  alloc_interest: number;
  alloc_escrow: number;
  alloc_fees: number;
  leftover: number;
};

/**
 * Standard waterfall payment allocation
 * Order: Interest -> Escrow -> Fees -> Principal -> Leftover
 */
export function allocateStandard(inp: AllocationInput): AllocationResult {
  let rem = round2(inp.pmt_amount);
  const out = { 
    alloc_principal: 0, 
    alloc_interest: 0, 
    alloc_escrow: 0, 
    alloc_fees: 0, 
    leftover: 0 
  };

  // 1) Interest first
  const ai = Math.min(rem, inp.interest_due); 
  rem = round2(rem - ai); 
  out.alloc_interest = ai;

  // 2) Escrow second
  const ae = Math.min(rem, inp.escrow_due);   
  rem = round2(rem - ae); 
  out.alloc_escrow = ae;

  // 3) Fees third
  const af = Math.min(rem, inp.fees_due);     
  rem = round2(rem - af); 
  out.alloc_fees = af;

  // 4) Principal fourth
  const ap = Math.min(rem, inp.principal_due);
  rem = round2(rem - ap); 
  out.alloc_principal = ap;

  // 5) Any leftover amount
  out.leftover = rem;
  
  return out;
}

/**
 * Alternative allocation for escrow-first scenarios
 */
export function allocateEscrowFirst(inp: AllocationInput): AllocationResult {
  let rem = round2(inp.pmt_amount);
  const out = { 
    alloc_principal: 0, 
    alloc_interest: 0, 
    alloc_escrow: 0, 
    alloc_fees: 0, 
    leftover: 0 
  };

  // 1) Escrow first
  const ae = Math.min(rem, inp.escrow_due);   
  rem = round2(rem - ae); 
  out.alloc_escrow = ae;

  // 2) Interest second
  const ai = Math.min(rem, inp.interest_due); 
  rem = round2(rem - ai); 
  out.alloc_interest = ai;

  // 3) Fees third
  const af = Math.min(rem, inp.fees_due);     
  rem = round2(rem - af); 
  out.alloc_fees = af;

  // 4) Principal fourth
  const ap = Math.min(rem, inp.principal_due);
  rem = round2(rem - ap); 
  out.alloc_principal = ap;

  // 5) Any leftover amount
  out.leftover = rem;
  
  return out;
}

function round2(n: number): number { 
  return Math.round((n + Number.EPSILON) * 100) / 100; 
}