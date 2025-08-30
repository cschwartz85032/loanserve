import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { 
  Loader2, Calculator, DollarSign, Home, Calendar, FileText, 
  Download, Eye, Users, ClipboardList, History, Building2,
  Phone, Mail, MapPin, User, Info, Plus
} from "lucide-react";
import { useLocation } from "wouter";
import { DocumentUploader } from "@/components/documents/document-uploader";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import { LoanAccountingLedger } from "@/components/loans/loan-accounting-ledger";
import { LoanInvestorsManager } from "@/components/loans/loan-investors-manager";
import { EscrowDisbursementsTab } from "@/components/loans/escrow-disbursements-tab";
import { LoanCRM } from "@/components/loans/loan-crm";
import { CommunicationPreferences } from "@/components/crm/communication-preferences";

interface LoanEditFormProps {
  loanId: string;
  onSave?: () => void;
  onCancel?: () => void;
}

interface PaymentCalculation {
  principalAndInterest: number;
  escrow: number;
  hoaFees: number;
  pmi: number;
  servicingFee: number;
  totalMonthlyPayment: number;
  breakdown: {
    hazardInsurance: number;
    propertyTaxes: number;
    escrowCushion: number;
  };
}

// Helper functions for audit log display
const getEventDescription = (log: any, currentLoanNumber?: string): string => {
  if (log.eventDescription) return log.eventDescription;
  const payload = (log as any).payloadJson || (log as any).payload_json;
  const baseDescription = payload?.description ?? 'N/A';
  
  // If we have a description and loan ID, append the loan number
  if (baseDescription !== 'N/A' && log.loanId && currentLoanNumber) {
    return `${baseDescription} on Loan ${currentLoanNumber}`;
  }
  
  return baseDescription;
};

// Insert hyperlink around the loan number within the description
const renderDescriptionWithLink = (description: string, loanId?: string) => {
  const match = description.match(/Loan ([A-Z0-9-]+)/);
  if (!match) return description;
  const loanNumber = match[1];
  const [before, after] = description.split(match[0]);
  return (
    <>
      {before}
      <a 
        href={`/loans/${loanId || 'unknown'}/crm`} 
        className="text-blue-500 underline hover:text-blue-700"
        onClick={(e) => {
          e.preventDefault();
          window.location.href = `/loans/${loanId || 'unknown'}/crm`;
        }}
      >
        Loan {loanNumber}
      </a>
      {after}
    </>
  );
};

// Get user name from ID (simplified version)
const getUserName = (actorId: string | null): string => {
  if (!actorId) return 'System';
  // In a real app, you'd look this up from user data
  if (actorId === '1') return 'loanatik';
  return `User ${actorId}`;
};

// Format audit details for display
const formatAuditDetails = (log: any, currentLoanNumber?: string): React.ReactNode => {
  const description = getEventDescription(log, currentLoanNumber);
  return renderDescriptionWithLink(description, log.loanId?.toString());
};

