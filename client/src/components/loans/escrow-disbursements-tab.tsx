import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Plus, Edit, Trash2, Pause, Play, DollarSign, Calendar, Building2, Phone, Mail, Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Form schemas
const disbursementSchema = z.object({
  disbursementType: z.enum(['taxes', 'insurance', 'hoa', 'other']),
  description: z.string().min(1, "Description is required"),
  
  // Status field (only when editing)
  status: z.enum(['active', 'suspended', 'completed', 'cancelled', 'terminated']).optional(),
  
  // Payee information
  payeeName: z.string().min(1, "Payee name is required"),
  payeeContactName: z.string().optional(),
  payeePhone: z.string().optional(),
  payeeEmail: z.string().email().optional().or(z.literal("")),
  payeeFax: z.string().optional(),
  
  // Payee address
  payeeStreetAddress: z.string().optional(),
  payeeCity: z.string().optional(),
  payeeState: z.string().optional(),
  payeeZipCode: z.string().optional(),
  
  // Type-specific fields (parcel number will come from property data)
  accountNumber: z.string().optional(), // For taxes
  policyNumber: z.string().optional(), // For insurance
  
  // Insurance-specific fields
  insuredName: z.string().optional(),
  insuranceCompanyName: z.string().optional(),
  policyDescription: z.string().optional(),
  policyExpirationDate: z.string().optional(),
  coverageAmount: z.string().optional(),
  
  // Insurance agent information
  agentName: z.string().optional(),
  agentBusinessAddress: z.string().optional(),
  agentCity: z.string().optional(),
  agentState: z.string().optional(),
  agentZipCode: z.string().optional(),
  agentPhone: z.string().optional(),
  agentFax: z.string().optional(),
  agentEmail: z.string().email().optional().or(z.literal("")),
  
  // Payment details
  paymentMethod: z.enum(['check', 'ach', 'wire']),
  bankAccountNumber: z.string().optional(),
  achRoutingNumber: z.string().optional(),
  wireRoutingNumber: z.string().optional(),
  accountType: z.enum(['checking', 'savings']).optional(),
  bankName: z.string().optional(),
  wireInstructions: z.string().optional(),
  
  // Remittance information
  remittanceAddress: z.string().optional(),
  remittanceCity: z.string().optional(),
  remittanceState: z.string().optional(),
  remittanceZipCode: z.string().optional(),
  accountNumber2: z.string().optional(),
  referenceNumber: z.string().optional(),
  
  // Payment schedule
  frequency: z.enum(['once', 'monthly', 'quarterly', 'semi_annual', 'annual']),
  monthlyAmount: z.string().optional(),
  annualAmount: z.string().optional(), // Will be calculated
  paymentAmount: z.string().min(1, "Payment amount is required"),
  nextDueDate: z.string().min(1, "Next due date is required"),
  firstDueDate: z.string().optional(),
  specificDueDates: z.string().optional(),
  
  // Settings
  autoPayEnabled: z.boolean().default(true),
  daysBeforeDue: z.number().min(1).max(30).default(10),
  notes: z.string().optional(),
});

type DisbursementFormData = z.infer<typeof disbursementSchema>;

interface EscrowDisbursementsTabProps {
  loanId: string;
}

