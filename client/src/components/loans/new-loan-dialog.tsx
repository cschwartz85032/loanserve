import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LOAN_STATUSES, LOAN_TYPES } from "@/lib/constants";

interface NewLoanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewLoanDialog({ open, onOpenChange }: NewLoanDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    loanNumber: "",
    propertyId: null as number | null,
    borrowerId: "",
    lenderId: "",
    servicerId: "",
    investorId: "",
    originalAmount: "",
    principalBalance: "",
    interestRate: "",
    termMonths: "",
    monthlyPaymentAmount: "",
    monthlyPayment: "",
    nextPaymentDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
    maturityDate: "",
    status: "active",
    loanType: "conventional",
    propertyAddress: "",
    propertyCity: "",
    propertyState: "",
    propertyZip: "",
    propertyValue: "",
    loanToValue: "",
    originationDate: new Date().toISOString().split('T')[0],
    firstPaymentDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
    notes: "",
    currentInterestRate: "",
    currentPaymentAmount: "",
    escrowBalance: "0",
    lateFeeAmount: "25",
    gracePeroidDays: 15,
    prepaymentPenalty: "0"
  });

  const createLoanMutation = useMutation({
    mutationFn: async (loanData: any) => {
      // Format the data to match the database schema
      const formattedData = {
        loanNumber: loanData.loanNumber,
        propertyId: loanData.propertyId,
        lenderId: loanData.lenderId ? parseInt(loanData.lenderId) : null,
        servicerId: loanData.servicerId ? parseInt(loanData.servicerId) : null,
        investorId: loanData.investorId ? parseInt(loanData.investorId) : null,
        originalAmount: loanData.originalAmount,
        principalBalance: loanData.principalBalance || loanData.originalAmount,
        interestRate: loanData.interestRate,
        currentInterestRate: loanData.currentInterestRate || loanData.interestRate,
        termMonths: parseInt(loanData.termMonths),
        monthlyPaymentAmount: loanData.monthlyPaymentAmount,
        currentPaymentAmount: loanData.currentPaymentAmount || loanData.monthlyPaymentAmount,
        nextPaymentDate: loanData.nextPaymentDate,
        maturityDate: loanData.maturityDate,
        status: loanData.status,
        loanType: loanData.loanType,
        originationDate: loanData.originationDate,
        firstPaymentDate: loanData.firstPaymentDate,
        escrowBalance: loanData.escrowBalance || "0",
        lateFeeAmount: loanData.lateFeeAmount || "25",
        gracePeroidDays: loanData.gracePeroidDays || 15,
        prepaymentPenalty: loanData.prepaymentPenalty || "0",
        notes: loanData.notes
      };
      
      const res = await apiRequest("POST", "/api/loans", formattedData);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create loan");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loans/metrics"] });
      toast({
        title: "Success",
        description: "Loan created successfully",
      });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-calculate fields
      if (field === "originalAmount" || field === "interestRate" || field === "termMonths") {
        const principal = parseFloat(updated.originalAmount) || 0;
        const rate = (parseFloat(updated.interestRate) || 0) / 100 / 12;
        const months = parseInt(updated.termMonths) || 0;
        
        if (principal > 0 && rate > 0 && months > 0) {
          const monthlyPayment = (principal * rate * Math.pow(1 + rate, months)) / (Math.pow(1 + rate, months) - 1);
          updated.monthlyPaymentAmount = monthlyPayment.toFixed(2);
          updated.monthlyPayment = monthlyPayment.toFixed(2);
          updated.currentPaymentAmount = monthlyPayment.toFixed(2);
          updated.principalBalance = updated.originalAmount;
          
          // Calculate maturity date
          const maturityDate = new Date(updated.originationDate);
          maturityDate.setMonth(maturityDate.getMonth() + months);
          updated.maturityDate = maturityDate.toISOString().split('T')[0];
        }
      }
      
      // Calculate LTV
      if (field === "originalAmount" || field === "propertyValue") {
        const loanAmount = parseFloat(updated.originalAmount) || 0;
        const propertyValue = parseFloat(updated.propertyValue) || 0;
        if (loanAmount > 0 && propertyValue > 0) {
          updated.loanToValue = ((loanAmount / propertyValue) * 100).toFixed(2);
        }
      }
      
      return updated;
    });
  };

  const generateLoanNumber = () => {
    const prefix = "LN";
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    handleInputChange("loanNumber", `${prefix}${timestamp}${random}`);
  };

  const resetForm = () => {
    setFormData({
      loanNumber: "",
      propertyId: null,
      borrowerId: "",
      lenderId: "",
      servicerId: "",
      investorId: "",
      originalAmount: "",
      principalBalance: "",
      interestRate: "",
      termMonths: "",
      monthlyPaymentAmount: "",
      monthlyPayment: "",
      nextPaymentDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
      maturityDate: "",
      status: "active",
      loanType: "conventional",
      propertyAddress: "",
      propertyCity: "",
      propertyState: "",
      propertyZip: "",
      propertyValue: "",
      loanToValue: "",
      originationDate: new Date().toISOString().split('T')[0],
      firstPaymentDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
      notes: "",
      currentInterestRate: "",
      currentPaymentAmount: "",
      escrowBalance: "0",
      lateFeeAmount: "25",
      gracePeroidDays: 15,
      prepaymentPenalty: "0"
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prepare submission data matching database schema
    const submitData = {
      ...formData,
      originalAmount: parseFloat(formData.originalAmount),
      principalBalance: parseFloat(formData.principalBalance || formData.originalAmount),
      interestRate: parseFloat(formData.interestRate),
      currentInterestRate: parseFloat(formData.currentInterestRate || formData.interestRate),
      termMonths: parseInt(formData.termMonths),
      monthlyPaymentAmount: parseFloat(formData.monthlyPaymentAmount),
      currentPaymentAmount: parseFloat(formData.currentPaymentAmount || formData.monthlyPaymentAmount),
      propertyValue: formData.propertyValue ? parseFloat(formData.propertyValue) : null,
      loanToValue: formData.loanToValue ? parseFloat(formData.loanToValue) : null,
      lenderId: formData.lenderId ? parseInt(formData.lenderId) : user?.id,
      servicerId: formData.servicerId ? parseInt(formData.servicerId) : user?.id,
      investorId: formData.investorId ? parseInt(formData.investorId) : null
    };
    
    createLoanMutation.mutate(submitData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Create New Loan</DialogTitle>
          <DialogDescription>
            Enter the loan details below to create a new loan account.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <ScrollArea className="h-[60vh] px-1">
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic">Basic Information</TabsTrigger>
                <TabsTrigger value="property">Property Details</TabsTrigger>
                <TabsTrigger value="parties">Parties & Notes</TabsTrigger>
              </TabsList>
              
              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="loanNumber">Loan Number *</Label>
                    <div className="flex space-x-2">
                      <Input
                        id="loanNumber"
                        value={formData.loanNumber}
                        onChange={(e) => handleInputChange("loanNumber", e.target.value)}
                        placeholder="Enter or generate"
                        required
                      />
                      <Button type="button" variant="outline" onClick={generateLoanNumber}>
                        Generate
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="loanType">Loan Type *</Label>
                    <Select value={formData.loanType} onValueChange={(value) => handleInputChange("loanType", value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LOAN_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="originalAmount">Original Amount *</Label>
                    <Input
                      id="originalAmount"
                      type="number"
                      step="0.01"
                      value={formData.originalAmount}
                      onChange={(e) => handleInputChange("originalAmount", e.target.value)}
                      placeholder="0.00"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="interestRate">Interest Rate (%) *</Label>
                    <Input
                      id="interestRate"
                      type="number"
                      step="0.001"
                      value={formData.interestRate}
                      onChange={(e) => handleInputChange("interestRate", e.target.value)}
                      placeholder="0.000"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="termMonths">Term (Months) *</Label>
                    <Input
                      id="termMonths"
                      type="number"
                      value={formData.termMonths}
                      onChange={(e) => handleInputChange("termMonths", e.target.value)}
                      placeholder="360"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="monthlyPayment">Monthly Payment</Label>
                    <Input
                      id="monthlyPayment"
                      type="number"
                      step="0.01"
                      value={formData.monthlyPayment}
                      readOnly
                      className="bg-slate-50"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="originationDate">Origination Date *</Label>
                    <Input
                      id="originationDate"
                      type="date"
                      value={formData.originationDate}
                      onChange={(e) => handleInputChange("originationDate", e.target.value)}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="firstPaymentDate">First Payment Date *</Label>
                    <Input
                      id="firstPaymentDate"
                      type="date"
                      value={formData.firstPaymentDate}
                      onChange={(e) => handleInputChange("firstPaymentDate", e.target.value)}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="maturityDate">Maturity Date</Label>
                    <Input
                      id="maturityDate"
                      type="date"
                      value={formData.maturityDate}
                      readOnly
                      className="bg-slate-50"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={formData.status} onValueChange={(value) => handleInputChange("status", value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LOAN_STATUSES.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="property" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="propertyAddress">Property Address</Label>
                    <Input
                      id="propertyAddress"
                      value={formData.propertyAddress}
                      onChange={(e) => handleInputChange("propertyAddress", e.target.value)}
                      placeholder="123 Main Street"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="propertyCity">City</Label>
                    <Input
                      id="propertyCity"
                      value={formData.propertyCity}
                      onChange={(e) => handleInputChange("propertyCity", e.target.value)}
                      placeholder="City"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="propertyState">State</Label>
                    <Input
                      id="propertyState"
                      value={formData.propertyState}
                      onChange={(e) => handleInputChange("propertyState", e.target.value)}
                      placeholder="State"
                      maxLength={2}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="propertyZip">ZIP Code</Label>
                    <Input
                      id="propertyZip"
                      value={formData.propertyZip}
                      onChange={(e) => handleInputChange("propertyZip", e.target.value)}
                      placeholder="12345"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="propertyValue">Property Value</Label>
                    <Input
                      id="propertyValue"
                      type="number"
                      step="0.01"
                      value={formData.propertyValue}
                      onChange={(e) => handleInputChange("propertyValue", e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="loanToValue">Loan-to-Value (%)</Label>
                    <Input
                      id="loanToValue"
                      type="number"
                      step="0.01"
                      value={formData.loanToValue}
                      readOnly
                      className="bg-slate-50"
                    />
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="parties" className="space-y-4 mt-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="borrowerId">Borrower ID</Label>
                    <Input
                      id="borrowerId"
                      value={formData.borrowerId}
                      onChange={(e) => handleInputChange("borrowerId", e.target.value)}
                      placeholder="Enter borrower ID (optional)"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lenderId">Lender ID</Label>
                    <Input
                      id="lenderId"
                      value={formData.lenderId}
                      onChange={(e) => handleInputChange("lenderId", e.target.value)}
                      placeholder="Enter lender ID"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="investorId">Investor ID</Label>
                    <Input
                      id="investorId"
                      value={formData.investorId}
                      onChange={(e) => handleInputChange("investorId", e.target.value)}
                      placeholder="Enter investor ID (optional)"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => handleInputChange("notes", e.target.value)}
                      placeholder="Additional notes or comments..."
                      rows={4}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </ScrollArea>
          
          <div className="flex justify-end space-x-2 mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createLoanMutation.isPending}>
              {createLoanMutation.isPending ? "Creating..." : "Create Loan"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}