export function LoanEditForm({ loanId, onSave, onCancel }: LoanEditFormProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<any>({});
  const [calculations, setCalculations] = useState<PaymentCalculation | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [, setLocation] = useLocation();

  // Fetch loan data
  const { data: loan, isLoading } = useQuery({
    queryKey: [`/api/loans/${loanId}`],
    enabled: !!loanId
  });

  // Fetch escrow disbursements for payment calculations
  const { data: escrowDisbursements = [] } = useQuery({
    queryKey: [`/api/loans/${loanId}/escrow-disbursements`],
    queryFn: async () => {
      console.log('Fetching escrow disbursements for loan:', loanId);
      const response = await fetch(`/api/loans/${loanId}/escrow-disbursements`, {
        credentials: 'include'
      });
      if (!response.ok) {
        console.error('Failed to fetch disbursements');
        return [];
      }
      const data = await response.json();
      console.log('Fetched disbursements:', data.length, 'items');
      return data;
    },
    enabled: !!loanId
  });
  
  // Fetch documents for this loan
  const { data: documents, refetch: refetchDocuments } = useQuery({
    queryKey: [`/api/documents`, { loanId }],
    queryFn: async () => {
      const response = await fetch(`/api/documents?loanId=${loanId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch documents');
      return response.json();
    },
    enabled: !!loanId
  });

  // Fetch compliance audit logs for this loan - Phase 9 Infrastructure
  const { data: auditLogsResponse } = useQuery({
    queryKey: [`/api/compliance/audit-log`, { entityType: 'loan', entityId: loanId }],
    queryFn: async () => {
      const response = await fetch(`/api/compliance/audit-log?entityType=loan&entityId=${loanId}&limit=50`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch compliance audit logs');
      return response.json();
    },
    enabled: !!loanId
  });
  
  // Extract audit logs from response
  const auditLogs = auditLogsResponse || [];

  // Helper function to get user name from actor ID
  const getUserName = (actorId: string) => {
    // For now, return a simple mapping - could be enhanced with a user lookup API
    if (actorId === '1') return 'loanatik';
    return `User ${actorId}`;
  };

  // Helper function to format audit details
  const formatAuditDetails = (log: any) => {
    const payload = log.payloadJson;
    if (!payload) return 'N/A';

    // For CRM notes, show the actual note content
    if (log.eventType === 'CRM.NOTE_ADDED' && payload.newValues?.content) {
      return `Note: "${payload.newValues.content}"`;
    }

    // For single field changes (beneficiary updates)
    if (payload.field && (payload.oldValue !== undefined || payload.newValue !== undefined)) {
      const oldVal = payload.oldValue ?? 'null';
      const newVal = payload.newValue ?? 'null';
      return (
        <div className="space-y-1">
          <div className="font-medium text-gray-700">Field: {payload.field}</div>
          <div className="text-sm">
            <span className="text-red-600 line-through">Current: {oldVal}</span>
            <span className="mx-2">→</span>
            <span className="text-green-600 font-medium">New: {newVal}</span>
          </div>
        </div>
      );
    }

    // For multiple field changes (investor updates)
    if (payload.changedFields && payload.changedFields.length > 0) {
      const changes = payload.changedFields.map((field: string) => {
        const oldValue = payload.oldValues?.[field] ?? payload.previousValues?.[field] ?? 'null';
        const newValue = payload.newValues?.[field] ?? 'null';
        return (
          <div key={field} className="border-l-2 border-blue-200 pl-2 py-1">
            <div className="font-medium text-gray-700 text-xs">{field}</div>
            <div className="text-xs">
              <span className="text-red-600 line-through">Current: {oldValue}</span>
              <span className="mx-2">→</span>
              <span className="text-green-600 font-medium">New: {newValue}</span>
            </div>
          </div>
        );
      });
      return <div className="space-y-2">{changes}</div>;
    }

    // For email operations, show enhanced details  
    if (log.eventType === 'CRM.EMAIL.SENT' && payload.emailDetails) {
      return (
        <div className="space-y-1">
          <div className="font-medium">Email Sent</div>
          <div className="text-sm text-gray-600">To: {payload.emailDetails.to}</div>
          <div className="text-sm text-gray-600">Subject: {payload.emailDetails.subject}</div>
        </div>
      );
    }

    // Fallback to description
    return payload.description || log.description || 'N/A';
  };

  // Update form data when loan is loaded
  useEffect(() => {
    if (loan) {
      console.log('Loading loan data into form:', loan);
      console.log('Escrow disbursements available:', escrowDisbursements?.length || 0);
      // Map originalAmount to loanAmount for UI display and ensure all servicing fields exist
      const formDataWithDefaults = {
        ...loan,
        loanAmount: loan.originalAmount || loan.loanAmount || '',
        // Ensure ALL servicing settings fields are always included with proper defaults
        servicingFee: loan.servicingFee || '',
        servicingFeeType: loan.servicingFeeType || 'percentage',
        lateCharge: loan.lateCharge || loan.lateChargeAmount || '',
        lateChargeType: loan.lateChargeType || 'percentage',
        feePayer: loan.feePayer || '',
        gracePeriodDays: loan.gracePeriodDays || '',
        investorLoanNumber: loan.investorLoanNumber || '',
        poolNumber: loan.poolNumber || '',
        // Ensure payment settings fields are always included
        propertyTax: loan.propertyTax || loan.propertyTaxes || '',
        homeInsurance: loan.homeInsurance || loan.hazardInsurance || '',
        hoaFees: loan.hoaFees || '',
        pmi: loan.pmi || loan.pmiAmount || '',
        otherMonthly: loan.otherMonthly || ''
      };
      console.log('Form data with defaults:', formDataWithDefaults);
      setFormData(formDataWithDefaults);
      calculatePayments(loan, escrowDisbursements);
    }
  }, [loan, escrowDisbursements]);

  const calculatePayments = (loanData: any, disbursements?: any[]) => {
    console.log('calculatePayments called with disbursements:', disbursements?.length || 0);
    
    // Calculate principal and interest from loan data
    const loanAmount = parseFloat(loanData.originalAmount) || parseFloat(loanData.loanAmount) || 0;
    const interestRate = parseFloat(loanData.interestRate) || 0;
    const loanTerm = parseInt(loanData.loanTerm) || 12;
    
    // Calculate monthly payment if we have the data
    let principalAndInterest = parseFloat(loanData.paymentAmount) || 0;
    
    // If payment amount is not set, calculate it
    if (!principalAndInterest && loanAmount && interestRate && loanTerm) {
      const monthlyRate = interestRate / 100 / 12;
      if (monthlyRate > 0) {
        principalAndInterest = (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, loanTerm)) / 
                              (Math.pow(1 + monthlyRate, loanTerm) - 1);
      } else {
        principalAndInterest = loanAmount / loanTerm;
      }
    }

    // Calculate escrow from actual disbursements if available
    let hazardInsurance = 0;
    let propertyTaxes = 0;
    let hoaFees = 0;
    
    if (disbursements && disbursements.length > 0) {
      console.log('Calculating from disbursements:', disbursements);
      
      disbursements.forEach(d => {
        // Only count active disbursements (check both status and isOnHold flag)
        if (d.status !== 'active' || d.isOnHold) {
          console.log(`Skipping disbursement (status: ${d.status}, onHold: ${d.isOnHold}): ${d.description}`);
          return;
        }
        
        // Try to get monthly amount, or calculate from annual amount
        let monthlyAmount = parseFloat(d.monthlyAmount) || 0;
        if (!monthlyAmount && d.annualAmount) {
          monthlyAmount = parseFloat(d.annualAmount) / 12;
        }
        
        console.log(`Disbursement: ${d.disbursementType} - ${d.description}: $${monthlyAmount.toFixed(2)}/month (status: ${d.status})`);
        
        if (d.disbursementType === 'insurance') {
          hazardInsurance += monthlyAmount;
        } else if (d.disbursementType === 'taxes') {
          propertyTaxes += monthlyAmount;
        } else if (d.disbursementType === 'hoa') {
          hoaFees += monthlyAmount;
        }
      });
      
      console.log('Calculated totals - Insurance:', hazardInsurance.toFixed(2), 'Taxes:', propertyTaxes.toFixed(2), 'HOA:', hoaFees.toFixed(2));
    } else {
      // Fallback to loan data if no disbursements
      console.log('No disbursements found, using loan data fields');
      hazardInsurance = parseFloat(loanData.hazardInsurance) || 0;
      propertyTaxes = parseFloat(loanData.propertyTaxes) || 0;
      hoaFees = parseFloat(loanData.hoaFees) || 0;
    }
    
    const escrowCushion = (hazardInsurance + propertyTaxes) * 0.1667;
    const escrow = hazardInsurance + propertyTaxes + escrowCushion;

    const pmi = parseFloat(loanData.pmiAmount) || 0;
    const servicingFee = parseFloat(loanData.servicingFee) || 0;

    const totalMonthlyPayment = principalAndInterest + escrow + hoaFees + pmi + servicingFee;
    
    console.log('Final calculation - Total escrow:', escrow.toFixed(2), 'Total payment:', totalMonthlyPayment.toFixed(2));

    setCalculations({
      principalAndInterest,
      escrow,
      hoaFees,
      pmi,
      servicingFee,
      totalMonthlyPayment,
      breakdown: {
        hazardInsurance,
        propertyTaxes,
        escrowCushion
      }
    });
  };

  useEffect(() => {
    if (formData.loanAmount || formData.interestRate || formData.loanTerm || escrowDisbursements?.length > 0) {
      calculatePayments(formData, escrowDisbursements);
    }
  }, [formData.loanAmount, formData.interestRate, formData.loanTerm, formData.hazardInsurance, formData.propertyTaxes, formData.hoaFees, formData.pmiAmount, formData.servicingFee, escrowDisbursements]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/loans/${loanId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    },
    onSuccess: (response) => {
      console.log('Update response:', response);
      // Update local form data with the server response to ensure consistency
      setFormData(response);
      // Invalidate and refetch the specific loan data
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/loans'] });
      // Invalidate audit logs to show new beneficiary changes
      queryClient.invalidateQueries({ queryKey: [`/api/compliance/audit-log`, { entityType: 'loan', entityId: loanId }] });
      // Force a refetch of the current loan data
      queryClient.refetchQueries({ queryKey: [`/api/loans/${loanId}`] });
      toast({
        title: "Loan Updated",
        description: "Loan information has been successfully updated",
      });
      onSave?.();
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      });
    }
  });

  const handleInputChange = (field: string, value: any) => {
    console.log(`Field changed: ${field} = ${value}`);
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    console.log('Saving form data:', formData);
    updateMutation.mutate(formData);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header with Loan Info */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Loan Edit</h2>
          <div className="flex gap-4 mt-2">
            {formData.loanNumber && (
              <Badge variant="outline">
                Loan #: {formData.loanNumber}
              </Badge>
            )}
            {formData.escrowNumber && (
              <Badge variant="outline">
                Escrow #: {formData.escrowNumber}
              </Badge>
            )}
            <Badge variant={formData.loanStatus === 'active' ? 'default' : 'secondary'}>
              {formData.loanStatus || 'Unknown'}
            </Badge>
          </div>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>

      <Tabs defaultValue="crm" className="w-full">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="crm">CRM</TabsTrigger>
          <TabsTrigger value="beneficiaries">Beneficiary</TabsTrigger>
          <TabsTrigger value="escrows">Escrows</TabsTrigger>
          <TabsTrigger value="documents">Docs</TabsTrigger>
          <TabsTrigger value="accounting">Accounting</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>

        {/* CRM Tab */}
        <TabsContent value="crm" className="space-y-6">
          <LoanCRM loanId={parseInt(loanId)} calculations={calculations} loanData={formData} />
        </TabsContent>

        {/* Beneficiaries Tab */}
        <TabsContent value="beneficiaries" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Beneficiary Information
              </CardTitle>
              <CardDescription>
                Manage beneficiary details for this loan
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="beneficiaryName">Contact Name</Label>
                  <Input
                    id="beneficiaryName"
                    value={formData.beneficiaryName || ''}
                    onChange={(e) => handleInputChange('beneficiaryName', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="beneficiaryCompanyName">Company Name</Label>
                  <Input
                    id="beneficiaryCompanyName"
                    value={formData.beneficiaryCompanyName || ''}
                    onChange={(e) => handleInputChange('beneficiaryCompanyName', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="beneficiaryPhone">Phone</Label>
                  <Input
                    id="beneficiaryPhone"
                    value={formData.beneficiaryPhone || ''}
                    onChange={(e) => handleInputChange('beneficiaryPhone', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="beneficiaryEmail">Email</Label>
                  <Input
                    id="beneficiaryEmail"
                    type="email"
                    value={formData.beneficiaryEmail || ''}
                    onChange={(e) => handleInputChange('beneficiaryEmail', e.target.value)}
                  />
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Beneficiary Address</h4>
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="beneficiaryStreetAddress">Street Address</Label>
                    <Input
                      id="beneficiaryStreetAddress"
                      value={formData.beneficiaryStreetAddress || ''}
                      onChange={(e) => handleInputChange('beneficiaryStreetAddress', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="beneficiaryCity">City</Label>
                    <Input
                      id="beneficiaryCity"
                      value={formData.beneficiaryCity || ''}
                      onChange={(e) => handleInputChange('beneficiaryCity', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="beneficiaryState">State</Label>
                    <Input
                      id="beneficiaryState"
                      value={formData.beneficiaryState || ''}
                      onChange={(e) => handleInputChange('beneficiaryState', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="beneficiaryZipCode">Zip Code</Label>
                    <Input
                      id="beneficiaryZipCode"
                      value={formData.beneficiaryZipCode || ''}
                      onChange={(e) => handleInputChange('beneficiaryZipCode', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Investors Section */}
          <LoanInvestorsManager loanId={loanId} />
        </TabsContent>

        {/* Escrows Tab */}
        <TabsContent value="escrows" className="space-y-6">
          <EscrowDisbursementsTab loanId={parseInt(loanId)} />
        </TabsContent>

        {/* Document Management Tab */}
        <TabsContent value="documents" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Document Management
              </CardTitle>
              <CardDescription>
                Manage all documents related to this loan
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Existing Documents */}
              {documents && documents.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="text-md font-medium">Attached Documents</h4>
                  <div className="grid gap-3">
                    {documents.map((doc: any) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                        <div className="flex items-center space-x-3">
                          <FileText className="h-5 w-5 text-blue-500" />
                          <div 
                            className="cursor-pointer"
                            onClick={() => {
                              setSelectedDocument(doc);
                              setPreviewOpen(true);
                            }}
                          >
                            <p className="font-medium text-gray-900 hover:text-blue-600 underline">
                              {doc.title || doc.fileName}
                            </p>
                            <p className="text-sm text-gray-500">
                              {doc.description}
                            </p>
                            <p className="text-xs text-gray-400">
                              {doc.mimeType} • {Math.round((doc.fileSize || 0) / 1024)}KB
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedDocument(doc);
                              setPreviewOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = `/api/documents/${doc.id}/file`;
                              link.download = doc.fileName;
                              link.click();
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No documents attached to this loan</p>
                </div>
              )}

              {/* Upload New Documents */}
              <div className="border-t pt-6">
                <h4 className="text-md font-medium mb-3">Upload New Documents</h4>
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <DocumentUploader 
                    loanId={parseInt(loanId)} 
                    onUploadComplete={() => {
                      toast({
                        title: "Documents uploaded",
                        description: "All documents have been attached to this loan.",
                      });
                      refetchDocuments();
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Accounting Tab */}
        <TabsContent value="accounting" className="space-y-6">
          <LoanAccountingLedger loanId={loanId} loanAmount={parseFloat(formData.loanAmount) || 0} />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <CommunicationPreferences 
            borrowerId={formData?.borrowerId?.toString() || '1'} 
            loanId={loanId}
          />
        </TabsContent>

        {/* Audit Trail Tab - Phase 9 Compliance Infrastructure */}
        <TabsContent value="audit" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Compliance Audit Trail
              </CardTitle>
              <CardDescription>
                Complete immutable history of all changes made to this loan using Phase 9 compliance infrastructure
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditLogs && auditLogs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>IP Address</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs">
                          {new Date(log.eventTsUtc).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-medium">
                          {getUserName(log.actorId) || 'System'}
                        </TableCell>
                        <TableCell className="whitespace-pre-wrap">
                          {formatAuditDetails(log, loan?.loanNumber)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-gray-500">
                          {log.ipAddr || 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No compliance audit history available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Document Preview Modal */}
      <DocumentPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        document={selectedDocument}
      />
    </div>
  );
}