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

interface SimpleNewLoanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SimpleNewLoanDialog({ open, onOpenChange }: SimpleNewLoanDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    loanNumber: "",
    originalAmount: "",
    interestRate: "",
    termMonths: "",
    propertyAddress: "",
    propertyCity: "",
    propertyState: "",
    propertyZip: ""
  });

  const createLoanMutation = useMutation({
    mutationFn: async (data: any) => {
      // First create the property
      const propertyData = {
        propertyType: "single_family",
        address: data.propertyAddress,
        city: data.propertyCity,
        state: data.propertyState,
        zipCode: data.propertyZip
      };
      
      const propertyResponse = await apiRequest("POST", "/api/properties", propertyData);
      const property = await propertyResponse.json();
      
      // Then create the loan with the property ID
      const loanData = {
        ...data,
        propertyId: property.id,
        rateType: "fixed",
        status: "active",
        maturityDate: new Date(new Date().setMonth(new Date().getMonth() + parseInt(data.termMonths))).toISOString().split('T')[0]
      };
      
      const response = await apiRequest("POST", "/api/loans", loanData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Loan created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loans/metrics"] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create loan",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      loanNumber: "",
      originalAmount: "",
      interestRate: "",
      termMonths: "",
      propertyAddress: "",
      propertyCity: "",
      propertyState: "",
      propertyZip: ""
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Calculate monthly payment
    const principal = parseFloat(formData.originalAmount) || 0;
    const rate = (parseFloat(formData.interestRate) || 0) / 100 / 12;
    const months = parseInt(formData.termMonths) || 0;
    
    let monthlyPayment = 0;
    if (principal > 0 && rate > 0 && months > 0) {
      monthlyPayment = (principal * rate * Math.pow(1 + rate, months)) / (Math.pow(1 + rate, months) - 1);
    }
    
    const submitData = {
      loanNumber: formData.loanNumber,
      originalAmount: parseFloat(formData.originalAmount),
      principalBalance: parseFloat(formData.originalAmount),
      interestRate: parseFloat(formData.interestRate),
      loanTerm: parseInt(formData.termMonths),
      termMonths: parseInt(formData.termMonths),
      paymentAmount: monthlyPayment,
      propertyAddress: formData.propertyAddress,
      propertyCity: formData.propertyCity,
      propertyState: formData.propertyState,
      propertyZip: formData.propertyZip,
      loanType: "conventional",
      firstPaymentDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
      nextPaymentDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
      lenderId: user?.id,
      servicerId: user?.id
    };
    
    createLoanMutation.mutate(submitData);
  };

  const generateLoanNumber = () => {
    const prefix = "LN";
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    setFormData(prev => ({ ...prev, loanNumber: `${prefix}${timestamp}${random}` }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Loan</DialogTitle>
          <DialogDescription>
            Enter basic loan information below.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="loanNumber">Loan Number</Label>
            <div className="flex space-x-2">
              <Input
                id="loanNumber"
                value={formData.loanNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, loanNumber: e.target.value }))}
                placeholder="Enter or generate"
                required
              />
              <Button type="button" variant="outline" onClick={generateLoanNumber}>
                Generate
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="originalAmount">Loan Amount</Label>
            <Input
              id="originalAmount"
              type="number"
              step="0.01"
              value={formData.originalAmount}
              onChange={(e) => setFormData(prev => ({ ...prev, originalAmount: e.target.value }))}
              placeholder="0.00"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="interestRate">Interest Rate (%)</Label>
            <Input
              id="interestRate"
              type="number"
              step="0.01"
              value={formData.interestRate}
              onChange={(e) => setFormData(prev => ({ ...prev, interestRate: e.target.value }))}
              placeholder="0.00"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="termMonths">Term (Months)</Label>
            <Input
              id="termMonths"
              type="number"
              value={formData.termMonths}
              onChange={(e) => setFormData(prev => ({ ...prev, termMonths: e.target.value }))}
              placeholder="360"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="propertyAddress">Property Address</Label>
            <Input
              id="propertyAddress"
              value={formData.propertyAddress}
              onChange={(e) => setFormData(prev => ({ ...prev, propertyAddress: e.target.value }))}
              placeholder="123 Main St"
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="propertyCity">City</Label>
              <Input
                id="propertyCity"
                value={formData.propertyCity}
                onChange={(e) => setFormData(prev => ({ ...prev, propertyCity: e.target.value }))}
                placeholder="City"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="propertyState">State</Label>
              <Input
                id="propertyState"
                value={formData.propertyState}
                onChange={(e) => setFormData(prev => ({ ...prev, propertyState: e.target.value }))}
                placeholder="State"
                required
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="propertyZip">ZIP Code</Label>
            <Input
              id="propertyZip"
              value={formData.propertyZip}
              onChange={(e) => setFormData(prev => ({ ...prev, propertyZip: e.target.value }))}
              placeholder="12345"
              required
            />
          </div>
          
          <div className="flex justify-end space-x-2 pt-4">
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