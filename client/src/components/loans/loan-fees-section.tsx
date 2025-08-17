import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Edit, Plus, DollarSign, FileDown, Check, X, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";

interface LoanFee {
  id: number;
  loanId: number;
  feeType: string;
  feeName: string;
  feeAmount: string;
  feePercentage?: string;
  frequency?: string;
  chargeDate?: string;
  dueDate?: string;
  paidDate?: string;
  waived: boolean;
  waivedBy?: number;
  waivedReason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface FeeTemplate {
  id: number;
  lenderId: number;
  templateName: string;
  description?: string;
  isDefault: boolean;
  fees: any[];
  createdAt: string;
  updatedAt: string;
}

interface LoanFeesSectionProps {
  loanId: number;
  loanAmount: string;
}

export function LoanFeesSection({ loanId, loanAmount }: LoanFeesSectionProps) {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isApplyTemplateOpen, setIsApplyTemplateOpen] = useState(false);
  const [editingFee, setEditingFee] = useState<LoanFee | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  
  const [newFee, setNewFee] = useState({
    feeType: "servicing",
    feeName: "",
    feeAmount: "",
    feePercentage: "",
    frequency: "one-time",
    chargeDate: "",
    dueDate: "",
    notes: ""
  });

  // Fetch loan fees
  const { data: fees, isLoading: feesLoading } = useQuery<LoanFee[]>({
    queryKey: [`/api/fees/loan/${loanId}`],
  });

  // Fetch fee templates for applying
  const { data: templates, isLoading: templatesLoading } = useQuery<FeeTemplate[]>({
    queryKey: ["/api/fees/templates"],
  });