interface EscrowDisbursement {
  id: number;
  loanId: number;
  disbursementType: string;
  description: string;
  payeeName: string;
  payeeContactName?: string;
  payeePhone?: string;
  payeeEmail?: string;
  payeeStreetAddress?: string;
  payeeCity?: string;
  payeeState?: string;
  payeeZipCode?: string;
  // Type-specific fields
  accountNumber?: string;
  accountType?: string;
  policyNumber?: string;
  wireInstructions?: string;
  // Insurance-specific fields
  insuredName?: string;
  insuranceCompanyName?: string;
  policyDescription?: string;
  policyExpirationDate?: string;
  coverageAmount?: string;
  insurancePropertyAddress?: string;
  insurancePropertyCity?: string;
  insurancePropertyState?: string;
  insurancePropertyZipCode?: string;
  agentName?: string;
  agentBusinessAddress?: string;
  agentCity?: string;
  agentState?: string;
  agentZipCode?: string;
  agentPhone?: string;
  agentFax?: string;
  agentEmail?: string;
  insuranceDocumentId?: number;
  insuranceTracking?: boolean;
  // Payment details
  paymentMethod: string;
  bankAccountNumber?: string;
  achRoutingNumber?: string;
  wireRoutingNumber?: string;
  bankName?: string;
  frequency: string;
  annualAmount: string;
  paymentAmount: string;
  monthlyAmount?: string;
  nextDueDate: string;
  daysBeforeDue?: number;
  status: string;
  isOnHold: boolean;
  holdReason?: string;
  holdRequestedBy?: string;
  autoPayEnabled: boolean;
  notes?: string;
  createdAt: string;
}

interface EscrowSummaryResponse {
  summary: {
    totalDisbursements: number;
    activeDisbursements: number;
    onHoldDisbursements: number;
    totalAnnualAmount: string;
  };
}

