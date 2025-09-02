-- Seed notification templates
-- Includes borrower communications, escrow requests, and ops escalations

INSERT INTO notification_templates (code, locale, channel, subject, body, version, active) VALUES
-- Borrower: HOI request (Email)
('BORR_HOI_REQUEST','en-US','email',
 'Action needed: Homeowner''s Insurance Policy',
 'Hi {{borrower.firstName}},

We''re finalizing your loan for {{property.address}}.
We could not locate an active homeowner''s insurance policy in the closing documents.

Please upload your policy (PDF or photo) here: {{links.upload}}

Policy must show:
 • Carrier
 • Policy number
 • Effective & expiration dates

If you believe we already have this, reply to this email.

Thank you,
LoanServe',
 'v2025-09-03', true),

-- Borrower: HOI request (SMS)
('BORR_HOI_REQUEST','en-US','sms', NULL,
 'LoanServe: We need your homeowner''s insurance for {{property.address}}. Upload: {{links.upload}}',
 'v2025-09-03', true),

-- Escrow: Missing Flood Determination (Email)
('ESC_ADDENDUM_MISSING_FLOOD','en-US','email',
 'Missing Flood Determination for {{property.address}}',
 'Hello {{escrow.name}},

Flood Determination is missing in the closing packet for loan {{loan.number}} ({{property.address}}).
Please upload it here: {{links.upload}}

Thanks,
LoanServe',
 'v2025-09-03', true),

-- Ops escalation (Email)
('OPS_ESCALATION_IDLE','en-US','email',
 'Idle Loan {{loan.number}} at stage {{stage}}',
 'Loan {{loan.number}} for {{property.address}} has been idle for {{idleDays}} days at "{{stage}}".
Owner: {{owner.name}}.
Link: {{links.loan}}
',
 'v2025-09-03', true),

-- Borrower: Payment due reminder (Email)
('BORR_PAYMENT_DUE','en-US','email',
 'Payment Due Reminder - {{loan.number}}',
 'Hi {{borrower.firstName}},

Your loan payment of ${{payment.amount}} is due on {{payment.dueDate}}.

Make a payment here: {{links.payment}}

Thank you,
LoanServe',
 'v2025-09-03', true),

-- Borrower: Payment due reminder (SMS)
('BORR_PAYMENT_DUE','en-US','sms', NULL,
 'LoanServe: Payment of ${{payment.amount}} due {{payment.dueDate}}. Pay: {{links.payment}}',
 'v2025-09-03', true)

ON CONFLICT (code, locale, channel, version) DO NOTHING;