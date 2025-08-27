import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  ArrowLeft,
  Home,
  DollarSign,
  Calendar,
  FileText,
  TrendingUp,
  AlertCircle,
  CreditCard,
  Download,
} from 'lucide-react';

export function BorrowerLoanDetails() {
  const { loanId } = useParams();

  const { data: loanDetails, isLoading: loanLoading } = useQuery({
    queryKey: [`/api/borrower/loans/${loanId}`],
    enabled: !!loanId,
  });

  const { data: paymentHistory, isLoading: paymentsLoading } = useQuery({
    queryKey: [`/api/borrower/loans/${loanId}/payments`],
    enabled: !!loanId,
  });

  if (loanLoading || paymentsLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!loanDetails) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Loan details not found. Please check the loan ID and try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { loan, property, balances, escrow } = loanDetails;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/borrowerportal/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{loan.loanNumber}</h1>
            <p className="text-muted-foreground flex items-center mt-1">
              <Home className="h-4 w-4 mr-1" />
              {property.address}, {property.city}, {property.state} {property.zip}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href={`/borrowerportal/loans/${loanId}/pay`}>
              <CreditCard className="mr-2 h-4 w-4" />
              Make Payment
            </Link>
          </Button>
        </div>
      </div>

      {/* Loan Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Principal Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {formatCurrency(balances?.principalBalance || loan.principalBalance)}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Original Amount: {formatCurrency(loan.originalAmount)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Next Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(loan.paymentAmount)}</p>
            <div className="flex items-center gap-2 mt-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Due: {loan.nextPaymentDate ? formatDate(loan.nextPaymentDate) : 'N/A'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Loan Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              variant={loan.status === 'current' ? 'default' : 'destructive'}
              className="text-lg px-4 py-2"
            >
              {loan.status}
            </Badge>
            <p className="text-sm text-muted-foreground mt-2">
              Rate: {loan.interestRate}% {loan.rateType}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Details */}
      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">Loan Details</TabsTrigger>
          <TabsTrigger value="payments">Payment History</TabsTrigger>
          {escrow && <TabsTrigger value="escrow">Escrow Account</TabsTrigger>}
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Loan Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Loan Type</p>
                  <p className="font-medium">{loan.loanType}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Interest Rate</p>
                  <p className="font-medium">{loan.interestRate}% {loan.rateType}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Loan Term</p>
                  <p className="font-medium">{loan.loanTerm} months</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Payment Frequency</p>
                  <p className="font-medium capitalize">{loan.paymentFrequency}</p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">First Payment Date</p>
                  <p className="font-medium">{formatDate(loan.firstPaymentDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Maturity Date</p>
                  <p className="font-medium">{formatDate(loan.maturityDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Payment Due Day</p>
                  <p className="font-medium">Day {loan.paymentDueDay} of each month</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Lender</p>
                  <p className="font-medium">{loan.lenderId}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Property Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Property Type</p>
                  <p className="font-medium capitalize">{property.propertyType}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Address</p>
                  <p className="font-medium">{property.address}</p>
                  <p className="font-medium">
                    {property.city}, {property.state} {property.zip}
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Appraised Value</p>
                  <p className="font-medium">{formatCurrency(property.appraisedValue)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Purchase Price</p>
                  <p className="font-medium">{formatCurrency(property.purchasePrice)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Payment History</CardTitle>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Download Statement
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {paymentHistory && paymentHistory.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Date</th>
                        <th className="text-left py-2">Payment #</th>
                        <th className="text-right py-2">Principal</th>
                        <th className="text-right py-2">Interest</th>
                        <th className="text-right py-2">Escrow</th>
                        <th className="text-right py-2">Total</th>
                        <th className="text-center py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentHistory.map((payment: any) => (
                        <tr key={payment.id} className="border-b">
                          <td className="py-2">
                            {payment.receivedDate ? formatDate(payment.receivedDate) : 'N/A'}
                          </td>
                          <td className="py-2">{payment.paymentNumber || '-'}</td>
                          <td className="text-right py-2">
                            {formatCurrency(payment.principalAmount || 0)}
                          </td>
                          <td className="text-right py-2">
                            {formatCurrency(payment.interestAmount || 0)}
                          </td>
                          <td className="text-right py-2">
                            {formatCurrency(payment.escrowAmount || 0)}
                          </td>
                          <td className="text-right py-2 font-medium">
                            {formatCurrency(payment.totalAmount || 0)}
                          </td>
                          <td className="text-center py-2">
                            <Badge variant={payment.status === 'completed' ? 'default' : 'outline'}>
                              {payment.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No payment history available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {escrow && (
          <TabsContent value="escrow" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Escrow Account</CardTitle>
                <CardDescription>
                  Your escrow account covers property taxes and insurance
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground">Current Balance</p>
                    <p className="text-2xl font-bold">{formatCurrency(escrow.balance)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Monthly Escrow Payment</p>
                    <p className="text-2xl font-bold">{formatCurrency(escrow.monthlyPayment)}</p>
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">Annual Disbursements</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Property Tax</span>
                      <span className="font-medium">{formatCurrency(escrow.propertyTax || 0)}/year</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Homeowners Insurance</span>
                      <span className="font-medium">{formatCurrency(escrow.insurance || 0)}/year</span>
                    </div>
                    {escrow.pmi && (
                      <div className="flex justify-between">
                        <span className="text-sm">Mortgage Insurance</span>
                        <span className="font-medium">{formatCurrency(escrow.pmi)}/year</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}