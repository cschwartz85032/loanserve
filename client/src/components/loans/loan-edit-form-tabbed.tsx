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
import { DocumentUploader } from "@/components/documents/document-uploader";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import { LoanAccountingLedger } from "@/components/loans/loan-accounting-ledger";
import { LoanInvestorsManager } from "@/components/loans/loan-investors-manager";

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

  // Fetch audit logs for this loan
  const { data: auditLogs } = useQuery({
    queryKey: [`/api/audit-logs`, { loanId }],
    queryFn: async () => {
      const response = await fetch(`/api/audit-logs?loanId=${loanId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch audit logs');
      return response.json();
    },
    enabled: !!loanId
  });

  // Update form data when loan is loaded
  useEffect(() => {
    if (loan) {
      setFormData(loan);
      calculatePayments(loan);
    }
  }, [loan]);

  const calculatePayments = (loanData: any) => {
    // Use the actual payment amount from the database, not calculated
    const principalAndInterest = parseFloat(loanData.paymentAmount) || 0;

    const hazardInsurance = parseFloat(loanData.hazardInsurance) || 0;
    const propertyTaxes = parseFloat(loanData.propertyTaxes) || 0;
    const escrowCushion = (hazardInsurance + propertyTaxes) * 0.1667;
    const escrow = hazardInsurance + propertyTaxes + escrowCushion;

    const hoaFees = parseFloat(loanData.hoaFees) || 0;
    const pmi = parseFloat(loanData.pmiAmount) || 0;
    const servicingFee = parseFloat(loanData.servicingFee) || 0;

    const totalMonthlyPayment = principalAndInterest + escrow + hoaFees + pmi + servicingFee;

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
    if (formData.loanAmount || formData.interestRate || formData.loanTerm) {
      calculatePayments(formData);
    }
  }, [formData.loanAmount, formData.interestRate, formData.loanTerm, formData.hazardInsurance, formData.propertyTaxes, formData.hoaFees, formData.pmiAmount, formData.servicingFee]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return fetch(`/api/loans/${loanId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }).then(res => res.json());
    },
    onSuccess: (response) => {
      console.log('Update response:', response);
      queryClient.invalidateQueries({ queryKey: ['/api/loans'] });
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
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

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="details">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="beneficiaries">Beneficiary</TabsTrigger>
          <TabsTrigger value="escrows">Escrows</TabsTrigger>
          <TabsTrigger value="documents">Docs</TabsTrigger>
          <TabsTrigger value="accounting">Accounting</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>

        {/* Edit Loan Details Tab */}
        <TabsContent value="details" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Payment Calculations Panel */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="h-5 w-5" />
                    Payment Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {calculations && (
                    <>
                      <div className="p-4 bg-primary-50 rounded-lg">
                        <div className="text-center">
                          <p className="text-sm text-gray-600 mb-1">Total Monthly Payment</p>
                          <p className="text-2xl font-bold text-primary-700">
                            {formatCurrency(calculations.totalMonthlyPayment)}
                          </p>
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Principal & Interest</span>
                          <span className="font-semibold">{formatCurrency(calculations.principalAndInterest)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Escrow Total</span>
                          <span className="font-semibold">{formatCurrency(calculations.escrow)}</span>
                        </div>
                        <div className="ml-4 space-y-1 text-sm text-gray-600">
                          <div className="flex justify-between">
                            <span>• Hazard Insurance</span>
                            <span>{formatCurrency(calculations.breakdown.hazardInsurance)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>• Property Taxes</span>
                            <span>{formatCurrency(calculations.breakdown.propertyTaxes)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>• Escrow Cushion</span>
                            <span>{formatCurrency(calculations.breakdown.escrowCushion)}</span>
                          </div>
                        </div>
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
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Loan Details Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
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
                </CardContent>
              </Card>

              {/* Property Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Property Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="propertyAddress">Property Address</Label>
                    <Textarea
                      id="propertyAddress"
                      value={formData.propertyAddress || ''}
                      onChange={(e) => handleInputChange('propertyAddress', e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
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
                </CardContent>
              </Card>

              {/* Loan Terms */}
              <Card>
                <CardHeader>
                  <CardTitle>Loan Terms</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
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
                        step="0.01"
                        value={formData.interestRate || ''}
                        onChange={(e) => handleInputChange('interestRate', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="loanTerm">Loan Term (months)</Label>
                      <Input
                        id="loanTerm"
                        type="number"
                        value={formData.loanTerm || ''}
                        onChange={(e) => handleInputChange('loanTerm', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
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
                      <Label htmlFor="maturityDate">Maturity Date</Label>
                      <Input
                        id="maturityDate"
                        type="date"
                        value={formData.maturityDate || ''}
                        onChange={(e) => handleInputChange('maturityDate', e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Monthly Expenses */}
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Expenses</CardTitle>
                  <CardDescription>Additional costs included in monthly payment</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="propertyTax">Property Tax</Label>
                      <Input
                        id="propertyTax"
                        type="number"
                        value={formData.propertyTax || ''}
                        onChange={(e) => handleInputChange('propertyTax', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="homeInsurance">Home Insurance</Label>
                      <Input
                        id="homeInsurance"
                        type="number"
                        value={formData.homeInsurance || ''}
                        onChange={(e) => handleInputChange('homeInsurance', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
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
                      <Label htmlFor="pmi">PMI</Label>
                      <Input
                        id="pmi"
                        type="number"
                        value={formData.pmi || ''}
                        onChange={(e) => handleInputChange('pmi', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="servicingFee">Servicing Fee</Label>
                      <Input
                        id="servicingFee"
                        type="number"
                        value={formData.servicingFee || ''}
                        onChange={(e) => handleInputChange('servicingFee', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="otherMonthly">Other Monthly</Label>
                      <Input
                        id="otherMonthly"
                        type="number"
                        value={formData.otherMonthly || ''}
                        onChange={(e) => handleInputChange('otherMonthly', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Contacts Tab */}
        <TabsContent value="contacts" className="space-y-6">
          {/* Borrower Contact */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Borrower Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
              <div className="grid grid-cols-4 gap-4">
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
            </CardContent>
          </Card>

          {/* Trustee Contact */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Trustee Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
              <div className="grid grid-cols-4 gap-4">
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
            </CardContent>
          </Card>

          {/* Escrow Company Contact */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Escrow Company Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="escrowCompanyName">Company Name</Label>
                  <Input
                    id="escrowCompanyName"
                    value={formData.escrowCompanyName || ''}
                    onChange={(e) => handleInputChange('escrowCompanyName', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="escrowNumber">Escrow Number</Label>
                  <Input
                    id="escrowNumber"
                    value={formData.escrowNumber || ''}
                    onChange={(e) => handleInputChange('escrowNumber', e.target.value)}
                    placeholder="ESC-123456"
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
              </div>
              <div className="grid grid-cols-4 gap-4">
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
            </CardContent>
          </Card>
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Escrow Account Management
              </CardTitle>
              <CardDescription>
                Manage escrow account settings, payments, and disbursements
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Escrow Account Settings */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-md font-semibold">Account Settings</h4>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="escrowRequired">Escrow Required</Label>
                      <Select 
                        value={formData.escrowRequired ? 'yes' : 'no'} 
                        onValueChange={(value) => handleInputChange('escrowRequired', value === 'yes')}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes - Required</SelectItem>
                          <SelectItem value="no">No - Not Required</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="escrowWaived">Escrow Waived</Label>
                      <Select 
                        value={formData.escrowWaived ? 'yes' : 'no'} 
                        onValueChange={(value) => handleInputChange('escrowWaived', value === 'yes')}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes - Waived</SelectItem>
                          <SelectItem value="no">No - Active</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="monthlyEscrow">Monthly Escrow Amount</Label>
                      <Input
                        id="monthlyEscrow"
                        type="number"
                        step="0.01"
                        value={formData.monthlyEscrow || ''}
                        onChange={(e) => handleInputChange('monthlyEscrow', e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-md font-semibold">Escrow Items</h4>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="propertyTaxes">Annual Property Taxes</Label>
                      <Input
                        id="propertyTaxes"
                        type="number"
                        step="0.01"
                        value={formData.propertyTaxes || ''}
                        onChange={(e) => handleInputChange('propertyTaxes', e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hazardInsurance">Annual Hazard Insurance</Label>
                      <Input
                        id="hazardInsurance"
                        type="number"
                        step="0.01"
                        value={formData.hazardInsurance || ''}
                        onChange={(e) => handleInputChange('hazardInsurance', e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hoaFees">HOA Fees (if applicable)</Label>
                      <Input
                        id="hoaFees"
                        type="number"
                        step="0.01"
                        value={formData.hoaFees || ''}
                        onChange={(e) => handleInputChange('hoaFees', e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Escrow Analysis */}
              {calculations && (
                <div className="border-t pt-6">
                  <h4 className="text-md font-semibold mb-4">Escrow Analysis</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-sm text-gray-500">Monthly Collection</div>
                        <div className="text-2xl font-bold text-blue-600">
                          {formatCurrency(calculations.escrow)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Includes 2-month cushion
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-sm text-gray-500">Annual Disbursements</div>
                        <div className="text-2xl font-bold text-green-600">
                          {formatCurrency((calculations.breakdown.hazardInsurance + calculations.breakdown.propertyTaxes) * 12)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Taxes + Insurance
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-sm text-gray-500">Cushion Amount</div>
                        <div className="text-2xl font-bold text-purple-600">
                          {formatCurrency(calculations.breakdown.escrowCushion * 12)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          2-month reserve
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="border-t pt-6">
                <h4 className="text-md font-semibold mb-4">Quick Actions</h4>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Disbursement
                  </Button>
                  <Button variant="outline" size="sm">
                    <Calculator className="h-4 w-4 mr-2" />
                    Run Escrow Analysis
                  </Button>
                  <Button variant="outline" size="sm">
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Statement
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
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

        {/* Audit Trail Tab */}
        <TabsContent value="audit" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Audit Trail
              </CardTitle>
              <CardDescription>
                Complete history of all changes made to this loan
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditLogs && auditLogs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                        <TableCell>{log.userName || 'System'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.action}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {log.details}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No audit history available</p>
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