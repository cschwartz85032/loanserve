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
    
    // Borrower Information (separate from property)
    borrowerName: "",
    borrowerCompanyName: "",
    borrowerEmail: "",
    borrowerPhone: "",
    borrowerAddress: "",
    borrowerCity: "",
    borrowerState: "",
    borrowerZip: "",
    borrowerSSN: "",
    borrowerIncome: "",
    creditScoreEquifax: "",
    creditScoreExperian: "",
    creditScoreTransunion: "",
    
    // Co-Borrower Information
    coBorrowerName: "",
    coBorrowerCompanyName: "",
    coBorrowerEmail: "",
    coBorrowerPhone: "",
    coBorrowerAddress: "",
    coBorrowerCity: "",
    coBorrowerState: "",
    coBorrowerZip: "",
    coBorrowerSSN: "",
    coBorrowerIncome: "",
    coBorrowerCreditScoreEquifax: "",
    coBorrowerCreditScoreExperian: "",
    coBorrowerCreditScoreTransunion: "",
    
    // Trustee Information
    trusteeName: "",
    trusteeCompanyName: "",
    trusteePhone: "",
    trusteeEmail: "",
    trusteeStreetAddress: "",
    trusteeCity: "",
    trusteeState: "",
    trusteeZipCode: "",
    
    // Beneficiary Information
    beneficiaryName: "",
    beneficiaryCompanyName: "",
    beneficiaryPhone: "",
    beneficiaryEmail: "",
    beneficiaryStreetAddress: "",
    beneficiaryCity: "",
    beneficiaryState: "",
    beneficiaryZipCode: "",
    
    // Escrow Company Information
    escrowCompanyName: "",
    escrowCompanyPhone: "",
    escrowCompanyEmail: "",
    escrowCompanyStreetAddress: "",
    escrowCompanyCity: "",
    escrowCompanyState: "",
    escrowCompanyZipCode: "",
    
    // Payment Information
    paymentAmount: "",
    escrowAmount: "",
    firstPaymentDate: "",
    nextPaymentDate: "",
    maturityDate: "",
    prepaymentExpirationDate: "",
    
    // Additional Fees
    hazardInsurance: "",
    propertyTaxes: "",
    hoaFees: "",
    pmiAmount: "",
    servicingFee: "25",
    
    // Other fields
    loanDocuments: null as any,
    defaultConditions: null as any,
    insuranceRequirements: null as any,
    crossDefaultParties: null as any,
    closingCosts: "",
    downPayment: ""
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
    
    console.log("=== UPDATING FORM WITH EXTRACTED DATA ===");
    console.log("Extracted data received:", extractedData);

    // Helper to clean and convert values to string
    const toString = (val: any) => {
      if (!val || 
          val === 'null' || 
          val === 'extracted_value_or_null' || 
          String(val).includes('_or_null') ||
          val === 'YYYY-MM-DD_or_null') {
        return "";
      }
      return String(val);
    };

    // Helper to clean string values
    const cleanString = (val: any) => {
      if (!val || 
          val === 'null' || 
          val === 'extracted_value_or_null' || 
          String(val).includes('_or_null')) {
        return "";
      }
      return String(val);
    };
    
    // Helper to clean numeric values (removes % signs and other non-numeric characters)
    const cleanNumeric = (val: any) => {
      if (!val) return "";
      const str = String(val);
      // Remove percentage signs, dollar signs, commas, and other non-numeric characters
      const cleaned = str.replace(/[%$,]/g, '').trim();
      // Return empty string if not a valid number
      if (isNaN(Number(cleaned))) return "";
      return cleaned;
    };
    
    // Helper to detect if value is percentage or amount
    const detectValueType = (val: any) => {
      if (!val) return 'amount';
      const str = String(val);
      return str.includes('%') ? 'percentage' : 'amount';
    };
    
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

    // Debug loan term extraction
    console.log("Loan term extraction from AI:", {
      loanTermMonths: extractedData.loanTermMonths,
      loanTerm: extractedData.loanTerm,
      termMonths: extractedData.termMonths,
      term: extractedData.term,
      raw: extractedData
    });

    // Always set a value for each field (never undefined) to prevent controlled/uncontrolled issues
    setFormData(prev => ({
      ...prev,
      // Loan Information
      loanNumber: cleanString(extractedData.loanNumber) || prev.loanNumber,
      loanType: extractedData.loanType ? normalizeLoanType(extractedData.loanType) : prev.loanType,
      // Fixed: prioritize loanAmount first, then originalAmount
      originalAmount: toString(extractedData.loanAmount || extractedData.originalAmount || extractedData.principal) || prev.originalAmount,
      principalBalance: toString(extractedData.principalBalance || extractedData.currentBalance || extractedData.loanAmount || extractedData.originalAmount) || prev.principalBalance,
      interestRate: toString(extractedData.interestRate) || prev.interestRate,
      rateType: cleanString(extractedData.rateType) || prev.rateType,
      loanTerm: toString(extractedData.loanTermMonths || extractedData.loanTerm || extractedData.termMonths || extractedData.term) || prev.loanTerm,
      
      // Property Information  
      propertyType: extractedData.propertyType ? normalizePropertyType(extractedData.propertyType) : prev.propertyType,
      propertyAddress: cleanString(extractedData.propertyStreetAddress || extractedData.propertyAddress || extractedData.address) || prev.propertyAddress,
      propertyCity: cleanString(extractedData.propertyCity || extractedData.city) || prev.propertyCity,
      propertyState: cleanString(extractedData.propertyState || extractedData.state) || prev.propertyState,
      propertyZip: cleanString(extractedData.propertyZipCode || extractedData.propertyZip || extractedData.zipCode) || prev.propertyZip,
      propertyValue: toString(extractedData.propertyValue || extractedData.appraisedValue) || prev.propertyValue,
      
      // Borrower Information
      borrowerName: cleanString(extractedData.borrowerName || extractedData.primaryBorrower) || prev.borrowerName,
      borrowerEmail: cleanString(extractedData.borrowerEmail) || prev.borrowerEmail,
      borrowerPhone: cleanString(extractedData.borrowerPhone) || prev.borrowerPhone,
      
      // Borrower Address (separate from property address)
      borrowerAddress: cleanString(extractedData.borrowerStreetAddress) || prev.borrowerAddress,
      borrowerCity: cleanString(extractedData.borrowerCity) || prev.borrowerCity,
      borrowerState: cleanString(extractedData.borrowerState) || prev.borrowerState,
      borrowerZip: cleanString(extractedData.borrowerZipCode) || prev.borrowerZip,
      creditScoreEquifax: toString(extractedData.creditScoreEquifax) || prev.creditScoreEquifax,
      creditScoreExperian: toString(extractedData.creditScoreExperian) || prev.creditScoreExperian,
      creditScoreTransunion: toString(extractedData.creditScoreTransunion) || prev.creditScoreTransunion,
      
      // Co-Borrower Information
      coBorrowerName: cleanString(extractedData.coBorrowerName) || prev.coBorrowerName,
      coBorrowerCompanyName: cleanString(extractedData.coBorrowerCompanyName) || prev.coBorrowerCompanyName,
      coBorrowerEmail: cleanString(extractedData.coBorrowerEmail) || prev.coBorrowerEmail,
      coBorrowerPhone: cleanString(extractedData.coBorrowerPhone) || prev.coBorrowerPhone,
      coBorrowerAddress: cleanString(extractedData.coBorrowerStreetAddress) || prev.coBorrowerAddress,
      coBorrowerCity: cleanString(extractedData.coBorrowerCity) || prev.coBorrowerCity,
      coBorrowerState: cleanString(extractedData.coBorrowerState) || prev.coBorrowerState,
      coBorrowerZip: cleanString(extractedData.coBorrowerZipCode) || prev.coBorrowerZip,
      coBorrowerSSN: cleanString(extractedData.coBorrowerSSN) || prev.coBorrowerSSN,
      coBorrowerIncome: toString(extractedData.coBorrowerIncome) || prev.coBorrowerIncome,
      coBorrowerCreditScoreEquifax: toString(extractedData.coBorrowerCreditScoreEquifax) || prev.coBorrowerCreditScoreEquifax,
      coBorrowerCreditScoreExperian: toString(extractedData.coBorrowerCreditScoreExperian) || prev.coBorrowerCreditScoreExperian,
      coBorrowerCreditScoreTransunion: toString(extractedData.coBorrowerCreditScoreTransunion) || prev.coBorrowerCreditScoreTransunion,
      
      // Payment Information
      paymentAmount: toString(extractedData.paymentAmount || extractedData.monthlyPayment) || prev.paymentAmount,
      escrowAmount: toString(extractedData.escrowAmount) || prev.escrowAmount,
      firstPaymentDate: (cleanString(extractedData.firstPaymentDate) && !cleanString(extractedData.firstPaymentDate).includes('YYYY-MM-DD')) ? cleanString(extractedData.firstPaymentDate) : prev.firstPaymentDate,
      nextPaymentDate: (cleanString(extractedData.nextPaymentDate) && !cleanString(extractedData.nextPaymentDate).includes('YYYY-MM-DD')) ? cleanString(extractedData.nextPaymentDate) : prev.nextPaymentDate,
      maturityDate: (cleanString(extractedData.maturityDate) && !cleanString(extractedData.maturityDate).includes('YYYY-MM-DD')) ? cleanString(extractedData.maturityDate) : prev.maturityDate,
      prepaymentExpirationDate: (cleanString(extractedData.prepaymentExpirationDate) && !cleanString(extractedData.prepaymentExpirationDate).includes('YYYY-MM-DD')) ? cleanString(extractedData.prepaymentExpirationDate) : prev.prepaymentExpirationDate,
      
      // Additional Fees
      hazardInsurance: toString(extractedData.hazardInsurance || extractedData.insuranceAmount || extractedData.insurance) || prev.hazardInsurance,
      propertyTaxes: toString(extractedData.propertyTaxes || extractedData.taxAmount || extractedData.taxes) || prev.propertyTaxes,
      hoaFees: toString(extractedData.hoaFees) || prev.hoaFees,
      pmiAmount: toString(extractedData.pmiAmount || extractedData.pmi) || prev.pmiAmount,
      
      // Servicing Settings
      servicingFee: cleanNumeric(extractedData.servicingFee) || prev.servicingFee,
      servicingFeeType: extractedData.servicingFee ? detectValueType(extractedData.servicingFee) : (cleanString(extractedData.servicingFeeType) || prev.servicingFeeType || 'amount'),
      lateCharge: cleanNumeric(extractedData.lateCharge || extractedData.lateChargeAmount) || prev.lateCharge,
      lateChargeType: (extractedData.lateCharge || extractedData.lateChargeAmount) ? detectValueType(extractedData.lateCharge || extractedData.lateChargeAmount) : (cleanString(extractedData.lateChargeType) || prev.lateChargeType || 'percentage'),
      feePayer: cleanString(extractedData.feePayer) || prev.feePayer,
      gracePeriodDays: cleanNumeric(extractedData.gracePeriodDays || extractedData.gracePeriod) || prev.gracePeriodDays,
      investorLoanNumber: cleanString(extractedData.investorLoanNumber) || prev.investorLoanNumber,
      poolNumber: cleanString(extractedData.poolNumber) || prev.poolNumber,
      
      // Enhanced AI-extracted fields
      borrowerSSN: cleanString(extractedData.borrowerSSN) || prev.borrowerSSN,
      borrowerIncome: toString(extractedData.borrowerIncome) || prev.borrowerIncome,
      
      // Trustee complete contact info
      trusteeName: cleanString(extractedData.trusteeName) || prev.trusteeName,
      trusteeCompanyName: cleanString(extractedData.trusteeCompanyName) || prev.trusteeCompanyName,
      trusteePhone: cleanString(extractedData.trusteePhone) || prev.trusteePhone,
      trusteeEmail: cleanString(extractedData.trusteeEmail) || prev.trusteeEmail,
      trusteeStreetAddress: cleanString(extractedData.trusteeStreetAddress) || prev.trusteeStreetAddress,
      trusteeCity: cleanString(extractedData.trusteeCity) || prev.trusteeCity,
      trusteeState: cleanString(extractedData.trusteeState) || prev.trusteeState,
      trusteeZipCode: cleanString(extractedData.trusteeZipCode) || prev.trusteeZipCode,
      
      // Beneficiary complete contact info
      beneficiaryName: cleanString(extractedData.beneficiaryName) || prev.beneficiaryName,
      beneficiaryCompanyName: cleanString(extractedData.beneficiaryCompanyName) || prev.beneficiaryCompanyName,
      beneficiaryPhone: cleanString(extractedData.beneficiaryPhone) || prev.beneficiaryPhone,
      beneficiaryEmail: cleanString(extractedData.beneficiaryEmail) || prev.beneficiaryEmail,
      beneficiaryStreetAddress: cleanString(extractedData.beneficiaryStreetAddress) || prev.beneficiaryStreetAddress,
      beneficiaryCity: cleanString(extractedData.beneficiaryCity) || prev.beneficiaryCity,
      beneficiaryState: cleanString(extractedData.beneficiaryState) || prev.beneficiaryState,
      beneficiaryZipCode: cleanString(extractedData.beneficiaryZipCode) || prev.beneficiaryZipCode,
      
      // Escrow Company complete contact info
      escrowCompanyName: cleanString(extractedData.escrowCompanyName) || prev.escrowCompanyName,
      escrowCompanyPhone: cleanString(extractedData.escrowCompanyPhone) || prev.escrowCompanyPhone,
      escrowCompanyEmail: cleanString(extractedData.escrowCompanyEmail) || prev.escrowCompanyEmail,
      escrowCompanyStreetAddress: cleanString(extractedData.escrowCompanyStreetAddress) || prev.escrowCompanyStreetAddress,
      escrowCompanyCity: cleanString(extractedData.escrowCompanyCity) || prev.escrowCompanyCity,
      escrowCompanyState: cleanString(extractedData.escrowCompanyState) || prev.escrowCompanyState,
      escrowCompanyZipCode: cleanString(extractedData.escrowCompanyZipCode) || prev.escrowCompanyZipCode,
      loanDocuments: extractedData.loanDocuments || prev.loanDocuments,
      defaultConditions: extractedData.defaultConditions || prev.defaultConditions,
      insuranceRequirements: extractedData.insuranceRequirements || prev.insuranceRequirements,
      crossDefaultParties: extractedData.crossDefaultParties || prev.crossDefaultParties,
      closingCosts: toString(extractedData.closingCosts) || prev.closingCosts,
      downPayment: toString(extractedData.downPayment) || prev.downPayment
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
      console.log("=== STARTING LOAN CREATION ===");
      console.log("Full form data received:", data);
      
      // First create the property
      const propertyData = {
        propertyType: data.propertyType,
        address: data.propertyAddress,
        city: data.propertyCity,
        state: data.propertyState,
        zipCode: data.propertyZip,
        value: data.propertyValue || "0"
      };
      
      console.log("Property data to be created:", propertyData);
      
      console.log("Sending property creation request...");
      const propertyResponse = await apiRequest("/api/properties", {
        method: "POST",
        body: JSON.stringify(propertyData)
      });
      console.log("Property response status:", propertyResponse.status);
      
      if (!propertyResponse.ok) {
        const errorData = await propertyResponse.json();
        console.error("Property creation failed:", errorData);
        throw new Error(errorData.error || errorData.message || 'Failed to create property');
      }
      let property;
      try {
        property = await propertyResponse.json();
        console.log("Property created successfully:", property);
        console.log("Property ID:", property.id);
      } catch (jsonError) {
        console.error("Error parsing property response:", jsonError);
        console.error("Response status:", propertyResponse.status);
        console.error("Response text:", await propertyResponse.text());
        throw new Error('Failed to parse property response');
      }
      
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
      
      // Helper function to clean date values
      const cleanDate = (dateValue: string | null | undefined): string => {
        if (!dateValue || 
            dateValue === 'YYYY-MM-DD_or_null' || 
            dateValue === 'null' || 
            dateValue === 'extracted_value_or_null' ||
            dateValue.includes('_or_null')) {
          return new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0];
        }
        
        // Validate if it's a proper date
        const parsedDate = new Date(dateValue);
        if (isNaN(parsedDate.getTime())) {
          return new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0];
        }
        
        return dateValue;
      };

      // Helper function to clean string values
      const cleanString = (value: string | null | undefined): string => {
        if (!value || 
            value === 'extracted_value_or_null' || 
            value === 'null' || 
            value.includes('_or_null')) {
          return '';
        }
        return value;
      };

      // Calculate maturity date properly (loan term is in MONTHS)
      const parsedLoanTerm = parseInt(data.loanTerm);
      const loanTermMonths = isNaN(parsedLoanTerm) ? 360 : parsedLoanTerm; // Default to 360 months (30 years)
      console.log("Loan term processing:", { input: data.loanTerm, parsed: parsedLoanTerm, final: loanTermMonths });
      const today = new Date();
      const maturityDate = new Date(today.setMonth(today.getMonth() + loanTermMonths)).toISOString().split('T')[0];

      console.log("=== PREPARING LOAN DATA ===");
      
      if (!property || !property.id) {
        console.error("Property object or ID is missing:", property);
        throw new Error('Property creation did not return a valid ID');
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
        loanTerm: loanTermMonths,
        paymentAmount: monthlyPayment?.toString() || "0",
        escrowAmount: data.escrowAmount?.toString() || "0",
        status: "active",
        maturityDate: cleanDate(data.maturityDate) || maturityDate,
        firstPaymentDate: cleanDate(data.firstPaymentDate),
        nextPaymentDate: cleanDate(data.nextPaymentDate),
        prepaymentExpirationDate: data.prepaymentExpirationDate ? cleanDate(data.prepaymentExpirationDate) : null,
        lenderId: user?.id,
        servicerId: user?.id,
        // Borrower information
        borrowerName: cleanString(data.borrowerName) || null,
        borrowerEmail: cleanString(data.borrowerEmail) || null,  
        borrowerPhone: cleanString(data.borrowerPhone) || null,
        // Borrower mailing address (separate from property)
        borrowerAddress: cleanString(data.borrowerAddress) || null,
        borrowerCity: cleanString(data.borrowerCity) || null,
        borrowerState: cleanString(data.borrowerState) || null,
        borrowerZip: cleanString(data.borrowerZip) || null,
        // Enhanced AI-extracted fields
        borrowerCompanyName: cleanString(data.borrowerCompanyName) || null,
        borrowerSSN: cleanString(data.borrowerSSN) || null,
        borrowerIncome: data.borrowerIncome?.toString() || null,
        creditScoreEquifax: data.creditScoreEquifax ? parseInt(data.creditScoreEquifax) : null,
        creditScoreExperian: data.creditScoreExperian ? parseInt(data.creditScoreExperian) : null,
        creditScoreTransunion: data.creditScoreTransunion ? parseInt(data.creditScoreTransunion) : null,
        // Co-Borrower information
        coBorrowerName: cleanString(data.coBorrowerName) || null,
        coBorrowerCompanyName: cleanString(data.coBorrowerCompanyName) || null,
        coBorrowerEmail: cleanString(data.coBorrowerEmail) || null,
        coBorrowerPhone: cleanString(data.coBorrowerPhone) || null,
        coBorrowerAddress: cleanString(data.coBorrowerAddress) || null,
        coBorrowerCity: cleanString(data.coBorrowerCity) || null,
        coBorrowerState: cleanString(data.coBorrowerState) || null,
        coBorrowerZip: cleanString(data.coBorrowerZip) || null,
        coBorrowerSSN: cleanString(data.coBorrowerSSN) || null,
        coBorrowerIncome: data.coBorrowerIncome?.toString() || null,
        coBorrowerCreditScoreEquifax: data.coBorrowerCreditScoreEquifax ? parseInt(data.coBorrowerCreditScoreEquifax) : null,
        coBorrowerCreditScoreExperian: data.coBorrowerCreditScoreExperian ? parseInt(data.coBorrowerCreditScoreExperian) : null,
        coBorrowerCreditScoreTransunion: data.coBorrowerCreditScoreTransunion ? parseInt(data.coBorrowerCreditScoreTransunion) : null,
        trusteeName: cleanString(data.trusteeName) || null,
        trusteeCompanyName: cleanString(data.trusteeCompanyName) || null,
        trusteePhone: cleanString(data.trusteePhone) || null,
        trusteeEmail: cleanString(data.trusteeEmail) || null,
        trusteeStreetAddress: cleanString(data.trusteeStreetAddress) || null,
        trusteeCity: cleanString(data.trusteeCity) || null,
        trusteeState: cleanString(data.trusteeState) || null,
        trusteeZipCode: cleanString(data.trusteeZipCode) || null,
        beneficiaryName: cleanString(data.beneficiaryName) || null,
        beneficiaryCompanyName: cleanString(data.beneficiaryCompanyName) || null,
        beneficiaryPhone: cleanString(data.beneficiaryPhone) || null,
        beneficiaryEmail: cleanString(data.beneficiaryEmail) || null,
        beneficiaryStreetAddress: cleanString(data.beneficiaryStreetAddress) || null,
        beneficiaryCity: cleanString(data.beneficiaryCity) || null,
        beneficiaryState: cleanString(data.beneficiaryState) || null,
        beneficiaryZipCode: cleanString(data.beneficiaryZipCode) || null,
        escrowCompanyName: cleanString(data.escrowCompanyName) || null,
        escrowCompanyPhone: cleanString(data.escrowCompanyPhone) || null,
        escrowCompanyEmail: cleanString(data.escrowCompanyEmail) || null,
        escrowCompanyStreetAddress: cleanString(data.escrowCompanyStreetAddress) || null,
        escrowCompanyCity: cleanString(data.escrowCompanyCity) || null,
        escrowCompanyState: cleanString(data.escrowCompanyState) || null,
        escrowCompanyZipCode: cleanString(data.escrowCompanyZipCode) || null,
        loanDocuments: data.loanDocuments ? JSON.stringify(data.loanDocuments) : null,
        defaultConditions: data.defaultConditions ? JSON.stringify(data.defaultConditions) : null,
        insuranceRequirements: data.insuranceRequirements ? JSON.stringify(data.insuranceRequirements) : null,
        crossDefaultParties: data.crossDefaultParties ? JSON.stringify(data.crossDefaultParties) : null,
        closingCosts: data.closingCosts?.toString() || null,
        downPayment: data.downPayment?.toString() || null,
        // Additional fields
        hazardInsurance: data.hazardInsurance?.toString() || "0",
        propertyTaxes: data.propertyTaxes?.toString() || "0",
        hoaFees: data.hoaFees?.toString() || "0",
        pmiAmount: data.pmiAmount?.toString() || "0",
        // Servicing Settings
        servicingFee: data.servicingFee?.toString() || "25",
        servicingFeeType: cleanString(data.servicingFeeType) || "percentage",
        lateCharge: data.lateCharge?.toString() || null,
        lateChargeType: cleanString(data.lateChargeType) || "percentage",
        feePayer: cleanString(data.feePayer) || null,
        gracePeriodDays: data.gracePeriodDays ? parseInt(data.gracePeriodDays) : null,
        investorLoanNumber: cleanString(data.investorLoanNumber) || null,
        poolNumber: cleanString(data.poolNumber) || null
      };
      
      console.log("=== LOAN DATA TO BE SENT ===");
      console.log(JSON.stringify(loanData, null, 2));
      console.log("Sending loan creation request...");
      
      const response = await apiRequest("/api/loans", {
        method: "POST",
        body: JSON.stringify(loanData)
      });
      console.log("Loan response status:", response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error("=== LOAN CREATION FAILED ===");
        console.error("Error details:", errorData);
        console.error("Error message:", errorData.error || errorData.message);
        throw new Error(errorData.error || errorData.message || 'Failed to create loan');
      }
      
      const createdLoan = await response.json();
      console.log("=== LOAN CREATED SUCCESSFULLY ===");
      console.log("Created loan:", createdLoan);
      
      return createdLoan;
    },
    onSuccess: async (loan) => {
      // If there are uploaded files, create document records
      if (files.length > 0) {
        try {
          for (const fileData of files) {
            if (fileData.status === 'completed' && fileData.file) {
              // Map document type to valid category
              const mapDocumentCategory = (docType: string): string => {
                if (!docType) return 'other';
                const lowerType = docType.toLowerCase();
                if (lowerType.includes('application')) return 'loan_application';
                if (lowerType.includes('agreement') || lowerType.includes('contract')) return 'loan_agreement';
                if (lowerType.includes('note') || lowerType.includes('promissory')) return 'promissory_note';
                if (lowerType.includes('deed')) return 'deed_of_trust';
                if (lowerType.includes('mortgage')) return 'mortgage';
                if (lowerType.includes('security')) return 'security_agreement';
                if (lowerType.includes('ucc')) return 'ucc_filing';
                if (lowerType.includes('assignment')) return 'assignment';
                if (lowerType.includes('modification')) return 'modification';
                if (lowerType.includes('insurance')) return 'insurance_policy';
                if (lowerType.includes('tax')) return 'tax_document';
                if (lowerType.includes('escrow')) return 'escrow_statement';
                if (lowerType.includes('title')) return 'title_report';
                if (lowerType.includes('appraisal')) return 'appraisal';
                if (lowerType.includes('closing')) return 'closing_disclosure';
                if (lowerType.includes('settlement')) return 'settlement_statement';
                return 'other';
              };

              const formData = new FormData();
              formData.append('file', fileData.file);
              formData.append('loanId', loan.id.toString());
              formData.append('category', mapDocumentCategory(fileData.documentType || ''));
              formData.append('description', `AI-analyzed: ${fileData.documentType || 'Unknown document type'}`);
              
              // Store the AI extraction JSON in the notes field
              if (fileData.extractedData) {
                formData.append('notes', JSON.stringify({
                  documentType: fileData.documentType,
                  extractedData: fileData.extractedData,
                  analyzedAt: new Date().toISOString()
                }));
              }

              const response = await fetch('/api/documents/upload', {
                method: 'POST',
                credentials: 'include',
                body: formData
              });

              if (!response.ok) {
                console.error('Failed to save document:', fileData.file.name);
              }
            }
          }
        } catch (error) {
          console.error('Error saving documents:', error);
          // Don't show error to user as loan was created successfully
        }
      }

      toast({
        title: "Success",
        description: "Loan created successfully with documents",
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
      console.error("=== LOAN CREATION ERROR ===");
      console.error("Error object:", error);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
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
      borrowerAddress: "",
      borrowerCity: "",
      borrowerState: "",
      borrowerZip: "",
      borrowerCompanyName: "",
      borrowerSSN: "",
      borrowerIncome: "",
      creditScoreEquifax: "",
      creditScoreExperian: "",
      creditScoreTransunion: "",
      coBorrowerName: "",
      coBorrowerCompanyName: "",
      coBorrowerEmail: "",
      coBorrowerPhone: "",
      coBorrowerAddress: "",
      coBorrowerCity: "",
      coBorrowerState: "",
      coBorrowerZip: "",
      coBorrowerSSN: "",
      coBorrowerIncome: "",
      coBorrowerCreditScoreEquifax: "",
      coBorrowerCreditScoreExperian: "",
      coBorrowerCreditScoreTransunion: "",
      trusteeName: "",
      trusteeCompanyName: "",
      trusteePhone: "",
      trusteeEmail: "",
      trusteeStreetAddress: "",
      trusteeCity: "",
      trusteeState: "",
      trusteeZipCode: "",
      beneficiaryName: "",
      beneficiaryCompanyName: "",
      beneficiaryPhone: "",
      beneficiaryEmail: "",
      beneficiaryStreetAddress: "",
      beneficiaryCity: "",
      beneficiaryState: "",
      beneficiaryZipCode: "",
      escrowCompanyName: "",
      escrowCompanyPhone: "",
      escrowCompanyEmail: "",
      escrowCompanyStreetAddress: "",
      escrowCompanyCity: "",
      escrowCompanyState: "",
      escrowCompanyZipCode: "",
      paymentAmount: "",
      escrowAmount: "",
      firstPaymentDate: "",
      nextPaymentDate: "",
      maturityDate: "",
      prepaymentExpirationDate: "",
      hazardInsurance: "",
      propertyTaxes: "",
      hoaFees: "",
      pmiAmount: "",
      servicingFee: "25",
      loanDocuments: null,
      defaultConditions: null,
      insuranceRequirements: null,
      crossDefaultParties: null,
      closingCosts: "",
      downPayment: ""
    });
    setFiles([]);
  };

  const handleSubmit = (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    console.log('=== FORM SUBMISSION STARTED ===');
    console.log('Form data at submission:', formData);
    console.log('Form data keys:', Object.keys(formData));
    console.log('Form data values that are empty:', Object.entries(formData).filter(([_, v]) => !v).map(([k]) => k));
    
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

          {/* Action Buttons at the top */}
          <div className="flex justify-end gap-3 px-6 py-3 border-b">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={createLoanMutation.isPending}
            >
              {createLoanMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>

          <ScrollArea className="h-[calc(90vh-250px)] px-6">
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
                      <Label htmlFor="originalAmount">Original Amount *</Label>
                      <Input
                        id="originalAmount"
                        type="number"
                        value={formData.originalAmount}
                        onChange={(e) => handleInputChange('originalAmount', e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="interestRate">Interest Rate (%) *</Label>
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
                      <Label htmlFor="loanTerm">Term (Months) *</Label>
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
                      <Label htmlFor="propertyAddress">Property Address *</Label>
                      <Input
                        id="propertyAddress"
                        value={formData.propertyAddress}
                        onChange={(e) => handleInputChange('propertyAddress', e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="propertyCity">City *</Label>
                      <Input
                        id="propertyCity"
                        value={formData.propertyCity}
                        onChange={(e) => handleInputChange('propertyCity', e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="propertyState">State *</Label>
                      <Input
                        id="propertyState"
                        value={formData.propertyState}
                        onChange={(e) => handleInputChange('propertyState', e.target.value)}
                        maxLength={2}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="propertyZip">ZIP Code *</Label>
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
                      <Label htmlFor="borrowerCompanyName">Borrower Company/Trust</Label>
                      <Input
                        id="borrowerCompanyName"
                        value={formData.borrowerCompanyName}
                        onChange={(e) => handleInputChange('borrowerCompanyName', e.target.value)}
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
                    <div className="space-y-2">
                      <Label htmlFor="borrowerSSN">SSN</Label>
                      <Input
                        id="borrowerSSN"
                        value={formData.borrowerSSN}
                        onChange={(e) => handleInputChange('borrowerSSN', e.target.value)}
                        placeholder="XXX-XX-XXXX"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="borrowerIncome">Annual Income</Label>
                      <Input
                        id="borrowerIncome"
                        type="number"
                        value={formData.borrowerIncome}
                        onChange={(e) => handleInputChange('borrowerIncome', e.target.value)}
                      />
                    </div>
                    
                    {/* Credit Scores */}
                    <div className="col-span-2">
                      <h4 className="text-md font-medium mb-3 text-gray-700">Credit Scores</h4>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="creditScoreEquifax">Equifax Score</Label>
                      <Input
                        id="creditScoreEquifax"
                        type="number"
                        value={formData.creditScoreEquifax}
                        onChange={(e) => handleInputChange('creditScoreEquifax', e.target.value)}
                        placeholder="300-850"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="creditScoreExperian">Experian Score</Label>
                      <Input
                        id="creditScoreExperian"
                        type="number"
                        value={formData.creditScoreExperian}
                        onChange={(e) => handleInputChange('creditScoreExperian', e.target.value)}
                        placeholder="300-850"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="creditScoreTransunion">TransUnion Score</Label>
                      <Input
                        id="creditScoreTransunion"
                        type="number"
                        value={formData.creditScoreTransunion}
                        onChange={(e) => handleInputChange('creditScoreTransunion', e.target.value)}
                        placeholder="300-850"
                      />
                    </div>
                    <div></div>
                    
                    {/* Borrower Mailing Address Section */}
                    <div className="col-span-2">
                      <h4 className="text-md font-medium mb-3 text-gray-700">Borrower Mailing Address (if different from property)</h4>
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="borrowerAddress">Street Address</Label>
                      <Input
                        id="borrowerAddress"
                        value={formData.borrowerAddress}
                        onChange={(e) => handleInputChange('borrowerAddress', e.target.value)}
                        placeholder="Leave blank if same as property address"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="borrowerCity">City</Label>
                      <Input
                        id="borrowerCity"
                        value={formData.borrowerCity}
                        onChange={(e) => handleInputChange('borrowerCity', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="borrowerState">State</Label>
                      <Input
                        id="borrowerState"
                        value={formData.borrowerState}
                        onChange={(e) => handleInputChange('borrowerState', e.target.value)}
                        maxLength={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="borrowerZip">ZIP Code</Label>
                      <Input
                        id="borrowerZip"
                        value={formData.borrowerZip}
                        onChange={(e) => handleInputChange('borrowerZip', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Co-Borrower Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Co-Borrower Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="coBorrowerName">Co-Borrower Name</Label>
                      <Input
                        id="coBorrowerName"
                        value={formData.coBorrowerName}
                        onChange={(e) => handleInputChange('coBorrowerName', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coBorrowerCompanyName">Co-Borrower Company/Trust</Label>
                      <Input
                        id="coBorrowerCompanyName"
                        value={formData.coBorrowerCompanyName}
                        onChange={(e) => handleInputChange('coBorrowerCompanyName', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coBorrowerEmail">Email</Label>
                      <Input
                        id="coBorrowerEmail"
                        type="email"
                        value={formData.coBorrowerEmail}
                        onChange={(e) => handleInputChange('coBorrowerEmail', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coBorrowerPhone">Phone</Label>
                      <Input
                        id="coBorrowerPhone"
                        value={formData.coBorrowerPhone}
                        onChange={(e) => handleInputChange('coBorrowerPhone', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coBorrowerSSN">SSN</Label>
                      <Input
                        id="coBorrowerSSN"
                        value={formData.coBorrowerSSN}
                        onChange={(e) => handleInputChange('coBorrowerSSN', e.target.value)}
                        placeholder="XXX-XX-XXXX"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coBorrowerIncome">Annual Income</Label>
                      <Input
                        id="coBorrowerIncome"
                        type="number"
                        value={formData.coBorrowerIncome}
                        onChange={(e) => handleInputChange('coBorrowerIncome', e.target.value)}
                      />
                    </div>
                    
                    {/* Co-Borrower Credit Scores */}
                    <div className="col-span-2">
                      <h4 className="text-md font-medium mb-3 text-gray-700">Co-Borrower Credit Scores</h4>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coBorrowerCreditScoreEquifax">Equifax Score</Label>
                      <Input
                        id="coBorrowerCreditScoreEquifax"
                        type="number"
                        value={formData.coBorrowerCreditScoreEquifax}
                        onChange={(e) => handleInputChange('coBorrowerCreditScoreEquifax', e.target.value)}
                        placeholder="300-850"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coBorrowerCreditScoreExperian">Experian Score</Label>
                      <Input
                        id="coBorrowerCreditScoreExperian"
                        type="number"
                        value={formData.coBorrowerCreditScoreExperian}
                        onChange={(e) => handleInputChange('coBorrowerCreditScoreExperian', e.target.value)}
                        placeholder="300-850"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coBorrowerCreditScoreTransunion">TransUnion Score</Label>
                      <Input
                        id="coBorrowerCreditScoreTransunion"
                        type="number"
                        value={formData.coBorrowerCreditScoreTransunion}
                        onChange={(e) => handleInputChange('coBorrowerCreditScoreTransunion', e.target.value)}
                        placeholder="300-850"
                      />
                    </div>
                    <div></div>
                    
                    {/* Co-Borrower Address */}
                    <div className="col-span-2">
                      <h4 className="text-md font-medium mb-3 text-gray-700">Co-Borrower Mailing Address</h4>
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="coBorrowerAddress">Street Address</Label>
                      <Input
                        id="coBorrowerAddress"
                        value={formData.coBorrowerAddress}
                        onChange={(e) => handleInputChange('coBorrowerAddress', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coBorrowerCity">City</Label>
                      <Input
                        id="coBorrowerCity"
                        value={formData.coBorrowerCity}
                        onChange={(e) => handleInputChange('coBorrowerCity', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coBorrowerState">State</Label>
                      <Input
                        id="coBorrowerState"
                        value={formData.coBorrowerState}
                        onChange={(e) => handleInputChange('coBorrowerState', e.target.value)}
                        maxLength={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coBorrowerZip">ZIP Code</Label>
                      <Input
                        id="coBorrowerZip"
                        value={formData.coBorrowerZip}
                        onChange={(e) => handleInputChange('coBorrowerZip', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Trustee Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Trustee Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="trusteeName">Trustee Name</Label>
                      <Input
                        id="trusteeName"
                        value={formData.trusteeName}
                        onChange={(e) => handleInputChange('trusteeName', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="trusteeCompanyName">Trustee Company</Label>
                      <Input
                        id="trusteeCompanyName"
                        value={formData.trusteeCompanyName}
                        onChange={(e) => handleInputChange('trusteeCompanyName', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="trusteePhone">Phone</Label>
                      <Input
                        id="trusteePhone"
                        value={formData.trusteePhone}
                        onChange={(e) => handleInputChange('trusteePhone', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="trusteeEmail">Email</Label>
                      <Input
                        id="trusteeEmail"
                        type="email"
                        value={formData.trusteeEmail}
                        onChange={(e) => handleInputChange('trusteeEmail', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="trusteeStreetAddress">Street Address</Label>
                      <Input
                        id="trusteeStreetAddress"
                        value={formData.trusteeStreetAddress}
                        onChange={(e) => handleInputChange('trusteeStreetAddress', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="trusteeCity">City</Label>
                      <Input
                        id="trusteeCity"
                        value={formData.trusteeCity}
                        onChange={(e) => handleInputChange('trusteeCity', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="trusteeState">State</Label>
                      <Input
                        id="trusteeState"
                        value={formData.trusteeState}
                        onChange={(e) => handleInputChange('trusteeState', e.target.value)}
                        maxLength={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="trusteeZipCode">ZIP Code</Label>
                      <Input
                        id="trusteeZipCode"
                        value={formData.trusteeZipCode}
                        onChange={(e) => handleInputChange('trusteeZipCode', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Beneficiary Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Beneficiary Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="beneficiaryName">Beneficiary Name</Label>
                      <Input
                        id="beneficiaryName"
                        value={formData.beneficiaryName}
                        onChange={(e) => handleInputChange('beneficiaryName', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="beneficiaryCompanyName">Beneficiary Company</Label>
                      <Input
                        id="beneficiaryCompanyName"
                        value={formData.beneficiaryCompanyName}
                        onChange={(e) => handleInputChange('beneficiaryCompanyName', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="beneficiaryPhone">Phone</Label>
                      <Input
                        id="beneficiaryPhone"
                        value={formData.beneficiaryPhone}
                        onChange={(e) => handleInputChange('beneficiaryPhone', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="beneficiaryEmail">Email</Label>
                      <Input
                        id="beneficiaryEmail"
                        type="email"
                        value={formData.beneficiaryEmail}
                        onChange={(e) => handleInputChange('beneficiaryEmail', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="beneficiaryStreetAddress">Street Address</Label>
                      <Input
                        id="beneficiaryStreetAddress"
                        value={formData.beneficiaryStreetAddress}
                        onChange={(e) => handleInputChange('beneficiaryStreetAddress', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="beneficiaryCity">City</Label>
                      <Input
                        id="beneficiaryCity"
                        value={formData.beneficiaryCity}
                        onChange={(e) => handleInputChange('beneficiaryCity', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="beneficiaryState">State</Label>
                      <Input
                        id="beneficiaryState"
                        value={formData.beneficiaryState}
                        onChange={(e) => handleInputChange('beneficiaryState', e.target.value)}
                        maxLength={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="beneficiaryZipCode">ZIP Code</Label>
                      <Input
                        id="beneficiaryZipCode"
                        value={formData.beneficiaryZipCode}
                        onChange={(e) => handleInputChange('beneficiaryZipCode', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Escrow Company Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Escrow Company Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="escrowCompanyName">Escrow Company Name</Label>
                      <Input
                        id="escrowCompanyName"
                        value={formData.escrowCompanyName}
                        onChange={(e) => handleInputChange('escrowCompanyName', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="escrowCompanyPhone">Phone</Label>
                      <Input
                        id="escrowCompanyPhone"
                        value={formData.escrowCompanyPhone}
                        onChange={(e) => handleInputChange('escrowCompanyPhone', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="escrowCompanyEmail">Email</Label>
                      <Input
                        id="escrowCompanyEmail"
                        type="email"
                        value={formData.escrowCompanyEmail}
                        onChange={(e) => handleInputChange('escrowCompanyEmail', e.target.value)}
                      />
                    </div>
                    <div></div>
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="escrowCompanyStreetAddress">Street Address</Label>
                      <Input
                        id="escrowCompanyStreetAddress"
                        value={formData.escrowCompanyStreetAddress}
                        onChange={(e) => handleInputChange('escrowCompanyStreetAddress', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="escrowCompanyCity">City</Label>
                      <Input
                        id="escrowCompanyCity"
                        value={formData.escrowCompanyCity}
                        onChange={(e) => handleInputChange('escrowCompanyCity', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="escrowCompanyState">State</Label>
                      <Input
                        id="escrowCompanyState"
                        value={formData.escrowCompanyState}
                        onChange={(e) => handleInputChange('escrowCompanyState', e.target.value)}
                        maxLength={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="escrowCompanyZipCode">ZIP Code</Label>
                      <Input
                        id="escrowCompanyZipCode"
                        value={formData.escrowCompanyZipCode}
                        onChange={(e) => handleInputChange('escrowCompanyZipCode', e.target.value)}
                      />
                    </div>
                  </div>
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
                      <Label htmlFor="coBorrowerName-manual">Co-Borrower Name</Label>
                      <Input
                        id="coBorrowerName-manual"
                        value={formData.coBorrowerName}
                        onChange={(e) => handleInputChange('coBorrowerName', e.target.value)}
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
              </form>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}