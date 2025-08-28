import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Calculator, DollarSign, Home, Calendar, FileText, Download, Eye, Trash2, Users, ClipboardList, History, Settings } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentUploader } from "@/components/documents/document-uploader";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import { LoanCRM } from "./loan-crm";

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
  breakdown: Record<string, number>;
}

export function LoanEditForm({ loanId, onSave, onCancel }: LoanEditFormProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<any>({});
  const [calculations, setCalculations] = useState<PaymentCalculation | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Fetch loan data
  const { data: loan, isLoading } = useQuery({
    queryKey: [`/api/loans/${loanId}`],
    enabled: !!loanId
  });

  // State for disbursements
  const [escrowDisbursements, setEscrowDisbursements] = useState<any[]>([]);
  const [isDisbursementsLoading, setIsDisbursementsLoading] = useState(false);
  
  // Manually fetch escrow disbursements when loan loads
  useEffect(() => {
    console.log('=== DISBURSEMENTS USEEFFECT TRIGGERED ===');
    console.log('loanId value:', loanId);
    console.log('loanId type:', typeof loanId);
    console.log('loanId truthy?:', !!loanId);
    
    if (loanId) {
      console.log('Starting disbursements fetch for loan:', loanId);
      setIsDisbursementsLoading(true);
      
      const url = `/api/loans/${loanId}/escrow-disbursements`;
      console.log('Fetching from URL:', url);
      
      fetch(url, {
        credentials: 'include'
      })
        .then(response => {
          console.log('Disbursements response received, status:', response.status);
          if (!response.ok) throw new Error(`Failed to fetch disbursements: ${response.status}`);
          return response.json();
        })
        .then(data => {
          console.log('Disbursements data received:', data);
          console.log('Number of disbursements:', data.length);
          setEscrowDisbursements(Array.isArray(data) ? data : []);
          setIsDisbursementsLoading(false);
        })
        .catch(error => {
          console.error('Error fetching disbursements:', error);
          setEscrowDisbursements([]);
          setIsDisbursementsLoading(false);
        });
    } else {
      console.log('No loanId, skipping disbursements fetch');
    }
  }, [loanId]);
  
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

  // Fetch compliance audit logs for this loan
  const { data: auditLogs } = useQuery({
    queryKey: [`/api/compliance/audit-log`, { entityType: 'loan', entityId: loanId }],
    queryFn: async () => {
      const response = await fetch(`/api/compliance/audit-log?entityType=loan&entityId=${loanId}&limit=50`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch audit logs');
      return response.json();
    },
    enabled: !!loanId
  });

  // Log when disbursements are fetched
  useEffect(() => {
    if (escrowDisbursements && Array.isArray(escrowDisbursements) && escrowDisbursements.length > 0) {
      console.log('Escrow disbursements loaded:', escrowDisbursements.length, 'items');
    }
  }, [escrowDisbursements]);

  // Update form data when loan is loaded
  useEffect(() => {
    if (loan) {
      console.log('=== UPDATING FORM DATA ===');
      console.log('Loan data:', loan);
      console.log('Disbursements loading?:', isDisbursementsLoading);
      console.log('Escrow disbursements:', escrowDisbursements);
      setFormData(loan);
      // Calculate payments with disbursements if available
      const disbursementsArray = Array.isArray(escrowDisbursements) ? escrowDisbursements : [];
      console.log('=== CALCULATING PAYMENTS ===');
      console.log('Disbursements array length:', disbursementsArray.length);
      if (disbursementsArray.length > 0) {
        console.log('First disbursement:', disbursementsArray[0]);
      }
      calculatePayments(loan, disbursementsArray);
    }
  }, [loan, escrowDisbursements, isDisbursementsLoading]);

  const calculatePayments = (loanData: any, disbursements?: any[]) => {
    console.log('calculatePayments called with:', { loanData, disbursements });
    
    // Use the actual payment amount from the database, not calculated
    const principalAndInterest = parseFloat(loanData.paymentAmount) || 0;

    // Group disbursements by type and calculate monthly amounts
    let escrowBreakdown: Record<string, number> = {};
    let totalEscrow = 0;
    
    if (disbursements && Array.isArray(disbursements) && disbursements.length > 0) {
      console.log('Processing disbursements:', disbursements.length);
      
      // Group disbursements by type
      const grouped = disbursements.reduce((acc: any, disbursement: any) => {
        // Skip if on hold or terminated
        if (!disbursement.isOnHold && disbursement.status !== 'terminated') {
          const type = disbursement.disbursementType;
          if (!acc[type]) {
            acc[type] = 0;
          }
          
          // Use the correct field names from the database
          let monthlyAmount = 0;
          
          // Log all available amount fields for debugging
          console.log(`Disbursement ${type} data:`, {
            paymentAmount: disbursement.paymentAmount,
            annualAmount: disbursement.annualAmount,
            monthlyAmount: disbursement.monthlyAmount,
            frequency: disbursement.frequency,
            isOnHold: disbursement.isOnHold
          });
          
          // Use paymentAmount with frequency as the primary source
          if (disbursement.paymentAmount) {
            const amount = parseFloat(disbursement.paymentAmount);
            switch (disbursement.frequency) {
              case 'monthly':
                monthlyAmount = amount;
                break;
              case 'quarterly':
                monthlyAmount = amount / 3;
                break;
              case 'semi_annual':
              case 'semi-annual':
                monthlyAmount = amount / 6;
                break;
              case 'annual':
              case 'annually':
              case 'once':
                monthlyAmount = amount / 12;
                break;
              default:
                // Default to annual if frequency is not specified
                monthlyAmount = amount / 12;
            }
            console.log(`Using paymentAmount ${amount} with frequency ${disbursement.frequency}, monthly = ${monthlyAmount}`);
          } else if (disbursement.annualAmount) {
            // Fallback to annualAmount if no paymentAmount
            monthlyAmount = parseFloat(disbursement.annualAmount) / 12;
            console.log(`Using annualAmount ${disbursement.annualAmount}, monthly = ${monthlyAmount}`);
          } else if (disbursement.monthlyAmount) {
            // Fallback to monthlyAmount if available
            monthlyAmount = parseFloat(disbursement.monthlyAmount);
            console.log(`Using monthlyAmount directly: ${monthlyAmount}`);
          }
          
          console.log(`Disbursement ${type}: final monthly amount = ${monthlyAmount}`);
          acc[type] += monthlyAmount;
        }
        return acc;
      }, {});

      console.log('Grouped disbursements:', grouped);
      
      // Separate HOA and other fees from escrow
      const hoaFromDisbursements = grouped['hoa'] || 0;
      const otherFromDisbursements = grouped['other'] || 0;
      
      // Build escrow breakdown including all types
      escrowBreakdown = {
        ...grouped,
        // Add standardized names for display
        hazardInsurance: grouped['insurance'] || 0,
        propertyTaxes: grouped['taxes'] || 0,
        hoa: hoaFromDisbursements,
        other: otherFromDisbursements
      };
      
      // Calculate total escrow (insurance + taxes only, not HOA or other)
      totalEscrow = (grouped['insurance'] || 0) + (grouped['taxes'] || 0);
    } else {
      console.log('No disbursements available, using fallback method');
      // Fallback to old method if no disbursements data
      const hazardInsurance = parseFloat(loanData.hazardInsurance) || 0;
      const propertyTaxes = parseFloat(loanData.propertyTaxes) || 0;
      const escrowCushion = (hazardInsurance + propertyTaxes) * 0.1667; // 2 months cushion
      totalEscrow = hazardInsurance + propertyTaxes + escrowCushion;
      
      escrowBreakdown = {
        hazardInsurance,
        propertyTaxes,
        escrowCushion
      };
    }

    // Other fees  
    const hoaFees = parseFloat(loanData.hoaFees) || 0;
    const pmi = parseFloat(loanData.pmiAmount) || 0;
    const servicingFee = parseFloat(loanData.servicingFee) || 0;

    const totalMonthlyPayment = principalAndInterest + totalEscrow + hoaFees + pmi + servicingFee;

    console.log('Final calculations:', {
      principalAndInterest,
      escrow: totalEscrow,
      breakdown: escrowBreakdown,
      totalMonthlyPayment
    });

    setCalculations({
      principalAndInterest,
      escrow: totalEscrow,
      hoaFees,
      pmi,
      servicingFee,
      totalMonthlyPayment,
      breakdown: escrowBreakdown
    });
  };

  // Recalculate when form data changes
  useEffect(() => {
    if (formData.loanAmount || formData.interestRate || formData.loanTerm) {
      const disbursementsArray = Array.isArray(escrowDisbursements) ? escrowDisbursements : [];
      calculatePayments(formData, disbursementsArray);
    }
  }, [formData.loanAmount, formData.interestRate, formData.loanTerm, formData.hazardInsurance, formData.propertyTaxes, formData.hoaFees, formData.pmiAmount, formData.servicingFee, escrowDisbursements]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      // Convert date strings to proper format for database
      const cleanData = { ...data };
      
      // Remove any timestamp fields that might cause issues
      delete cleanData.createdAt;
      delete cleanData.updatedAt;
      delete cleanData.statusDate;
      
      // Convert date fields to proper format if they exist - ensure they are valid date strings
      const formatDateForDb = (dateValue: any): string | null => {
        if (!dateValue) return null;
        if (typeof dateValue === 'string') {
          // Check if it's already in YYYY-MM-DD format
          if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return dateValue;
          }
          
          // Handle dates with two-digit years (MM/DD/YY or MM-DD-YY)
          const twoDigitYearMatch = dateValue.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
          if (twoDigitYearMatch) {
            const month = twoDigitYearMatch[1].padStart(2, '0');
            const day = twoDigitYearMatch[2].padStart(2, '0');
            const year = parseInt(twoDigitYearMatch[3]);
            // Use pivot year: 00-49 becomes 2000-2049, 50-99 becomes 1950-1999
            const fullYear = year < 50 ? 2000 + year : 1900 + year;
            return `${fullYear}-${month}-${day}`;
          }
          
          // Try to parse and format the date
          const parsedDate = new Date(dateValue);
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString().split('T')[0];
          }
        }
        if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
          return dateValue.toISOString().split('T')[0];
        }
        return null;
      };

      // Only set date fields if they have values
      ['firstPaymentDate', 'nextPaymentDate', 'maturityDate', 'prepaymentExpirationDate'].forEach(field => {
        if (cleanData[field]) {
          const formattedDate = formatDateForDb(cleanData[field]);
          if (formattedDate) {
            cleanData[field] = formattedDate;
          } else {
            delete cleanData[field]; // Remove invalid dates
          }
        }
      });
      
      const res = await apiRequest(`/api/loans/${loanId}`, {
        method: "PUT",
        body: JSON.stringify(cleanData)
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
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
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
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
      <Tabs defaultValue="crm" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="crm">CRM</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="accounting">Accounting</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>

        {/* CRM Tab */}
        <TabsContent value="crm" className="mt-6">
          <LoanCRM loanId={parseInt(loanId)} />
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Document Management</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                Document management features coming soon
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Accounting Tab */}
        <TabsContent value="accounting" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Accounting Ledger</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                Accounting features coming soon
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Trail Tab - Using Phase 9 Compliance Infrastructure */}
        <TabsContent value="audit" className="mt-6">
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
              {auditLogs && auditLogs.logs && auditLogs.logs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity Type</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>IP Address</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.logs.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs">
                          {new Date(log.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell>{log.userId || 'System'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.eventType}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {log.entityType}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {log.eventDescription || 'N/A'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.ipAddress || 'N/A'}
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
