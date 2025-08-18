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
import { Loader2, Calculator, DollarSign, Home, Calendar, FileText, Download, Eye, Trash2, Users, ClipboardList, History } from "lucide-react";
import { DocumentUploader } from "@/components/documents/document-uploader";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";

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

  // Fetch documents for this loan - THIS WORKS
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
  
  // Fetch escrow disbursements - MATCH THE WORKING DOCUMENTS PATTERN
  const { data: escrowDisbursements = [], isLoading: isDisbursementsLoading, refetch: refetchDisbursements } = useQuery({
    queryKey: [`/api/loans/${loanId}/escrow-disbursements`],
    queryFn: async () => {
      console.log('=== FETCHING ESCROW DISBURSEMENTS ===');
      const response = await fetch(`/api/loans/${loanId}/escrow-disbursements`, {
        credentials: 'include'
      });
      if (!response.ok) {
        console.error('Failed to fetch disbursements:', response.status);
        return [];
      }
      const data = await response.json();
      console.log('Fetched disbursements:', data.length, 'items');
      return data;
    },
    enabled: !!loanId
  });

  // Force fetch disbursements when loan loads
  useEffect(() => {
    console.log('=== REFETCH EFFECT TRIGGERED ===');
    console.log('LoanId:', loanId, 'Loan:', !!loan);
    console.log('isDisbursementsLoading:', isDisbursementsLoading);
    console.log('refetchDisbursements type:', typeof refetchDisbursements);
    
    if (loanId && loan && refetchDisbursements) {
      console.log('=== CALLING REFETCH DISBURSEMENTS NOW ===');
      refetchDisbursements().then((result) => {
        console.log('=== REFETCH RESULT ===', result);
      }).catch((error) => {
        console.error('=== REFETCH ERROR ===', error);
      });
    }
  }, [loanId, loan, refetchDisbursements]);
  
  // Log when disbursements are fetched
  useEffect(() => {
    console.log('=== ESCROW DISBURSEMENTS CHECK ===');
    console.log('Disbursements:', escrowDisbursements);
    if (escrowDisbursements && Array.isArray(escrowDisbursements) && escrowDisbursements.length > 0) {
      console.log('Number of disbursements:', escrowDisbursements.length);
      console.log('First disbursement:', escrowDisbursements[0]);
    } else {
      console.log('No disbursements available or still loading');
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
          
          // Try different field names for the amount
          if (disbursement.monthlyAmount) {
            monthlyAmount = parseFloat(disbursement.monthlyAmount);
          } else if (disbursement.annualAmount) {
            monthlyAmount = parseFloat(disbursement.annualAmount) / 12;
          } else if (disbursement.paymentAmount) {
            // Determine monthly amount based on frequency
            const amount = parseFloat(disbursement.paymentAmount);
            switch (disbursement.frequency) {
              case 'monthly':
                monthlyAmount = amount;
                break;
              case 'quarterly':
                monthlyAmount = amount / 3;
                break;
              case 'semi_annual':
                monthlyAmount = amount / 6;
                break;
              case 'annual':
              case 'once':
                monthlyAmount = amount / 12;
                break;
              default:
                monthlyAmount = amount / 12;
            }
          }
          
          console.log(`Disbursement ${type}: monthly amount = ${monthlyAmount}`);
          acc[type] += monthlyAmount;
        }
        return acc;
      }, {});

      console.log('Grouped disbursements:', grouped);
      escrowBreakdown = grouped;
      totalEscrow = Object.values(grouped).reduce((sum: number, amount: any) => sum + amount, 0);
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
      <Tabs defaultValue="details" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="details">Edit Loan Details</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="documents">Document Management</TabsTrigger>
          <TabsTrigger value="accounting">Accounting</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>

        {/* Edit Loan Details Tab */}
        <TabsContent value="details">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Panel - Payment Calculations */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="h-5 w-5" />
                    Payment Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
            {calculations ? (
              <>
                {/* Total Payment */}
                <div className="p-4 bg-primary-50 rounded-lg">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">Total Monthly Payment</p>
                    <p className="text-2xl font-bold text-primary-700">
                      {formatCurrency(calculations.totalMonthlyPayment)}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Payment Components */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Principal & Interest</span>
                    <span className="font-semibold">{formatCurrency(calculations.principalAndInterest)}</span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Escrow Total</span>
                    <span className="font-semibold">{formatCurrency(calculations.escrow)}</span>
                  </div>
                  
                  {/* Escrow Breakdown - Group by class */}
                  {calculations.breakdown && Object.keys(calculations.breakdown).length > 0 && (
                    <div className="ml-4 space-y-1 text-sm text-gray-600">
                      {Object.entries(calculations.breakdown).map(([type, amount]) => (
                        <div key={type} className="flex justify-between">
                          <span>• {type === 'insurance' ? 'Insurance' : 
                                 type === 'taxes' ? 'Property Taxes' : 
                                 type === 'hoa' ? 'HOA' :
                                 type === 'other' ? 'Other' :
                                 type === 'hazardInsurance' ? 'Hazard Insurance' :
                                 type === 'propertyTaxes' ? 'Property Taxes' :
                                 type === 'escrowCushion' ? 'Escrow Cushion' :
                                 type.charAt(0).toUpperCase() + type.slice(1)}</span>
                          <span>{formatCurrency(amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {calculations.hoaFees > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">HOA Fees</span>
                      <span className="font-semibold">{formatCurrency(calculations.hoaFees)}</span>
                    </div>
                  )}

                  {calculations.pmi > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">PMI</span>
                      <span className="font-semibold">{formatCurrency(calculations.pmi)}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Servicing Fee</span>
                    <span className="font-semibold">{formatCurrency(calculations.servicingFee)}</span>
                  </div>
                </div>

                <Separator />

                {/* Loan Summary */}
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-gray-500" />
                    <span>Loan Amount: {formatCurrency(parseFloat(formData.loanAmount || formData.originalAmount) || 0)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{formData.interestRate || 0}% APR</Badge>
                    <Badge variant="outline">{formData.loanTerm || 360} months</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Home className="h-4 w-4 text-gray-500" />
                    <span className="text-xs">{formData.propertyAddress}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Calculator className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Enter loan details to see payment breakdown</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right Panel - Loan Form */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Edit Loan Details</span>
              <div className="flex gap-4 text-sm text-gray-600">
                {formData.loanNumber && (
                  <div className="flex items-center gap-1">
                    <span className="font-medium">Loan #:</span>
                    <Badge variant="outline">{formData.loanNumber}</Badge>
                  </div>
                )}
                {formData.escrowNumber && (
                  <div className="flex items-center gap-1">
                    <span className="font-medium">Escrow #:</span>
                    <Badge variant="outline">{formData.escrowNumber}</Badge>
                  </div>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="borrowerName">Borrower Name</Label>
                <Input
                  id="borrowerName"
                  value={formData.borrowerName || ''}
                  onChange={(e) => handleInputChange('borrowerName', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loanStatus">Loan Status</Label>
                <Select 
                  value={formData.loanStatus || ''} 
                  onValueChange={(value) => handleInputChange('loanStatus', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paid_off">Paid Off</SelectItem>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="foreclosure">Foreclosure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Property Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Property Information</h3>
              <div className="space-y-2">
                <Label htmlFor="propertyAddress">Property Address</Label>
                <Textarea
                  id="propertyAddress"
                  value={formData.propertyAddress || ''}
                  onChange={(e) => handleInputChange('propertyAddress', e.target.value)}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="propertyType">Property Type</Label>
                  <Select 
                    value={formData.propertyType || ''} 
                    onValueChange={(value) => handleInputChange('propertyType', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single_family">Single Family</SelectItem>
                      <SelectItem value="condo">Condominium</SelectItem>
                      <SelectItem value="townhouse">Townhouse</SelectItem>
                      <SelectItem value="multi_family">Multi-Family</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="propertyValue">Property Value</Label>
                  <Input
                    id="propertyValue"
                    type="number"
                    value={formData.propertyValue || ''}
                    onChange={(e) => handleInputChange('propertyValue', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="downPayment">Down Payment</Label>
                  <Input
                    id="downPayment"
                    type="number"
                    value={formData.downPayment || ''}
                    onChange={(e) => handleInputChange('downPayment', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            {/* Loan Terms */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Loan Terms</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="loanAmount">Loan Amount</Label>
                  <Input
                    id="loanAmount"
                    type="number"
                    value={formData.loanAmount || ''}
                    onChange={(e) => handleInputChange('loanAmount', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interestRate">Interest Rate (%)</Label>
                  <Input
                    id="interestRate"
                    type="number"
                    step="0.001"
                    value={formData.interestRate || ''}
                    onChange={(e) => handleInputChange('interestRate', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loanTerm">Loan Term (Months)</Label>
                  <Input
                    id="loanTerm"
                    type="number"
                    value={formData.loanTerm || ''}
                    onChange={(e) => handleInputChange('loanTerm', parseFloat(e.target.value) || 360)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="loanType">Loan Type</Label>
                  <Select 
                    value={formData.loanType || ''} 
                    onValueChange={(value) => handleInputChange('loanType', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conventional">Conventional</SelectItem>
                      <SelectItem value="fha">FHA</SelectItem>
                      <SelectItem value="va">VA</SelectItem>
                      <SelectItem value="usda">USDA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="closingCosts">Closing Costs</Label>
                  <Input
                    id="closingCosts"
                    type="number"
                    value={formData.closingCosts || ''}
                    onChange={(e) => handleInputChange('closingCosts', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Contact Information</h3>
              
              {/* Borrower Contact */}
              <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                <h4 className="text-md font-medium text-gray-700">Borrower</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="borrowerName">Contact Name</Label>
                    <Input
                      id="borrowerName"
                      value={formData.borrowerName || ''}
                      onChange={(e) => handleInputChange('borrowerName', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="borrowerCompanyName">Company Name</Label>
                    <Input
                      id="borrowerCompanyName"
                      value={formData.borrowerCompanyName || ''}
                      onChange={(e) => handleInputChange('borrowerCompanyName', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="borrowerPhone">Phone</Label>
                    <Input
                      id="borrowerPhone"
                      value={formData.borrowerPhone || ''}
                      onChange={(e) => handleInputChange('borrowerPhone', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="borrowerEmail">Email</Label>
                    <Input
                      id="borrowerEmail"
                      type="email"
                      value={formData.borrowerEmail || ''}
                      onChange={(e) => handleInputChange('borrowerEmail', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="borrowerSSN">SSN</Label>
                    <Input
                      id="borrowerSSN"
                      value={formData.borrowerSSN || ''}
                      onChange={(e) => handleInputChange('borrowerSSN', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="borrowerIncome">Monthly Income</Label>
                    <Input
                      id="borrowerIncome"
                      type="number"
                      value={formData.borrowerIncome || ''}
                      onChange={(e) => handleInputChange('borrowerIncome', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="borrowerAddress">Street Address</Label>
                    <Input
                      id="borrowerAddress"
                      value={formData.borrowerAddress || ''}
                      onChange={(e) => handleInputChange('borrowerAddress', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="borrowerCity">City</Label>
                    <Input
                      id="borrowerCity"
                      value={formData.borrowerCity || ''}
                      onChange={(e) => handleInputChange('borrowerCity', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="borrowerState">State</Label>
                    <Input
                      id="borrowerState"
                      value={formData.borrowerState || ''}
                      onChange={(e) => handleInputChange('borrowerState', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="borrowerZip">Zip Code</Label>
                    <Input
                      id="borrowerZip"
                      value={formData.borrowerZip || ''}
                      onChange={(e) => handleInputChange('borrowerZip', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Trustee Contact */}
              <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                <h4 className="text-md font-medium text-gray-700">Trustee</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="trusteeName">Contact Name</Label>
                    <Input
                      id="trusteeName"
                      value={formData.trusteeName || ''}
                      onChange={(e) => handleInputChange('trusteeName', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trusteeCompanyName">Company Name</Label>
                    <Input
                      id="trusteeCompanyName"
                      value={formData.trusteeCompanyName || ''}
                      onChange={(e) => handleInputChange('trusteeCompanyName', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trusteePhone">Phone</Label>
                    <Input
                      id="trusteePhone"
                      value={formData.trusteePhone || ''}
                      onChange={(e) => handleInputChange('trusteePhone', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trusteeEmail">Email</Label>
                    <Input
                      id="trusteeEmail"
                      type="email"
                      value={formData.trusteeEmail || ''}
                      onChange={(e) => handleInputChange('trusteeEmail', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="trusteeStreetAddress">Street Address</Label>
                    <Input
                      id="trusteeStreetAddress"
                      value={formData.trusteeStreetAddress || ''}
                      onChange={(e) => handleInputChange('trusteeStreetAddress', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trusteeCity">City</Label>
                    <Input
                      id="trusteeCity"
                      value={formData.trusteeCity || ''}
                      onChange={(e) => handleInputChange('trusteeCity', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trusteeState">State</Label>
                    <Input
                      id="trusteeState"
                      value={formData.trusteeState || ''}
                      onChange={(e) => handleInputChange('trusteeState', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trusteeZipCode">Zip Code</Label>
                    <Input
                      id="trusteeZipCode"
                      value={formData.trusteeZipCode || ''}
                      onChange={(e) => handleInputChange('trusteeZipCode', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Beneficiary Contact */}
              <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                <h4 className="text-md font-medium text-gray-700">Beneficiary</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

              {/* Escrow Company Contact */}
              <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                <h4 className="text-md font-medium text-gray-700">Escrow Company</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="escrowCompanyName">Company Name</Label>
                    <Input
                      id="escrowCompanyName"
                      value={formData.escrowCompanyName || ''}
                      onChange={(e) => handleInputChange('escrowCompanyName', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="escrowCompanyPhone">Phone</Label>
                    <Input
                      id="escrowCompanyPhone"
                      value={formData.escrowCompanyPhone || ''}
                      onChange={(e) => handleInputChange('escrowCompanyPhone', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="escrowCompanyEmail">Email</Label>
                    <Input
                      id="escrowCompanyEmail"
                      type="email"
                      value={formData.escrowCompanyEmail || ''}
                      onChange={(e) => handleInputChange('escrowCompanyEmail', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="escrowCompanyStreetAddress">Street Address</Label>
                    <Input
                      id="escrowCompanyStreetAddress"
                      value={formData.escrowCompanyStreetAddress || ''}
                      onChange={(e) => handleInputChange('escrowCompanyStreetAddress', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="escrowCompanyCity">City</Label>
                    <Input
                      id="escrowCompanyCity"
                      value={formData.escrowCompanyCity || ''}
                      onChange={(e) => handleInputChange('escrowCompanyCity', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="escrowCompanyState">State</Label>
                    <Input
                      id="escrowCompanyState"
                      value={formData.escrowCompanyState || ''}
                      onChange={(e) => handleInputChange('escrowCompanyState', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="escrowCompanyZipCode">Zip Code</Label>
                    <Input
                      id="escrowCompanyZipCode"
                      value={formData.escrowCompanyZipCode || ''}
                      onChange={(e) => handleInputChange('escrowCompanyZipCode', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Important Dates */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Important Dates</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstPaymentDate">First Payment Date</Label>
                  <Input
                    id="firstPaymentDate"
                    type="date"
                    value={formData.firstPaymentDate || ''}
                    onChange={(e) => handleInputChange('firstPaymentDate', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nextPaymentDate">Next Payment Date</Label>
                  <Input
                    id="nextPaymentDate"
                    type="date"
                    value={formData.nextPaymentDate || ''}
                    onChange={(e) => handleInputChange('nextPaymentDate', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maturityDate">Maturity Date</Label>
                  <Input
                    id="maturityDate"
                    type="date"
                    value={formData.maturityDate || ''}
                    onChange={(e) => handleInputChange('maturityDate', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prepaymentExpirationDate">Prepayment Penalty Expiration</Label>
                  <Input
                    id="prepaymentExpirationDate"
                    type="date"
                    value={formData.prepaymentExpirationDate || ''}
                    onChange={(e) => handleInputChange('prepaymentExpirationDate', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Monthly Expenses */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Monthly Expenses</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hazardInsurance">Hazard Insurance</Label>
                  <Input
                    id="hazardInsurance"
                    type="number"
                    value={formData.hazardInsurance || ''}
                    onChange={(e) => handleInputChange('hazardInsurance', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="propertyTaxes">Property Taxes</Label>
                  <Input
                    id="propertyTaxes"
                    type="number"
                    value={formData.propertyTaxes || ''}
                    onChange={(e) => handleInputChange('propertyTaxes', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hoaFees">HOA Fees</Label>
                  <Input
                    id="hoaFees"
                    type="number"
                    value={formData.hoaFees || ''}
                    onChange={(e) => handleInputChange('hoaFees', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pmiAmount">PMI Amount</Label>
                  <Input
                    id="pmiAmount"
                    type="number"
                    value={formData.pmiAmount || ''}
                    onChange={(e) => handleInputChange('pmiAmount', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="servicingFee">Servicing Fee</Label>
                <Input
                  id="servicingFee"
                  type="number"
                  value={formData.servicingFee || ''}
                  onChange={(e) => handleInputChange('servicingFee', parseFloat(e.target.value) || 25)}
                />
              </div>
            </div>

            {/* Document Management Section */}
            <div className="space-y-4 border-t pt-6 mt-6">
              <h3 className="text-lg font-semibold flex items-center text-blue-600">
                <FileText className="mr-2 h-5 w-5" />
                Document Management
              </h3>
              
              {/* Existing Documents */}
              {documents && documents.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-md font-medium text-gray-700">Attached Documents</h4>
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
                            <p className="font-medium text-gray-900 hover:text-blue-600 underline">{doc.title || doc.fileName}</p>
                            <p className="text-sm text-gray-500 hover:text-blue-500 cursor-pointer">{doc.description}</p>
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
              )}

              {/* Upload New Documents */}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-700 mb-3">
                  Upload additional loan documents, contracts, and supporting files
                </p>
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

            {/* Actions */}
            <div className="flex gap-3 pt-6">
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
          </CardContent>
        </Card>
      </div>
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