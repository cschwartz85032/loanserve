import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  DollarSign, Plus, FileText, Download, Eye, Info, 
  Send, CheckCircle, XCircle, AlertCircle, Mail
} from "lucide-react";

interface LoanAccountingLedgerProps {
  loanId: string;
  loanAmount: number;
}

export function LoanAccountingLedger({ loanId, loanAmount }: LoanAccountingLedgerProps) {
  const { toast } = useToast();
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [emailRecipient, setEmailRecipient] = useState({ email: '', name: '', format: 'pdf' });
  const [selectedFee, setSelectedFee] = useState<any>(null);
  
  const [newTransaction, setNewTransaction] = useState({
    transactionDate: new Date().toISOString().split('T')[0],
    description: '',
    transactionType: 'payment',
    category: '',
    amount: '',
    notes: '',
    feeId: '',
  });

  // Fetch ledger entries
  const { data: ledgerEntries = [], isLoading, refetch } = useQuery({
    queryKey: [`/api/loans/${loanId}/ledger`],
    enabled: !!loanId,
  });

  // Fetch fee templates for dropdown (contains 33 configured fees)
  const { data: feeTemplates = [] } = useQuery({
    queryKey: [`/api/fees/templates`],
    enabled: !!loanId,
  });

  // Extract all fees from all templates into a flat array
  const availableFees = Array.isArray(feeTemplates) ? feeTemplates.flatMap((template: any) => 
    Array.isArray(template.fees) ? template.fees : []
  ) : [];

  // Add transaction mutation
  const addTransactionMutation = useMutation({
    mutationFn: (transaction: any) => 
      apiRequest(`/api/loans/${loanId}/ledger`, {
        method: 'POST',
        body: JSON.stringify(transaction)
      }),
    onSuccess: () => {
      toast({ title: "Transaction added", description: "The transaction has been recorded in the ledger." });
      setShowAddTransaction(false);
      refetch();
      resetTransaction();
    },
    onError: (error: any) => {
      console.error('Transaction add error:', error);
      toast({ 
        title: "Error", 
        description: "Failed to add transaction. Please check the console for details.", 
        variant: "destructive" 
      });
    }
  });

  // Approve transaction mutation
  const approveTransactionMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string }) => 
      apiRequest(`/api/ledger/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approvalNotes: notes })
      }),
    onSuccess: () => {
      toast({ title: "Transaction approved", description: "The transaction has been posted to the ledger." });
      setShowApprovalDialog(false);
      refetch();
    }
  });

  // Export functions
  const handleExport = async (format: 'csv' | 'pdf') => {
    try {
      const response = await fetch(`/api/loans/${loanId}/ledger/export/${format}`, {
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `loan-${loanId}-ledger.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast({ title: "Export successful", description: `Ledger exported as ${format.toUpperCase()}` });
    } catch (error) {
      toast({ 
        title: "Export failed", 
        description: "Failed to export ledger.", 
        variant: "destructive" 
      });
    }
  };

  // Email ledger
  const emailLedgerMutation = useMutation({
    mutationFn: (data: any) => 
      apiRequest(`/api/loans/${loanId}/ledger/email`, {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      toast({ title: "Email sent", description: "Ledger report has been emailed successfully." });
      setShowEmailDialog(false);
      setEmailRecipient({ email: '', name: '', format: 'pdf' });
    },
    onError: () => {
      toast({ 
        title: "Email failed", 
        description: "Failed to send ledger report. Please check if email service is configured.", 
        variant: "destructive" 
      });
    }
  });

  const resetTransaction = () => {
    setNewTransaction({
      transactionDate: new Date().toISOString().split('T')[0],
      description: '',
      transactionType: 'payment',
      category: '',
      amount: '',
      notes: '',
      feeId: '',
    });
    setSelectedFee(null);
  };

  // Calculate summary statistics
  const calculateSummary = () => {
    const entries = Array.isArray(ledgerEntries) ? ledgerEntries : [];
    
    if (entries.length === 0) {
      return {
        totalDebits: 0,
        totalCredits: 0,
        currentBalance: loanAmount || 0,
        principalBalance: loanAmount || 0,
        pendingCount: 0,
      };
    }

    const lastEntry = entries[entries.length - 1];
    
    const totalDebits = entries.reduce((sum: number, entry: any) => 
      sum + parseFloat(entry.debitAmount || 0), 0);
    
    const totalCredits = entries.reduce((sum: number, entry: any) => 
      sum + parseFloat(entry.creditAmount || 0), 0);
    
    const pendingCount = entries.filter((entry: any) => 
      entry.status === 'pending_approval').length;

    return {
      totalDebits,
      totalCredits,
      currentBalance: parseFloat(lastEntry?.runningBalance || loanAmount || 0),
      principalBalance: parseFloat(lastEntry?.principalBalance || loanAmount || 0),
      pendingCount,
    };
  };

  const summary = calculateSummary();

  const getTransactionTypeBadge = (type: string) => {
    const badges: { [key: string]: { color: string; label: string } } = {
      principal: { color: "bg-green-50", label: "Principal" },
      interest: { color: "bg-purple-50", label: "Interest" },
      fee: { color: "bg-yellow-50", label: "Fee" },
      payment: { color: "bg-blue-50", label: "Payment" },
      escrow: { color: "bg-indigo-50", label: "Escrow" },
      penalty: { color: "bg-red-50", label: "Penalty" },
      reversal: { color: "bg-orange-50", label: "Reversal" },
    };
    
    const badge = badges[type] || { color: "bg-gray-50", label: type };
    return <Badge variant="outline" className={badge.color}>{badge.label}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'posted':
        return <Badge className="bg-green-500">Posted</Badge>;
      case 'pending_approval':
        return <Badge variant="secondary">Pending Approval</Badge>;
      case 'reversed':
        return <Badge variant="destructive">Reversed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            General Ledger
          </CardTitle>
          <CardDescription>
            Complete transaction history with debit/credit entries and running balance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Ledger Actions Bar */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAddTransaction(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Transaction
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>
                <FileText className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowEmailDialog(true)}>
                <Mail className="h-4 w-4 mr-2" />
                Email Report
              </Button>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Current Balance</p>
              <p className="text-2xl font-bold">${summary.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-24">Date</TableHead>
                  <TableHead className="w-32">Transaction ID</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Type</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right font-bold">Balance</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">Loading ledger entries...</TableCell>
                  </TableRow>
                ) : !Array.isArray(ledgerEntries) || ledgerEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                      No transactions recorded yet
                    </TableCell>
                  </TableRow>
                ) : (
                  ledgerEntries.map((entry: any) => (
                    <TableRow key={entry.id} className={entry.status === 'pending_approval' ? 'bg-yellow-50' : ''}>
                      <TableCell className="font-mono text-sm">
                        {new Date(entry.transactionDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{entry.transactionId}</TableCell>
                      <TableCell>{entry.description}</TableCell>
                      <TableCell className="text-center">
                        {getTransactionTypeBadge(entry.transactionType)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-red-600">
                        {entry.debitAmount ? `$${parseFloat(entry.debitAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-green-600">
                        {entry.creditAmount ? `$${parseFloat(entry.creditAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        ${parseFloat(entry.runningBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(entry.status)}
                      </TableCell>
                      <TableCell>
                        {entry.status === 'pending_approval' ? (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setSelectedTransaction(entry);
                              setShowApprovalDialog(true);
                            }}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" disabled>
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-5 gap-4 mt-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-gray-500">Total Debits</div>
                <div className="text-xl font-bold text-red-600">${summary.totalDebits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-gray-500">Total Credits</div>
                <div className="text-xl font-bold text-green-600">${summary.totalCredits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-gray-500">Principal Balance</div>
                <div className="text-xl font-bold text-blue-600">${summary.principalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-gray-500">Pending Transactions</div>
                <div className="text-xl font-bold text-yellow-600">{summary.pendingCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-gray-500">Current Balance</div>
                <div className="text-xl font-bold">${summary.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </CardContent>
            </Card>
          </div>

          {/* Note about non-destructive accounting */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-start space-x-3">
              <Info className="h-5 w-5 text-blue-500 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-semibold mb-1">Non-Destructive Accounting Policy</p>
                <p>All corrections are made through reversing entries. Original transactions cannot be deleted. 
                Deletions require senior officer approval and are logged in the audit trail.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Transaction Dialog */}
      <Dialog open={showAddTransaction} onOpenChange={setShowAddTransaction}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Transaction</DialogTitle>
            <DialogDescription>
              Record a new transaction in the loan ledger
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="transactionDate">Transaction Date</Label>
                <Input
                  id="transactionDate"
                  type="date"
                  value={newTransaction.transactionDate}
                  onChange={(e) => setNewTransaction({ ...newTransaction, transactionDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transactionType">Transaction Type</Label>
                <Select 
                  value={newTransaction.transactionType} 
                  onValueChange={(value) => {
                    setNewTransaction({ ...newTransaction, transactionType: value, feeId: '' });
                    setSelectedFee(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="principal">Principal</SelectItem>
                    <SelectItem value="interest">Interest</SelectItem>
                    <SelectItem value="fee">Fee</SelectItem>
                    <SelectItem value="payment">Payment</SelectItem>
                    <SelectItem value="escrow">Escrow</SelectItem>
                    <SelectItem value="penalty">Penalty</SelectItem>
                    <SelectItem value="reversal">Reversal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Show fee selector when transaction type is fee */}
            {newTransaction.transactionType === 'fee' && (
              <div className="space-y-2">
                <Label htmlFor="feeSelection">Select Fee from Schedule</Label>
                <Select 
                  value={newTransaction.feeId} 
                  onValueChange={(value) => {
                    const fee = availableFees.find((f: any) => f.name === value);
                    if (fee) {
                      setSelectedFee(fee);
                      setNewTransaction({ 
                        ...newTransaction, 
                        feeId: value,
                        description: `${fee.name} - ${fee.type}`,
                        amount: `-${fee.amount}` // Fees are typically debits (negative)
                      });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a fee from the schedule" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFees.length === 0 ? (
                      <SelectItem value="none" disabled>No fees in schedule</SelectItem>
                    ) : (
                      availableFees.map((fee: any, index: number) => (
                        <SelectItem key={index} value={fee.name}>
                          {fee.name} - ${parseFloat(fee.amount).toFixed(2)} ({fee.type})
                          {fee.note && ` - ${fee.note}`}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {selectedFee && (
                  <div className="p-3 bg-blue-50 rounded-md text-sm">
                    <p className="font-medium">{selectedFee.name}</p>
                    <p className="text-gray-600">Type: {selectedFee.type}</p>
                    <p className="text-gray-600">Amount: ${parseFloat(selectedFee.amount).toFixed(2)}</p>
                    <p className="text-gray-600">Frequency: {selectedFee.frequency}</p>
                    {selectedFee.note && <p className="text-gray-600">Note: {selectedFee.note}</p>}
                  </div>
                )}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={newTransaction.description}
                onChange={(e) => setNewTransaction({ ...newTransaction, description: e.target.value })}
                placeholder="Enter transaction description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={newTransaction.amount}
                  onChange={(e) => setNewTransaction({ ...newTransaction, amount: e.target.value })}
                  placeholder="Enter amount (negative for debit, positive for credit)"
                  className="flex-1"
                />
                <div className="text-sm text-gray-500 w-48">
                  {newTransaction.amount && (
                    parseFloat(newTransaction.amount) < 0 ? 
                    <span className="text-red-600">Debit: ${Math.abs(parseFloat(newTransaction.amount)).toFixed(2)}</span> : 
                    <span className="text-green-600">Credit: ${parseFloat(newTransaction.amount).toFixed(2)}</span>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500">Use negative numbers for debits (charges) and positive for credits (payments/deposits)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={newTransaction.notes}
                onChange={(e) => setNewTransaction({ ...newTransaction, notes: e.target.value })}
                placeholder="Optional notes about this transaction"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddTransaction(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                const amount = parseFloat(newTransaction.amount);
                const transactionData = {
                  ...newTransaction,
                  debitAmount: amount < 0 ? Math.abs(amount).toFixed(2) : '',
                  creditAmount: amount > 0 ? amount.toFixed(2) : '',
                };
                // Remove amount property to avoid conflicts
                const { amount: _, ...finalData } = transactionData;
                console.log('Sending transaction data:', finalData);
                addTransactionMutation.mutate(finalData);
              }}
              disabled={!newTransaction.description || !newTransaction.amount}
            >
              Add Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Transaction</DialogTitle>
            <DialogDescription>
              Review and approve this pending transaction
            </DialogDescription>
          </DialogHeader>
          {selectedTransaction && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-gray-500">Transaction Details</p>
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  <p><strong>ID:</strong> {selectedTransaction.transactionId}</p>
                  <p><strong>Description:</strong> {selectedTransaction.description}</p>
                  <p><strong>Amount:</strong> 
                    {selectedTransaction.debitAmount && ` Debit: $${selectedTransaction.debitAmount}`}
                    {selectedTransaction.creditAmount && ` Credit: $${selectedTransaction.creditAmount}`}
                  </p>
                  <p><strong>Type:</strong> {selectedTransaction.transactionType}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="approvalNotes">Approval Notes</Label>
                <Textarea
                  id="approvalNotes"
                  placeholder="Enter approval notes (optional)"
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApprovalDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                const notes = (document.getElementById('approvalNotes') as HTMLTextAreaElement)?.value || '';
                approveTransactionMutation.mutate({ id: selectedTransaction.id, notes });
              }}
            >
              Approve & Post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email Ledger Report</DialogTitle>
            <DialogDescription>
              Send the ledger report to a contact via email
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recipientEmail">Recipient Email</Label>
              <Input
                id="recipientEmail"
                type="email"
                value={emailRecipient.email}
                onChange={(e) => setEmailRecipient({ ...emailRecipient, email: e.target.value })}
                placeholder="recipient@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipientName">Recipient Name</Label>
              <Input
                id="recipientName"
                value={emailRecipient.name}
                onChange={(e) => setEmailRecipient({ ...emailRecipient, name: e.target.value })}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="format">Report Format</Label>
              <Select 
                value={emailRecipient.format} 
                onValueChange={(value) => setEmailRecipient({ ...emailRecipient, format: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => emailLedgerMutation.mutate({
                recipientEmail: emailRecipient.email,
                recipientName: emailRecipient.name,
                format: emailRecipient.format
              })}
              disabled={!emailRecipient.email || !emailRecipient.name}
            >
              <Send className="h-4 w-4 mr-2" />
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}