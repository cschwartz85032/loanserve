import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Plus, Clock, DollarSign, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { ESCROW_TYPES } from "@/lib/constants";

interface ScheduledPayment {
  id: string;
  escrowAccountId: string;
  paymentType: string;
  amount: number;
  scheduledDate: Date;
  status: "scheduled" | "processing" | "completed" | "failed";
  payee: string;
  reference: string;
  createdAt: Date;
  updatedAt: Date;
}

export function PaymentScheduler({ escrowAccountId }: { escrowAccountId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date>();
  const [paymentType, setPaymentType] = useState("");
  const [amount, setAmount] = useState("");
  const [payee, setPayee] = useState("");
  const [reference, setReference] = useState("");
  const { toast } = useToast();

  const { data: scheduledPayments, isLoading } = useQuery({
    queryKey: ["/api/escrow-payments", escrowAccountId],
    enabled: !!escrowAccountId,
  });

  const scheduleMutation = useMutation({
    mutationFn: async (payment: Omit<ScheduledPayment, "id" | "status" | "createdAt" | "updatedAt">) => {
      const response = await fetch("/api/escrow-payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payment),
      });
      if (!response.ok) throw new Error("Failed to schedule payment");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escrow-payments", escrowAccountId] });
      toast({
        title: "Payment Scheduled",
        description: "The escrow payment has been scheduled successfully.",
      });
      setIsOpen(false);
      resetForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to schedule payment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const response = await fetch(`/api/escrow-payments/${paymentId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to cancel payment");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escrow-payments", escrowAccountId] });
      toast({
        title: "Payment Cancelled",
        description: "The scheduled payment has been cancelled.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to cancel payment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setScheduledDate(undefined);
    setPaymentType("");
    setAmount("");
    setPayee("");
    setReference("");
  };

  const handleSchedulePayment = () => {
    if (!scheduledDate || !paymentType || !amount || !payee) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    scheduleMutation.mutate({
      escrowAccountId,
      paymentType,
      amount: parseFloat(amount),
      scheduledDate,
      payee,
      reference,
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
      scheduled: { variant: "default", icon: Clock },
      processing: { variant: "secondary", icon: Clock },
      completed: { variant: "outline", icon: CheckCircle },
      failed: { variant: "destructive", icon: XCircle },
    };
    const config = variants[status] || variants.scheduled;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant}>
        <Icon className="mr-1 h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const upcomingPayments = Array.isArray(scheduledPayments) 
    ? scheduledPayments.filter((p: ScheduledPayment) => p.status === "scheduled")
    : [];
    
  const recentPayments = Array.isArray(scheduledPayments)
    ? scheduledPayments.filter((p: ScheduledPayment) => p.status !== "scheduled")
    : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Payment Scheduler</CardTitle>
            <CardDescription>Schedule and manage escrow disbursements</CardDescription>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Schedule Payment
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Schedule Escrow Payment</DialogTitle>
                <DialogDescription>
                  Set up a new escrow payment disbursement
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="payment-type">Payment Type</Label>
                  <Select value={paymentType} onValueChange={setPaymentType}>
                    <SelectTrigger id="payment-type">
                      <SelectValue placeholder="Select payment type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ESCROW_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="amount">Amount</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="amount"
                      type="number"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="payee">Payee</Label>
                  <Input
                    id="payee"
                    placeholder="Enter payee name"
                    value={payee}
                    onChange={(e) => setPayee(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="reference">Reference Number (Optional)</Label>
                  <Input
                    id="reference"
                    placeholder="Enter reference number"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Scheduled Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal",
                          !scheduledDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {scheduledDate ? format(scheduledDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={scheduledDate}
                        onSelect={setScheduledDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSchedulePayment} disabled={scheduleMutation.isPending}>
                  Schedule Payment
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {upcomingPayments.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-3">Upcoming Payments</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingPayments.map((payment: ScheduledPayment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{format(new Date(payment.scheduledDate), "MMM dd, yyyy")}</TableCell>
                    <TableCell>{ESCROW_TYPES.find(t => t.value === payment.paymentType)?.label}</TableCell>
                    <TableCell>{payment.payee}</TableCell>
                    <TableCell>${payment.amount.toLocaleString()}</TableCell>
                    <TableCell>{getStatusBadge(payment.status)}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelMutation.mutate(payment.id)}
                        disabled={cancelMutation.isPending}
                      >
                        Cancel
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {recentPayments.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-3">Recent Payments</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPayments.slice(0, 5).map((payment: ScheduledPayment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{format(new Date(payment.scheduledDate), "MMM dd, yyyy")}</TableCell>
                    <TableCell>{ESCROW_TYPES.find(t => t.value === payment.paymentType)?.label}</TableCell>
                    <TableCell>{payment.payee}</TableCell>
                    <TableCell>${payment.amount.toLocaleString()}</TableCell>
                    <TableCell>{getStatusBadge(payment.status)}</TableCell>
                    <TableCell>{payment.reference || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && scheduledPayments?.length === 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No payments scheduled yet. Click "Schedule Payment" to set up your first escrow disbursement.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}