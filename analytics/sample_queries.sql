-- LoanServe Pro Analytics: Sample SQL Queries for Business Intelligence

-- === PORTFOLIO ANALYSIS ===

-- 1. Portfolio Overview with Geographic Distribution
SELECT 
  dl.property_state,
  COUNT(DISTINCT fs.loan_id) as loan_count,
  SUM(fs.upb) as total_upb,
  AVG(fs.upb) as avg_loan_balance,
  SUM(fs.escrow_balance) as total_escrow,
  COUNT(*) FILTER (WHERE fs.delinquency_bucket != '0+') as delinquent_count,
  ROUND(
    COUNT(*) FILTER (WHERE fs.delinquency_bucket != '0+')::numeric / 
    COUNT(*)::numeric * 100, 2
  ) as delinquency_rate_pct
FROM reporting.fact_servicing fs
JOIN reporting.dim_loan dl ON dl.loan_id = fs.loan_id
WHERE fs.d = (SELECT MAX(d) FROM reporting.fact_servicing)
GROUP BY dl.property_state
ORDER BY total_upb DESC;

-- 2. Loan Program Performance Analysis
SELECT 
  dl.program_code,
  di.investor_name,
  COUNT(DISTINCT fs.loan_id) as loan_count,
  SUM(fs.upb) as total_upb,
  AVG(fs.interest_rate) as avg_interest_rate,
  SUM(ft.alloc_principal) as ytd_principal_collections,
  SUM(ft.alloc_interest) as ytd_interest_collections,
  SUM(ft.alloc_fees) as ytd_fee_collections
FROM reporting.fact_servicing fs
JOIN reporting.dim_loan dl ON dl.loan_id = fs.loan_id
LEFT JOIN reporting.dim_investor di ON di.investor_id = dl.investor_id
LEFT JOIN reporting.fact_txn ft ON ft.loan_id = fs.loan_id 
  AND ft.d >= DATE_TRUNC('year', CURRENT_DATE)
  AND ft.type = 'PAYMENT'
WHERE fs.d = (SELECT MAX(d) FROM reporting.fact_servicing)
GROUP BY dl.program_code, di.investor_name
HAVING COUNT(DISTINCT fs.loan_id) > 0
ORDER BY total_upb DESC;

-- === PAYMENT AND COLLECTIONS ANALYSIS ===

-- 3. Monthly Payment Collections Trend
SELECT 
  dd.y as year,
  dd.m as month,
  dd.month_name,
  COUNT(*) as payment_count,
  SUM(ft.amount) as total_payments,
  SUM(ft.alloc_principal) as principal_collected,
  SUM(ft.alloc_interest) as interest_collected,
  SUM(ft.alloc_escrow) as escrow_collected,
  SUM(ft.alloc_fees) as fees_collected,
  ROUND(AVG(ft.amount), 2) as avg_payment_amount
FROM reporting.fact_txn ft
JOIN reporting.dim_date dd ON dd.d = ft.d
WHERE ft.type = 'PAYMENT'
  AND ft.d >= DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 year'
GROUP BY dd.y, dd.m, dd.month_name
ORDER BY dd.y DESC, dd.m DESC;

-- 4. Payment Channel Performance
SELECT 
  ft.payment_method,
  COUNT(*) as transaction_count,
  SUM(ft.amount) as total_amount,
  AVG(ft.amount) as avg_amount,
  MIN(ft.amount) as min_amount,
  MAX(ft.amount) as max_amount,
  COUNT(*) FILTER (WHERE ft.amount >= 1000) as large_payments
FROM reporting.fact_txn ft
WHERE ft.type = 'PAYMENT'
  AND ft.d >= CURRENT_DATE - INTERVAL '90 days'
  AND ft.payment_method IS NOT NULL
GROUP BY ft.payment_method
ORDER BY total_amount DESC;

-- === QUALITY CONTROL ANALYTICS ===

-- 5. QC Defect Analysis by Severity and Resolution Time
SELECT 
  fq.severity,
  fq.rule_code,
  COUNT(*) as defect_count,
  COUNT(*) FILTER (WHERE fq.status = 'resolved') as resolved_count,
  COUNT(*) FILTER (WHERE fq.status = 'open') as open_count,
  ROUND(
    COUNT(*) FILTER (WHERE fq.status = 'resolved')::numeric / 
    COUNT(*)::numeric * 100, 2
  ) as resolution_rate_pct,
  ROUND(
    AVG(EXTRACT(days FROM fq.resolved_at - fq.created_at)) FILTER (WHERE fq.resolved_at IS NOT NULL), 
    1
  ) as avg_resolution_days
