import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  DollarSign, CreditCard, FileText, Send, CheckCircle, 
  XCircle, Clock, AlertCircle, TrendingUp, Download,
  Plus, Filter, Search, RefreshCw, Banknote, Building
} from "lucide-react";
import { format } from "date-fns";

interface PaymentEntry {
  id: string;
  loanId: number;
  loanNumber: string;
  amount: number;
  source: 'ach' | 'wire' | 'check' | 'card' | 'manual';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'returned';
  effectiveDate: string;
  referenceNumber?: string;
  channelReferenceId?: string;
  createdAt: string;
  processedAt?: string;
  errorMessage?: string;
  metadata?: any;
}

export function PaymentProcessor() {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("process");
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Payment form state
  const [paymentData, setPaymentData] = useState({
    loanId: "",
    amount: "",
    source: "ach",
    effectiveDate: new Date().toISOString().split('T')[0],
    
    // ACH fields
    routingNumber: "",
    accountNumber: "",
    accountType: "checking",
    secCode: "PPD",
    
    // Wire fields
    wireRef: "",
    senderRef: "",
    
    // Check fields
    checkNumber: "",
    payerAccount: "",
    payerBank: "",
    issueDate: new Date().toISOString().split('T')[0],
    
    // General
    reference: "",
    notes: ""
  });

  // Fetch loans for dropdown
  const { data: loans = [] } = useQuery({
    queryKey: ['/api/loans'],
  });

  // Fetch payment history from the actual backend endpoint
  const { data: payments = [], isLoading: paymentsLoading, refetch: refetchPayments } = useQuery({
    queryKey: ['/api/payments/all'],
  });

  // Fetch payment metrics
  const { data: metrics } = useQuery({
    queryKey: ['/api/payments/metrics'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Submit payment mutation
  const submitPaymentMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/payments', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (response) => {
      toast({
        title: "Payment Submitted",
        description: `Payment of $${paymentData.amount} has been submitted for processing. ID: ${response.paymentId}`,
      });
      setShowPaymentDialog(false);
      resetPaymentForm();
      refetchPayments();
      queryClient.invalidateQueries({ queryKey: ['/api/payments/metrics'] });
    },
    onError: (error: any) => {
      toast({
        title: "Payment Failed",
        description: error.message || "Failed to submit payment",
        variant: "destructive",
      });
    },
  });

  // Retry failed payment
  const retryPaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      return apiRequest(`/api/payments/${paymentId}/retry`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({
        title: "Payment Resubmitted",
        description: "Payment has been resubmitted for processing",
      });
      refetchPayments();
    },
  });

  // Cancel payment
  const cancelPaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      return apiRequest(`/api/payments/${paymentId}/cancel`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({
        title: "Payment Cancelled",
        description: "Payment has been cancelled successfully",
      });
      refetchPayments();
    },
  });

  const resetPaymentForm = () => {
    setPaymentData({
      loanId: "",
      amount: "",
      source: "ach",
      effectiveDate: new Date().toISOString().split('T')[0],
      routingNumber: "",
      accountNumber: "",
      accountType: "checking",
      secCode: "PPD",
      wireRef: "",
      senderRef: "",
      checkNumber: "",
      payerAccount: "",
      payerBank: "",
      issueDate: new Date().toISOString().split('T')[0],
      reference: "",
      notes: ""
    });
  };

  const handleSubmitPayment = () => {
    const loan = loans.find((l: any) => l.id.toString() === paymentData.loanId);
    if (!loan) {
      toast({
        title: "Invalid Loan",
        description: "Please select a valid loan",
        variant: "destructive",
      });
      return;
    }

    const submissionData: any = {
      loan_id: paymentData.loanId,
      amount: parseFloat(paymentData.amount),
      source: paymentData.source,
      effective_date: paymentData.effectiveDate,
      external_ref: paymentData.reference,
    };
    
    console.log('[Frontend] Submitting payment data:', submissionData);

    // Add source-specific fields
    if (paymentData.source === 'ach') {
      submissionData.routing_number = paymentData.routingNumber;
      submissionData.account_number = paymentData.accountNumber;
      submissionData.account_type = paymentData.accountType;
      submissionData.sec_code = paymentData.secCode;
    } else if (paymentData.source === 'wire') {
      submissionData.wire_ref = paymentData.wireRef;
      submissionData.sender_ref = paymentData.senderRef;
    } else if (paymentData.source === 'check') {
      submissionData.check_number = paymentData.checkNumber;
      submissionData.payer_account = paymentData.payerAccount;
      submissionData.payer_bank = paymentData.payerBank;
      submissionData.issue_date = paymentData.issueDate;
    }

    console.log('[Frontend] Final submission data:', submissionData);
    submitPaymentMutation.mutate(submissionData);
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { variant: any; icon: any; label: string }> = {
      pending: { variant: "secondary", icon: Clock, label: "Pending" },
      processing: { variant: "default", icon: RefreshCw, label: "Processing" },
      completed: { variant: "success", icon: CheckCircle, label: "Completed" },
      failed: { variant: "destructive", icon: XCircle, label: "Failed" },
      returned: { variant: "warning", icon: AlertCircle, label: "Returned" },
    };
    
    const config = badges[status] || { variant: "outline", icon: Clock, label: status };
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant as any} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'ach': return <Building className="h-4 w-4" />;
      case 'wire': return <Send className="h-4 w-4" />;
      case 'check': return <FileText className="h-4 w-4" />;
      case 'card': return <CreditCard className="h-4 w-4" />;
      default: return <DollarSign className="h-4 w-4" />;
    }
  };

  const filteredPayments = payments.filter((payment: PaymentEntry) => {
    const matchesSearch = !searchTerm || 
      payment.loanNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.referenceNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Metrics Dashboard */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Today's Collections</p>
                <p className="text-2xl font-bold">
                  ${metrics?.todayCollections?.toLocaleString() || '0'}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Payments</p>
                <p className="text-2xl font-bold">{metrics?.pendingCount || 0}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failed Payments</p>
                <p className="text-2xl font-bold">{metrics?.failedCount || 0}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Month to Date</p>
                <p className="text-2xl font-bold">
                  ${metrics?.monthToDate?.toLocaleString() || '0'}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Payment Processing Center</CardTitle>
              <CardDescription>
                Process payments via ACH, Wire, Check, or Manual entry with Column Bank integration
              </CardDescription>
            </div>
            <Button onClick={() => setShowPaymentDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedTab} onValueChange={setSelectedTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="process">Process Payments</TabsTrigger>
              <TabsTrigger value="history">Payment History</TabsTrigger>
              <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
            </TabsList>

            {/* Process Payments Tab */}
            <TabsContent value="process" className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Payments are processed through Column Bank's secure API with cryptographic audit trail.
                  All transactions are idempotent and hash-chained for compliance.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button className="w-full justify-start" variant="outline" onClick={() => {
                      setPaymentData({ ...paymentData, source: 'ach' });
                      setShowPaymentDialog(true);
                    }}>
                      <Building className="h-4 w-4 mr-2" />
                      Process ACH Payment
                    </Button>
                    <Button className="w-full justify-start" variant="outline" onClick={() => {
                      setPaymentData({ ...paymentData, source: 'wire' });
                      setShowPaymentDialog(true);
                    }}>
                      <Send className="h-4 w-4 mr-2" />
                      Process Wire Transfer
                    </Button>
                    <Button className="w-full justify-start" variant="outline" onClick={() => {
                      setPaymentData({ ...paymentData, source: 'check' });
                      setShowPaymentDialog(true);
                    }}>
                      <FileText className="h-4 w-4 mr-2" />
                      Record Check Payment
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {payments.slice(0, 5).map((payment: PaymentEntry) => (
                        <div key={payment.id} className="flex items-center justify-between p-2 border rounded">
                          <div className="flex items-center gap-2">
                            {getSourceIcon(payment.source)}
                            <div>
                              <p className="text-sm font-medium">Loan #{payment.loanNumber}</p>
                              <p className="text-xs text-muted-foreground">
                                ${payment.amount.toLocaleString()}
                              </p>
                            </div>
                          </div>
                          {getStatusBadge(payment.status)}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Payment History Tab */}
            <TabsContent value="history" className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by loan number or reference..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="returned">Returned</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => refetchPayments()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>

              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Loan</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentsLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          Loading payments...
                        </TableCell>
                      </TableRow>
                    ) : filteredPayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No payments found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPayments.map((payment: PaymentEntry) => (
                        <TableRow key={payment.id}>
                          <TableCell>
                            {format(new Date(payment.createdAt), 'MM/dd/yyyy')}
                          </TableCell>
                          <TableCell className="font-medium">
                            {payment.loanNumber}
                          </TableCell>
                          <TableCell className="font-mono">
                            ${payment.amount.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {getSourceIcon(payment.source)}
                              <span className="capitalize">{payment.source}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {payment.referenceNumber || payment.channelReferenceId || '-'}
                          </TableCell>
                          <TableCell>{getStatusBadge(payment.status)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {payment.status === 'failed' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => retryPaymentMutation.mutate(payment.id)}
                                >
                                  Retry
                                </Button>
                              )}
                              {payment.status === 'pending' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => cancelPaymentMutation.mutate(payment.id)}
                                >
                                  Cancel
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Exceptions Tab */}
            <TabsContent value="exceptions" className="space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {metrics?.exceptionCount || 0} payment exceptions require attention
                </AlertDescription>
              </Alert>
              
              <div className="space-y-4">
                {payments
                  .filter((p: PaymentEntry) => p.status === 'failed' || p.status === 'returned')
                  .map((payment: PaymentEntry) => (
                    <Card key={payment.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">Loan #{payment.loanNumber}</p>
                              {getStatusBadge(payment.status)}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Amount: ${payment.amount.toLocaleString()} | 
                              Date: {format(new Date(payment.createdAt), 'MM/dd/yyyy')}
                            </p>
                            {payment.errorMessage && (
                              <p className="text-sm text-red-600">
                                Error: {payment.errorMessage}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" 
                              onClick={() => retryPaymentMutation.mutate(payment.id)}>
                              Retry
                            </Button>
                            <Button size="sm" variant="outline">
                              View Details
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Enter payment details for processing through Column Bank
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Basic Information */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="loan">Loan</Label>
                <Select value={paymentData.loanId} onValueChange={(value) => 
                  setPaymentData({ ...paymentData, loanId: value })
                }>
                  <SelectTrigger>
                    <SelectValue placeholder="Select loan" />
                  </SelectTrigger>
                  <SelectContent>
                    {loans.map((loan: any) => (
                      <SelectItem key={loan.id} value={loan.id.toString()}>
                        {loan.loanNumber} - ${loan.principalBalance}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                />
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Tabs value={paymentData.source} onValueChange={(value) => 
                setPaymentData({ ...paymentData, source: value as any })
              }>
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="ach">ACH</TabsTrigger>
                  <TabsTrigger value="wire">Wire</TabsTrigger>
                  <TabsTrigger value="check">Check</TabsTrigger>
                  <TabsTrigger value="manual">Manual</TabsTrigger>
                </TabsList>
                
                {/* ACH Fields */}
                <TabsContent value="ach" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="routing">Routing Number</Label>
                      <Input
                        id="routing"
                        placeholder="123456789"
                        value={paymentData.routingNumber}
                        onChange={(e) => setPaymentData({ ...paymentData, routingNumber: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="account">Account Number</Label>
                      <Input
                        id="account"
                        placeholder="Account number"
                        value={paymentData.accountNumber}
                        onChange={(e) => setPaymentData({ ...paymentData, accountNumber: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="accountType">Account Type</Label>
                      <Select value={paymentData.accountType} onValueChange={(value) =>
                        setPaymentData({ ...paymentData, accountType: value })
                      }>
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
                      <Label htmlFor="secCode">SEC Code</Label>
                      <Select value={paymentData.secCode} onValueChange={(value) =>
                        setPaymentData({ ...paymentData, secCode: value })
                      }>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PPD">PPD - Personal</SelectItem>
                          <SelectItem value="CCD">CCD - Corporate</SelectItem>
                          <SelectItem value="WEB">WEB - Internet</SelectItem>
                          <SelectItem value="TEL">TEL - Telephone</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </TabsContent>
                
                {/* Wire Fields */}
                <TabsContent value="wire" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="wireRef">Wire Reference</Label>
                      <Input
                        id="wireRef"
                        placeholder="Wire reference number"
                        value={paymentData.wireRef}
                        onChange={(e) => setPaymentData({ ...paymentData, wireRef: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="senderRef">Sender Reference</Label>
                      <Input
                        id="senderRef"
                        placeholder="Sender reference"
                        value={paymentData.senderRef}
                        onChange={(e) => setPaymentData({ ...paymentData, senderRef: e.target.value })}
                      />
                    </div>
                  </div>
                </TabsContent>
                
                {/* Check Fields */}
                <TabsContent value="check" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="checkNumber">Check Number</Label>
                      <Input
                        id="checkNumber"
                        placeholder="Check number"
                        value={paymentData.checkNumber}
                        onChange={(e) => setPaymentData({ ...paymentData, checkNumber: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="issueDate">Issue Date</Label>
                      <Input
                        id="issueDate"
                        type="date"
                        value={paymentData.issueDate}
                        onChange={(e) => setPaymentData({ ...paymentData, issueDate: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="payerAccount">Payer Account</Label>
                      <Input
                        id="payerAccount"
                        placeholder="Payer account number"
                        value={paymentData.payerAccount}
                        onChange={(e) => setPaymentData({ ...paymentData, payerAccount: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payerBank">Payer Bank</Label>
                      <Input
                        id="payerBank"
                        placeholder="Bank name"
                        value={paymentData.payerBank}
                        onChange={(e) => setPaymentData({ ...paymentData, payerBank: e.target.value })}
                      />
                    </div>
                  </div>
                </TabsContent>
                
                {/* Manual Entry */}
                <TabsContent value="manual" className="space-y-4">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Manual payments require additional verification and may take longer to process
                    </AlertDescription>
                  </Alert>
                </TabsContent>
              </Tabs>
            </div>

            {/* Additional Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="effectiveDate">Effective Date</Label>
                <Input
                  id="effectiveDate"
                  type="date"
                  value={paymentData.effectiveDate}
                  onChange={(e) => setPaymentData({ ...paymentData, effectiveDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reference">Reference Number</Label>
                <Input
                  id="reference"
                  placeholder="External reference"
                  value={paymentData.reference}
                  onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes..."
                value={paymentData.notes}
                onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitPayment} disabled={submitPaymentMutation.isPending}>
              {submitPaymentMutation.isPending ? "Processing..." : "Submit Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}