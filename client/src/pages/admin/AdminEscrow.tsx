import React from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { format } from 'date-fns';
import { 
  Wallet, 
  DollarSign, 
  Calendar, 
  AlertCircle, 
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  FileText,
  Plus,
  Filter,
  Download
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

function AdminEscrow() {
  const [selectedLoan, setSelectedLoan] = React.useState('all');
  const [showAddDisbursement, setShowAddDisbursement] = React.useState(false);
  const [disbursementForm, setDisbursementForm] = React.useState({
    loanId: '',
    escrowAccountId: '',
    disbursementType: 'property_tax',
    amount: '',
    scheduledDate: '',
    payee: '',
    description: '',
  });

  // Fetch data
  const { data: escrowAccounts = [] } = useQuery<any[]>({
    queryKey: ['/api/escrow-accounts'],
  });

  const { data: escrowPayments = [] } = useQuery<any[]>({
    queryKey: ['/api/escrow-payments'],
  });

  const { data: loans = [] } = useQuery<any[]>({
    queryKey: ['/api/loans'],
  });

  const { data: escrowMetrics } = useQuery<any>({
    queryKey: ['/api/escrow/metrics'],
  });

  // Create disbursement mutation
  const createDisbursement = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/escrow-disbursements', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/escrow-payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/escrow/metrics'] });
      toast({
        title: "Success",
        description: "Disbursement scheduled successfully",
      });
      setShowAddDisbursement(false);
      setDisbursementForm({
        loanId: '',
        escrowAccountId: '',
        disbursementType: 'property_tax',
        amount: '',
        scheduledDate: '',
        payee: '',
        description: '',
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create disbursement",
        variant: "destructive",
      });
    },
  });

  // Process disbursement mutation
  const processDisbursement = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/escrow-disbursements/${id}/process`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/escrow-payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/escrow/metrics'] });
      toast({
        title: "Success",
        description: "Disbursement processed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to process disbursement",
        variant: "destructive",
      });
    },
  });

  const filteredAccounts = selectedLoan === 'all' 
    ? escrowAccounts 
    : escrowAccounts.filter((acc: any) => acc.loanId?.toString() === selectedLoan);

  const filteredPayments = selectedLoan === 'all'
    ? escrowPayments
    : escrowPayments.filter((payment: any) => payment.loanId?.toString() === selectedLoan);

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: any }> = {
      'scheduled': { color: 'bg-blue-100 text-blue-800', icon: Clock },
      'pending': { color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle },
      'completed': { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      'failed': { color: 'bg-red-100 text-red-800', icon: AlertCircle },
    };
    const config = statusConfig[status] || statusConfig['pending'];
    const Icon = config.icon;
    
    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const handleSubmitDisbursement = (e: React.FormEvent) => {
    e.preventDefault();
    createDisbursement.mutate({
      ...disbursementForm,
      amount: parseFloat(disbursementForm.amount),
      loanId: parseInt(disbursementForm.loanId),
      escrowAccountId: parseInt(disbursementForm.escrowAccountId),
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Escrow Balance</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                ${escrowMetrics?.totalBalance || '0.00'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending Disbursements</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-500" />
                {escrowMetrics?.pendingDisbursements || 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>This Month's Disbursements</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                ${escrowMetrics?.monthlyDisbursements || '0.00'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Accounts</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Wallet className="h-5 w-5 text-blue-500" />
                {escrowAccounts.filter((acc: any) => acc.status === 'active').length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filter Bar */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Escrow Management</CardTitle>
              <div className="flex items-center gap-4">
                <Select value={selectedLoan} onValueChange={setSelectedLoan}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filter by Loan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Loans</SelectItem>
                    {loans.map((loan: any) => (
                      <SelectItem key={loan.id} value={loan.id.toString()}>
                        {loan.loanNumber} - {loan.borrowerName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Dialog open={showAddDisbursement} onOpenChange={setShowAddDisbursement}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Schedule Disbursement
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Schedule New Disbursement</DialogTitle>
                      <DialogDescription>
                        Create a new escrow disbursement for property taxes, insurance, or other payments.
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmitDisbursement} className="space-y-4">
                      <div>
                        <Label htmlFor="loan">Loan</Label>
                        <Select 
                          value={disbursementForm.loanId} 
                          onValueChange={(value) => {
                            setDisbursementForm({ ...disbursementForm, loanId: value });
                            const account = escrowAccounts.find((acc: any) => acc.loanId?.toString() === value);
                            if (account) {
                              setDisbursementForm(prev => ({ ...prev, escrowAccountId: account.id.toString() }));
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select loan" />
                          </SelectTrigger>
                          <SelectContent>
                            {loans.map((loan: any) => (
                              <SelectItem key={loan.id} value={loan.id.toString()}>
                                {loan.loanNumber} - {loan.borrowerName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="type">Disbursement Type</Label>
                        <Select 
                          value={disbursementForm.disbursementType} 
                          onValueChange={(value) => setDisbursementForm({ ...disbursementForm, disbursementType: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="property_tax">Property Tax</SelectItem>
                            <SelectItem value="insurance">Insurance</SelectItem>
                            <SelectItem value="hoa">HOA Fees</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="amount">Amount</Label>
                        <Input
                          id="amount"
                          type="number"
                          step="0.01"
                          value={disbursementForm.amount}
                          onChange={(e) => setDisbursementForm({ ...disbursementForm, amount: e.target.value })}
                          placeholder="0.00"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="payee">Payee</Label>
                        <Input
                          id="payee"
                          value={disbursementForm.payee}
                          onChange={(e) => setDisbursementForm({ ...disbursementForm, payee: e.target.value })}
                          placeholder="County Tax Assessor"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="scheduledDate">Scheduled Date</Label>
                        <Input
                          id="scheduledDate"
                          type="date"
                          value={disbursementForm.scheduledDate}
                          onChange={(e) => setDisbursementForm({ ...disbursementForm, scheduledDate: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="description">Description</Label>
                        <Input
                          id="description"
                          value={disbursementForm.description}
                          onChange={(e) => setDisbursementForm({ ...disbursementForm, description: e.target.value })}
                          placeholder="Q1 2025 property tax payment"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setShowAddDisbursement(false)}>
                          Cancel
                        </Button>
                        <Button type="submit">
                          Schedule Disbursement
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Tabs defaultValue="accounts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="accounts">
              <Wallet className="h-4 w-4 mr-2" />
              Escrow Accounts
            </TabsTrigger>
            <TabsTrigger value="disbursements">
              <DollarSign className="h-4 w-4 mr-2" />
              Disbursements
            </TabsTrigger>
            <TabsTrigger value="schedule">
              <Calendar className="h-4 w-4 mr-2" />
              Payment Schedule
            </TabsTrigger>
          </TabsList>

          <TabsContent value="accounts">
            <Card>
              <CardHeader>
                <CardTitle>Escrow Accounts ({filteredAccounts.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loan Number</TableHead>
                      <TableHead>Borrower</TableHead>
                      <TableHead>Current Balance</TableHead>
                      <TableHead>Monthly Payment</TableHead>
                      <TableHead>Last Activity</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                          No escrow accounts found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAccounts.map((account: any) => {
                        const loan = loans.find((l: any) => l.id === account.loanId);
                        return (
                          <TableRow key={account.id}>
                            <TableCell className="font-medium">{loan?.loanNumber}</TableCell>
                            <TableCell>{loan?.borrowerName}</TableCell>
                            <TableCell className="font-semibold">${account.currentBalance || '0.00'}</TableCell>
                            <TableCell>${account.monthlyPayment || '0.00'}</TableCell>
                            <TableCell>
                              {account.lastActivityDate 
                                ? format(new Date(account.lastActivityDate), 'MMM dd, yyyy')
                                : 'No activity'}
                            </TableCell>
                            <TableCell>{getStatusBadge(account.status || 'active')}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="disbursements">
            <Card>
              <CardHeader>
                <CardTitle>Recent Disbursements</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Loan</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Payee</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                          No disbursements found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPayments.map((payment: any) => {
                        const loan = loans.find((l: any) => l.id === payment.loanId);
                        return (
                          <TableRow key={payment.id}>
                            <TableCell>
                              {format(new Date(payment.paymentDate || payment.scheduledDate), 'MMM dd, yyyy')}
                            </TableCell>
                            <TableCell className="font-medium">{loan?.loanNumber}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {payment.disbursementType?.replace(/_/g, ' ').toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell>{payment.payee || 'N/A'}</TableCell>
                            <TableCell className="font-semibold">${payment.amount}</TableCell>
                            <TableCell>{getStatusBadge(payment.status)}</TableCell>
                            <TableCell>
                              {payment.status === 'scheduled' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => processDisbursement.mutate(payment.id)}
                                >
                                  Process
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedule">
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Payment Schedule</CardTitle>
                <CardDescription>
                  Scheduled escrow disbursements for the next 90 days
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {escrowPayments
                    .filter((payment: any) => {
                      const paymentDate = new Date(payment.scheduledDate);
                      const now = new Date();
                      const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
                      return payment.status === 'scheduled' && 
                             paymentDate >= now && 
                             paymentDate <= ninetyDaysFromNow;
                    })
                    .sort((a: any, b: any) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())
                    .map((payment: any) => {
                      const loan = loans.find((l: any) => l.id === payment.loanId);
                      return (
                        <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col items-center bg-blue-50 rounded-lg p-2">
                              <span className="text-xs text-gray-500">
                                {format(new Date(payment.scheduledDate), 'MMM')}
                              </span>
                              <span className="text-lg font-bold">
                                {format(new Date(payment.scheduledDate), 'dd')}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">{payment.payee}</p>
                              <p className="text-sm text-gray-500">
                                {loan?.loanNumber} - {payment.disbursementType?.replace(/_/g, ' ')}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-lg">${payment.amount}</p>
                            <p className="text-sm text-gray-500">{payment.status}</p>
                          </div>
                        </div>
                      );
                    })}
                  {escrowPayments.filter((payment: any) => {
                    const paymentDate = new Date(payment.scheduledDate);
                    const now = new Date();
                    const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
                    return payment.status === 'scheduled' && 
                           paymentDate >= now && 
                           paymentDate <= ninetyDaysFromNow;
                  }).length === 0 && (
                    <p className="text-center text-gray-500 py-8">
                      No scheduled disbursements in the next 90 days
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

export default AdminEscrow;