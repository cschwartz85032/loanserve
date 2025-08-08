export const LOAN_STATUSES = [
  { value: "originated", label: "Originated" },
  { value: "active", label: "Active" },
  { value: "current", label: "Current" },
  { value: "delinquent_30", label: "30+ Days Late" },
  { value: "delinquent_60", label: "60+ Days Late" },
  { value: "delinquent_90", label: "90+ Days Late" },
  { value: "foreclosure", label: "In Foreclosure" },
  { value: "bankruptcy", label: "Bankruptcy" },
  { value: "paid_off", label: "Paid Off" },
  { value: "charged_off", label: "Charged Off" },
];

export const LOAN_TYPES = [
  { value: "conventional", label: "Conventional" },
  { value: "fha", label: "FHA" },
  { value: "va", label: "VA" },
  { value: "usda", label: "USDA" },
  { value: "jumbo", label: "Jumbo" },
  { value: "portfolio", label: "Portfolio" },
];

export const USER_ROLES = [
  { value: "lender", label: "Lender" },
  { value: "borrower", label: "Borrower" },
  { value: "investor", label: "Investor" },
  { value: "escrow_officer", label: "Escrow Officer" },
  { value: "legal", label: "Legal" },
];

export const DOCUMENT_TYPES = [
  { value: "loan_application", label: "Loan Application" },
  { value: "credit_report", label: "Credit Report" },
  { value: "income_verification", label: "Income Verification" },
  { value: "property_appraisal", label: "Property Appraisal" },
  { value: "insurance_policy", label: "Insurance Policy" },
  { value: "property_deed", label: "Property Deed" },
  { value: "tax_return", label: "Tax Return" },
  { value: "bank_statement", label: "Bank Statement" },
  { value: "legal_document", label: "Legal Document" },
  { value: "correspondence", label: "Correspondence" },
];

export const PAYMENT_TYPES = [
  { value: "principal_interest", label: "Principal & Interest" },
  { value: "escrow_taxes", label: "Escrow - Taxes" },
  { value: "escrow_insurance", label: "Escrow - Insurance" },
  { value: "escrow_hoa", label: "Escrow - HOA" },
  { value: "late_fee", label: "Late Fee" },
  { value: "other_fee", label: "Other Fee" },
];

export const ESCROW_TYPES = [
  { value: "property_tax", label: "Property Tax" },
  { value: "hazard_insurance", label: "Hazard Insurance" },
  { value: "pmi_insurance", label: "PMI Insurance" },
  { value: "hoa_fees", label: "HOA Fees" },
  { value: "flood_insurance", label: "Flood Insurance" },
  { value: "other", label: "Other" },
];

export const NOTIFICATION_TYPES = [
  { value: "payment_due", label: "Payment Due" },
  { value: "payment_received", label: "Payment Received" },
  { value: "document_required", label: "Document Required" },
  { value: "document_uploaded", label: "Document Uploaded" },
  { value: "escrow_payment", label: "Escrow Payment" },
  { value: "compliance_alert", label: "Compliance Alert" },
  { value: "system_notification", label: "System Notification" },
];

export const PRIORITY_LEVELS = [
  { value: "low", label: "Low", color: "text-green-600" },
  { value: "normal", label: "Normal", color: "text-blue-600" },
  { value: "high", label: "High", color: "text-yellow-600" },
  { value: "urgent", label: "Urgent", color: "text-red-600" },
];

// Color schemes for charts and metrics
export const CHART_COLORS = {
  primary: "hsl(203.8863, 88.2845%, 53.1373%)",
  secondary: "hsl(210, 25%, 7.8431%)",
  success: "hsl(159.7826, 100%, 36.0784%)",
  warning: "hsl(42.0290, 92.8251%, 56.2745%)",
  danger: "hsl(356.3033, 90.5579%, 54.3137%)",
  info: "hsl(202.8169, 89.1213%, 53.1373%)",
};

// Date formatting options
export const DATE_FORMATS = {
  short: { month: "short", day: "numeric", year: "numeric" } as const,
  long: { weekday: "long", year: "numeric", month: "long", day: "numeric" } as const,
  numeric: { year: "numeric", month: "2-digit", day: "2-digit" } as const,
};

// Currency formatting options
export const CURRENCY_FORMAT = {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
} as const;

// File upload restrictions
export const FILE_UPLOAD = {
  maxSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/gif",
  ],
  allowedExtensions: [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".gif"],
};

// Pagination defaults
export const PAGINATION = {
  defaultLimit: 25,
  maxLimit: 100,
  defaultOffset: 0,
};

// API endpoints
export const API_ENDPOINTS = {
  loans: "/api/loans",
  payments: "/api/payments",
  documents: "/api/documents",
  escrow: "/api/escrow-accounts",
  escrowPayments: "/api/escrow-payments",
  notifications: "/api/notifications",
  users: "/api/users",
  auth: {
    login: "/api/login",
    logout: "/api/logout",
    register: "/api/register",
    user: "/api/user",
  },
};
