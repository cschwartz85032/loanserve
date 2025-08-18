import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { 
  Loader2, Users, Building2, DollarSign, Percent, Landmark,
  MapPin, Phone, Mail, Plus, Edit2, Trash2, AlertCircle,
  CheckCircle
} from "lucide-react";

interface Investor {
  id?: number;
  investorId: string;
  loanId: number;
  entityType: 'individual' | 'corporation' | 'llc' | 'partnership' | 'trust' | 'estate';
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  bankName?: string;
  bankStreetAddress?: string;
  bankCity?: string;
  bankState?: string;
  bankZipCode?: string;
  accountNumber?: string;
  routingNumber?: string;
  accountType?: 'checking' | 'savings';
  ownershipPercentage: number;
  investmentAmount?: number;
  investmentDate?: string;
  notes?: string;
}

interface LoanInvestorsManagerProps {
  loanId: string;
}

export function LoanInvestorsManager({ loanId }: LoanInvestorsManagerProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingInvestor, setEditingInvestor] = useState<Investor | null>(null);
  const [formData, setFormData] = useState<Partial<Investor>>({
    entityType: 'individual',
    ownershipPercentage: 0,
    accountType: 'checking'
  });

  // Fetch investors for this loan
  const { data: investors = [], isLoading, refetch } = useQuery({
    queryKey: [`/api/loans/${loanId}/investors`],
    enabled: !!loanId
  });

  // Calculate total ownership percentage
  const totalOwnership = investors.reduce((sum: number, inv: Investor) => 
    sum + parseFloat(inv.ownershipPercentage?.toString() || '0'), 0
  );

  // Create investor mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<Investor>) => {
      const response = await fetch(`/api/loans/${loanId}/investors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create investor');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Investor added successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/investors`] });
      handleCloseDialog();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to add investor",
        variant: "destructive",
      });
    }
  });

  // Update investor mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Investor> }) => {
      const response = await fetch(`/api/investors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update investor');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Investor updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/investors`] });
      handleCloseDialog();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update investor",
        variant: "destructive",
      });
    }
  });

  // Delete investor mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/investors/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete investor');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Investor removed successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/investors`] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to remove investor",
        variant: "destructive",
      });
    }
  });

  const handleOpenDialog = (investor?: Investor) => {
    if (investor) {
      setEditingInvestor(investor);
      setFormData(investor);
    } else {
      setEditingInvestor(null);
      setFormData({
        entityType: 'individual',
        ownershipPercentage: 0,
        accountType: 'checking'
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingInvestor(null);
    setFormData({
      entityType: 'individual',
      ownershipPercentage: 0,
      accountType: 'checking'
    });
  };

  const handleSave = () => {
    if (!formData.name || !formData.ownershipPercentage) {
      toast({
        title: "Error",
        description: "Please fill in required fields",
        variant: "destructive",
      });
      return;
    }

    if (editingInvestor) {
      updateMutation.mutate({ id: editingInvestor.id!, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to remove this investor?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleInputChange = (field: keyof Investor, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Determine ownership status styling
  const getOwnershipStatusStyle = () => {
    if (totalOwnership === 100) {
      return "text-green-600 bg-green-50 border-green-200";
    } else {
      return "text-red-600 bg-red-50 border-red-200 animate-pulse";
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Investor Management
              </CardTitle>
              <CardDescription>
                Manage investor ownership percentages and banking information
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Investor
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className={`p-4 rounded-lg border-2 ${getOwnershipStatusStyle()}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {totalOwnership === 100 ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <AlertCircle className="h-5 w-5" />
                )}
                <span className="font-semibold">Total Ownership:</span>
              </div>
              <span className="text-2xl font-bold">{totalOwnership.toFixed(2)}%</span>
            </div>
            {totalOwnership !== 100 && (
              <p className="text-sm mt-2">
                {totalOwnership < 100 
                  ? `Missing ${(100 - totalOwnership).toFixed(2)}% ownership allocation`
                  : `Exceeds 100% by ${(totalOwnership - 100).toFixed(2)}%`
                }
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Investors List */}
      <Card>
        <CardHeader>
          <CardTitle>Current Investors</CardTitle>
        </CardHeader>
        <CardContent>
          {investors.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No investors added yet. Click "Add Investor" to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Investor ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Ownership %</TableHead>
                  <TableHead>Investment Amount</TableHead>
                  <TableHead>Banking Info</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {investors.map((investor: Investor) => (
                  <TableRow key={investor.id}>
                    <TableCell className="font-mono text-sm">
                      {investor.investorId}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{investor.name}</p>
                        {investor.contactName && (
                          <p className="text-sm text-gray-500">{investor.contactName}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {investor.entityType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={investor.ownershipPercentage > 0 ? "bg-blue-100 text-blue-800" : ""}>
                        {parseFloat(investor.ownershipPercentage?.toString() || '0').toFixed(2)}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {investor.investmentAmount ? (
                        <span className="font-medium">
                          ${parseFloat(investor.investmentAmount.toString()).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {investor.bankName ? (
                        <div className="text-sm">
                          <p className="font-medium">{investor.bankName}</p>
                          {investor.accountType && (
                            <p className="text-gray-500 capitalize">{investor.accountType}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">Not provided</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {investor.email && (
                          <p className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {investor.email}
                          </p>
                        )}
                        {investor.phone && (
                          <p className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {investor.phone}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDialog(investor)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(investor.id!)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingInvestor ? 'Edit Investor' : 'Add New Investor'}
            </DialogTitle>
            <DialogDescription>
              Enter investor details including ownership percentage and banking information
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" />
                Basic Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entityType">Entity Type *</Label>
                  <Select
                    value={formData.entityType}
                    onValueChange={(value) => handleInputChange('entityType', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Individual</SelectItem>
                      <SelectItem value="corporation">Corporation</SelectItem>
                      <SelectItem value="llc">LLC</SelectItem>
                      <SelectItem value="partnership">Partnership</SelectItem>
                      <SelectItem value="trust">Trust</SelectItem>
                      <SelectItem value="estate">Estate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">
                    {formData.entityType === 'individual' ? 'Name' : 'Entity Name'} *
                  </Label>
                  <Input
                    id="name"
                    value={formData.name || ''}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder={formData.entityType === 'individual' ? 'John Doe' : 'ABC Corporation'}
                  />
                </div>
                {formData.entityType !== 'individual' && (
                  <div className="space-y-2">
                    <Label htmlFor="contactName">Contact Person</Label>
                    <Input
                      id="contactName"
                      value={formData.contactName || ''}
                      onChange={(e) => handleInputChange('contactName', e.target.value)}
                      placeholder="Jane Smith"
                    />
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Investment Details */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Percent className="h-4 w-4" />
                Investment Details
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ownershipPercentage">Ownership Percentage *</Label>
                  <Input
                    id="ownershipPercentage"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={formData.ownershipPercentage || ''}
                    onChange={(e) => handleInputChange('ownershipPercentage', parseFloat(e.target.value))}
                    placeholder="25.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="investmentAmount">Investment Amount</Label>
                  <Input
                    id="investmentAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.investmentAmount || ''}
                    onChange={(e) => handleInputChange('investmentAmount', parseFloat(e.target.value))}
                    placeholder="100000.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="investmentDate">Investment Date</Label>
                  <Input
                    id="investmentDate"
                    type="date"
                    value={formData.investmentDate || ''}
                    onChange={(e) => handleInputChange('investmentDate', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Contact Information */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Contact Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="investor@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone || ''}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="streetAddress">Street Address</Label>
                  <Input
                    id="streetAddress"
                    value={formData.streetAddress || ''}
                    onChange={(e) => handleInputChange('streetAddress', e.target.value)}
                    placeholder="123 Main St"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city || ''}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    placeholder="San Francisco"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={formData.state || ''}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                    placeholder="CA"
                    maxLength={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zipCode">Zip Code</Label>
                  <Input
                    id="zipCode"
                    value={formData.zipCode || ''}
                    onChange={(e) => handleInputChange('zipCode', e.target.value)}
                    placeholder="94105"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Banking Information */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Landmark className="h-4 w-4" />
                Banking Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bankName">Bank Name</Label>
                  <Input
                    id="bankName"
                    value={formData.bankName || ''}
                    onChange={(e) => handleInputChange('bankName', e.target.value)}
                    placeholder="First National Bank"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountType">Account Type</Label>
                  <Select
                    value={formData.accountType || 'checking'}
                    onValueChange={(value) => handleInputChange('accountType', value)}
                  >
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
                  <Label htmlFor="accountNumber">Account Number</Label>
                  <Input
                    id="accountNumber"
                    value={formData.accountNumber || ''}
                    onChange={(e) => handleInputChange('accountNumber', e.target.value)}
                    placeholder="****1234"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="routingNumber">Routing Number</Label>
                  <Input
                    id="routingNumber"
                    value={formData.routingNumber || ''}
                    onChange={(e) => handleInputChange('routingNumber', e.target.value)}
                    placeholder="123456789"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bankStreetAddress">Bank Street Address</Label>
                  <Input
                    id="bankStreetAddress"
                    value={formData.bankStreetAddress || ''}
                    onChange={(e) => handleInputChange('bankStreetAddress', e.target.value)}
                    placeholder="456 Bank Ave"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankCity">Bank City</Label>
                  <Input
                    id="bankCity"
                    value={formData.bankCity || ''}
                    onChange={(e) => handleInputChange('bankCity', e.target.value)}
                    placeholder="New York"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankState">Bank State</Label>
                  <Input
                    id="bankState"
                    value={formData.bankState || ''}
                    onChange={(e) => handleInputChange('bankState', e.target.value)}
                    placeholder="NY"
                    maxLength={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankZipCode">Bank Zip Code</Label>
                  <Input
                    id="bankZipCode"
                    value={formData.bankZipCode || ''}
                    onChange={(e) => handleInputChange('bankZipCode', e.target.value)}
                    placeholder="10001"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Notes */}
            <div className="space-y-4">
              <h3 className="font-semibold">Additional Notes</h3>
              <Textarea
                value={formData.notes || ''}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Any additional notes about this investor..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                editingInvestor ? 'Update Investor' : 'Add Investor'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}