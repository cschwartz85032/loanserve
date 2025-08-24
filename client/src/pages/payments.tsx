import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { 
  Plus, 
  Download, 
  CreditCard, 
  Building, 
  FileCheck, 
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowRight,
  Search,
  Filter
} from "lucide-react";

interface PaymentForm {
  loanId: string;
  loanNumber: string;
  borrowerName: string;
  amount: string;
  source: 'ach' | 'wire' | 'check' | 'card' | 'cash';
  effectiveDate: string;
  // ACH fields
  routingNumber?: string;
  accountNumber?: string;
  accountType?: 'checking' | 'savings';
  secCode?: string;
  // Wire fields
  wireRef?: string;
  senderBank?: string;
  senderAccount?: string;
  // Check fields
  checkNumber?: string;
  checkDate?: string;
  drawerBank?: string;
  // Card fields
  last4?: string;
  authCode?: string;
  // Common fields
  reference?: string;
  notes?: string;
}

interface PaymentTransaction {
  payment_id: string;
  loan_id: string;
  loan_number?: string;
  borrower_name?: string;
  source: string;
  state: string;
  amount_cents: number;
  currency: string;
  external_ref?: string;
  received_at: string;
  effective_date?: string;
  metadata?: any;
}

export default function Payments() {
  const { toast } = useToast();
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({
    loanId: '',
    loanNumber: '',
    borrowerName: '',
    amount: '',
    source: 'ach',
    effectiveDate: new Date().toISOString().split('T')[0],
    accountType: 'checking',
    secCode: 'WEB'
  });

  // Fetch loans for selection
  const { data: loans = [] } = useQuery({
    queryKey: ['/api/loans'],
  });

  // Fetch recent payments
  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['/api/payments/transactions'],
    queryFn: async () => {
      const response = await apiRequest('/api/payments/transactions');
      return Array.isArray(response) ? response : [];
    },
    refetchInterval: 5000 // Refresh every 5 seconds to show status updates
  });

  // Submit payment mutation
  const submitPayment = useMutation({
    mutationFn: async (payment: PaymentForm) => {
      const response = await apiRequest('/api/payments/manual', {
        method: 'POST',
        body: payment
      });
      return await response.json();
    },
    onSuccess: (data: any) => {
      // Show detailed status
      const description = data.queue_submitted 
        ? `Payment ${data.payment_id} submitted successfully. Status: ${data.details.status}`
        : `Payment ${data.payment_id} recorded but queue submission failed. Manual intervention required.`;
      
      toast({
        title: data.queue_submitted ? "Payment Submitted" : "Payment Recorded with Warning",
        description: description,
        variant: data.queue_submitted ? "default" : "destructive"
      });
      
      console.log('Payment submission result:', data);
      
      setShowRecordPayment(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['/api/payments/transactions'] });
    },
    onError: (error: any) => {
      console.error('Payment submission error:', error);
      toast({
        title: "Error",
        description: `Failed to submit payment: ${error.details || error.message || 'Unknown error'}`,
        variant: "destructive"
      });
    }
  });

  const resetForm = () => {
    setPaymentForm({
      loanId: '',
      loanNumber: '',
      borrowerName: '',
      amount: '',
      source: 'ach',
      effectiveDate: new Date().toISOString().split('T')[0],
      accountType: 'checking',
      secCode: 'WEB'
    });
    setSelectedLoan(null);
  };

  const handleLoanSelect = (loanId: string) => {
    const loan = loans?.find((l: any) => l.id.toString() === loanId);
    if (loan) {
      setSelectedLoan(loan);
      setPaymentForm({
        ...paymentForm,
        loanId: loan.id.toString(),
        loanNumber: loan.loanNumber,
        borrowerName: loan.borrowerName || 'Unknown'
      });
    }
  };

  const handleSubmit = () => {
    if (!paymentForm.loanId || !paymentForm.amount) {
      toast({
        title: "Validation Error",
        description: "Please select a loan and enter an amount",
        variant: "destructive"
      });
      return;
    }

    // Validate source-specific fields
    if (paymentForm.source === 'ach') {
      if (!paymentForm.routingNumber || !paymentForm.accountNumber) {
        toast({
          title: "Validation Error",
          description: "Please enter routing and account numbers for ACH payment",
          variant: "destructive"
        });
        return;
      }
    } else if (paymentForm.source === 'wire') {
      if (!paymentForm.wireRef) {
        toast({
          title: "Validation Error",
          description: "Please enter wire reference number",
          variant: "destructive"
        });
        return;
      }
    } else if (paymentForm.source === 'check') {
      if (!paymentForm.checkNumber) {
        toast({
          title: "Validation Error",
          description: "Please enter check number",
          variant: "destructive"
        });
        return;
      }
    }

    submitPayment.mutate(paymentForm);
  };

  const getStatusBadge = (state: string) => {
    const statusConfig: Record<string, { variant: any; icon: any; label: string }> = {
      'received': { variant: 'secondary', icon: Clock, label: 'Received' },
      'validated': { variant: 'default', icon: AlertCircle, label: 'Validated' },
      'processing': { variant: 'default', icon: ArrowRight, label: 'Processing' },
      'posted_pending_settlement': { variant: 'default', icon: Clock, label: 'Pending Settlement' },
      'settled': { variant: 'default', icon: CheckCircle, label: 'Settled' },
      'rejected': { variant: 'destructive', icon: XCircle, label: 'Rejected' },
      'reversed': { variant: 'destructive', icon: XCircle, label: 'Reversed' }
    };

    const config = statusConfig[state] || { variant: 'secondary', icon: AlertCircle, label: state };
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'ach': return Building;
      case 'wire': return DollarSign;
      case 'check': return FileCheck;
      case 'card': return CreditCard;
      default: return DollarSign;
    }
  };

  // Filter payments
  const filteredPayments = payments?.filter(p => {
    const matchesSearch = !searchTerm || 
      p.loan_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.borrower_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.external_ref?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterStatus === 'all' || p.state === filterStatus;
    
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Payment Management</h1>
              <p className="text-sm text-slate-600">Process and track loan payments</p>
            </div>
            <div className="flex items-center space-x-3">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button onClick={() => setShowRecordPayment(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Record Payment
              </Button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Today's Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${payments?.filter(p => p.received_at.startsWith(new Date().toISOString().split('T')[0]))
                    .reduce((sum, p) => sum + p.amount_cents / 100, 0).toFixed(2) || '0.00'}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Pending Settlement</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {payments?.filter(p => p.state === 'posted_pending_settlement').length || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Settled Today</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {payments?.filter(p => p.state === 'settled' && p.received_at.startsWith(new Date().toISOString().split('T')[0])).length || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Failed/Rejected</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {payments?.filter(p => p.state === 'rejected' || p.state === 'reversed').length || 0}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Payments Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Payment Transactions</CardTitle>
                  <CardDescription>Recent payment activity and processing status</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search payments..."
                      className="pl-8 w-64"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="received">Received</SelectItem>
                      <SelectItem value="validated">Validated</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="settled">Settled</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {paymentsLoading ? (
                <div className="text-center py-8 text-slate-500">Loading payments...</div>
              ) : filteredPayments && filteredPayments.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">Date/Time</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">Loan</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">Borrower</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">Amount</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">Source</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">Reference</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayments.map((payment) => {
                        const SourceIcon = getSourceIcon(payment.source);
                        return (
                          <tr key={payment.payment_id} className="border-b hover:bg-slate-50">
                            <td className="py-3 px-2 text-sm">
                              {format(new Date(payment.received_at), 'MM/dd/yy HH:mm')}
                            </td>
                            <td className="py-3 px-2 text-sm font-medium">
                              {payment.loan_number || payment.loan_id}
                            </td>
                            <td className="py-3 px-2 text-sm">
                              {payment.borrower_name || 'Unknown'}
                            </td>
                            <td className="py-3 px-2 text-sm font-medium">
                              ${(payment.amount_cents / 100).toFixed(2)}
                            </td>
                            <td className="py-3 px-2 text-sm">
                              <div className="flex items-center gap-2">
                                <SourceIcon className="h-4 w-4 text-slate-500" />
                                <span className="uppercase">{payment.source}</span>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-sm text-slate-600">
                              {payment.external_ref || '-'}
                            </td>
                            <td className="py-3 px-2">
                              {getStatusBadge(payment.state)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-slate-500 mb-4">No payment transactions found</p>
                  <Button onClick={() => setShowRecordPayment(true)} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Record First Payment
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Record Payment Dialog */}
      <Dialog open={showRecordPayment} onOpenChange={setShowRecordPayment}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Record Manual Payment</DialogTitle>
            <DialogDescription>
              Enter payment details to submit for processing
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Loan Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Select Loan</Label>
                <Select value={paymentForm.loanId} onValueChange={handleLoanSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a loan..." />
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
              <div className="space-y-2">
                <Label>Payment Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})}
                />
              </div>
            </div>

            {/* Selected Loan Details */}
            {selectedLoan && (
              <Card className="bg-slate-50">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-slate-600">Principal Balance:</span>
                      <div className="font-medium">${parseFloat(selectedLoan.principalBalance).toFixed(2)}</div>
                    </div>
                    <div>
                      <span className="text-slate-600">Payment Amount:</span>
                      <div className="font-medium">${parseFloat(selectedLoan.paymentAmount || 0).toFixed(2)}</div>
                    </div>
                    <div>
                      <span className="text-slate-600">Next Due Date:</span>
                      <div className="font-medium">
                        {selectedLoan.nextPaymentDate ? format(new Date(selectedLoan.nextPaymentDate), 'MM/dd/yyyy') : 'N/A'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Payment Type Tabs */}
            <Tabs value={paymentForm.source} onValueChange={(v) => setPaymentForm({...paymentForm, source: v as any})}>
              <TabsList className="grid grid-cols-5 w-full">
                <TabsTrigger value="ach">ACH</TabsTrigger>
                <TabsTrigger value="wire">Wire</TabsTrigger>
                <TabsTrigger value="check">Check</TabsTrigger>
                <TabsTrigger value="card">Card</TabsTrigger>
                <TabsTrigger value="cash">Cash</TabsTrigger>
              </TabsList>

              <TabsContent value="ach" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Routing Number</Label>
                    <Input
                      placeholder="9 digits"
                      maxLength={9}
                      value={paymentForm.routingNumber || ''}
                      onChange={(e) => setPaymentForm({...paymentForm, routingNumber: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Account Number</Label>
                    <Input
                      placeholder="Account number"
                      value={paymentForm.accountNumber || ''}
                      onChange={(e) => setPaymentForm({...paymentForm, accountNumber: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Account Type</Label>
                    <Select value={paymentForm.accountType} onValueChange={(v) => setPaymentForm({...paymentForm, accountType: v as any})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checking">Checking</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>SEC Code</Label>
                    <Select value={paymentForm.secCode} onValueChange={(v) => setPaymentForm({...paymentForm, secCode: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="WEB">WEB - Internet</SelectItem>
                        <SelectItem value="PPD">PPD - Prearranged</SelectItem>
                        <SelectItem value="CCD">CCD - Corporate</SelectItem>
                        <SelectItem value="TEL">TEL - Telephone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="wire" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Wire Reference</Label>
                    <Input
                      placeholder="Wire reference number"
                      value={paymentForm.wireRef || ''}
                      onChange={(e) => setPaymentForm({...paymentForm, wireRef: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Sender Bank</Label>
                    <Input
                      placeholder="Originating bank"
                      value={paymentForm.senderBank || ''}
                      onChange={(e) => setPaymentForm({...paymentForm, senderBank: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Sender Account</Label>
                  <Input
                    placeholder="Sender account number"
                    value={paymentForm.senderAccount || ''}
                    onChange={(e) => setPaymentForm({...paymentForm, senderAccount: e.target.value})}
                  />
                </div>
              </TabsContent>

              <TabsContent value="check" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Check Number</Label>
                    <Input
                      placeholder="Check #"
                      value={paymentForm.checkNumber || ''}
                      onChange={(e) => setPaymentForm({...paymentForm, checkNumber: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Check Date</Label>
                    <Input
                      type="date"
                      value={paymentForm.checkDate || ''}
                      onChange={(e) => setPaymentForm({...paymentForm, checkDate: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Drawer Bank</Label>
                  <Input
                    placeholder="Bank name"
                    value={paymentForm.drawerBank || ''}
                    onChange={(e) => setPaymentForm({...paymentForm, drawerBank: e.target.value})}
                  />
                </div>
              </TabsContent>

              <TabsContent value="card" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Last 4 Digits</Label>
                    <Input
                      placeholder="1234"
                      maxLength={4}
                      value={paymentForm.last4 || ''}
                      onChange={(e) => setPaymentForm({...paymentForm, last4: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Authorization Code</Label>
                    <Input
                      placeholder="Auth code"
                      value={paymentForm.authCode || ''}
                      onChange={(e) => setPaymentForm({...paymentForm, authCode: e.target.value})}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="cash" className="space-y-4">
                <div className="text-sm text-slate-600">
                  Cash payment will be recorded and processed immediately upon submission.
                </div>
              </TabsContent>
            </Tabs>

            {/* Common Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Effective Date</Label>
                <Input
                  type="date"
                  value={paymentForm.effectiveDate}
                  onChange={(e) => setPaymentForm({...paymentForm, effectiveDate: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Reference (Optional)</Label>
                <Input
                  placeholder="External reference"
                  value={paymentForm.reference || ''}
                  onChange={(e) => setPaymentForm({...paymentForm, reference: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <textarea
                className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Additional notes..."
                value={paymentForm.notes || ''}
                onChange={(e) => setPaymentForm({...paymentForm, notes: e.target.value})}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowRecordPayment(false);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitPayment.isPending}>
              {submitPayment.isPending ? 'Submitting...' : 'Submit Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}