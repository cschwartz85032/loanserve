import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, Link, useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatDate } from '@/lib/utils';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { ArrowLeft, CreditCard, DollarSign, AlertCircle, CheckCircle } from 'lucide-react';

export function BorrowerMakePayment() {
  const { loanId } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedMethodId, setSelectedMethodId] = useState('');
  const [allocation, setAllocation] = useState({
    principal: 0,
    interest: 0,
    escrow: 0,
    fees: 0,
  });

  // Fetch loan details
  const { data: loanDetails, isLoading: loanLoading } = useQuery({
    queryKey: [`/api/borrower/loans/${loanId}`],
    enabled: !!loanId,
  });

  // Fetch payment methods
  const { data: paymentMethods = [], isLoading: methodsLoading } = useQuery({
    queryKey: ['/api/borrower/payment-methods'],
  });

  // Process payment mutation
  const paymentMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/borrower/loans/${loanId}/payments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/borrower/dashboard'] });
      queryClient.invalidateQueries({ queryKey: [`/api/borrower/loans/${loanId}/payments`] });
      
      toast({
        title: 'Payment Submitted',
        description: `Your payment of ${formatCurrency(parseFloat(paymentAmount))} has been submitted successfully.`,
      });

      // Redirect to confirmation page or dashboard
      setLocation('/borrowerportal/dashboard');
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Payment Failed',
        description: error.message || 'Failed to process payment. Please try again.',
      });
    },
  });

  const handlePaymentAmountChange = (value: string) => {
    setPaymentAmount(value);
    const amount = parseFloat(value) || 0;
    
    // Auto-allocate based on loan payment amount
    if (loanDetails?.loan) {
      const loan = loanDetails.loan;
      // Simple allocation logic - this would be more sophisticated in production
      const monthlyInterest = (loan.principalBalance * loan.interestRate / 100) / 12;
      const monthlyEscrow = loanDetails.escrow?.monthlyPayment || 0;
      const fees = 0; // Any outstanding fees would be calculated here
      const principal = Math.max(0, amount - monthlyInterest - monthlyEscrow - fees);

      setAllocation({
        principal: Math.min(principal, amount),
        interest: Math.min(monthlyInterest, amount),
        escrow: Math.min(monthlyEscrow, amount - monthlyInterest),
        fees: Math.min(fees, amount - monthlyInterest - monthlyEscrow),
      });
    }
  };

  const handleSubmitPayment = () => {
    if (!selectedMethodId) {
      toast({
        variant: 'destructive',
        title: 'Payment Method Required',
        description: 'Please select a payment method to continue.',
      });
      return;
    }

    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Amount',
        description: 'Please enter a valid payment amount.',
      });
      return;
    }

    paymentMutation.mutate({
      amount: parseFloat(paymentAmount),
      paymentMethodId: parseInt(selectedMethodId),
      ...allocation,
    });
  };

  if (loanLoading || methodsLoading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!loanDetails) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Loan not found. Please check the loan ID and try again.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { loan, property } = loanDetails;

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/borrowerportal/loans/${loanId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Make a Payment</h1>
          <p className="text-muted-foreground">
            {loan.loanNumber} • {property.address}, {property.city}, {property.state}
          </p>
        </div>
      </div>

      {/* Payment Amount Card */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Amount</CardTitle>
          <CardDescription>
            Your regular monthly payment is {formatCurrency(loan.paymentAmount)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Button
              variant={paymentAmount === loan.paymentAmount.toString() ? 'default' : 'outline'}
              onClick={() => handlePaymentAmountChange(loan.paymentAmount.toString())}
            >
              Regular Payment
              <span className="ml-2 font-bold">{formatCurrency(loan.paymentAmount)}</span>
            </Button>
            <Button
              variant={paymentAmount !== loan.paymentAmount.toString() && paymentAmount ? 'default' : 'outline'}
              onClick={() => setPaymentAmount('')}
            >
              Custom Amount
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-amount">Enter Payment Amount</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => handlePaymentAmountChange(e.target.value)}
                className="pl-10 text-lg"
              />
            </div>
          </div>

          {paymentAmount && parseFloat(paymentAmount) > 0 && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <h4 className="font-medium mb-2">Payment Allocation</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Principal</span>
                  <span className="font-medium">{formatCurrency(allocation.principal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Interest</span>
                  <span className="font-medium">{formatCurrency(allocation.interest)}</span>
                </div>
                {allocation.escrow > 0 && (
                  <div className="flex justify-between">
                    <span>Escrow</span>
                    <span className="font-medium">{formatCurrency(allocation.escrow)}</span>
                  </div>
                )}
                {allocation.fees > 0 && (
                  <div className="flex justify-between">
                    <span>Fees</span>
                    <span className="font-medium">{formatCurrency(allocation.fees)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(parseFloat(paymentAmount))}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Method Card */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Method</CardTitle>
          <CardDescription>Select or add a payment method</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {paymentMethods.length > 0 ? (
            <RadioGroup value={selectedMethodId} onValueChange={setSelectedMethodId}>
              {paymentMethods.map((method: any) => (
                <div key={method.id} className="flex items-center space-x-2 p-3 border rounded-lg">
                  <RadioGroupItem value={method.id.toString()} id={`method-${method.id}`} />
                  <Label htmlFor={`method-${method.id}`} className="flex-1 cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        <span>
                          {method.bankName || 'Bank Account'} ••••{method.last4}
                        </span>
                        {method.isDefault && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                            Default
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground capitalize">
                        {method.accountType}
                      </span>
                    </div>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No payment methods found. Please add a payment method first.
              </AlertDescription>
            </Alert>
          )}

          <Button variant="outline" className="w-full" asChild>
            <Link href="/borrowerportal/payment-methods">
              <CreditCard className="mr-2 h-4 w-4" />
              Manage Payment Methods
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Payment Confirmation */}
      <Card>
        <CardHeader>
          <CardTitle>Review and Confirm</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Loan Number</span>
              <span className="font-medium">{loan.loanNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Property</span>
              <span className="font-medium text-right">
                {property.address}, {property.city}, {property.state}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment Date</span>
              <span className="font-medium">{formatDate(new Date())}</span>
            </div>
            {selectedMethodId && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Method</span>
                <span className="font-medium">
                  ••••{paymentMethods.find((m: any) => m.id.toString() === selectedMethodId)?.last4}
                </span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t">
              <span>Total Payment</span>
              <span>{formatCurrency(parseFloat(paymentAmount) || 0)}</span>
            </div>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              By submitting this payment, you authorize the withdrawal of{' '}
              {formatCurrency(parseFloat(paymentAmount) || 0)} from your selected account.
              Payments are typically processed within 1-2 business days.
            </AlertDescription>
          </Alert>

          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmitPayment}
            disabled={!paymentAmount || !selectedMethodId || paymentMutation.isPending}
          >
            {paymentMutation.isPending ? (
              <>Processing...</>
            ) : (
              <>
                <CheckCircle className="mr-2 h-5 w-5" />
                Submit Payment of {formatCurrency(parseFloat(paymentAmount) || 0)}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}