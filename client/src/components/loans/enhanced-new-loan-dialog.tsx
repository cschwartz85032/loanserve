import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  CloudUpload, 
  File, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  FileText,
  Sparkles,
  PenTool
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EnhancedNewLoanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoanCreated?: (loanId: string) => void;
}

interface UploadedFile {
  file: File;
  status: 'pending' | 'processing' | 'completed' | 'error';
  documentType?: string;
  extractedData?: any;
  error?: string;
}

export function EnhancedNewLoanDialog({ open, onOpenChange, onLoanCreated }: EnhancedNewLoanDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("ai");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(-1);
  
  // Form data that can be filled by AI or manually
  const [formData, setFormData] = useState({
    // Loan Information
    loanNumber: "",
    loanType: "conventional",
    originalAmount: "",
    principalBalance: "",
    interestRate: "",
    rateType: "fixed",
    loanTerm: "",
    
    // Property Information
    propertyType: "single_family",
    propertyAddress: "",
    propertyCity: "",
    propertyState: "",
    propertyZip: "",
    propertyValue: "",
    
    // Borrower Information
    borrowerName: "",
    borrowerEmail: "",
    borrowerPhone: "",
    coborrowerName: "",
    
    // Payment Information
    paymentAmount: "",
    escrowAmount: "",
    firstPaymentDate: "",
    nextPaymentDate: "",
    maturityDate: "",
    
    // Additional Fees
    hazardInsurance: "",
    propertyTaxes: "",
    hoaFees: "",
    pmiAmount: "",
    servicingFee: "25"
  });

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files).map(file => ({
        file,
        status: 'pending' as const
      }));
      setFiles(prev => [...prev, ...newFiles]);
      processDocuments(newFiles);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).map(file => ({
        file,
        status: 'pending' as const
      }));
      setFiles(prev => [...prev, ...newFiles]);
      processDocuments(newFiles);
    }
  };

  const processDocuments = async (filesToProcess: UploadedFile[]) => {
    setIsProcessing(true);
    
    try {
      // Process each document one by one
      for (let i = 0; i < filesToProcess.length; i++) {
        setCurrentProcessingIndex(i);
        
        // Update status to processing for the current file
        const currentFile = filesToProcess[i];
        setFiles(prev => prev.map(f => 
          f.file === currentFile.file ? { ...f, status: 'processing' } : f
        ));

        const formData = new FormData();
        formData.append('file', currentFile.file);
        
        try {
          const response = await fetch('/api/documents/analyze', {
            method: 'POST',
            body: formData,
            credentials: 'include'
          });

          if (!response.ok) {
            throw new Error(`Failed to analyze document: ${response.statusText}`);
          }

          const result = await response.json();
          console.log('Document analysis result:', result);
          
          // Update file status and extracted data
          setFiles(prev => prev.map(f => 
            f.file === currentFile.file ? { 
              ...f, 
              status: 'completed',
              documentType: result.documentType,
              extractedData: result.extractedData
            } : f
          ));

          // Update form data with extracted information
          updateFormWithExtractedData(result.extractedData);
          console.log('Form data updated with extracted data');

        } catch (error) {
          console.error(`Error processing file:`, error);
          setFiles(prev => prev.map(f => 
            f.file === currentFile.file ? { 
              ...f, 
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            } : f
          ));
        }
      }
    } finally {
      setIsProcessing(false);
      setCurrentProcessingIndex(-1);
    }
  };

  const updateFormWithExtractedData = (extractedData: any) => {
    if (!extractedData) return;

    // Helper to convert values to string
    const toString = (val: any) => val ? String(val) : "";
    
    // Helper to normalize property type
    const normalizePropertyType = (type: string) => {
      if (!type) return "single_family";
      const normalized = type.toLowerCase();
      if (normalized.includes('single') || normalized.includes('family')) return 'single_family';
      if (normalized.includes('condo')) return 'condo';
      if (normalized.includes('town')) return 'townhouse';
      if (normalized.includes('multi')) return 'multi_family';
      if (normalized.includes('manufactured')) return 'manufactured';
      if (normalized.includes('commercial')) return 'commercial';
      if (normalized.includes('land')) return 'land';
      if (normalized.includes('mixed')) return 'mixed_use';
      return 'single_family';
    };
    
    // Helper to normalize loan type
    const normalizeLoanType = (type: string) => {
      if (!type) return "conventional";
      const normalized = type.toLowerCase();
      if (normalized.includes('conventional') || normalized.includes('fixed')) return 'conventional';
      if (normalized.includes('fha')) return 'fha';
      if (normalized.includes('va')) return 'va';
      if (normalized.includes('usda')) return 'usda';
      return 'conventional';
    };

    setFormData(prev => ({
      ...prev,
      // Loan Information
      loanNumber: extractedData.loanNumber || prev.loanNumber,
      loanType: normalizeLoanType(extractedData.loanType) || prev.loanType,
      originalAmount: toString(extractedData.originalAmount || extractedData.loanAmount) || prev.originalAmount,
      principalBalance: toString(extractedData.principalBalance || extractedData.currentBalance || extractedData.originalAmount || extractedData.loanAmount) || prev.principalBalance,
      interestRate: toString(extractedData.interestRate) || prev.interestRate,
      rateType: extractedData.rateType || prev.rateType,
      loanTerm: toString(extractedData.loanTerm || extractedData.termMonths) || prev.loanTerm,
      
      // Property Information
      propertyType: normalizePropertyType(extractedData.propertyType) || prev.propertyType,
      propertyAddress: extractedData.propertyAddress || extractedData.address || prev.propertyAddress,
      propertyCity: extractedData.propertyCity || extractedData.city || prev.propertyCity,
      propertyState: extractedData.propertyState || extractedData.state || prev.propertyState,
      propertyZip: extractedData.propertyZip || extractedData.zipCode || prev.propertyZip,
      propertyValue: toString(extractedData.propertyValue || extractedData.appraisedValue) || prev.propertyValue,
      
      // Borrower Information
      borrowerName: extractedData.borrowerName || extractedData.primaryBorrower || prev.borrowerName,
      borrowerEmail: extractedData.borrowerEmail || prev.borrowerEmail,
      borrowerPhone: extractedData.borrowerPhone || prev.borrowerPhone,
      coborrowerName: extractedData.coborrowerName || extractedData.coBorrower || prev.coborrowerName,
      
      // Payment Information
      paymentAmount: toString(extractedData.paymentAmount || extractedData.monthlyPayment) || prev.paymentAmount,
      escrowAmount: toString(extractedData.escrowAmount) || prev.escrowAmount,
      firstPaymentDate: extractedData.firstPaymentDate || prev.firstPaymentDate,
      nextPaymentDate: extractedData.nextPaymentDate || prev.nextPaymentDate,
      maturityDate: extractedData.maturityDate || prev.maturityDate,
      
      // Additional Fees
      hazardInsurance: toString(extractedData.hazardInsurance || extractedData.insuranceAmount) || prev.hazardInsurance,
      propertyTaxes: toString(extractedData.propertyTaxes || extractedData.taxAmount) || prev.propertyTaxes,
      hoaFees: toString(extractedData.hoaFees) || prev.hoaFees,
      pmiAmount: toString(extractedData.pmiAmount || extractedData.pmi) || prev.pmiAmount,
      servicingFee: toString(extractedData.servicingFee) || prev.servicingFee
    }));

    toast({
      title: "Data extracted",
      description: "Form fields have been updated with extracted information",
    });
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const createLoanMutation = useMutation({
    mutationFn: async (data: any) => {
      // First create the property
      const propertyData = {
        propertyType: data.propertyType,
        address: data.propertyAddress,
        city: data.propertyCity,
        state: data.propertyState,
        zipCode: data.propertyZip,
        value: data.propertyValue || "0"
      };
      
      const propertyResponse = await apiRequest("POST", "/api/properties", propertyData);
      const property = await propertyResponse.json();
      
      // Calculate monthly payment if not provided
      let monthlyPayment = data.paymentAmount;
      if (!monthlyPayment && data.originalAmount && data.interestRate && data.loanTerm) {
        const principal = parseFloat(data.originalAmount);
        const rate = parseFloat(data.interestRate) / 100 / 12;
        const months = parseInt(data.loanTerm);
        
        if (principal > 0 && rate > 0 && months > 0) {
          monthlyPayment = (principal * rate * Math.pow(1 + rate, months)) / (Math.pow(1 + rate, months) - 1);
        }
      }
      
      // Create the loan with the property ID
      const loanData = {
        loanNumber: data.loanNumber || `LN${Date.now()}`,
        loanType: data.loanType,
        propertyId: property.id,
        originalAmount: data.originalAmount.toString(),
        principalBalance: (data.principalBalance || data.originalAmount).toString(),
        interestRate: data.interestRate.toString(),
        rateType: data.rateType,
        loanTerm: parseInt(data.loanTerm),
        paymentAmount: monthlyPayment?.toString() || "0",
        escrowAmount: data.escrowAmount?.toString() || "0",
        status: "active",
        maturityDate: data.maturityDate || new Date(new Date().setMonth(new Date().getMonth() + parseInt(data.loanTerm))).toISOString().split('T')[0],
        firstPaymentDate: data.firstPaymentDate || new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
        nextPaymentDate: data.nextPaymentDate || new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
        lenderId: user?.id,
        servicerId: user?.id,
        // Additional fields
        hazardInsurance: data.hazardInsurance?.toString() || "0",
        propertyTaxes: data.propertyTaxes?.toString() || "0",
        hoaFees: data.hoaFees?.toString() || "0",
        pmiAmount: data.pmiAmount?.toString() || "0",
        servicingFee: data.servicingFee?.toString() || "25"
      };
      
      const response = await apiRequest("POST", "/api/loans", loanData);
      return response.json();
    },
    onSuccess: (loan) => {
      toast({
        title: "Success",
        description: "Loan created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loans/metrics"] });
      resetForm();
      onOpenChange(false);
      if (onLoanCreated) {
        onLoanCreated(loan.id.toString());
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create loan",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      loanNumber: "",
      loanType: "conventional",
      originalAmount: "",
      principalBalance: "",
      interestRate: "",
      rateType: "fixed",
      loanTerm: "",
      propertyType: "single_family",
      propertyAddress: "",
      propertyCity: "",
      propertyState: "",
      propertyZip: "",
      propertyValue: "",
      borrowerName: "",
      borrowerEmail: "",
      borrowerPhone: "",
      coborrowerName: "",
      paymentAmount: "",
      escrowAmount: "",
      firstPaymentDate: "",
      nextPaymentDate: "",
      maturityDate: "",
      hazardInsurance: "",
      propertyTaxes: "",
      hoaFees: "",
      pmiAmount: "",
      servicingFee: "25"
    });
    setFiles([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submitting loan with form data:', formData);
    
    // Validate required fields
    if (!formData.originalAmount || !formData.interestRate || !formData.loanTerm || 
        !formData.propertyAddress || !formData.propertyCity || !formData.propertyState || !formData.propertyZip) {
      toast({
        title: "Missing required fields",
        description: "Please fill in all required fields before submitting",
        variant: "destructive"
      });
      return;
    }
    
    createLoanMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Create New Loan</DialogTitle>
          <DialogDescription>
            Drop loan documents to auto-fill the form with AI, or enter details manually
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mx-6 grid w-auto grid-cols-2">
            <TabsTrigger value="ai" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              AI Document Analysis
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <PenTool className="h-4 w-4" />
              Manual Entry
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[calc(90vh-200px)] px-6">
            <TabsContent value="ai" className="space-y-4">
              {/* Drop Zone */}
              <Card
                className={cn(
                  "border-2 border-dashed transition-colors",
                  dragActive ? "border-primary bg-primary/5" : "border-gray-300 hover:border-gray-400"
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <CardContent className="p-8 text-center">
                  <CloudUpload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-lg font-medium mb-2">
                    Drag and drop loan documents here
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    AI will analyze and extract all loan information automatically
                  </p>
                  <Button variant="outline" onClick={() => document.getElementById('file-input')?.click()}>
                    <FileText className="h-4 w-4 mr-2" />
                    Browse Files
                  </Button>
                  <input
                    id="file-input"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                  />
                  <p className="text-xs text-gray-400 mt-4">
                    Supported: PDF, Word, Images, Text files
                  </p>
                </CardContent>
              </Card>

              {/* File List */}
              {files.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Processing Documents</h4>
                  {files.map((uploadFile, index) => (
                    <Card key={index} className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 flex-1">
                          <File className="h-5 w-5 text-gray-500" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {uploadFile.file.name}
                            </p>
                            {uploadFile.documentType && (
                              <Badge variant="secondary" className="text-xs">
                                {uploadFile.documentType}
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          {uploadFile.status === 'pending' && (
                            <span className="text-xs text-gray-500">Waiting...</span>
                          )}
                          
                          {uploadFile.status === 'processing' && (
                            <div className="flex items-center space-x-2">
                              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                              <span className="text-xs text-blue-500">Analyzing...</span>
                            </div>
                          )}
                          
                          {uploadFile.status === 'completed' && (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          )}
                          
                          {uploadFile.status === 'error' && (
                            <div className="flex items-center space-x-1">
                              <AlertCircle className="h-5 w-5 text-red-500" />
                              <span className="text-xs text-red-500">{uploadFile.error}</span>
                            </div>
                          )}
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                            disabled={uploadFile.status === 'processing'}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                  
                  {isProcessing && (
                    <Progress value={(currentProcessingIndex + 1) / files.length * 100} className="h-2" />
                  )}
                </div>
              )}

              {/* AI-Filled Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Loan Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="loanNumber">Loan Number</Label>
                      <Input
                        id="loanNumber"
                        value={formData.loanNumber}
                        onChange={(e) => handleInputChange('loanNumber', e.target.value)}
                        placeholder="Auto-generated if empty"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="loanType">Loan Type</Label>
                      <Select value={formData.loanType} onValueChange={(value) => handleInputChange('loanType', value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="conventional">Conventional</SelectItem>
                          <SelectItem value="fha">FHA</SelectItem>
                          <SelectItem value="va">VA</SelectItem>
                          <SelectItem value="usda">USDA</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="originalAmount">Original Amount</Label>
                      <Input
                        id="originalAmount"
                        type="number"
                        value={formData.originalAmount}
                        onChange={(e) => handleInputChange('originalAmount', e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="interestRate">Interest Rate (%)</Label>
                      <Input
                        id="interestRate"
                        type="number"
                        step="0.001"
                        value={formData.interestRate}
                        onChange={(e) => handleInputChange('interestRate', e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="loanTerm">Term (Months)</Label>
                      <Input
                        id="loanTerm"
                        type="number"
                        value={formData.loanTerm}
                        onChange={(e) => handleInputChange('loanTerm', e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="paymentAmount">Monthly Payment</Label>
                      <Input
                        id="paymentAmount"
                        type="number"
                        value={formData.paymentAmount}
                        onChange={(e) => handleInputChange('paymentAmount', e.target.value)}
                        placeholder="Auto-calculated if empty"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Property Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="propertyType">Property Type</Label>
                      <Select value={formData.propertyType} onValueChange={(value) => handleInputChange('propertyType', value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single_family">Single Family</SelectItem>
                          <SelectItem value="condo">Condo</SelectItem>
                          <SelectItem value="townhouse">Townhouse</SelectItem>
                          <SelectItem value="multi_family">Multi-Family</SelectItem>
                          <SelectItem value="manufactured">Manufactured</SelectItem>
                          <SelectItem value="commercial">Commercial</SelectItem>
                          <SelectItem value="land">Land</SelectItem>
                          <SelectItem value="mixed_use">Mixed Use</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="propertyValue">Property Value</Label>
                      <Input
                        id="propertyValue"
                        type="number"
                        value={formData.propertyValue}
                        onChange={(e) => handleInputChange('propertyValue', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="propertyAddress">Property Address</Label>
                      <Input
                        id="propertyAddress"
                        value={formData.propertyAddress}
                        onChange={(e) => handleInputChange('propertyAddress', e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="propertyCity">City</Label>
                      <Input
                        id="propertyCity"
                        value={formData.propertyCity}
                        onChange={(e) => handleInputChange('propertyCity', e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="propertyState">State</Label>
                      <Input
                        id="propertyState"
                        value={formData.propertyState}
                        onChange={(e) => handleInputChange('propertyState', e.target.value)}
                        maxLength={2}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="propertyZip">ZIP Code</Label>
                      <Input
                        id="propertyZip"
                        value={formData.propertyZip}
                        onChange={(e) => handleInputChange('propertyZip', e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Borrower Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="borrowerName">Borrower Name</Label>
                      <Input
                        id="borrowerName"
                        value={formData.borrowerName}
                        onChange={(e) => handleInputChange('borrowerName', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coborrowerName">Co-Borrower Name</Label>
                      <Input
                        id="coborrowerName"
                        value={formData.coborrowerName}
                        onChange={(e) => handleInputChange('coborrowerName', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="borrowerEmail">Email</Label>
                      <Input
                        id="borrowerEmail"
                        type="email"
                        value={formData.borrowerEmail}
                        onChange={(e) => handleInputChange('borrowerEmail', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="borrowerPhone">Phone</Label>
                      <Input
                        id="borrowerPhone"
                        value={formData.borrowerPhone}
                        onChange={(e) => handleInputChange('borrowerPhone', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pb-6">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createLoanMutation.isPending}>
                    {createLoanMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create Loan'
                    )}
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="manual" className="space-y-4">
              {/* Same form without the drop zone */}
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Copy all form sections from AI tab */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Loan Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="loanNumber-manual">Loan Number</Label>
                      <Input
                        id="loanNumber-manual"
                        value={formData.loanNumber}
                        onChange={(e) => handleInputChange('loanNumber', e.target.value)}
                        placeholder="Auto-generated if empty"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="loanType-manual">Loan Type</Label>
                      <Select value={formData.loanType} onValueChange={(value) => handleInputChange('loanType', value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="conventional">Conventional</SelectItem>
                          <SelectItem value="fha">FHA</SelectItem>
                          <SelectItem value="va">VA</SelectItem>
                          <SelectItem value="usda">USDA</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="originalAmount-manual">Original Amount</Label>
                      <Input
                        id="originalAmount-manual"
                        type="number"
                        value={formData.originalAmount}
                        onChange={(e) => handleInputChange('originalAmount', e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="interestRate-manual">Interest Rate (%)</Label>
                      <Input
                        id="interestRate-manual"
                        type="number"
                        step="0.001"
                        value={formData.interestRate}
                        onChange={(e) => handleInputChange('interestRate', e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="loanTerm-manual">Term (Months)</Label>
                      <Input
                        id="loanTerm-manual"
                        type="number"
                        value={formData.loanTerm}
                        onChange={(e) => handleInputChange('loanTerm', e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="paymentAmount-manual">Monthly Payment</Label>
                      <Input
                        id="paymentAmount-manual"
                        type="number"
                        value={formData.paymentAmount}
                        onChange={(e) => handleInputChange('paymentAmount', e.target.value)}
                        placeholder="Auto-calculated if empty"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Property Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="propertyAddress-manual">Property Address</Label>
                      <Input
                        id="propertyAddress-manual"
                        value={formData.propertyAddress}
                        onChange={(e) => handleInputChange('propertyAddress', e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="propertyCity-manual">City</Label>
                      <Input
                        id="propertyCity-manual"
                        value={formData.propertyCity}
                        onChange={(e) => handleInputChange('propertyCity', e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="propertyState-manual">State</Label>
                      <Input
                        id="propertyState-manual"
                        value={formData.propertyState}
                        onChange={(e) => handleInputChange('propertyState', e.target.value)}
                        maxLength={2}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="propertyZip-manual">ZIP Code</Label>
                      <Input
                        id="propertyZip-manual"
                        value={formData.propertyZip}
                        onChange={(e) => handleInputChange('propertyZip', e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="propertyValue-manual">Property Value</Label>
                      <Input
                        id="propertyValue-manual"
                        type="number"
                        value={formData.propertyValue}
                        onChange={(e) => handleInputChange('propertyValue', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Borrower Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="borrowerName-manual">Borrower Name</Label>
                      <Input
                        id="borrowerName-manual"
                        value={formData.borrowerName}
                        onChange={(e) => handleInputChange('borrowerName', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coborrowerName-manual">Co-Borrower Name</Label>
                      <Input
                        id="coborrowerName-manual"
                        value={formData.coborrowerName}
                        onChange={(e) => handleInputChange('coborrowerName', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="borrowerEmail-manual">Email</Label>
                      <Input
                        id="borrowerEmail-manual"
                        type="email"
                        value={formData.borrowerEmail}
                        onChange={(e) => handleInputChange('borrowerEmail', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="borrowerPhone-manual">Phone</Label>
                      <Input
                        id="borrowerPhone-manual"
                        value={formData.borrowerPhone}
                        onChange={(e) => handleInputChange('borrowerPhone', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pb-6">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createLoanMutation.isPending}>
                    {createLoanMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create Loan'
                    )}
                  </Button>
                </div>
              </form>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}