export function EscrowDisbursementsTab({ loanId }: EscrowDisbursementsTabProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingDisbursement, setEditingDisbursement] = useState<EscrowDisbursement | null>(null);
  const [showSensitive, setShowSensitive] = useState<{ [key: number]: boolean }>({});
  const queryClient = useQueryClient();

  // Fetch loan data to get property information
  const { data: loan } = useQuery({
    queryKey: [`/api/loans/${loanId}`],
    enabled: !!loanId
  }) as { data: any };

  const { data: disbursements = [], isLoading, refetch: refetchDisbursements } = useQuery({
    queryKey: [`/api/loans/${loanId}/escrow-disbursements`],
    queryFn: async () => {
      const response = await apiRequest(`/api/loans/${loanId}/escrow-disbursements`);
      const data = await response.json();
      console.log('Fetched disbursements from API:', data);
      return Array.isArray(data) ? data : [];
    },
    staleTime: 0, // Always consider data stale
    gcTime: 0, // Don't cache the data (updated API)
  });

  // Local state to track disbursements for immediate UI updates
  const [localDisbursements, setLocalDisbursements] = useState<EscrowDisbursement[]>([]);

  // Update local state when query data changes - avoid infinite loops
  useEffect(() => {
    if (Array.isArray(disbursements)) {
      setLocalDisbursements(disbursements);
    }
  }, [disbursements]);

  const { data: escrowSummary, refetch: refetchSummary } = useQuery<EscrowSummaryResponse>({
    queryKey: [`/api/loans/${loanId}/escrow-summary`],
    queryFn: async () => {
      const response = await apiRequest(`/api/loans/${loanId}/escrow-summary`);
      const data = await response.json();
      return data as EscrowSummaryResponse;
    },
    staleTime: 0, // Always consider data stale
    gcTime: 0, // Don't cache the data (updated API)
  });

  const form = useForm<DisbursementFormData>({
    resolver: zodResolver(disbursementSchema),
    defaultValues: {
      disbursementType: 'taxes',
      description: '',
      payeeName: '',
      payeeContactName: '',
      payeePhone: '',
      payeeEmail: '',
      payeeStreetAddress: '',
      payeeCity: '',
      payeeState: '',
      payeeZipCode: '',
      accountNumber: '',
      policyNumber: '',
      // Insurance-specific fields
      insuredName: '',
      insuranceCompanyName: '',
      policyDescription: '',
      policyExpirationDate: '',
      coverageAmount: '',

      agentName: '',
      agentBusinessAddress: '',
      agentCity: '',
      agentState: '',
      agentZipCode: '',
      agentPhone: '',
      agentFax: '',
      agentEmail: '',
      // Payment fields
      paymentMethod: 'check',
      bankAccountNumber: '',
      achRoutingNumber: '',
      wireRoutingNumber: '',
      bankName: '',
      frequency: 'annual',
      paymentAmount: '',
      nextDueDate: '',
      annualAmount: '',
      monthlyAmount: '',
      autoPayEnabled: true,
      daysBeforeDue: 10,
      notes: '',
    },
  });

  // Helper function to get frequency multiplier
  const getFrequencyMultiplier = (frequency: string) => {
    switch (frequency) {
      case 'once': return 1;
      case 'monthly': return 12;
      case 'quarterly': return 4;
      case 'semi_annual': return 2;
      case 'annual': return 1;
      default: return 1;
    }
  };

  // Watch for changes in payment amount and frequency to calculate annual and monthly amounts
  const paymentAmount = form.watch('paymentAmount');
  const frequency = form.watch('frequency');

  useEffect(() => {
    if (paymentAmount && frequency) {
      const amount = parseFloat(paymentAmount);
      const multiplier = getFrequencyMultiplier(frequency);
      
      if (!isNaN(amount)) {
        const annualAmount = (amount * multiplier).toFixed(2);
        const monthlyAmount = (parseFloat(annualAmount) / 12).toFixed(2);
        
        form.setValue('annualAmount', annualAmount, { shouldValidate: false });
        form.setValue('monthlyAmount', monthlyAmount, { shouldValidate: false });
      }
    }
  }, [paymentAmount, frequency]); // Removed form from dependencies to prevent infinite loop

  const createMutation = useMutation({
    mutationFn: async (data: DisbursementFormData) => {
      const response = await apiRequest(`/api/loans/${loanId}/escrow-disbursements`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return await response.json();
    },
    onSuccess: (newDisbursement) => {
      console.log('Disbursement created successfully, updating local state and refetching for loanId:', loanId);
      
      // Immediately update local state for instant UI feedback
      setLocalDisbursements(prev => [...prev, newDisbursement]);
      
      // Also refetch to ensure data consistency
      refetchDisbursements();
      refetchSummary();
      
      setIsAddDialogOpen(false);
      setEditingDisbursement(null);
      form.reset();
      toast({ title: "Disbursement created successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error creating disbursement", 
        description: error.message || "Failed to create disbursement",
        variant: "destructive" 
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<DisbursementFormData> }) => {
      const response = await apiRequest(`/api/escrow-disbursements/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return await response.json();
    },
    onSuccess: () => {
      console.log('Disbursement updated successfully, manually refetching data for loanId:', loanId);
      refetchDisbursements();
      refetchSummary();
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/escrow-disbursements`] });
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/escrow-summary`] });
      setIsAddDialogOpen(false);
      setEditingDisbursement(null);
      form.reset();
      toast({ title: "Disbursement updated successfully" });
    },
  });

  const holdMutation = useMutation({
    mutationFn: async ({ id, action, reason, requestedBy }: { id: number; action: 'hold' | 'release'; reason?: string; requestedBy?: string }) => {
      const response = await apiRequest(`/api/escrow-disbursements/${id}/hold`, {
        method: 'POST',
        body: JSON.stringify({ action, reason, requestedBy }),
      });
      return await response.json();
    },
    onSuccess: (updatedDisbursement) => {
      console.log('Disbursement hold status updated, updating local state and refetching data for loanId:', loanId);
      
      // Update local state immediately for instant UI feedback
      setLocalDisbursements(prev => 
        prev.map(d => d.id === updatedDisbursement.id ? updatedDisbursement : d)
      );
      
      refetchDisbursements();
      refetchSummary();
      toast({ title: "Disbursement status updated successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest(`/api/escrow-disbursements/${id}`, { method: 'DELETE' });
      // DELETE returns 204 No Content, so no JSON to parse
      if (!response.ok) {
        throw new Error(`Failed to delete: ${response.status}`);
      }
      return id; // Return the deleted ID
    },
    onSuccess: (deletedId) => {
      console.log('Disbursement deleted successfully, ID:', deletedId);
      
      // Update local state immediately for instant UI feedback
      setLocalDisbursements(prev => prev.filter(d => d.id !== deletedId));
      
      // Also refetch to ensure data consistency with backend
      setTimeout(() => {
        refetchDisbursements();
        refetchSummary();
      }, 100);
      
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/escrow-disbursements`] });
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/escrow-summary`] });
      toast({ title: "Disbursement deleted successfully" });
    },
    onError: (error: any) => {
      console.error('Delete failed:', error);
      toast({ 
        title: "Failed to delete disbursement", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const onSubmit = (data: DisbursementFormData) => {
    if (editingDisbursement) {
      updateMutation.mutate({ id: editingDisbursement.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const toggleSensitive = (id: number) => {
    setShowSensitive(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const maskSensitive = (value: string | undefined, id: number) => {
    if (!value) return '';
    return showSensitive[id] ? value : '****' + value.slice(-4);
  };

  const getStatusColor = (status: string, isOnHold: boolean) => {
    if (isOnHold) return 'destructive';
    switch (status) {
      case 'active': return 'default';
      case 'suspended': return 'secondary';
      case 'cancelled': return 'destructive';
      case 'completed': return 'outline'; // Changed from 'success' to 'outline'
      case 'terminated': return 'secondary'; // For historical insurance records
      default: return 'default';
    }
  };

  const getFrequencyLabel = (frequency: string) => {
    const labels: { [key: string]: string } = {
      once: 'Once',
      monthly: 'Monthly',
      quarterly: 'Quarterly',
      semi_annual: 'Semi-Annual',
      annual: 'Annual'
    };
    return labels[frequency] || frequency;
  };

  if (isLoading) {
    return <div className="p-4">Loading escrow disbursements...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Disbursements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{escrowSummary?.summary?.totalDisbursements || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{escrowSummary?.summary?.activeDisbursements || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">On Hold</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{escrowSummary?.summary?.onHoldDisbursements || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Annual Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${Number(escrowSummary?.summary?.totalAnnualAmount || 0).toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Action Bar */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Escrow Disbursements</h3>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Disbursement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingDisbursement ? 'Edit Disbursement' : 'Add New Disbursement'}
              </DialogTitle>
              <DialogDescription>
                Configure escrow disbursement details, payee information, and payment schedule.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <Tabs defaultValue="basic" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="basic">Basic Info</TabsTrigger>
                    <TabsTrigger value="payee">Payee Details</TabsTrigger>
                    <TabsTrigger value="payment">Payment Info</TabsTrigger>
                    <TabsTrigger value="schedule">Schedule</TabsTrigger>
                  </TabsList>

                  <TabsContent value="basic" className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                      <FormField
                        control={form.control}
                        name="disbursementType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Disbursement Type *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="taxes">Property Taxes</SelectItem>
                                <SelectItem value="insurance">Insurance</SelectItem>
                                <SelectItem value="hoa">HOA Fees</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {/* Show status field only when editing an existing disbursement */}
                      {editingDisbursement && (
                        <FormField
                          control={form.control}
                          name="status"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Status</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value || editingDisbursement.status}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select status" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="suspended">Suspended</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                  <SelectItem value="cancelled">Cancelled</SelectItem>
                                  {/* Show terminated option only for insurance disbursements */}
                                  {form.watch('disbursementType') === 'insurance' && (
                                    <SelectItem value="terminated">Terminated (Historical Record)</SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                              {field.value === 'terminated' && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  This disbursement will be kept for historical records but is no longer active.
                                </p>
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                    </div>
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description *</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Annual property tax payment" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {/* Type-specific fields */}
                    {form.watch('disbursementType') === 'taxes' && (
                      <div className="space-y-4">
                        <FormField
                          control={form.control}
                          name="accountNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Account Number *</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter account number" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {loan?.parcelNumber && (
                          <div className="text-sm text-muted-foreground">
                            <strong>Parcel Number:</strong> {loan.parcelNumber}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {form.watch('disbursementType') === 'insurance' && (
                      <FormField
                        control={form.control}
                        name="policyNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Policy Number *</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter policy number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Additional notes..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>

                  <TabsContent value="payee" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="payeeName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Payee Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="County Tax Collector" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="payeeContactName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Person</FormLabel>
                            <FormControl>
                              <Input placeholder="John Smith" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="payeePhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl>
                              <Input placeholder="(555) 123-4567" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="payeeEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input placeholder="contact@taxcollector.gov" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="payeeFax"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fax</FormLabel>
                            <FormControl>
                              <Input placeholder="(555) 123-4568" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="payeeStreetAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Street Address</FormLabel>
                            <FormControl>
                              <Input placeholder="123 Main St" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="payeeCity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input placeholder="Anytown" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="payeeState"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>State</FormLabel>
                            <FormControl>
                              <Input placeholder="CA" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="payeeZipCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>ZIP Code</FormLabel>
                            <FormControl>
                              <Input placeholder="12345" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    {/* Insurance-specific fields - shown only for insurance disbursements */}
                    {form.watch('disbursementType') === 'insurance' && (
                      <>
                        <div className="border-b pb-2 pt-4">
                          <h4 className="font-medium text-sm">Insurance Policy Details</h4>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="policyDescription"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Policy Type</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select policy type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="Hazard">Hazard</SelectItem>
                                    <SelectItem value="Flood">Flood</SelectItem>
                                    <SelectItem value="Earthquake">Earthquake</SelectItem>
                                    <SelectItem value="Title">Title</SelectItem>
                                    <SelectItem value="PMI">PMI</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="policyExpirationDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Policy Expiration Date</FormLabel>
                                <FormControl>
                                  <Input type="date" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="insuredName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Insured Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="Name of insured party" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="coverageAmount"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Coverage Amount</FormLabel>
                                <FormControl>
                                  <Input type="number" step="0.01" placeholder="$0.00" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        
                        <FormField
                          control={form.control}
                          name="insuranceCompanyName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Insurance Company</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g., State Farm, Allstate" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <div className="border-b pb-2 pt-4">
                          <h4 className="font-medium text-sm">Insurance Agent Information</h4>
                        </div>
                        
                        <FormField
                          control={form.control}
                          name="agentName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Agent Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Insurance agent name" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="agentBusinessAddress"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Agent Address</FormLabel>
                                <FormControl>
                                  <Input placeholder="Street address" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="agentCity"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>City</FormLabel>
                                <FormControl>
                                  <Input placeholder="City" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="agentState"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>State</FormLabel>
                                <FormControl>
                                  <Input placeholder="State" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="agentZipCode"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>ZIP Code</FormLabel>
                                <FormControl>
                                  <Input placeholder="ZIP" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4">
                          <FormField
                            control={form.control}
                            name="agentPhone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Agent Phone</FormLabel>
                                <FormControl>
                                  <Input placeholder="(555) 123-4567" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="agentFax"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Agent Fax</FormLabel>
                                <FormControl>
                                  <Input placeholder="(555) 123-4568" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="agentEmail"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Agent Email</FormLabel>
                                <FormControl>
                                  <Input type="email" placeholder="agent@example.com" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </>
                    )}
                  </TabsContent>

                  <TabsContent value="payment" className="space-y-4">
                    <FormField
                      control={form.control}
                      name="paymentMethod"
                      render={({ field }) => (
                        <FormItem className="space-y-3">
                          <FormLabel>Payment Method *</FormLabel>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              className="flex flex-row space-x-6"
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="check" id="check" />
                                <label htmlFor="check">Check</label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="ach" id="ach" />
                                <label htmlFor="ach">ACH Transfer</label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="wire" id="wire" />
                                <label htmlFor="wire">Wire Transfer</label>
                              </div>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {(form.watch('paymentMethod') === 'ach' || form.watch('paymentMethod') === 'wire') && (
                      <>
                        <FormField
                          control={form.control}
                          name="bankAccountNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Account Number</FormLabel>
                              <FormControl>
                                <Input type="password" placeholder="Account number" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="achRoutingNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>ACH Routing Number</FormLabel>
                                <FormControl>
                                  <Input placeholder="123456789" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="wireRoutingNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Wire Routing Number</FormLabel>
                                <FormControl>
                                  <Input placeholder="123456789" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="accountType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Account Type</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select account type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="checking">Checking</SelectItem>
                                    <SelectItem value="savings">Savings</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="bankName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Bank Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="Bank of America" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="accountNumber2"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Reference/Policy Number</FormLabel>
                            <FormControl>
                              <Input placeholder="Tax parcel #, policy #, etc." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="referenceNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Reference Number</FormLabel>
                            <FormControl>
                              <Input placeholder="Additional reference" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="schedule" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="frequency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Payment Frequency *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select frequency" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="once">One Time</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                                <SelectItem value="quarterly">Quarterly</SelectItem>
                                <SelectItem value="semi_annual">Semi-Annual</SelectItem>
                                <SelectItem value="annual">Annual</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="nextDueDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Next Due Date *</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="paymentAmount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Payment Amount *</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="0.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="annualAmount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Annual Amount</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                step="0.01" 
                                placeholder="0.00" 
                                {...field} 
                                readOnly
                                className="bg-muted"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="monthlyAmount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Monthly Amount</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                step="0.01" 
                                placeholder="0.00" 
                                {...field} 
                                readOnly
                                className="bg-muted"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="autoPayEnabled"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                              <FormLabel>Auto-Pay Enabled</FormLabel>
                              <p className="text-sm text-muted-foreground">
                                Automatically process payments when due
                              </p>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="daysBeforeDue"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Days Before Due</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                min="1" 
                                max="30" 
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex justify-end space-x-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setIsAddDialogOpen(false);
                      setEditingDisbursement(null);
                      // Clear form for new disbursement
                      form.reset();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Disbursement'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Disbursements Table */}
      <Card>
        <CardHeader>
          <CardTitle>Disbursement List</CardTitle>
          <CardDescription>
            Manage all escrow disbursements for this loan
          </CardDescription>
        </CardHeader>
        <CardContent>
          {localDisbursements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No disbursements configured. Click "Add Disbursement" to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Next Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.isArray(localDisbursements) && localDisbursements.map((disbursement: EscrowDisbursement) => {
                  console.log('Rendering disbursement in table:', disbursement);
                  return (
                    <TableRow key={disbursement.id}>
                    <TableCell>
                      <div>
                        <Badge variant="outline" className="capitalize">
                          {disbursement.disbursementType}
                        </Badge>
                        <div className="text-sm text-muted-foreground mt-1">
                          <button
                            onClick={() => {
                              console.log('Opening edit dialog for disbursement:', disbursement.id);
                              setEditingDisbursement(disbursement);
                              
                              // Populate form with disbursement data
                              form.setValue('disbursementType', disbursement.disbursementType as any);
                              form.setValue('description', disbursement.description || '');
                              form.setValue('payeeName', disbursement.payeeName || '');
                              form.setValue('payeeContactName', disbursement.payeeContactName || '');
                              form.setValue('payeePhone', disbursement.payeePhone || '');
                              form.setValue('payeeEmail', disbursement.payeeEmail || '');
                              form.setValue('payeeStreetAddress', disbursement.payeeStreetAddress || '');
                              form.setValue('payeeCity', disbursement.payeeCity || '');
                              form.setValue('payeeState', disbursement.payeeState || '');
                              form.setValue('payeeZipCode', disbursement.payeeZipCode || '');
                              form.setValue('accountNumber', disbursement.accountNumber || '');
                              form.setValue('policyNumber', disbursement.policyNumber || '');
                              form.setValue('paymentMethod', disbursement.paymentMethod as any);
                              form.setValue('bankAccountNumber', disbursement.bankAccountNumber || '');
                              form.setValue('achRoutingNumber', disbursement.achRoutingNumber || '');
                              form.setValue('wireRoutingNumber', disbursement.wireRoutingNumber || '');
                              form.setValue('bankName', disbursement.bankName || '');
                              form.setValue('frequency', disbursement.frequency as any);
                              form.setValue('paymentAmount', disbursement.paymentAmount || '');
                              form.setValue('nextDueDate', disbursement.nextDueDate ? disbursement.nextDueDate.split('T')[0] : '');
                              form.setValue('autoPayEnabled', disbursement.autoPayEnabled || false);
                              form.setValue('daysBeforeDue', disbursement.daysBeforeDue || 10);
                              form.setValue('notes', disbursement.notes || '');
                              
                              // Insurance-specific fields
                              form.setValue('insuredName', disbursement.insuredName || '');
                              form.setValue('insuranceCompanyName', disbursement.insuranceCompanyName || '');
                              form.setValue('policyDescription', disbursement.policyDescription || '');
                              form.setValue('policyExpirationDate', disbursement.policyExpirationDate ? disbursement.policyExpirationDate.split('T')[0] : '');
                              form.setValue('coverageAmount', disbursement.coverageAmount || '');
                              form.setValue('agentName', disbursement.agentName || '');
                              form.setValue('agentBusinessAddress', disbursement.agentBusinessAddress || '');
                              form.setValue('agentCity', disbursement.agentCity || '');
                              form.setValue('agentState', disbursement.agentState || '');
                              form.setValue('agentZipCode', disbursement.agentZipCode || '');
                              form.setValue('agentPhone', disbursement.agentPhone || '');
                              form.setValue('agentFax', disbursement.agentFax || '');
                              form.setValue('agentEmail', disbursement.agentEmail || '');
                              
                              // Set status if present
                              form.setValue('status', disbursement.status || 'active');
                              
                              // Calculate and set derived amounts
                              const amount = parseFloat(disbursement.paymentAmount || '0');
                              const multiplier = getFrequencyMultiplier(disbursement.frequency);
                              
                              if (!isNaN(amount) && amount > 0) {
                                const annualAmount = (amount * multiplier).toFixed(2);
                                const monthlyAmount = (parseFloat(annualAmount) / 12).toFixed(2);
                                form.setValue('annualAmount', annualAmount);
                                form.setValue('monthlyAmount', monthlyAmount);
                              } else {
                                form.setValue('annualAmount', '');
                                form.setValue('monthlyAmount', '');
                              }
                              
                              setIsAddDialogOpen(true);
                            }}
                            className="text-blue-600 underline hover:text-blue-800 text-left"
                          >
                            {disbursement.description}
                          </button>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{disbursement.payeeName}</div>
                        {disbursement.payeePhone && (
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {disbursement.payeePhone}
                          </div>
                        )}
                        {disbursement.payeeEmail && (
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {disbursement.payeeEmail}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {getFrequencyLabel(disbursement.frequency)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">${disbursement.paymentAmount ? Number(disbursement.paymentAmount).toLocaleString() : '0.00'}</div>
                        <div className="text-sm text-muted-foreground">
                          Annual: ${disbursement.annualAmount ? Number(disbursement.annualAmount).toLocaleString() : '0.00'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {disbursement.nextDueDate && disbursement.nextDueDate !== 'Invalid Date' ? new Date(disbursement.nextDueDate).toLocaleDateString() : 'Not set'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(disbursement.status, disbursement.isOnHold)}>
                        {disbursement.isOnHold ? 'On Hold' : disbursement.status}
                      </Badge>
                      {disbursement.isOnHold && disbursement.holdReason && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {disbursement.holdReason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            console.log('Edit button clicked for disbursement:', disbursement);
                            setEditingDisbursement(disbursement);
                            
                            // Use setValue for each field individually for better control
                            form.setValue('disbursementType', disbursement.disbursementType as any);
                            form.setValue('description', disbursement.description || '');
                            form.setValue('payeeName', disbursement.payeeName || '');
                            form.setValue('payeeContactName', disbursement.payeeContactName || '');
                            form.setValue('payeePhone', disbursement.payeePhone || '');
                            form.setValue('payeeEmail', disbursement.payeeEmail || '');
                            form.setValue('payeeStreetAddress', disbursement.payeeStreetAddress || '');
                            form.setValue('payeeCity', disbursement.payeeCity || '');
                            form.setValue('payeeState', disbursement.payeeState || '');
                            form.setValue('payeeZipCode', disbursement.payeeZipCode || '');
                            form.setValue('accountNumber', disbursement.accountNumber || '');
                            form.setValue('policyNumber', disbursement.policyNumber || '');
                            form.setValue('paymentMethod', disbursement.paymentMethod as any);
                            form.setValue('bankAccountNumber', disbursement.bankAccountNumber || '');
                            form.setValue('achRoutingNumber', disbursement.achRoutingNumber || '');
                            form.setValue('wireRoutingNumber', disbursement.wireRoutingNumber || '');
                            form.setValue('bankName', disbursement.bankName || '');
                            form.setValue('frequency', disbursement.frequency as any);
                            form.setValue('paymentAmount', disbursement.paymentAmount || '');
                            form.setValue('nextDueDate', disbursement.nextDueDate ? disbursement.nextDueDate.split('T')[0] : '');
                            form.setValue('autoPayEnabled', disbursement.autoPayEnabled || false);
                            form.setValue('daysBeforeDue', disbursement.daysBeforeDue || 10);
                            form.setValue('notes', disbursement.notes || '');
                            
                            // Insurance-specific fields
                            form.setValue('insuredName', disbursement.insuredName || '');
                            form.setValue('insuranceCompanyName', disbursement.insuranceCompanyName || '');
                            form.setValue('policyDescription', disbursement.policyDescription || '');
                            form.setValue('policyExpirationDate', disbursement.policyExpirationDate ? disbursement.policyExpirationDate.split('T')[0] : '');
                            form.setValue('coverageAmount', disbursement.coverageAmount || '');
                            form.setValue('agentName', disbursement.agentName || '');
                            form.setValue('agentBusinessAddress', disbursement.agentBusinessAddress || '');
                            form.setValue('agentCity', disbursement.agentCity || '');
                            form.setValue('agentState', disbursement.agentState || '');
                            form.setValue('agentZipCode', disbursement.agentZipCode || '');
                            form.setValue('agentPhone', disbursement.agentPhone || '');
                            form.setValue('agentFax', disbursement.agentFax || '');
                            form.setValue('agentEmail', disbursement.agentEmail || '');
                            
                            // Set status if present
                            form.setValue('status', disbursement.status || 'active');
                            
                            // Calculate and set derived amounts
                            const amount = parseFloat(disbursement.paymentAmount || '0');
                            const multiplier = getFrequencyMultiplier(disbursement.frequency);
                            
                            if (!isNaN(amount) && amount > 0) {
                              const annualAmount = (amount * multiplier).toFixed(2);
                              const monthlyAmount = (parseFloat(annualAmount) / 12).toFixed(2);
                              form.setValue('annualAmount', annualAmount);
                              form.setValue('monthlyAmount', monthlyAmount);
                            } else {
                              form.setValue('annualAmount', '');
                              form.setValue('monthlyAmount', '');
                            }
                            
                            console.log('Form values set, opening dialog');
                            setIsAddDialogOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant={disbursement.isOnHold ? "default" : "ghost"}
                          size="sm"
                          className={disbursement.isOnHold ? "bg-red-100 hover:bg-red-200 text-red-700" : ""}
                          onClick={() => {
                            const action = disbursement.isOnHold ? 'release' : 'hold';
                            const reason = action === 'hold' ? prompt('Reason for hold:') || '' : undefined;
                            if (action === 'release' || (action === 'hold' && reason)) {
                              holdMutation.mutate({ 
                                id: disbursement.id, 
                                action, 
                                reason,
                                requestedBy: 'Current User' // Replace with actual user
                              });
                            }
                          }}
                        >
                          {disbursement.isOnHold ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                        </Button>
                        {disbursement.accountNumber && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleSensitive(disbursement.id)}
                          >
                            {showSensitive[disbursement.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this disbursement?')) {
                              deleteMutation.mutate(disbursement.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}