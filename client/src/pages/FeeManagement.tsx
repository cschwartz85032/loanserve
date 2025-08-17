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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Edit, Plus, DollarSign, Star, StarOff, Copy, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";

// Default WestStar fee structure based on the document
const WESTSTAR_DEFAULT_FEES = [
  { type: "setup", name: "Setup Fee without Impounds", amount: "150.00", frequency: "one-time", chargeDate: "origination" },
  { type: "setup", name: "Setup Fee with Impounds", amount: "225.00", frequency: "one-time", chargeDate: "origination" },
  { type: "setup", name: "Setup Fee if Transferred From Another Servicer", amount: "10.00", frequency: "one-time", chargeDate: "origination" },
  { type: "servicing", name: "Transaction/Servicing Fee - Monthly", amount: "13.00", frequency: "monthly", chargeDate: "payment" },
  { type: "servicing", name: "Transaction/Servicing Fee - Quarterly", amount: "39.00", frequency: "quarterly", chargeDate: "payment" },
  { type: "servicing", name: "Transaction/Servicing Fee - Semi-Annual", amount: "78.00", frequency: "semi-annual", chargeDate: "payment" },
  { type: "servicing", name: "Transaction/Servicing Fee - Annual", amount: "156.00", frequency: "annual", chargeDate: "payment" },
  { type: "servicing", name: "Additional Disbursement by check", amount: "5.00", frequency: "per-transaction", chargeDate: "transaction" },
  { type: "servicing", name: "Receipt by Paper", amount: "5.00", frequency: "monthly", chargeDate: "payment" },
  { type: "servicing", name: "Collection for Taxes and/or Insurance", amount: "6.00", frequency: "monthly", chargeDate: "payment" },
  { type: "servicing", name: "Disbursement from Impound Account", amount: "8.00", frequency: "per-transaction", chargeDate: "transaction" },
  { type: "document", name: "Assignment or Assumption Fee", amount: "100.00", frequency: "one-time", chargeDate: "transaction" },
  { type: "document", name: "Successor in Interest", amount: "50.00", frequency: "one-time", chargeDate: "transaction" },
  { type: "document", name: "Partial Release", amount: "100.00", frequency: "one-time", chargeDate: "transaction" },
  { type: "document", name: "Verifications", amount: "25.00", frequency: "per-transaction", chargeDate: "transaction" },
  { type: "document", name: "Holding Documents/Dormant accounts", amount: "156.00", frequency: "annual", chargeDate: "annual" },
  { type: "closing", name: "Close Out (Withdrawal & Affidavits)", amount: "150.00", frequency: "one-time", chargeDate: "closing" },
  { type: "closing", name: "Close Out on Payoff", amount: "125.00", frequency: "one-time", chargeDate: "payoff" },
  { type: "statement", name: "Bring-Current Statement", amount: "40.00", frequency: "per-transaction", chargeDate: "transaction" },
  { type: "statement", name: "Payoff Statement", amount: "100.00", frequency: "per-transaction", chargeDate: "transaction" },
  { type: "statement", name: "Payoff Statement Update", amount: "40.00", frequency: "per-transaction", chargeDate: "transaction" },
  { type: "administrative", name: "Recording Fee", amount: "0.00", frequency: "per-transaction", chargeDate: "transaction", note: "Actual Charge" },
  { type: "administrative", name: "Modification and Addendums", amount: "100.00", frequency: "per-transaction", chargeDate: "transaction" },
  { type: "collection", name: "Late Reminder/Delinquency Notice", amount: "20.00", frequency: "per-transaction", chargeDate: "transaction" },
  { type: "collection", name: "Insufficient Funds/Returned Items", amount: "25.00", frequency: "per-transaction", chargeDate: "transaction" },
  { type: "administrative", name: "Void and Reissues/Stop pay", amount: "29.00", frequency: "per-transaction", chargeDate: "transaction" },
  { type: "closing", name: "Reconveyance Fee", amount: "125.00", frequency: "one-time", chargeDate: "payoff" },
  { type: "collection", name: "Demand Monitor Fee", amount: "145.00", frequency: "per-transaction", chargeDate: "transaction", note: "includes 1 demand stmt, 1 fax, 1 update, foreclosure monitoring" },
  { type: "administrative", name: "Fed Ex Fee", amount: "25.00", frequency: "per-transaction", chargeDate: "transaction" },
  { type: "special", name: "Bankruptcy Management/Adj Rate Payments", amount: "25.00", frequency: "monthly", chargeDate: "payment", note: "additional" },
  { type: "special", name: "Research/Special Handling/Manual Calculation", amount: "50.00", frequency: "hourly", chargeDate: "transaction", note: "min. per hour" },
  { type: "trust", name: "Document Signing Fee (For Trust Services)", amount: "125.00", frequency: "per-transaction", chargeDate: "transaction" },
  { type: "administrative", name: "Storage Retrieval", amount: "35.00", frequency: "per-transaction", chargeDate: "transaction" }
];

interface Fee {
  type: string;
  name: string;
  amount: string;
  percentage?: string;
  isPercentage?: boolean;
  frequency: string;
  chargeDate?: string;
  dueDate?: string;
  note?: string;
}