  // Add fee mutation
  const addFeeMutation = useMutation({
    mutationFn: (data: typeof newFee) => 
      apiRequest(`/api/fees/loan/${loanId}`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/fees/loan/${loanId}`] });
      toast({
        title: "Success",
        description: "Fee added successfully",
      });
      setIsAddDialogOpen(false);
      setNewFee({
        feeType: "servicing",
        feeName: "",
        feeAmount: "",
        feePercentage: "",
        frequency: "one-time",
        chargeDate: "",
        dueDate: "",
        notes: ""
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add fee",
        variant: "destructive",
      });
    },
  });

  // Update fee mutation
  const updateFeeMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<LoanFee>) => 
      apiRequest(`/api/fees/loan-fee/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/fees/loan/${loanId}`] });
      toast({
        title: "Success",
        description: "Fee updated successfully",
      });
      setEditingFee(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update fee",
        variant: "destructive",
      });
    },
  });

  // Delete fee mutation
  const deleteFeeMutation = useMutation({
    mutationFn: (id: number) => 
      apiRequest(`/api/fees/loan-fee/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/fees/loan/${loanId}`] });
      toast({
        title: "Success",
        description: "Fee deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete fee",
        variant: "destructive",
      });
    },
  });

  // Apply template mutation
  const applyTemplateMutation = useMutation({
    mutationFn: (templateId: string) => 
      apiRequest(`/api/fees/loan/${loanId}/apply-template/${templateId}`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/fees/loan/${loanId}`] });
      toast({
        title: "Success",
        description: "Fee template applied successfully",
      });
      setIsApplyTemplateOpen(false);
      setSelectedTemplateId("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to apply fee template",
        variant: "destructive",
      });
    },
  });

  const calculateTotalFees = () => {
    if (!fees) return "0.00";
    const total = fees
      .filter(fee => !fee.waived)
      .reduce((sum, fee) => sum + parseFloat(fee.feeAmount || "0"), 0);
    return total.toFixed(2);
  };

  const calculateUnpaidFees = () => {
    if (!fees) return "0.00";
    const total = fees
      .filter(fee => !fee.waived && !fee.paidDate)
      .reduce((sum, fee) => sum + parseFloat(fee.feeAmount || "0"), 0);
    return total.toFixed(2);
  };

  const markAsPaid = (fee: LoanFee) => {
    updateFeeMutation.mutate({
      id: fee.id,
      paidDate: new Date().toISOString().split('T')[0]
    });
  };

  const waiveFee = (fee: LoanFee, reason: string) => {
    updateFeeMutation.mutate({
      id: fee.id,
      waived: true,
      waivedReason: reason
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Loan Fees</CardTitle>
            <CardDescription>
              Manage fees associated with this loan
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Dialog open={isApplyTemplateOpen} onOpenChange={setIsApplyTemplateOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <FileDown className="mr-2 h-4 w-4" />
                  Apply Template
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Apply Fee Template</DialogTitle>
                  <DialogDescription>
                    Select a fee template to apply to this loan
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="template">Fee Template</Label>
                    <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates?.map(template => (
                          <SelectItem key={template.id} value={template.id.toString()}>
                            {template.templateName}
                            {template.isDefault && " (Default)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {selectedTemplateId && templates && (
                    <div className="text-sm text-muted-foreground">
                      {templates.find(t => t.id.toString() === selectedTemplateId)?.description}
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsApplyTemplateOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => applyTemplateMutation.mutate(selectedTemplateId)}
                    disabled={!selectedTemplateId}
                  >
                    Apply Template
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Fee
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Fee</DialogTitle>
                  <DialogDescription>
                    Add a new fee to this loan
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="feeType">Fee Type</Label>
                      <Select value={newFee.feeType} onValueChange={(value) => setNewFee(prev => ({ ...prev, feeType: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="setup">Setup</SelectItem>
                          <SelectItem value="servicing">Servicing</SelectItem>
                          <SelectItem value="document">Document</SelectItem>
                          <SelectItem value="closing">Closing</SelectItem>
                          <SelectItem value="statement">Statement</SelectItem>
                          <SelectItem value="administrative">Administrative</SelectItem>
                          <SelectItem value="collection">Collection</SelectItem>
                          <SelectItem value="special">Special</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label htmlFor="frequency">Frequency</Label>
                      <Select value={newFee.frequency} onValueChange={(value) => setNewFee(prev => ({ ...prev, frequency: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="one-time">One-time</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="semi-annual">Semi-Annual</SelectItem>
                          <SelectItem value="annual">Annual</SelectItem>
                          <SelectItem value="per-transaction">Per Transaction</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="feeName">Fee Name</Label>
                    <Input
                      id="feeName"
                      value={newFee.feeName}
                      onChange={(e) => setNewFee(prev => ({ ...prev, feeName: e.target.value }))}
                      placeholder="e.g., Late Payment Fee"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="feeAmount">Amount</Label>
                      <Input
                        id="feeAmount"
                        type="number"
                        step="0.01"
                        value={newFee.feeAmount}
                        onChange={(e) => setNewFee(prev => ({ ...prev, feeAmount: e.target.value }))}
                        placeholder="0.00"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="dueDate">Due Date</Label>
                      <Input
                        id="dueDate"
                        type="date"
                        value={newFee.dueDate}
                        onChange={(e) => setNewFee(prev => ({ ...prev, dueDate: e.target.value }))}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={newFee.notes}
                      onChange={(e) => setNewFee(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Additional notes about this fee..."
                      rows={2}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsAddDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => addFeeMutation.mutate(newFee)}
                    disabled={!newFee.feeName || !newFee.feeAmount}
                  >
                    Add Fee
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-sm text-muted-foreground">Total Fees</div>
            <div className="text-2xl font-bold">${calculateTotalFees()}</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-3">
            <div className="text-sm text-muted-foreground">Unpaid Fees</div>
            <div className="text-2xl font-bold text-amber-600">${calculateUnpaidFees()}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="text-sm text-muted-foreground">Paid Fees</div>
            <div className="text-2xl font-bold text-green-600">
              ${(parseFloat(calculateTotalFees()) - parseFloat(calculateUnpaidFees())).toFixed(2)}
            </div>
          </div>
        </div>

        {feesLoading ? (
          <div className="text-center py-4">Loading fees...</div>
        ) : fees && fees.length > 0 ? (
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fees.map((fee) => (
                  <TableRow key={fee.id}>
                    <TableCell>
                      <Badge variant="outline">{fee.feeType}</Badge>
                    </TableCell>
                    <TableCell>{fee.feeName}</TableCell>
                    <TableCell>${fee.feeAmount}</TableCell>
                    <TableCell>{fee.frequency}</TableCell>
                    <TableCell>
                      {fee.dueDate ? format(new Date(fee.dueDate), 'MMM dd, yyyy') : '-'}
                    </TableCell>
                    <TableCell>
                      {fee.waived ? (
                        <Badge variant="secondary">Waived</Badge>
                      ) : fee.paidDate ? (
                        <Badge variant="default" className="bg-green-500">Paid</Badge>
                      ) : (
                        <Badge variant="destructive">Unpaid</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {!fee.waived && !fee.paidDate && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => markAsPaid(fee)}
                            title="Mark as Paid"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        {!fee.waived && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const reason = prompt("Reason for waiving this fee:");
                              if (reason) waiveFee(fee, reason);
                            }}
                            title="Waive Fee"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteFeeMutation.mutate(fee.id)}
                          title="Delete Fee"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No fees added to this loan</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setIsApplyTemplateOpen(true)}
            >
              Apply Fee Template
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}