import { pool } from "../../server/db";

export async function loadCanonicalAndDocs(loanId: number) {
  try {
    // Load basic loan data from loans table using raw SQL
    const loanResult = await pool.query(`SELECT * FROM loans WHERE id = $1`, [loanId]);
    const loan = loanResult.rows[0] || {};
    
    // Load property data if available
    let property = {};
    if (loan.property_id) {
      const propResult = await pool.query(`SELECT * FROM properties WHERE id = $1`, [loan.property_id]);
      property = propResult.rows[0] || {};
    }
    
    // Create canonical data from loan and property
    const canonical = {
      LoanNumber: loan.loan_number,
      BorrowerFullName: loan.borrower_name,
      NoteAmount: loan.original_amount,
      InterestRate: loan.interest_rate,
      AmortTermMonths: loan.amortization_term,
      PropertyStreet: property.street_address || loan.borrower_address,
      PropertyCity: property.city || loan.borrower_city,
      PropertyState: property.state || loan.borrower_state,
      PropertyZip: property.zip_code || loan.borrower_zip,
      ...loan
    };
    
    // For now, mock documents until document system is integrated
    const docs = [];
    
    return { canonical, evidence: {}, docs };
  } catch (error) {
    console.error('[Canonical] Error loading canonical data:', error);
    throw error;
  }
}

export async function loadQcSnapshot(loanId: number) {
  try {
    // Mock QC data for now until QC system is integrated
    const rules = { rowCount: 5, rows: [
      { id: 1, code: 'R001', name: 'Income Verification', severity: 'Warning' },
      { id: 2, code: 'R002', name: 'Property Appraisal', severity: 'Critical' },
      { id: 3, code: 'R003', name: 'Credit Score Check', severity: 'Warning' },
      { id: 4, code: 'R004', name: 'DTI Calculation', severity: 'Major' },
      { id: 5, code: 'R005', name: 'Title Insurance', severity: 'Minor' }
    ]};
    
    const open = { rows: [] };  // No open defects for demo
    const waived = { rows: [] }; // No waived defects for demo
    
    return { rules, open, waived };
  } catch (error) {
    console.error('[QC] Error loading QC snapshot:', error);
    throw error;
  }
}