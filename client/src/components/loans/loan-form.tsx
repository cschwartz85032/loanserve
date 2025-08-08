import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { insertLoanSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LOAN_STATUSES, LOAN_TYPES } from "@/lib/constants";

interface LoanFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function LoanForm({ onSuccess, onCancel }: LoanFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    loanNumber: "",
    borrowerId: "",
    lenderId: user?.id || "",
    investorId: "",
    originalAmount: "",
    currentBalance: "",
    interestRate: "",
    termMonths: "",
    monthlyPayment: "",
    nextPaymentDate: "",
    maturityDate: "",
    status: "originated",
    propertyAddress: "",
    propertyCity: "",
    propertyState: "",
    propertyZip: "",
    propertyValue: "",
    loanToValue: "",
    originationDate: "",
    firstPaymentDate: "",
    notes: ""
  });

  const createLoanMutation = useMutation({
    mutationFn: async (loanData: any) => {
      const res = await apiRequest("POST", "/api/loans", loanData);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loans/metrics"] });
      toast({
        title: "Success",
        description: "Loan created successfully",
      });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Convert string values to appropriate types
      const processedData = {
        ...formData,
        originalAmount: parseFloat(formData.originalAmount),
        currentBalance: parseFloat(formData.currentBalance || formData.originalAmount),
        interestRate: parseFloat(formData.interestRate),
        termMonths: parseInt(formData.termMonths),
        monthlyPayment: parseFloat(formData.monthlyPayment),
        propertyValue: formData.propertyValue ? parseFloat(formData.propertyValue) : null,
        loanToValue: formData.loanToValue ? parseFloat(formData.loanToValue) : null,
        nextPaymentDate: formData.nextPaymentDate || null,
        maturityDate: formData.maturityDate || null,
        originationDate: formData.originationDate || null,
        firstPaymentDate: formData.firstPaymentDate || null,
        borrowerId: formData.borrowerId || null,
        investorId: formData.investorId || null,
      };

      // Validate with schema
      const validatedData = insertLoanSchema.parse(processedData);
      createLoanMutation.mutate(validatedData);
    } catch (error: any) {
      toast({
        title: "Validation Error",
        description: error.message || "Please check all required fields",
        variant: "destructive",
      });
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const generateLoanNumber = () => {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    setFormData(prev => ({ ...prev, loanNumber: `LN${timestamp}${random}` }));
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Create New Loan</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Loan Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="loanNumber">Loan Number *</Label>
              <div className="flex space-x-2">
                <Input
                  id="loanNumber"
                  value={formData.loanNumber}
                  onChange={(e) => handleInputChange("loanNumber", e.target.value)}
                  placeholder="Enter loan number"
                  required
                />
                <Button type="button" variant="outline" onClick={generateLoanNumber}>
                  Generate
                </Button>
              </div>
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
              <Label htmlFor="monthlyPayment">Monthly Payment *</Label>
              <Input
                id="monthlyPayment"
                type="number"
                step="0.01"
                value={formData.monthlyPayment}
                onChange={(e) => handleInputChange("monthlyPayment", e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          {/* Property Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Property Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="propertyAddress">Property Address *</Label>
                <Input
                  id="propertyAddress"
                  value={formData.propertyAddress}
                  onChange={(e) => handleInputChange("propertyAddress", e.target.value)}
                  placeholder="Enter property address"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="propertyCity">City *</Label>
                <Input
                  id="propertyCity"
                  value={formData.propertyCity}
                  onChange={(e) => handleInputChange("propertyCity", e.target.value)}
                  placeholder="Enter city"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="propertyState">State *</Label>
                <Input
                  id="propertyState"
                  value={formData.propertyState}
                  onChange={(e) => handleInputChange("propertyState", e.target.value)}
                  placeholder="Enter state"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="propertyZip">ZIP Code *</Label>
                <Input
                  id="propertyZip"
                  value={formData.propertyZip}
                  onChange={(e) => handleInputChange("propertyZip", e.target.value)}
                  placeholder="Enter ZIP code"
                  required
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
            </div>
          </div>

          {/* Dates */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Important Dates</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="originationDate">Origination Date</Label>
                <Input
                  id="originationDate"
                  type="date"
                  value={formData.originationDate}
                  onChange={(e) => handleInputChange("originationDate", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="firstPaymentDate">First Payment Date</Label>
                <Input
                  id="firstPaymentDate"
                  type="date"
                  value={formData.firstPaymentDate}
                  onChange={(e) => handleInputChange("firstPaymentDate", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nextPaymentDate">Next Payment Date</Label>
                <Input
                  id="nextPaymentDate"
                  type="date"
                  value={formData.nextPaymentDate}
                  onChange={(e) => handleInputChange("nextPaymentDate", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maturityDate">Maturity Date</Label>
                <Input
                  id="maturityDate"
                  type="date"
                  value={formData.maturityDate}
                  onChange={(e) => handleInputChange("maturityDate", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange("notes", e.target.value)}
              placeholder="Additional notes about this loan"
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-6 border-t">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={createLoanMutation.isPending}>
              {createLoanMutation.isPending ? "Creating..." : "Create Loan"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
