/**
 * Enhanced Payment Table Component
 * Displays payments with status badges and detail drawer
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Eye,
  DollarSign,
  Calendar,
  Hash,
  CreditCard,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Activity
} from "lucide-react";

interface Payment {
  id: string;
  loanId: number;
  loanNumber: string;
  borrowerName: string;
  propertyAddress: string;
  amount: string;
  effectiveDate: string;
  receivedDate: string | null;
  status: string;
  paymentMethod: string | null;
  confirmationNumber: string | null;
  allocations: {
    principal: string;
    interest: string;
    escrow: string;
    lateFee: string;
    otherFee: string;
    suspense: string;
    details: Array<{
      type: string;
      amount: string;
      description: string;
    }>;
  };
  sourceChannel: string | null;
  processedDate: string | null;
  reconciledAt: string | null;
  artifacts: Array<{
    id: string;
    type: string;
    url: string;
    createdAt: string;
    metadata: any;
  }>;
  metadata: any;
  notes: string | null;
}

interface PaymentEvent {
  id: string;
  type: string;
  timestamp: string;
  actor: {
    type: string;
    id: string;
  };
  description: string;
  data: any;
  hash: {
    current: string;
    previous: string;
  };
  correlationId: string;
}

interface PaymentTableProps {
  loanId?: number;
}

export function PaymentTable({ loanId }: PaymentTableProps) {
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Fetch payments
  const { data: paymentsData, isLoading, refetch } = useQuery({
    queryKey: loanId ? [`/api/payments/${loanId}`] : ['/api/payments/all'],
    enabled: true,
    refetchInterval: 30000, // Refresh every 30 seconds for real-time updates
  });

  // Fetch events for selected payment
  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: selectedPayment ? [`/api/payments/${selectedPayment.id}/events`] : [],
    enabled: !!selectedPayment,
  });

  // Set up polling for real-time updates (WebSocket can be added later)
  useEffect(() => {
    // Poll for updates every 30 seconds
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ 
        queryKey: loanId ? [`/api/payments/${loanId}`] : ['/api/payments/all'] 
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [loanId]);

  const payments = paymentsData?.payments || [];

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
      pending: { variant: "secondary", icon: Clock },
      processing: { variant: "secondary", icon: RefreshCw },
      completed: { variant: "default", icon: CheckCircle },
      posted: { variant: "default", icon: CheckCircle },
      failed: { variant: "destructive", icon: XCircle },
      returned: { variant: "destructive", icon: XCircle },
      reversed: { variant: "destructive", icon: TrendingDown },
      reconciled: { variant: "default", icon: CheckCircle },
    };

    const config = variants[status] || { variant: "outline", icon: AlertCircle };
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const getChannelBadge = (channel: string | null) => {
    if (!channel) return null;
    
    const channels: Record<string, { label: string; icon: any }> = {
      ach: { label: "ACH", icon: CreditCard },
      wire: { label: "Wire", icon: TrendingUp },
      check: { label: "Check", icon: FileText },
      manual: { label: "Manual", icon: Hash },
      column: { label: "Column Bank", icon: CreditCard },
    };

    const config = channels[channel] || { label: channel, icon: CreditCard };
    const Icon = config.icon;

    return (
      <Badge variant="outline" className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  const openPaymentDetails = (payment: Payment) => {
    setSelectedPayment(payment);
    setSheetOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Payments</h2>
          <Button onClick={() => refetch()} size="sm" variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Loan</TableHead>
                <TableHead>Borrower</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Confirmation</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No payments found
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((payment: Payment) => (
                  <TableRow key={payment.id} data-testid={`payment-row-${payment.id}`}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {format(new Date(payment.effectiveDate), 'MMM dd, yyyy')}
                        </span>
                        {payment.receivedDate && (
                          <span className="text-xs text-muted-foreground">
                            Received: {format(new Date(payment.receivedDate), 'MMM dd')}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{payment.loanNumber}</span>
                        <span className="text-xs text-muted-foreground">
                          {payment.propertyAddress}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{payment.borrowerName}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{formatCurrency(payment.amount)}</span>
                        {payment.allocations.suspense !== '0' && (
                          <span className="text-xs text-amber-600">
                            Suspense: {formatCurrency(payment.allocations.suspense)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(payment.status)}</TableCell>
                    <TableCell>{getChannelBadge(payment.sourceChannel)}</TableCell>
                    <TableCell>
                      {payment.confirmationNumber && (
                        <span className="text-xs font-mono">{payment.confirmationNumber}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openPaymentDetails(payment)}
                        data-testid={`view-payment-${payment.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Payment Details Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
          {selectedPayment && (
            <>
              <SheetHeader>
                <SheetTitle>Payment Details</SheetTitle>
                <SheetDescription>
                  Payment ID: {selectedPayment.id}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Payment Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Payment Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount:</span>
                      <span className="font-medium">{formatCurrency(selectedPayment.amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      {getStatusBadge(selectedPayment.status)}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Effective Date:</span>
                      <span>{format(new Date(selectedPayment.effectiveDate), 'MMM dd, yyyy')}</span>
                    </div>
                    {selectedPayment.sourceChannel && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Channel:</span>
                        {getChannelBadge(selectedPayment.sourceChannel)}
                      </div>
                    )}
                    {selectedPayment.confirmationNumber && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Confirmation:</span>
                        <span className="font-mono text-sm">{selectedPayment.confirmationNumber}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Tabs defaultValue="allocations" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="allocations">Allocations</TabsTrigger>
                    <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                    <TabsTrigger value="metadata">Metadata</TabsTrigger>
                  </TabsList>

                  {/* Allocations Tab */}
                  <TabsContent value="allocations" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Payment Breakdown</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Principal:</span>
                            <span className="font-medium">{formatCurrency(selectedPayment.allocations.principal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Interest:</span>
                            <span className="font-medium">{formatCurrency(selectedPayment.allocations.interest)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Escrow:</span>
                            <span className="font-medium">{formatCurrency(selectedPayment.allocations.escrow)}</span>
                          </div>
                          {selectedPayment.allocations.lateFee !== '0' && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Late Fee:</span>
                              <span className="font-medium">{formatCurrency(selectedPayment.allocations.lateFee)}</span>
                            </div>
                          )}
                          {selectedPayment.allocations.otherFee !== '0' && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Other Fees:</span>
                              <span className="font-medium">{formatCurrency(selectedPayment.allocations.otherFee)}</span>
                            </div>
                          )}
                          {selectedPayment.allocations.suspense !== '0' && (
                            <>
                              <Separator />
                              <div className="flex justify-between text-amber-600">
                                <span className="font-medium">Suspense Amount:</span>
                                <span className="font-medium">{formatCurrency(selectedPayment.allocations.suspense)}</span>
                              </div>
                            </>
                          )}
                        </div>

                        {selectedPayment.allocations.details.length > 0 && (
                          <>
                            <Separator className="my-4" />
                            <div className="space-y-2">
                              <h4 className="font-medium text-sm">Detailed Allocations</h4>
                              {selectedPayment.allocations.details.map((detail, idx) => (
                                <div key={idx} className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">{detail.description}:</span>
                                  <span>{formatCurrency(detail.amount)}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Artifacts Tab */}
                  <TabsContent value="artifacts" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Payment Artifacts</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {selectedPayment.artifacts.length === 0 ? (
                          <p className="text-muted-foreground">No artifacts available</p>
                        ) : (
                          <div className="space-y-3">
                            {selectedPayment.artifacts.map((artifact) => (
                              <div key={artifact.id} className="flex items-center justify-between p-3 border rounded-lg">
                                <div className="flex items-center space-x-3">
                                  <FileText className="h-5 w-5 text-muted-foreground" />
                                  <div>
                                    <p className="font-medium text-sm">{artifact.type}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {format(new Date(artifact.createdAt), 'MMM dd, yyyy HH:mm')}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => window.open(artifact.url, '_blank')}
                                  data-testid={`artifact-link-${artifact.id}`}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Timeline Tab */}
                  <TabsContent value="timeline" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Event Timeline</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {eventsLoading ? (
                          <div className="space-y-2">
                            <Skeleton className="h-16 w-full" />
                            <Skeleton className="h-16 w-full" />
                            <Skeleton className="h-16 w-full" />
                          </div>
                        ) : eventsData?.events?.length === 0 ? (
                          <p className="text-muted-foreground">No events recorded</p>
                        ) : (
                          <ScrollArea className="h-[400px]">
                            <div className="space-y-4">
                              {eventsData?.events?.map((event: PaymentEvent) => (
                                <div key={event.id} className="flex space-x-3">
                                  <div className="flex-shrink-0">
                                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                      <Activity className="h-4 w-4 text-primary" />
                                    </div>
                                  </div>
                                  <div className="flex-1 space-y-1">
                                    <div className="flex items-center justify-between">
                                      <h4 className="text-sm font-medium">{event.description}</h4>
                                      <Badge variant="outline" className="text-xs">
                                        {event.type}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {format(new Date(event.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Actor: {event.actor.type} ({event.actor.id})
                                    </p>
                                    {event.correlationId && (
                                      <p className="text-xs font-mono text-muted-foreground">
                                        Correlation: {event.correlationId.slice(0, 8)}...
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Metadata Tab */}
                  <TabsContent value="metadata" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Additional Information</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {selectedPayment.notes && (
                          <div className="mb-4">
                            <h4 className="font-medium text-sm mb-2">Notes</h4>
                            <p className="text-sm text-muted-foreground">{selectedPayment.notes}</p>
                          </div>
                        )}
                        {selectedPayment.metadata && (
                          <div>
                            <h4 className="font-medium text-sm mb-2">Metadata</h4>
                            <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                              {JSON.stringify(selectedPayment.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}