FROM reporting.fact_qc fq
WHERE fq.d >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY fq.severity, fq.rule_code
ORDER BY fq.severity, defect_count DESC;

-- 6. QC Performance by Loan Program
SELECT 
  dl.program_code,
  COUNT(DISTINCT fq.loan_id) as loans_with_defects,
  COUNT(*) as total_defects,
  ROUND(COUNT(*)::numeric / COUNT(DISTINCT fq.loan_id), 2) as defects_per_loan,
  COUNT(*) FILTER (WHERE fq.severity IN ('critical', 'high')) as critical_defects,
  ROUND(
    COUNT(*) FILTER (WHERE fq.severity IN ('critical', 'high'))::numeric / 
    COUNT(*)::numeric * 100, 2
  ) as critical_defect_rate_pct
FROM reporting.fact_qc fq
JOIN reporting.dim_loan dl ON dl.loan_id = fq.loan_id
WHERE fq.d >= CURRENT_DATE - INTERVAL '3 months'
GROUP BY dl.program_code
ORDER BY defects_per_loan DESC;

-- === INVESTOR REMITTANCE ANALYTICS ===

-- 7. Investor Remittance Performance
SELECT 
  di.investor_name,
  COUNT(DISTINCT fr.loan_id) as loan_count,
  SUM(fr.principal) as ytd_principal,
  SUM(fr.interest) as ytd_interest,
  SUM(fr.escrow) as ytd_escrow,
  SUM(fr.svc_fee) as ytd_servicing_fees,
  SUM(fr.net) as ytd_net_remittance,
  ROUND(
    SUM(fr.svc_fee)::numeric / NULLIF(SUM(fr.principal + fr.interest), 0) * 10000, 2
  ) as effective_svc_fee_bps
FROM reporting.fact_remit fr
JOIN reporting.dim_investor di ON di.investor_id = fr.investor_id
WHERE fr.d >= DATE_TRUNC('year', CURRENT_DATE)
GROUP BY di.investor_name
ORDER BY ytd_net_remittance DESC;

-- 8. Monthly Remittance Trends
SELECT 
  dd.y as year,
  dd.m as month,
  COUNT(DISTINCT fr.investor_id) as active_investors,
  COUNT(DISTINCT fr.loan_id) as loans_remitted,
  SUM(fr.principal) as total_principal,
  SUM(fr.interest) as total_interest,
  SUM(fr.svc_fee) as total_servicing_fees,
  SUM(fr.net) as total_net_remittance,
  ROUND(AVG(fr.participation_pct), 4) as avg_participation_pct
FROM reporting.fact_remit fr
JOIN reporting.dim_date dd ON dd.d = fr.d
WHERE fr.d >= CURRENT_DATE - INTERVAL '24 months'
GROUP BY dd.y, dd.m
ORDER BY dd.y DESC, dd.m DESC;

-- === DOCUMENT PROCESSING ANALYTICS ===

-- 9. Document Processing Performance
SELECT 
  fd.document_type,
  COUNT(*) as total_documents,
  COUNT(*) FILTER (WHERE fd.processing_status = 'completed') as completed_docs,
  COUNT(*) FILTER (WHERE fd.processing_status = 'failed') as failed_docs,
  ROUND(
    COUNT(*) FILTER (WHERE fd.processing_status = 'completed')::numeric / 
    COUNT(*)::numeric * 100, 2
  ) as success_rate_pct,
  ROUND(AVG(fd.processing_time_ms) FILTER (WHERE fd.processing_status = 'completed'), 0) as avg_processing_ms,
  ROUND(AVG(fd.ai_confidence_score) FILTER (WHERE fd.ai_confidence_score IS NOT NULL), 4) as avg_ai_confidence,
  SUM(fd.file_size_bytes) / 1024 / 1024 as total_mb_processed
FROM reporting.fact_document fd
WHERE fd.d >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY fd.document_type
ORDER BY total_documents DESC;

-- 10. AI Extraction Quality Analysis
SELECT 
  fd.document_type,
  COUNT(*) as documents_with_ai,
  ROUND(AVG(fd.ai_confidence_score), 4) as avg_confidence,
  ROUND(AVG(fd.extraction_count), 1) as avg_extractions_per_doc,
  ROUND(AVG(fd.validation_errors), 1) as avg_validation_errors,
  COUNT(*) FILTER (WHERE fd.ai_confidence_score >= 0.95) as high_confidence_docs,
  ROUND(
    COUNT(*) FILTER (WHERE fd.ai_confidence_score >= 0.95)::numeric / 
    COUNT(*)::numeric * 100, 2
  ) as high_confidence_rate_pct
FROM reporting.fact_document fd
WHERE fd.ai_confidence_score IS NOT NULL
  AND fd.d >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY fd.document_type