interface FeeTemplate {
  id: number;
  lenderId: number;
  templateName: string;
  description?: string;
  isDefault: boolean;
  fees: Fee[];
  createdAt: string;
  updatedAt: string;
}

export default function FeeManagement() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<FeeTemplate | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<FeeTemplate | null>(null);
  const [newTemplate, setNewTemplate] = useState({
    templateName: "",
    description: "",
    isDefault: false,
    fees: [] as Fee[]
  });
  const [newFee, setNewFee] = useState<Fee>({
    type: "servicing",
    name: "",
    amount: "",
    frequency: "monthly",
    chargeDate: "payment"
  });

  // Fetch fee templates
  const { data: templates, isLoading } = useQuery<FeeTemplate[]>({
    queryKey: ["/api/fees/templates"],
  });

  // Create fee template mutation
  const createTemplateMutation = useMutation({
    mutationFn: (data: typeof newTemplate) => 
      apiRequest("/api/fees/templates", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fees/templates"] });
      toast({
        title: "Success",
        description: "Fee template created successfully",
      });
      setIsCreateDialogOpen(false);
      setNewTemplate({
        templateName: "",
        description: "",
        isDefault: false,
        fees: []
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create fee template",
        variant: "destructive",
      });
    },
  });

  // Update fee template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, ...data }: FeeTemplate) => 
      apiRequest(`/api/fees/templates/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fees/templates"] });
      toast({
        title: "Success",
        description: "Fee template updated successfully",
      });
      setEditingTemplate(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update fee template",
        variant: "destructive",
      });
    },
  });

  // Delete fee template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: (id: number) => 
      apiRequest(`/api/fees/templates/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fees/templates"] });
      toast({
        title: "Success",
        description: "Fee template deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete fee template",
        variant: "destructive",
      });
    },
  });

  const addFeeToTemplate = () => {
    if (!newFee.name || !newFee.amount) {
      toast({
        title: "Error",
        description: "Please fill in fee name and amount",
        variant: "destructive",
      });
      return;
    }
    
    setNewTemplate(prev => ({
      ...prev,
      fees: [...prev.fees, { ...newFee }]
    }));
    
    setNewFee({
      type: "servicing",
      name: "",
      amount: "",
      frequency: "monthly",
      chargeDate: "payment"
    });
  };

  const removeFeeFromTemplate = (index: number) => {
    setNewTemplate(prev => ({
      ...prev,
      fees: prev.fees.filter((_, i) => i !== index)
    }));
  };

  const loadWestStarDefaults = () => {
    setNewTemplate(prev => ({
      ...prev,
      templateName: prev.templateName || "WestStar Default Fee Schedule",
      description: prev.description || "Default fee schedule based on WestStar Pacific Mortgage servicing agreement",
      fees: WESTSTAR_DEFAULT_FEES
    }));
    
    toast({
      title: "Success",
      description: "WestStar default fees loaded",
    });
  };

  const duplicateTemplate = (template: FeeTemplate) => {
    setNewTemplate({
      templateName: `${template.templateName} (Copy)`,
      description: template.description,
      isDefault: false,
      fees: template.fees
    });
    setIsCreateDialogOpen(true);
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Fee Management</h1>
          <p className="text-muted-foreground mt-1">Manage fee templates and schedules for loans</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Create Fee Template</DialogTitle>
              <DialogDescription>
                Create a new fee template that can be applied to loans
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="templateName">Template Name</Label>
                  <Input
                    id="templateName"
                    value={newTemplate.templateName}
                    onChange={(e) => setNewTemplate(prev => ({ ...prev, templateName: e.target.value }))}
                    placeholder="e.g., Standard Servicing Fees"
                  />
                </div>
                <div className="flex items-center space-x-2 mt-6">
                  <Switch
                    id="isDefault"
                    checked={newTemplate.isDefault}
                    onCheckedChange={(checked) => setNewTemplate(prev => ({ ...prev, isDefault: checked }))}
                  />
                  <Label htmlFor="isDefault">Set as default template</Label>
                </div>
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe this fee template..."
                  rows={2}
                />
              </div>

              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Fees</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadWestStarDefaults}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Load WestStar Defaults
                </Button>
              </div>

              <Card>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-12 gap-2 mb-2">
                    <Select value={newFee.type} onValueChange={(value) => setNewFee(prev => ({ ...prev, type: value }))}>
                      <SelectTrigger className="col-span-2">
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
                        <SelectItem value="trust">Trust</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      className="col-span-4"
                      placeholder="Fee name"
                      value={newFee.name}
                      onChange={(e) => setNewFee(prev => ({ ...prev, name: e.target.value }))}
                    />
                    <Input
                      className="col-span-2"
                      placeholder="Amount"
                      type="number"
                      step="0.01"
                      value={newFee.amount}
                      onChange={(e) => setNewFee(prev => ({ ...prev, amount: e.target.value }))}
                    />
                    <Select value={newFee.frequency} onValueChange={(value) => setNewFee(prev => ({ ...prev, frequency: value }))}>
                      <SelectTrigger className="col-span-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one-time">One-time</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="semi-annual">Semi-Annual</SelectItem>
                        <SelectItem value="annual">Annual</SelectItem>
                        <SelectItem value="per-transaction">Per Transaction</SelectItem>
                        <SelectItem value="hourly">Hourly</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="icon"
                      onClick={addFeeToTemplate}
                      className="col-span-1"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {newTemplate.fees.length > 0 && (
                <ScrollArea className="h-[250px] border rounded-md p-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Frequency</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {newTemplate.fees.map((fee, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Badge variant="outline">{fee.type}</Badge>
                          </TableCell>
                          <TableCell>{fee.name}</TableCell>
                          <TableCell>${fee.amount}</TableCell>
                          <TableCell>{fee.frequency}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeFeeFromTemplate(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => createTemplateMutation.mutate(newTemplate)}
                disabled={!newTemplate.templateName || newTemplate.fees.length === 0}
              >
                Create Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="templates" className="w-full">
        <TabsList>
          <TabsTrigger value="templates">Fee Templates</TabsTrigger>
          <TabsTrigger value="schedule">Fee Schedule</TabsTrigger>
        </TabsList>
        
        <TabsContent value="templates">
          {isLoading ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">Loading templates...</div>
              </CardContent>
            </Card>
          ) : templates && templates.length > 0 ? (
            <div className="grid gap-4">
              {templates.map((template) => (
                <Card key={template.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {template.templateName}
                          {template.isDefault && (
                            <Badge variant="default">
                              <Star className="mr-1 h-3 w-3" />
                              Default
                            </Badge>
                          )}
                        </CardTitle>
                        {template.description && (
                          <CardDescription>{template.description}</CardDescription>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedTemplate(template)}
                        >
                          <DollarSign className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => duplicateTemplate(template)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingTemplate(template)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteTemplateMutation.mutate(template.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground">
                      {template.fees.length} fees configured
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-3">
                  <p className="text-muted-foreground">No fee templates created yet</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      loadWestStarDefaults();
                      setIsCreateDialogOpen(true);
                    }}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Create WestStar Default Template
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="schedule">
          <Card>
            <CardHeader>
              <CardTitle>WestStar Fee Schedule Reference</CardTitle>
              <CardDescription>
                Standard fee schedule from WestStar Pacific Mortgage servicing agreement
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Fee Name</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {WESTSTAR_DEFAULT_FEES.map((fee, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Badge variant="outline">{fee.type}</Badge>
                        </TableCell>
                        <TableCell>{fee.name}</TableCell>
                        <TableCell>
                          {fee.amount === "0.00" && fee.note === "Actual Charge" ? 
                            "Actual Charge" : 
                            `$${fee.amount}`
                          }
                        </TableCell>
                        <TableCell>{fee.frequency}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {fee.note}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Template Dialog */}
      {editingTemplate && (
        <Dialog open={!!editingTemplate} onOpenChange={() => setEditingTemplate(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Edit Fee Template</DialogTitle>
              <DialogDescription>
                Modify the fee template details and fees
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editTemplateName">Template Name</Label>
                  <Input
                    id="editTemplateName"
                    value={editingTemplate.templateName}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, templateName: e.target.value })}
                  />
                </div>
                <div className="flex items-center space-x-2 mt-6">
                  <Switch
                    id="editIsDefault"
                    checked={editingTemplate.isDefault}
                    onCheckedChange={(checked) => setEditingTemplate({ ...editingTemplate, isDefault: checked })}
                  />
                  <Label htmlFor="editIsDefault">Set as default template</Label>
                </div>
              </div>

              <div>
                <Label htmlFor="editDescription">Description</Label>
                <Textarea
                  id="editDescription"
                  value={editingTemplate.description || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Fees ({editingTemplate.fees.length})</Label>
                <ScrollArea className="h-[300px] border rounded-md p-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Frequency</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editingTemplate.fees.map((fee, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Badge variant="outline">{fee.type}</Badge>
                          </TableCell>
                          <TableCell>{fee.name}</TableCell>
                          <TableCell>${fee.amount}</TableCell>
                          <TableCell>{fee.frequency}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const newFees = editingTemplate.fees.filter((_, i) => i !== index);
                                setEditingTemplate({ ...editingTemplate, fees: newFees });
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditingTemplate(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => updateTemplateMutation.mutate(editingTemplate)}
                disabled={!editingTemplate.templateName || editingTemplate.fees.length === 0}
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* View Template Dialog */}
      {selectedTemplate && (
        <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>{selectedTemplate.templateName}</DialogTitle>
              {selectedTemplate.description && (
                <DialogDescription>{selectedTemplate.description}</DialogDescription>
              )}
            </DialogHeader>
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Charge Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedTemplate.fees.map((fee, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Badge variant="outline">{fee.type}</Badge>
                      </TableCell>
                      <TableCell>{fee.name}</TableCell>
                      <TableCell>${fee.amount}</TableCell>
                      <TableCell>{fee.frequency}</TableCell>
                      <TableCell>{fee.chargeDate}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}