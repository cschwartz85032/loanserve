import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Calculator, DollarSign, Home, Calendar, FileText, Download, Eye, Trash2 } from "lucide-react";
import { DocumentUploader } from "@/components/documents/document-uploader";

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

  // Update form data when loan is loaded
  useEffect(() => {
    if (loan) {
      setFormData(loan);
      calculatePayments(loan);
    }
  }, [loan]);

  const calculatePayments = (loanData: any) => {
    const principal = parseFloat(loanData.loanAmount) || 0;
    const annualRate = parseFloat(loanData.interestRate) || 0;
    const termYears = parseFloat(loanData.loanTerm) || 30;
    const monthlyRate = annualRate / 100 / 12;
    const numPayments = termYears * 12;

    // Principal & Interest calculation
    let principalAndInterest = 0;
    if (monthlyRate > 0) {
      principalAndInterest = principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / 
                           (Math.pow(1 + monthlyRate, numPayments) - 1);
    } else {
      principalAndInterest = principal / numPayments;
    }

    // Escrow breakdown
    const hazardInsurance = parseFloat(loanData.hazardInsurance) || 0;
    const propertyTaxes = parseFloat(loanData.propertyTaxes) || 0;
    const escrowCushion = (hazardInsurance + propertyTaxes) * 0.1667; // 2 months cushion
    const escrow = hazardInsurance + propertyTaxes + escrowCushion;

    // Other fees
    const hoaFees = parseFloat(loanData.hoaFees) || 0;
    const pmi = parseFloat(loanData.pmiAmount) || 0;
    const servicingFee = parseFloat(loanData.servicingFee) || 25;

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

  // Recalculate when form data changes
  useEffect(() => {
    if (formData.loanAmount || formData.interestRate || formData.loanTerm) {
      calculatePayments(formData);
    }
  }, [formData.loanAmount, formData.interestRate, formData.loanTerm, formData.hazardInsurance, formData.propertyTaxes, formData.hoaFees, formData.pmiAmount, formData.servicingFee]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      // Convert date strings to proper format for database
      const cleanData = { ...data };
      
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

      if (cleanData.firstPaymentDate) {
        cleanData.firstPaymentDate = formatDateForDb(cleanData.firstPaymentDate);
      }
      if (cleanData.nextPaymentDate) {
        cleanData.nextPaymentDate = formatDateForDb(cleanData.nextPaymentDate);
      }
      if (cleanData.maturityDate) {
        cleanData.maturityDate = formatDateForDb(cleanData.maturityDate);
      }
      if (cleanData.prepaymentExpirationDate) {
        cleanData.prepaymentExpirationDate = formatDateForDb(cleanData.prepaymentExpirationDate);
      }
      
      const res = await apiRequest("PUT", `/api/loans/${loanId}`, cleanData);
      if (!res.ok) throw new Error('Failed to update loan');
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
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
                  
                  {/* Escrow Breakdown */}
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

                <Separator />

                {/* Loan Summary */}
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-gray-500" />
                    <span>Loan Amount: {formatCurrency(parseFloat(formData.loanAmount) || 0)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{formData.interestRate || 0}% APR</Badge>
                    <Badge variant="outline">{formData.loanTerm || 30} years</Badge>
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
            <CardTitle>Edit Loan Details</CardTitle>
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
                  <Label htmlFor="loanTerm">Loan Term (Years)</Label>
                  <Input
                    id="loanTerm"
                    type="number"
                    value={formData.loanTerm || ''}
                    onChange={(e) => handleInputChange('loanTerm', parseFloat(e.target.value) || 30)}
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
                          <div>
                            <p className="font-medium text-gray-900">{doc.title || doc.fileName}</p>
                            <p className="text-sm text-gray-500">{doc.description}</p>
                            <p className="text-xs text-gray-400">
                              {doc.mimeType} • {Math.round((doc.fileSize || 0) / 1024)}KB
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(doc.storageUrl, '_blank')}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = doc.storageUrl;
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
    </div>
  );
}