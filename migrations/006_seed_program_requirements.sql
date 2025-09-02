-- QC System: Seed Program Requirements
-- Default requirements for FNMA program

INSERT INTO program_requirements (program_code, key, required, params) VALUES
('FNMA','HomeownersInsCarrier',true,'{}'),
('FNMA','HOIPolicyNumber',true,'{}'),
('FNMA','FloodZone',true,'{}'),
('FNMA','FloodInsRequired',false,'{}'),
('FNMA','AppraisedValue',true,'{}'),
('FNMA','UCDPSSRStatus',true,'{}'),
('PORTFOLIO','HomeownersInsCarrier',false,'{}'),
('PORTFOLIO','FloodZone',false,'{}'),
('FRE','HomeownersInsCarrier',true,'{}'),
('FRE','HOIPolicyNumber',true,'{}'),
('FRE','FloodZone',true,'{}')
ON CONFLICT (program_code, key) DO NOTHING;