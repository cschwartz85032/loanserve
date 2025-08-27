import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Link } from 'wouter';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Home,
  DollarSign,
  Calendar,
  CreditCard,
  FileText,
  Bell,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

export function BorrowerDashboard() {
  const { data: dashboard, isLoading, error } = useQuery({
    queryKey: ['/api/borrower/dashboard'],
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load dashboard. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { loans = [], recentPayments = [], unreadNotices = [] } = dashboard;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold">Welcome Back</h1>
        <Button asChild>
          <Link href="/borrowerportal/payment">
            <CreditCard className="mr-2 h-4 w-4" />
            Make a Payment
          </Link>
        </Button>
      </div>

      {/* Loans Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loans.map((loan: any) => (
          <Card key={loan.loanId} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{loan.loanNumber}</CardTitle>
                  <CardDescription className="flex items-center mt-1">
                    <Home className="h-3 w-3 mr-1" />
                    {loan.propertyAddress}, {loan.propertyCity}, {loan.propertyState}
                  </CardDescription>
                </div>
                <Badge variant={loan.status === 'current' ? 'default' : 'destructive'}>
                  {loan.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Principal Balance</span>
                  <span className="font-semibold">{formatCurrency(loan.principalBalance)}</span>
                </div>
                {loan.escrowBalance > 0 && (
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm text-muted-foreground">Escrow Balance</span>
                    <span className="font-semibold">{formatCurrency(loan.escrowBalance)}</span>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-muted-foreground">Next Payment Due</p>
                    <p className="font-semibold flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      {loan.nextPaymentDate ? formatDate(loan.nextPaymentDate) : 'N/A'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Amount</p>
                    <p className="font-semibold text-lg">{formatCurrency(loan.paymentAmount)}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" asChild>
                  <Link href={`/borrowerportal/loans/${loan.loanId}`}>
                    View Details
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="sm" className="flex-1" asChild>
                  <Link href={`/borrowerportal/loans/${loan.loanId}/pay`}>
                    Pay Now
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {loans.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <Home className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No loans found</p>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Payments */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-xl">Recent Payments</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/borrowerportal/payments">View All</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recentPayments.length > 0 ? (
              <div className="space-y-3">
                {recentPayments.map((payment: any) => (
                  <div
                    key={payment.id}
                    className="flex justify-between items-center py-2 border-b last:border-0"
                  >
                    <div>
                      <p className="font-medium">{payment.loanNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(payment.receivedDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(payment.totalAmount)}</p>
                      <Badge variant="outline" className="text-xs">
                        {payment.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <DollarSign className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No recent payments</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-xl">Notifications</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/borrowerportal/notices">View All</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {unreadNotices.length > 0 ? (
              <div className="space-y-3">
                {unreadNotices.map((notice: any) => (
                  <div
                    key={notice.id}
                    className="flex items-start gap-3 py-2 border-b last:border-0"
                  >
                    <Bell className="h-4 w-4 mt-1 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{notice.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(notice.createdAt)}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {notice.type}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Bell className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No new notifications</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button variant="outline" className="h-auto flex-col py-4" asChild>
              <Link href="/borrowerportal/payment">
                <CreditCard className="h-6 w-6 mb-2" />
                <span className="text-xs">Make Payment</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col py-4" asChild>
              <Link href="/borrowerportal/payment-methods">
                <DollarSign className="h-6 w-6 mb-2" />
                <span className="text-xs">Payment Methods</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col py-4" asChild>
              <Link href="/borrowerportal/documents">
                <FileText className="h-6 w-6 mb-2" />
                <span className="text-xs">Documents</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col py-4" asChild>
              <Link href="/borrowerportal/profile">
                <Bell className="h-6 w-6 mb-2" />
                <span className="text-xs">Preferences</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}