ORDER BY avg_confidence DESC;

-- === OPERATIONAL EFFICIENCY METRICS ===

-- 11. Export Performance by Template
SELECT 
  fe.template,
  COUNT(*) as total_exports,
  COUNT(*) FILTER (WHERE fe.status = 'succeeded') as successful_exports,
  COUNT(*) FILTER (WHERE fe.status = 'failed') as failed_exports,
  ROUND(
    COUNT(*) FILTER (WHERE fe.status = 'succeeded')::numeric / 
    COUNT(*)::numeric * 100, 2
  ) as success_rate_pct,
  ROUND(AVG(fe.processing_time_ms) FILTER (WHERE fe.status = 'succeeded'), 0) as avg_processing_ms,
  ROUND(AVG(fe.file_size_bytes) FILTER (WHERE fe.status = 'succeeded') / 1024, 0) as avg_file_size_kb
FROM reporting.fact_export fe
WHERE fe.d >= CURRENT_DATE - INTERVAL '60 days'
GROUP BY fe.template
ORDER BY total_exports DESC;

-- 12. Notification Delivery Performance
SELECT 
  fn.channel,
  fn.template_code,
  COUNT(*) as total_notifications,
  COUNT(*) FILTER (WHERE fn.status = 'sent') as delivered_notifications,
  COUNT(*) FILTER (WHERE fn.status = 'failed') as failed_notifications,
  COUNT(*) FILTER (WHERE fn.status = 'suppressed') as suppressed_notifications,
  ROUND(
    COUNT(*) FILTER (WHERE fn.status = 'sent')::numeric / 
    COUNT(*)::numeric * 100, 2
  ) as delivery_rate_pct,
  ROUND(AVG(fn.delivery_time_ms) FILTER (WHERE fn.status = 'sent'), 0) as avg_delivery_ms,
  SUM(fn.recipient_count) FILTER (WHERE fn.status = 'sent') as total_recipients_reached
FROM reporting.fact_notify fn
WHERE fn.d >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY fn.channel, fn.template_code
ORDER BY total_notifications DESC;

-- === BUSINESS HEALTH DASHBOARD ===

-- 13. Daily Business Metrics (Last 30 Days)
SELECT 
  dd.d as business_date,
  COUNT(DISTINCT ft.loan_id) FILTER (WHERE ft.type = 'PAYMENT') as loans_with_payments,
  SUM(ft.amount) FILTER (WHERE ft.type = 'PAYMENT') as daily_collections,
  COUNT(*) FILTER (WHERE ft.type = 'PAYMENT') as payment_count,
  COUNT(*) FILTER (WHERE fe.status = 'succeeded') as successful_exports,
  COUNT(*) FILTER (WHERE fq.status = 'open') as new_qc_defects,
  COUNT(*) FILTER (WHERE fn.status = 'sent') as notifications_delivered
FROM reporting.dim_date dd
LEFT JOIN reporting.fact_txn ft ON ft.d = dd.d
LEFT JOIN reporting.fact_export fe ON fe.d = dd.d
LEFT JOIN reporting.fact_qc fq ON fq.d = dd.d
LEFT JOIN reporting.fact_notify fn ON fn.d = dd.d
WHERE dd.d >= CURRENT_DATE - INTERVAL '30 days'
  AND dd.d <= CURRENT_DATE
GROUP BY dd.d
ORDER BY dd.d DESC;

-- 14. Portfolio Risk Assessment
SELECT 
  dl.property_state,
  dl.program_code,
  COUNT(DISTINCT fs.loan_id) as loan_count,
  SUM(fs.upb) as total_upb,
  COUNT(*) FILTER (WHERE fs.delinquency_dpd > 0) as delinquent_loans,
  COUNT(*) FILTER (WHERE fs.delinquency_dpd > 30) as severe_delinquent_loans,
  ROUND(
    COUNT(*) FILTER (WHERE fs.delinquency_dpd > 0)::numeric / 
    COUNT(*)::numeric * 100, 2
  ) as delinquency_rate_pct,
  ROUND(
    SUM(fs.upb) FILTER (WHERE fs.delinquency_dpd > 0)::numeric / 
    SUM(fs.upb)::numeric * 100, 2
  ) as delinquent_upb_pct
FROM reporting.fact_servicing fs
JOIN reporting.dim_loan dl ON dl.loan_id = fs.loan_id
WHERE fs.d = (SELECT MAX(d) FROM reporting.fact_servicing)
GROUP BY dl.property_state, dl.program_code
HAVING COUNT(DISTINCT fs.loan_id) >= 5  -- Only include meaningful sample sizes
ORDER BY delinquent_upb_pct DESC, total_upb DESC;