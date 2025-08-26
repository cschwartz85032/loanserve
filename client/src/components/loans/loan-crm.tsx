import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format, parseISO } from 'date-fns';
import { 
  CRM_CONSTANTS,
  getPhonesFromLoan,
  getEmailsFromLoan,
  getActivityDescription,
  type PhoneInfo,
  type EmailInfo
} from '@/utils/crm-utils';
import { 
  MessageSquare, 
  Phone, 
  Calendar, 
  CheckSquare, 
  Users, 
  FileText, 
  Plus, 
  Clock,
  User,
  PhoneCall,
  Mail,
  Activity,
  Briefcase,
  Star,
  Send,
  Paperclip,
  Bold,
  Italic,
  Link,
  List,
  Image,
  MoreHorizontal,
  ChevronDown,
  Filter,
  Search,
  Calculator,
  DollarSign,
  MapPin,
  MessageCircle,
  Edit,
  Trash2,
  Settings,
  Check,
  X,
  Camera
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import MD5 from 'crypto-js/md5';

interface LoanCRMProps {
  loanId: number;
  calculations?: any;
  loanData?: any;
}

// Email Templates Content Component
const EmailTemplatesContent = React.memo(({ 
  onSelectTemplate, 
  onClose 
}: { 
  onSelectTemplate: (template: any) => void;
  onClose: () => void;
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [folderPath, setFolderPath] = useState<Array<{id: number | null, name: string}>>([
    { id: null, name: 'Email Templates' }
  ]);
  
  // Fetch folders with template count
  const { data: foldersResponse, isLoading: loadingFolders } = useQuery({
    queryKey: ['/api/email-template-folders'],
  });
  const folders = foldersResponse?.data || [];
  
  // Fetch templates for current folder or all templates
  const { data: templatesResponse, isLoading: loadingTemplates } = useQuery({
    queryKey: ['/api/email-templates', currentFolderId, searchTerm],
    queryFn: async () => {
      let url = '/api/email-templates';
      const params = new URLSearchParams();
      if (currentFolderId) params.append('folderId', currentFolderId.toString());
      if (searchTerm) params.append('search', searchTerm);
      if (params.toString()) url += `?${params}`;
      
      const response = await fetch(url, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    }
  });
  const templates = templatesResponse?.data || [];

  const navigateToFolder = (folder: { id: number | null, name: string }) => {
    setCurrentFolderId(folder.id);
    
    // Update breadcrumb path
    const folderIndex = folderPath.findIndex(f => f.id === folder.id);
    if (folderIndex !== -1) {
      // Navigate back in breadcrumb
      setFolderPath(folderPath.slice(0, folderIndex + 1));
    } else {
      // Navigate forward to new folder
      setFolderPath([...folderPath, folder]);
    }
  };

  const totalTemplates = templates.length + folders.reduce((sum: number, folder: any) => sum + (folder.templateCount || 0), 0);

  return (
    <div className="space-y-4">
      {/* Breadcrumb Navigation */}
      {folderPath.length > 1 && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          {folderPath.map((folder, index) => (
            <React.Fragment key={index}>
              {index > 0 && <ChevronDown className="h-3 w-3 rotate-[-90deg]" />}
              <button
                onClick={() => navigateToFolder(folder)}
                className="hover:text-primary transition-colors"
              >
                {folder.name}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
      
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search Email Templates"
          className="pl-8"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      
      {/* Folders and Templates */}
      <ScrollArea className="h-[350px]">
        <div className="space-y-1">
          {/* Show All Templates folder at root */}
          {!currentFolderId && !searchTerm && (
            <div
              className="flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer transition-colors border rounded"
              onClick={() => navigateToFolder({ id: null, name: 'All Email Templates' })}
            >
              <div className="flex items-center gap-2">
                <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
                <span className="text-sm font-medium">All Email Templates ({totalTemplates} Templates)</span>
              </div>
            </div>
          )}
          
          {/* Display folders for current level */}
          {!searchTerm && folders
            .filter((folder: any) => folder.parentId === currentFolderId)
            .map((folder: any) => (
              <div
                key={folder.id}
                className="flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer transition-colors border rounded"
                onClick={() => navigateToFolder({ id: folder.id, name: folder.name })}
              >
                <div className="flex items-center gap-2">
                  <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
                  <span className="text-sm font-medium">{folder.name} ({folder.templateCount} Templates)</span>
                </div>
              </div>
            ))}
          
          {/* Display templates */}
          {templates.map((template: any) => (
            <div
              key={template.id}
              className="p-3 hover:bg-muted/50 rounded cursor-pointer transition-colors border"
              onClick={() => onSelectTemplate(template)}
            >
              <p className="text-sm font-medium">{template.name}</p>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {template.subject || 'No subject'}
              </p>
            </div>
          ))}
          
          {/* Loading state */}
          {(loadingFolders || loadingTemplates) && (
            <div className="text-center py-4">
              <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                Loading...
              </div>
            </div>
          )}
          
          {/* Empty state */}
          {!loadingFolders && !loadingTemplates && templates.length === 0 && 
           folders.filter((f: any) => f.parentId === currentFolderId).length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No templates found</p>
            </div>
          )}
        </div>
      </ScrollArea>
      
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </DialogFooter>
    </div>
  );
});

// Document Selector Component for attachments
function DocumentSelector({ 
  loanId, 
  selectedDocuments, 
  onSelectionChange 
}: { 
  loanId: number;
  selectedDocuments: number[];
  onSelectionChange: (docs: Array<{id: number, name: string, size?: number}>) => void;
}) {
  // Fetch all documents
  const { data: documents = [], isLoading } = useQuery({
    queryKey: [`/api/documents`],
  });

  // Filter documents related to this loan or general documents
  const relevantDocs = documents.filter((doc: any) => 
    doc.loanId === loanId || doc.loanId === null
  );

  const [selected, setSelected] = useState<Set<number>>(new Set(selectedDocuments));

  const handleToggleDocument = (docId: number) => {
    const newSelected = new Set(selected);
    if (newSelected.has(docId)) {
      newSelected.delete(docId);
    } else {
      newSelected.add(docId);
    }
    setSelected(newSelected);
    
    // Call the callback with selected documents
    const selectedDocs = relevantDocs
      .filter((doc: any) => newSelected.has(doc.id))
      .map((doc: any) => ({
        id: doc.id,
        name: doc.name || doc.fileName || 'Untitled Document',
        size: doc.fileSize
      }));
    onSelectionChange(selectedDocs);
  };

  if (isLoading) {
    return <div className="text-center py-4">Loading documents...</div>;
  }

  if (relevantDocs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No documents available</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {relevantDocs.map((doc: any) => (
        <div 
          key={doc.id}
          className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
            selected.has(doc.id) ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'
          }`}
          onClick={() => handleToggleDocument(doc.id)}
        >
          <div className="flex items-center justify-center w-5 h-5">
            <input
              type="checkbox"
              checked={selected.has(doc.id)}
              onChange={() => {}}
              className="h-4 w-4"
            />
          </div>
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">{doc.name || doc.fileName || 'Untitled Document'}</p>
            <p className="text-xs text-muted-foreground">
              {doc.documentType || 'Document'} 
              {doc.uploadDate && !isNaN(new Date(doc.uploadDate).getTime()) && (
                <span> • Uploaded {format(new Date(doc.uploadDate), 'MMM d, yyyy')}</span>
              )}
            </p>
          </div>
          {doc.fileSize && (
            <span className="text-xs text-muted-foreground">
              {(doc.fileSize / 1024).toFixed(1)} KB
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function LoanCRM({ loanId, calculations, loanData }: LoanCRMProps) {
  const { user } = useAuth();
  const [selectedTab, setSelectedTab] = useState('notes');
  const [communicationType, setCommunicationType] = useState('note');
  const [newNoteContent, setNewNoteContent] = useState('');

  const [newCallNotes, setNewCallNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailContent, setEmailContent] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailBcc, setEmailBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [textMessage, setTextMessage] = useState('');
  const [smsTo, setSmsTo] = useState('');
  const [showSmsTemplatesModal, setShowSmsTemplatesModal] = useState(false);
  const [smsScheduledTime, setSmsScheduledTime] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState('');
  const [callOutcome, setCallOutcome] = useState('');
  const [emailAttachments, setEmailAttachments] = useState<Array<{id?: number, name: string, size?: number, file?: File}>>([]);
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [scheduledSendTime, setScheduledSendTime] = useState<string | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  
  // Contact editing states
  const [hoveredContact, setHoveredContact] = useState<string | null>(null);
  const [editPhoneModal, setEditPhoneModal] = useState(false);
  const [editEmailModal, setEditEmailModal] = useState(false);
  const [editAddressModal, setEditAddressModal] = useState(false);
  const [phoneNumbers, setPhoneNumbers] = useState<Array<{number: string, label: string, isBad?: boolean}>>([]);
  const [emailAddresses, setEmailAddresses] = useState<Array<{email: string, label: string}>>([]);
  const [editLoanTermsModal, setEditLoanTermsModal] = useState(false);
  const [editServicingModal, setEditServicingModal] = useState(false);
  const [loanTermsForm, setLoanTermsForm] = useState<any>({});
  const [servicingForm, setServicingForm] = useState<any>({});
  const [editPropertyModal, setEditPropertyModal] = useState(false);
  const [propertyForm, setPropertyForm] = useState<any>({});
  const [editingBorrowerName, setEditingBorrowerName] = useState(false);
  const [borrowerNameValue, setBorrowerNameValue] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Trustee editing states
  const [editingTrusteeName, setEditingTrusteeName] = useState(false);
  const [trusteeNameValue, setTrusteeNameValue] = useState('');
  const [editingTrusteeCompany, setEditingTrusteeCompany] = useState(false);
  const [trusteeCompanyValue, setTrusteeCompanyValue] = useState('');
  const [editingTrusteeAddress, setEditingTrusteeAddress] = useState(false);
  const [trusteeAddressForm, setTrusteeAddressForm] = useState({
    street: '',
    city: '',
    state: '',
    zip: ''
  });
  const [editingTrusteePhone, setEditingTrusteePhone] = useState(false);
  const [trusteePhoneValue, setTrusteePhoneValue] = useState('');
  const [editingTrusteeEmail, setEditingTrusteeEmail] = useState(false);
  const [trusteeEmailValue, setTrusteeEmailValue] = useState('');
  
  // Escrow editing states
  const [editingEscrowCompany, setEditingEscrowCompany] = useState(false);
  const [escrowCompanyValue, setEscrowCompanyValue] = useState('');
  const [editingEscrowNumber, setEditingEscrowNumber] = useState(false);
  const [escrowNumberValue, setEscrowNumberValue] = useState('');
  const [editingEscrowAddress, setEditingEscrowAddress] = useState(false);
  const [escrowAddressForm, setEscrowAddressForm] = useState({
    street: '',
    city: '',
    state: '',
    zip: ''
  });
  const [editingEscrowPhone, setEditingEscrowPhone] = useState(false);
  const [escrowPhoneValue, setEscrowPhoneValue] = useState('');
  const [editingEscrowEmail, setEditingEscrowEmail] = useState(false);
  const [escrowEmailValue, setEscrowEmailValue] = useState('');

  // Initialize profile photo from loan data
  useEffect(() => {
    if (loanData?.borrowerPhoto) {
      setProfilePhoto(loanData.borrowerPhoto);
    }
  }, [loanData?.borrowerPhoto]);
  
  // Initialize trustee data from loan data
  useEffect(() => {
    if (loanData) {
      setTrusteeNameValue(loanData.trusteeName || '');
      setTrusteeCompanyValue(loanData.trusteeCompanyName || '');
      setTrusteePhoneValue(loanData.trusteePhone || '');
      setTrusteeEmailValue(loanData.trusteeEmail || '');
      setTrusteeAddressForm({
        street: loanData.trusteeStreetAddress || '',
        city: loanData.trusteeCity || '',
        state: loanData.trusteeState || '',
        zip: loanData.trusteeZipCode || ''
      });
    }
  }, [loanData]);
  
  // Initialize escrow data from loan data
  useEffect(() => {
    if (loanData) {
      setEscrowCompanyValue(loanData.escrowCompanyName || '');
      setEscrowNumberValue(loanData.escrowNumber || '');
      setEscrowPhoneValue(loanData.escrowCompanyPhone || '');
      setEscrowEmailValue(loanData.escrowCompanyEmail || '');
      setEscrowAddressForm({
        street: loanData.escrowCompanyStreetAddress || '',
        city: loanData.escrowCompanyCity || '',
        state: loanData.escrowCompanyState || '',
        zip: loanData.escrowCompanyZipCode || ''
      });
    }
  }, [loanData]);

  // Initialize forms when modals open
  useEffect(() => {
    if (editLoanTermsModal && loanData) {
      setLoanTermsForm({
        originalAmount: loanData.originalAmount || '',
        principalBalance: loanData.principalBalance || '',
        interestRate: loanData.interestRate || '',
        loanTerm: loanData.loanTerm || '',
        paymentFrequency: loanData.paymentFrequency || 'monthly',
        firstPaymentDate: loanData.firstPaymentDate || '',
        maturityDate: loanData.maturityDate || ''
      });
    }
  }, [editLoanTermsModal, loanData]);

  useEffect(() => {
    if (editPropertyModal && loanData) {
      setPropertyForm({
        propertyAddress: loanData.propertyAddress || '',
        propertyCity: loanData.propertyCity || '',
        propertyState: loanData.propertyState || '',
        propertyZip: loanData.propertyZip || '',
        propertyType: loanData.propertyType || '',
        propertyValue: loanData.propertyValue || '',
        downPayment: loanData.downPayment || '',
        parcelNumber: loanData.parcelNumber || '',
        legalDescription: loanData.legalDescription || ''
      });
    }
  }, [editPropertyModal, loanData]);

  useEffect(() => {
    if (editServicingModal && loanData) {
      setServicingForm({
        servicingFee: loanData.servicingFee || '',
        servicingFeeType: loanData.servicingFeeType || 'percentage',
        lateCharge: loanData.lateCharge || '',
        lateChargeType: loanData.lateChargeType || 'fixed',
        gracePeriodDays: loanData.gracePeriodDays || '',
        feePayer: loanData.feePayer || '',
        investorLoanNumber: loanData.investorLoanNumber || '',
        poolNumber: loanData.poolNumber || '',
        prepaymentPenalty: loanData.prepaymentPenalty || false,
        prepaymentPenaltyAmount: loanData.prepaymentPenaltyAmount || '',
        prepaymentExpirationDate: loanData.prepaymentExpirationDate || ''
      });
    }
  }, [editServicingModal, loanData]);

  // Initialize borrower name
  useEffect(() => {
    if (loanData?.borrowerName) {
      setBorrowerNameValue(loanData.borrowerName);
    }
  }, [loanData?.borrowerName]);

  // Initialize contact data from loanData
  useEffect(() => {
    if (!loanData) return;
    
    // Use utility functions to parse phone and email data
    const phones = getPhonesFromLoan(loanData);
    setPhoneNumbers(phones);

    const emails = getEmailsFromLoan(loanData);
    setEmailAddresses(emails);
  }, [loanData]);

  // Helper function to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);
  };

  // Save loan terms
  const saveLoanTerms = async () => {
    try {
      await apiRequest(`/api/loans/${loanId}`, {
        method: 'PATCH',
        body: loanTermsForm
      });
      toast({
        title: 'Success',
        description: 'Loan terms updated successfully'
      });
      setEditLoanTermsModal(false);
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update loan terms',
        variant: 'destructive'
      });
    }
  };

  // Save servicing settings
  const saveServicingSettings = async () => {
    try {
      await apiRequest(`/api/loans/${loanId}`, {
        method: 'PATCH',
        body: servicingForm
      });
      toast({
        title: 'Success',
        description: 'Servicing settings updated successfully'
      });
      setEditServicingModal(false);
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update servicing settings',
        variant: 'destructive'
      });
    }
  };

  // Save property information
  const saveProperty = async () => {
    try {
      await apiRequest(`/api/loans/${loanId}`, {
        method: 'PATCH',
        body: propertyForm
      });
      toast({
        title: 'Success',
        description: 'Property information updated successfully'
      });
      setEditPropertyModal(false);
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update property information',
        variant: 'destructive'
      });
    }
  };

  // Save borrower name
  const saveBorrowerName = async () => {
    try {
      await apiRequest(`/api/loans/${loanId}`, {
        method: 'PATCH',
        body: { borrowerName: borrowerNameValue }
      });
      toast({
        title: 'Success',
        description: 'Borrower name updated successfully'
      });
      setEditingBorrowerName(false);
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update borrower name',
        variant: 'destructive'
      });
    }
  };
  
  // Save trustee information
  const saveTrusteeName = async () => {
    try {
      await apiRequest(`/api/loans/${loanId}`, {
        method: 'PATCH',
        body: { trusteeName: trusteeNameValue }
      });
      toast({ title: 'Success', description: 'Trustee name updated' });
      setEditingTrusteeName(false);
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };
  
  const saveTrusteeCompany = async () => {
    try {
      await apiRequest(`/api/loans/${loanId}`, {
        method: 'PATCH',
        body: { trusteeCompanyName: trusteeCompanyValue }
      });
      toast({ title: 'Success', description: 'Company updated' });
      setEditingTrusteeCompany(false);
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };
  
  const saveTrusteeAddress = async () => {
    try {
      await apiRequest(`/api/loans/${loanId}`, {
        method: 'PATCH',
        body: {
          trusteeStreetAddress: trusteeAddressForm.street,
          trusteeCity: trusteeAddressForm.city,
          trusteeState: trusteeAddressForm.state,
          trusteeZipCode: trusteeAddressForm.zip
        }
      });
      toast({ title: 'Success', description: 'Address updated' });
      setEditingTrusteeAddress(false);
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };
  
  const saveTrusteePhone = async () => {
    try {
      await apiRequest(`/api/loans/${loanId}`, {
        method: 'PATCH',
        body: { trusteePhone: trusteePhoneValue }
      });
      toast({ title: 'Success', description: 'Phone updated' });
      setEditingTrusteePhone(false);
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };
  
  const saveTrusteeEmail = async () => {
    try {
      await apiRequest(`/api/loans/${loanId}`, {
        method: 'PATCH',
        body: { trusteeEmail: trusteeEmailValue }
      });
      toast({ title: 'Success', description: 'Email updated' });
      setEditingTrusteeEmail(false);
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };
  
  // Save escrow information
  const saveEscrowCompany = async () => {
    try {
      await apiRequest(`/api/loans/${loanId}`, {
        method: 'PATCH',
        body: { escrowCompanyName: escrowCompanyValue }
      });
      toast({ title: 'Success', description: 'Escrow company updated' });
      setEditingEscrowCompany(false);
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };
  
  const saveEscrowNumber = async () => {
    try {
      await apiRequest(`/api/loans/${loanId}`, {
        method: 'PATCH',
        body: { escrowNumber: escrowNumberValue }
      });
      toast({ title: 'Success', description: 'Escrow number updated' });
      setEditingEscrowNumber(false);
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };
  
  const saveEscrowAddress = async () => {
    try {
      await apiRequest(`/api/loans/${loanId}`, {
        method: 'PATCH',
        body: {
          escrowCompanyStreetAddress: escrowAddressForm.street,
          escrowCompanyCity: escrowAddressForm.city,
          escrowCompanyState: escrowAddressForm.state,
          escrowCompanyZipCode: escrowAddressForm.zip
        }
      });
      toast({ title: 'Success', description: 'Address updated' });
      setEditingEscrowAddress(false);
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };
  
  const saveEscrowPhone = async () => {
    try {
      await apiRequest(`/api/loans/${loanId}`, {
        method: 'PATCH',
        body: { escrowCompanyPhone: escrowPhoneValue }
      });
      toast({ title: 'Success', description: 'Phone updated' });
      setEditingEscrowPhone(false);
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };
  
  const saveEscrowEmail = async () => {
    try {
      await apiRequest(`/api/loans/${loanId}`, {
        method: 'PATCH',
        body: { escrowCompanyEmail: escrowEmailValue }
      });
      toast({ title: 'Success', description: 'Email updated' });
      setEditingEscrowEmail(false);
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };

  // Generate Gravatar URL using proper MD5 hash
  const getGravatarUrl = (email: string, size: number = 80) => {
    if (!email) return null;
    // Use crypto-js MD5 for proper hashing
    const hash = MD5(email.trim().toLowerCase()).toString();
    return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=mp`;
  };

  // Get profile photo URL (custom or Gravatar)
  const getProfilePhotoUrl = () => {
    if (profilePhoto) {
      return profilePhoto;
    }
    if (loanData?.borrowerPhoto) {
      return loanData.borrowerPhoto;
    }
    // Use first email address for Gravatar
    const email = emailAddresses[0]?.email || loanData?.borrowerEmail;
    if (email) {
      return getGravatarUrl(email, 200);
    }
    return null;
  };

  // Handle profile photo upload
  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a JPG, PNG, GIF or WebP image',
        variant: 'destructive'
      });
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload an image smaller than 5MB',
        variant: 'destructive'
      });
      return;
    }

    // Convert to base64
    setUploadingPhoto(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      
      try {
        const response = await fetch(`/api/loans/${loanId}/profile-photo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ photoUrl: base64 }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Upload failed with status ${response.status}`);
        }

        const data = await response.json();
        setProfilePhoto(base64);
        
        // Invalidate query to refresh loan data
        queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
        
        toast({
          title: 'Success',
          description: 'Profile photo updated successfully'
        });
      } catch (error: any) {
        console.error('Profile photo upload error:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to upload profile photo',
          variant: 'destructive'
        });
      } finally {
        setUploadingPhoto(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Fetch CRM data
  const { data: notes = [], isLoading: notesLoading } = useQuery<any[]>({
    queryKey: [`/api/loans/${loanId}/crm/notes`],
  });



  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery<any[]>({
    queryKey: [`/api/loans/${loanId}/crm/appointments`],
  });

  const { data: calls = [], isLoading: callsLoading } = useQuery<any[]>({
    queryKey: [`/api/loans/${loanId}/crm/calls`],
  });

  const { data: activity = [], isLoading: activityLoading } = useQuery<any[]>({
    queryKey: [`/api/loans/${loanId}/crm/activity`],
    queryFn: async () => {
      const response = await fetch(`/api/loans/${loanId}/crm/activity`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch activity');
      const data = await response.json();
      console.log('Activity data fetched:', data);
      console.log('Email activities:', data.filter((a: any) => a.activityType === 'email'));
      return data;
    }
  });

  const { data: collaborators = [], isLoading: collaboratorsLoading } = useQuery<any[]>({
    queryKey: [`/api/loans/${loanId}/crm/collaborators`],
  });

  // Initialize To field with borrower's email when switching to email tab
  useEffect(() => {
    if (communicationType === 'email' && emailAddresses.length > 0 && !emailTo) {
      // Use the first email address from the parsed data
      const firstEmail = emailAddresses.find(e => e.email)?.email;
      if (firstEmail) {
        setEmailTo(firstEmail);
      }
    }
    // Initialize SMS To field with primary phone when switching to text tab
    if (communicationType === 'text' && phoneNumbers.length > 0 && !smsTo) {
      const primaryPhone = phoneNumbers.find(p => !p.isBad)?.number || phoneNumbers[0]?.number;
      if (primaryPhone) {
        setSmsTo(primaryPhone);
      }
    }
  }, [communicationType, emailAddresses, phoneNumbers]);

  // Mutations
  const createNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest(`/api/loans/${loanId}/crm/notes`, {
        method: 'POST',
        body: { content },  // Don't stringify here, apiRequest will handle it
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/crm/notes`] });
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/crm/activity`] });
      setNewNoteContent('');
      toast({ title: 'Success', description: 'Note added successfully' });
    },
  });

  // Update contact info mutation
  const updateContactInfoMutation = useMutation({
    mutationFn: async (contactInfo: { phones?: any[], emails?: any[] }) => {
      const response = await apiRequest(`/api/loans/${loanId}/contact-info`, {
        method: 'PATCH',
        body: JSON.stringify(contactInfo),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
      toast({ title: 'Success', description: 'Contact information updated successfully' });
    },
  });





  const createTextMutation = useMutation({
    mutationFn: async (textData: { message: string; recipients: string[]; scheduled?: string }) => {
      console.log('Sending text message:', textData);
      
      // Send SMS to each recipient
      const promises = textData.recipients.map(recipient => 
        apiRequest(`/api/loans/${loanId}/sms`, {
          method: 'POST',
          body: JSON.stringify({
            to: recipient,
            message: textData.message,
            scheduled: textData.scheduled
          }),
        })
      );
      
      const responses = await Promise.all(promises);
      const results = await Promise.all(responses.map(r => r.json()));
      console.log('SMS sent:', results);
      return results;
    },
    onSuccess: async () => {
      console.log('SMS sent successfully, invalidating queries...');
      // Force immediate refetch of activity timeline
      await queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/crm/activity`] });
      await queryClient.refetchQueries({ queryKey: [`/api/loans/${loanId}/crm/activity`] });
      
      setTextMessage('');
      setSmsTo('');
      setSmsScheduledTime(null);
      toast({ title: 'Success', description: 'SMS message sent' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to send SMS',
        variant: 'destructive'
      });
    }
  });

  const createCallMutation = useMutation({
    mutationFn: async (call: any) => {
      console.log('Creating call log:', call);
      const response = await apiRequest(`/api/loans/${loanId}/crm/calls`, {
        method: 'POST',
        body: JSON.stringify(call),
      });
      const result = await response.json();
      console.log('Call created:', result);
      return result;
    },
    onSuccess: async () => {
      console.log('Call logged successfully, invalidating queries...');
      // Force immediate refetch of activity timeline
      await queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/crm/calls`] });
      await queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/crm/activity`] });
      await queryClient.refetchQueries({ queryKey: [`/api/loans/${loanId}/crm/activity`] });
      
      setNewCallNotes('');
      setCallDuration('');
      setCallOutcome('');
      toast({ title: 'Success', description: 'Call logged successfully' });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (emailData: { to: string; cc?: string; bcc?: string; subject: string; content: string; attachments?: any[] }) => {
      console.log('Sending email with data:', emailData);
      console.log('Attachments:', emailData.attachments);
      
      // If we have attachments with files (uploaded), we need to use FormData
      const hasUploadedFiles = emailData.attachments?.some(a => a.file);
      
      console.log('Has uploaded files:', hasUploadedFiles);
      
      if (hasUploadedFiles) {
        const formData = new FormData();
        formData.append('to', emailData.to);
        if (emailData.cc) formData.append('cc', emailData.cc);
        if (emailData.bcc) formData.append('bcc', emailData.bcc);
        formData.append('subject', emailData.subject);
        formData.append('content', emailData.content);
        
        // Add document IDs
        const docIds = emailData.attachments?.filter(a => a.id).map(a => a.id) || [];
        if (docIds.length > 0) {
          formData.append('documentIds', JSON.stringify(docIds));
          console.log('Document IDs being sent:', docIds);
        }
        
        // Add uploaded files
        let fileCount = 0;
        emailData.attachments?.forEach(attachment => {
          if (attachment.file) {
            formData.append('files', attachment.file, attachment.name);
            fileCount++;
            console.log(`Added file to FormData: ${attachment.name}`);
          }
        });
        console.log(`Total files added to FormData: ${fileCount}`);
        
        console.log('Sending FormData request to:', `/api/loans/${loanId}/crm/send-email`);
        const response = await fetch(`/api/loans/${loanId}/crm/send-email`, {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
        
        if (!response.ok) {
          const error = await response.text();
          console.error('Email send error:', error);
          throw new Error(error);
        }
        
        const result = await response.json();
        console.log('Email send result:', result);
        return result;
      } else {
        // Standard JSON request if no uploaded files
        console.log('Sending JSON request (no uploaded files)');
        const response = await apiRequest(`/api/loans/${loanId}/crm/send-email`, {
          method: 'POST',
          body: {
            ...emailData,
            documentIds: emailData.attachments?.filter(a => a.id).map(a => a.id)
          }
        });
        const result = await response.json();
        console.log('Email send result:', result);
        return result;
      }
    },
    onSuccess: async (result) => {
      console.log('Email sent successfully, result:', result);
      
      // Force immediate refetch of activity timeline
      console.log('Invalidating and refetching activity...');
      await queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/crm/activity`] });
      await queryClient.refetchQueries({ queryKey: [`/api/loans/${loanId}/crm/activity`] });
      
      setEmailTo('');
      setEmailCc('');
      setEmailBcc('');
      setEmailSubject('');
      setEmailContent('');
      setEmailAttachments([]);
      setShowCc(false);
      setShowBcc(false);
      
      const attachmentText = result?.attachmentCount > 0 
        ? ` with ${result.attachmentCount} attachment${result.attachmentCount > 1 ? 's' : ''}` 
        : '';
      toast({ title: 'Success', description: `Email sent successfully${attachmentText}` });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to send email',
        variant: 'destructive'
      });
    }
  });

  const handleAddNote = () => {
    if (newNoteContent.trim()) {
      createNoteMutation.mutate(newNoteContent);
    }
  };





  const handleSendEmail = () => {
    if (emailTo && emailSubject && emailContent) {
      sendEmailMutation.mutate({
        to: emailTo,
        cc: emailCc || undefined,
        bcc: emailBcc || undefined,
        subject: emailSubject,
        content: emailContent,
        attachments: emailAttachments
      });
    }
  };

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffInMs = now.getTime() - then.getTime();
    const diffInMins = Math.floor(diffInMs / 60000);
    const diffInHours = Math.floor(diffInMs / 3600000);
    const diffInDays = Math.floor(diffInMs / 86400000);

    if (diffInMins < 1) return 'just now';
    if (diffInMins < 60) return `${diffInMins} min ago`;
    if (diffInHours < 24) return `${diffInHours} hours ago`;
    if (diffInDays < 7) return `${diffInDays} days ago`;
    return format(then, 'MMM dd, yyyy');
  };

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Left Column - Borrower Info, Payment Breakdown and Info Cards */}
      <div className="col-span-3 space-y-6">
        {/* Borrower Information Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3 mb-3">
              <div className="relative">
                <Avatar 
                  className={`h-12 w-12 cursor-pointer hover:opacity-80 transition-opacity ${uploadingPhoto ? 'opacity-50' : ''}`}
                  onClick={() => !uploadingPhoto && fileInputRef.current?.click()}
                  title={uploadingPhoto ? "Uploading..." : "Click to upload profile photo"}
                >
                  {getProfilePhotoUrl() ? (
                    <img 
                      src={getProfilePhotoUrl() || ''} 
                      alt={loanData?.borrowerName || 'Profile'} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <AvatarFallback className="text-sm font-normal">
                      {loanData?.borrowerName?.split(' ').map((n: string) => n[0]).join('') || 'N/A'}
                    </AvatarFallback>
                  )}
                </Avatar>
                {uploadingPhoto && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </div>
              <div className="flex-1">
                {editingBorrowerName ? (
                  <Input
                    value={borrowerNameValue}
                    onChange={(e) => setBorrowerNameValue(e.target.value)}
                    onBlur={saveBorrowerName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        saveBorrowerName();
                      } else if (e.key === 'Escape') {
                        setBorrowerNameValue(loanData?.borrowerName || '');
                        setEditingBorrowerName(false);
                      }
                    }}
                    className="text-base font-medium h-7 mb-1"
                    autoFocus
                  />
                ) : (
                  <h3 
                    className="text-base font-medium cursor-pointer hover:text-primary transition-colors"
                    onClick={() => setEditingBorrowerName(true)}
                    title="Click to edit"
                  >
                    {loanData?.borrowerName || 'Unknown Borrower'}
                  </h3>
                )}
                <p className="text-xs text-muted-foreground">
                  {loanData?.lastPaymentDate ? 
                    `Last payment: ${format(new Date(loanData.lastPaymentDate), 'MMM dd, yyyy')}` : 
                    'No communication yet'}
                </p>
              </div>
            </div>
            
            {/* Contact Information */}
            <div className="space-y-2 border-t pt-3">
              {/* Phone Numbers */}
              {phoneNumbers.some(p => p.number) ? (
                <>
                  {phoneNumbers.filter(p => p.number).map((phone, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between text-xs group cursor-pointer hover:bg-muted/20 px-1 py-0.5 rounded transition-colors"
                      onMouseEnter={() => setHoveredContact(`phone${index}`)}
                      onMouseLeave={() => setHoveredContact(null)}
                    >
                      <div className="flex items-center space-x-2">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <span className={`font-normal ${phone.isBad ? 'text-red-500 line-through' : 'text-muted-foreground'}`}>
                          {phone.number}
                        </span>
                        {phone.label && (
                          <span className="text-xs text-muted-foreground">({phone.label})</span>
                        )}
                      </div>
                      {hoveredContact === `phone${index}` && (
                        <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-5 w-5 p-0"
                            onClick={() => setEditPhoneModal(true)}
                          >
                            <Edit className="h-3 w-3 text-muted-foreground" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-5 w-5 p-0"
                            onClick={() => setEditPhoneModal(true)}
                          >
                            <Plus className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              ) : (
                <button 
                  className="flex items-center space-x-2 text-xs text-primary hover:underline"
                  onClick={() => setEditPhoneModal(true)}
                >
                  <Phone className="h-3 w-3" />
                  <span>Add phone</span>
                </button>
              )}
              
              {/* Email */}
              {emailAddresses.some(e => e.email) ? (
                <>
                  {emailAddresses.filter(e => e.email).map((emailObj, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between text-xs group cursor-pointer hover:bg-muted/20 px-1 py-0.5 rounded transition-colors"
                      onMouseEnter={() => setHoveredContact(`email${index}`)}
                      onMouseLeave={() => setHoveredContact(null)}
                    >
                      <div className="flex items-center space-x-2">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground font-normal truncate">{emailObj.email}</span>
                        {emailObj.label && (
                          <span className="text-xs text-muted-foreground">({emailObj.label})</span>
                        )}
                      </div>
                      {hoveredContact === `email${index}` && (
                        <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-5 w-5 p-0"
                            onClick={() => setEditEmailModal(true)}
                          >
                            <Edit className="h-3 w-3 text-muted-foreground" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-5 w-5 p-0"
                            onClick={() => setEditEmailModal(true)}
                          >
                            <Plus className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              ) : (
                <button 
                  className="flex items-center space-x-2 text-xs text-primary hover:underline"
                  onClick={() => setEditEmailModal(true)}
                >
                  <Mail className="h-3 w-3" />
                  <span>Add email</span>
                </button>
              )}
              

            </div>
          </CardContent>
        </Card>

        {/* Property Information Card */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
                <MapPin className="h-3 w-3" />
                Property
              </CardTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0"
                onClick={() => setEditPropertyModal(true)}
              >
                <Edit className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Property Address */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Address</label>
              <div className="text-sm">
                {loanData?.propertyAddress ? (
                  <div>
                    <p>{loanData.propertyAddress}</p>
                    {loanData.propertyCity && (
                      <p className="text-muted-foreground">
                        {loanData.propertyCity}, {loanData.propertyState} {loanData.propertyZip}
                      </p>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">No address</span>
                )}
              </div>
            </div>

            {/* Property Type */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Property Type</label>
              <p className="text-sm">
                {loanData?.propertyType || <span className="text-muted-foreground">Not specified</span>}
              </p>
            </div>

            {/* Property Value */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Property Value</label>
              <p className="text-sm">
                {loanData?.propertyValue ? 
                  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(loanData.propertyValue)) :
                  <span className="text-muted-foreground">Not specified</span>
                }
              </p>
            </div>

            {/* Down Payment */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Down Payment</label>
              <p className="text-sm">
                {loanData?.downPayment ? 
                  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(loanData.downPayment)) :
                  <span className="text-muted-foreground">Not specified</span>
                }
              </p>
            </div>

            {/* Parcel Number (APN) */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Parcel Number (APN)</label>
              <p className="text-sm">
                {loanData?.parcelNumber || <span className="text-muted-foreground">Not specified</span>}
              </p>
            </div>

            {/* Legal Description */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Legal Description</label>
              <p className="text-sm text-muted-foreground">
                {loanData?.legalDescription || <span className="text-muted-foreground">Not specified</span>}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Trustee Information Card */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
                <User className="h-3 w-3" />
                Trustee
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Trustee Name */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Name</label>
              {editingTrusteeName ? (
                <div className="flex items-center space-x-1">
                  <Input
                    value={trusteeNameValue}
                    onChange={(e) => setTrusteeNameValue(e.target.value)}
                    className="h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveTrusteeName();
                      if (e.key === 'Escape') {
                        setEditingTrusteeName(false);
                        setTrusteeNameValue(loanData?.trusteeName || '');
                      }
                    }}
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={saveTrusteeName}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                    setEditingTrusteeName(false);
                    setTrusteeNameValue(loanData?.trusteeName || '');
                  }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between group">
                  <p className="text-sm font-medium">
                    {trusteeNameValue || <span className="text-muted-foreground">Add trustee name</span>}
                  </p>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => setEditingTrusteeName(true)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Trustee Company */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Company</label>
              {editingTrusteeCompany ? (
                <div className="flex items-center space-x-1">
                  <Input
                    value={trusteeCompanyValue}
                    onChange={(e) => setTrusteeCompanyValue(e.target.value)}
                    className="h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveTrusteeCompany();
                      if (e.key === 'Escape') {
                        setEditingTrusteeCompany(false);
                        setTrusteeCompanyValue(loanData?.trusteeCompanyName || '');
                      }
                    }}
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={saveTrusteeCompany}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                    setEditingTrusteeCompany(false);
                    setTrusteeCompanyValue(loanData?.trusteeCompanyName || '');
                  }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between group">
                  <p className="text-sm">
                    {trusteeCompanyValue || <span className="text-muted-foreground">Add company</span>}
                  </p>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => setEditingTrusteeCompany(true)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Trustee Phone */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Phone</label>
              {editingTrusteePhone ? (
                <div className="flex items-center space-x-1">
                  <Input
                    value={trusteePhoneValue}
                    onChange={(e) => setTrusteePhoneValue(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="(555) 555-5555"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveTrusteePhone();
                      if (e.key === 'Escape') {
                        setEditingTrusteePhone(false);
                        setTrusteePhoneValue(loanData?.trusteePhone || '');
                      }
                    }}
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={saveTrusteePhone}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                    setEditingTrusteePhone(false);
                    setTrusteePhoneValue(loanData?.trusteePhone || '');
                  }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between group">
                  <div className="flex items-center space-x-2">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <p className="text-sm">
                      {trusteePhoneValue || <span className="text-muted-foreground">Add phone</span>}
                    </p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => setEditingTrusteePhone(true)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Trustee Email */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Email</label>
              {editingTrusteeEmail ? (
                <div className="flex items-center space-x-1">
                  <Input
                    value={trusteeEmailValue}
                    onChange={(e) => setTrusteeEmailValue(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="trustee@example.com"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveTrusteeEmail();
                      if (e.key === 'Escape') {
                        setEditingTrusteeEmail(false);
                        setTrusteeEmailValue(loanData?.trusteeEmail || '');
                      }
                    }}
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={saveTrusteeEmail}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                    setEditingTrusteeEmail(false);
                    setTrusteeEmailValue(loanData?.trusteeEmail || '');
                  }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between group">
                  <div className="flex items-center space-x-2">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    <p className="text-sm">
                      {trusteeEmailValue || <span className="text-muted-foreground">Add email</span>}
                    </p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => setEditingTrusteeEmail(true)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Trustee Address */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Address</label>
              {editingTrusteeAddress ? (
                <div className="space-y-2">
                  <Input
                    value={trusteeAddressForm.street}
                    onChange={(e) => setTrusteeAddressForm({...trusteeAddressForm, street: e.target.value})}
                    className="h-8 text-xs"
                    placeholder="Street address"
                  />
                  <div className="flex space-x-2">
                    <Input
                      value={trusteeAddressForm.city}
                      onChange={(e) => setTrusteeAddressForm({...trusteeAddressForm, city: e.target.value})}
                      className="h-8 text-xs flex-1"
                      placeholder="City"
                    />
                    <Input
                      value={trusteeAddressForm.state}
                      onChange={(e) => setTrusteeAddressForm({...trusteeAddressForm, state: e.target.value})}
                      className="h-8 text-xs w-20"
                      placeholder="State"
                      maxLength={2}
                    />
                    <Input
                      value={trusteeAddressForm.zip}
                      onChange={(e) => setTrusteeAddressForm({...trusteeAddressForm, zip: e.target.value})}
                      className="h-8 text-xs w-24"
                      placeholder="ZIP"
                    />
                  </div>
                  <div className="flex justify-end space-x-1">
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={saveTrusteeAddress}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => {
                      setEditingTrusteeAddress(false);
                      setTrusteeAddressForm({
                        street: loanData?.trusteeStreetAddress || '',
                        city: loanData?.trusteeCity || '',
                        state: loanData?.trusteeState || '',
                        zip: loanData?.trusteeZipCode || ''
                      });
                    }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between group">
                  <div className="flex items-start space-x-2">
                    <MapPin className="h-3 w-3 text-muted-foreground mt-0.5" />
                    <div className="text-sm">
                      {trusteeAddressForm.street ? (
                        <div>
                          <p>{trusteeAddressForm.street}</p>
                          {trusteeAddressForm.city && (
                            <p className="text-muted-foreground">
                              {trusteeAddressForm.city}, {trusteeAddressForm.state} {trusteeAddressForm.zip}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Add address</span>
                      )}
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => setEditingTrusteeAddress(true)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Escrow Company Card */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
                <Briefcase className="h-3 w-3" />
                Escrow Company
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Escrow Company Name */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Company Name</label>
              {editingEscrowCompany ? (
                <div className="flex items-center space-x-1">
                  <Input
                    value={escrowCompanyValue}
                    onChange={(e) => setEscrowCompanyValue(e.target.value)}
                    className="h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEscrowCompany();
                      if (e.key === 'Escape') {
                        setEditingEscrowCompany(false);
                        setEscrowCompanyValue(loanData?.escrowCompanyName || '');
                      }
                    }}
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={saveEscrowCompany}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                    setEditingEscrowCompany(false);
                    setEscrowCompanyValue(loanData?.escrowCompanyName || '');
                  }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between group">
                  <p className="text-sm font-medium">
                    {escrowCompanyValue || <span className="text-muted-foreground">Add company name</span>}
                  </p>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => setEditingEscrowCompany(true)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Escrow Number */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Escrow Number</label>
              {editingEscrowNumber ? (
                <div className="flex items-center space-x-1">
                  <Input
                    value={escrowNumberValue}
                    onChange={(e) => setEscrowNumberValue(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="ESC-12345"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEscrowNumber();
                      if (e.key === 'Escape') {
                        setEditingEscrowNumber(false);
                        setEscrowNumberValue(loanData?.escrowNumber || '');
                      }
                    }}
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={saveEscrowNumber}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                    setEditingEscrowNumber(false);
                    setEscrowNumberValue(loanData?.escrowNumber || '');
                  }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between group">
                  <p className="text-sm">
                    {escrowNumberValue || <span className="text-muted-foreground">Add escrow number</span>}
                  </p>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => setEditingEscrowNumber(true)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Escrow Phone */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Phone</label>
              {editingEscrowPhone ? (
                <div className="flex items-center space-x-1">
                  <Input
                    value={escrowPhoneValue}
                    onChange={(e) => setEscrowPhoneValue(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="(555) 555-5555"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEscrowPhone();
                      if (e.key === 'Escape') {
                        setEditingEscrowPhone(false);
                        setEscrowPhoneValue(loanData?.escrowCompanyPhone || '');
                      }
                    }}
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={saveEscrowPhone}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                    setEditingEscrowPhone(false);
                    setEscrowPhoneValue(loanData?.escrowCompanyPhone || '');
                  }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between group">
                  <div className="flex items-center space-x-2">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <p className="text-sm">
                      {escrowPhoneValue || <span className="text-muted-foreground">Add phone</span>}
                    </p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => setEditingEscrowPhone(true)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Escrow Email */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Email</label>
              {editingEscrowEmail ? (
                <div className="flex items-center space-x-1">
                  <Input
                    value={escrowEmailValue}
                    onChange={(e) => setEscrowEmailValue(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="escrow@example.com"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEscrowEmail();
                      if (e.key === 'Escape') {
                        setEditingEscrowEmail(false);
                        setEscrowEmailValue(loanData?.escrowCompanyEmail || '');
                      }
                    }}
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={saveEscrowEmail}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                    setEditingEscrowEmail(false);
                    setEscrowEmailValue(loanData?.escrowCompanyEmail || '');
                  }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between group">
                  <div className="flex items-center space-x-2">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    <p className="text-sm">
                      {escrowEmailValue || <span className="text-muted-foreground">Add email</span>}
                    </p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => setEditingEscrowEmail(true)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Escrow Address */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Address</label>
              {editingEscrowAddress ? (
                <div className="space-y-2">
                  <Input
                    value={escrowAddressForm.street}
                    onChange={(e) => setEscrowAddressForm({...escrowAddressForm, street: e.target.value})}
                    className="h-8 text-xs"
                    placeholder="Street address"
                  />
                  <div className="flex space-x-2">
                    <Input
                      value={escrowAddressForm.city}
                      onChange={(e) => setEscrowAddressForm({...escrowAddressForm, city: e.target.value})}
                      className="h-8 text-xs flex-1"
                      placeholder="City"
                    />
                    <Input
                      value={escrowAddressForm.state}
                      onChange={(e) => setEscrowAddressForm({...escrowAddressForm, state: e.target.value})}
                      className="h-8 text-xs w-20"
                      placeholder="State"
                      maxLength={2}
                    />
                    <Input
                      value={escrowAddressForm.zip}
                      onChange={(e) => setEscrowAddressForm({...escrowAddressForm, zip: e.target.value})}
                      className="h-8 text-xs w-24"
                      placeholder="ZIP"
                    />
                  </div>
                  <div className="flex justify-end space-x-1">
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={saveEscrowAddress}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => {
                      setEditingEscrowAddress(false);
                      setEscrowAddressForm({
                        street: loanData?.escrowCompanyStreetAddress || '',
                        city: loanData?.escrowCompanyCity || '',
                        state: loanData?.escrowCompanyState || '',
                        zip: loanData?.escrowCompanyZipCode || ''
                      });
                    }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between group">
                  <div className="flex items-start space-x-2">
                    <MapPin className="h-3 w-3 text-muted-foreground mt-0.5" />
                    <div className="text-sm">
                      {escrowAddressForm.street ? (
                        <div>
                          <p>{escrowAddressForm.street}</p>
                          {escrowAddressForm.city && (
                            <p className="text-muted-foreground">
                              {escrowAddressForm.city}, {escrowAddressForm.state} {escrowAddressForm.zip}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Add address</span>
                      )}
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => setEditingEscrowAddress(true)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle Column - Main Content Area */}
      <div className="col-span-6 space-y-6">
        {/* Notes Section */}
        <Card>
          <CardHeader className="pb-3 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <MessageSquare className="h-3 w-3" />
                <CardTitle className="text-xs font-medium">Notes</CardTitle>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs">
                <Filter className="h-3 w-3 mr-1" />
                Filter
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Communication Type Tabs */}
            <Tabs value={communicationType} onValueChange={setCommunicationType} className="mb-3">
              <TabsList className="grid w-full grid-cols-4 h-8">
                <TabsTrigger value="note" className="text-xs">
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Create Note
                </TabsTrigger>
                <TabsTrigger value="email" className="text-xs">
                  <Mail className="h-3 w-3 mr-1" />
                  Send Email
                </TabsTrigger>
                <TabsTrigger value="text" className="text-xs">
                  <MessageCircle className="h-3 w-3 mr-1" />
                  Text
                </TabsTrigger>
                <TabsTrigger value="call" className="text-xs">
                  <Phone className="h-3 w-3 mr-1" />
                  Log Call
                </TabsTrigger>
              </TabsList>

              {/* Note Tab Content */}
              <TabsContent value="note" className="mt-3">
                <div className="border rounded-lg p-2">
                  <div className="flex items-center space-x-1 mb-2 border-b pb-1.5">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <Bold className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <Italic className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <Link className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <List className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <Image className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <Paperclip className="h-3 w-3" />
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Add notes or type @name to notify"
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    className="min-h-[80px] border-0 p-0 focus:ring-0 text-xs"
                  />
                  <div className="flex justify-between items-center mt-2">
                    <div className="text-xs text-muted-foreground">
                      My Team Members
                    </div>
                    <Button 
                      onClick={handleAddNote}
                      disabled={!newNoteContent.trim() || createNoteMutation.isPending}
                      size="sm"
                      className="h-7 text-xs"
                    >
                      <Send className="h-3 w-3 mr-1" />
                      Send Note
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Email Tab Content */}
              <TabsContent value="email" className="mt-4">
                <div className="border rounded-lg p-3 space-y-3">
                  {/* To Field */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium">To:</label>
                      <div className="space-x-2">
                        {!showCc && (
                          <button
                            onClick={() => setShowCc(true)}
                            className="text-xs text-primary hover:underline"
                          >
                            CC
                          </button>
                        )}
                        {!showBcc && (
                          <button
                            onClick={() => setShowBcc(true)}
                            className="text-xs text-primary hover:underline"
                          >
                            BCC
                          </button>
                        )}
                      </div>
                    </div>
                    <Input
                      placeholder="recipient@example.com"
                      value={emailTo}
                      onChange={(e) => setEmailTo(e.target.value)}
                      className="text-xs"
                    />
                  </div>

                  {/* CC Field */}
                  {showCc && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium">CC:</label>
                      <Input
                        placeholder="cc@example.com (separate multiple with commas)"
                        value={emailCc}
                        onChange={(e) => setEmailCc(e.target.value)}
                        className="text-xs"
                      />
                    </div>
                  )}
                  
                  {/* BCC Field */}
                  {showBcc && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium">BCC:</label>
                      <Input
                        placeholder="bcc@example.com (separate multiple with commas)"
                        value={emailBcc}
                        onChange={(e) => setEmailBcc(e.target.value)}
                        className="text-xs"
                      />
                    </div>
                  )}

                  {/* Subject Field */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Subject:</label>
                    <Input
                      placeholder="Email subject"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="text-xs"
                    />
                  </div>

                  {/* Email Content with Rich Text Editor */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Message:</label>
                    <div className="border rounded-lg">
                      <div className="flex items-center space-x-1 p-2 border-b">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <Bold className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <Italic className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <Link className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <List className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <Image className="h-3 w-3" />
                        </Button>
                      </div>
                      <Textarea
                        placeholder="Email content..."
                        value={emailContent}
                        onChange={(e) => setEmailContent(e.target.value)}
                        className="min-h-[150px] text-xs border-0 focus:ring-0"
                      />
                    </div>
                  </div>

                  {/* Attachments, Templates and Action Buttons on same line */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => setShowAttachmentModal(true)}
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2"
                      >
                        <Paperclip className="h-3 w-3 mr-1" />
                        Attachments
                      </Button>
                      <Button
                        onClick={() => setShowTemplatesModal(true)}
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2"
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        Templates
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          // Clear all email fields
                          setEmailTo('');
                          setEmailCc('');
                          setEmailBcc('');
                          setEmailSubject('');
                          setEmailContent('');
                          setEmailAttachments([]);
                        }}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                      
                      <div className="flex-1" />
                      
                      <Button 
                        onClick={handleSendEmail}
                        disabled={!emailTo || !emailSubject || !emailContent || sendEmailMutation.isPending}
                        size="sm"
                        className="h-7 text-xs"
                      >
                        {sendEmailMutation.isPending ? 'Sending...' : 'Send Email'}
                      </Button>
                      <Button
                        onClick={() => {
                          // Schedule send functionality
                          toast({
                            title: 'Scheduled Send',
                            description: 'Email scheduled for later delivery'
                          });
                        }}
                        disabled={!emailTo || !emailSubject || !emailContent}
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title="Schedule"
                      >
                        <Clock className="h-3 w-3" />
                      </Button>
                    </div>
                    
                    {emailAttachments.length > 0 && (
                      <div className="border rounded-md p-2 space-y-1">
                        {emailAttachments.map((attachment, index) => (
                          <div key={index} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                            <div className="flex items-center space-x-2">
                              <FileText className="h-3 w-3 text-muted-foreground" />
                              <span className="truncate max-w-[200px]">{attachment.name}</span>
                              {attachment.size && (
                                <span className="text-muted-foreground">
                                  ({(attachment.size / 1024).toFixed(1)} KB)
                                </span>
                              )}
                            </div>
                            <Button
                              onClick={() => setEmailAttachments(prev => prev.filter((_, i) => i !== index))}
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Text Tab Content */}
              <TabsContent value="text" className="mt-4">
                <div className="border rounded-lg p-3 space-y-3">
                  {/* To Field */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium">To:</label>
                    <Input
                      placeholder="+1234567890 (separate multiple with comma or semicolon)"
                      value={smsTo}
                      onChange={(e) => setSmsTo(e.target.value)}
                      className="text-xs"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter phone numbers separated by comma or semicolon
                    </p>
                  </div>

                  {/* Message Field */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Message:</label>
                    <Textarea
                      placeholder="Type your SMS message (160 characters max for single SMS)..."
                      value={textMessage}
                      onChange={(e) => setTextMessage(e.target.value)}
                      className="min-h-[100px]"
                      maxLength={1000}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{textMessage.length}/1000 characters</span>
                      {textMessage.length > 160 && (
                        <span>Will be sent as {Math.ceil(textMessage.length / 160)} SMS messages</span>
                      )}
                    </div>
                  </div>

                  {/* Templates, Delete and Action Buttons */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => setShowSmsTemplatesModal(true)}
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2"
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        Templates
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          // Clear all SMS fields
                          setSmsTo('');
                          setTextMessage('');
                          setSmsScheduledTime(null);
                        }}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                      
                      <div className="flex-1" />
                      
                      <Button 
                        onClick={() => {
                          if (textMessage.trim() && smsTo.trim()) {
                            // Parse multiple recipients
                            const recipients = smsTo
                              .split(/[,;]/)
                              .map(r => r.trim())
                              .filter(r => r);
                            
                            createTextMutation.mutate({
                              message: textMessage,
                              recipients,
                              scheduled: smsScheduledTime || undefined
                            });
                          }
                        }}
                        disabled={!smsTo || !textMessage || createTextMutation.isPending}
                        size="sm"
                        className="h-7 text-xs"
                      >
                        {createTextMutation.isPending ? 'Sending...' : 'Send SMS'}
                      </Button>
                      <Button
                        onClick={() => {
                          // Schedule send functionality
                          const scheduledTime = prompt('Enter time to send (e.g., "in 1 hour" or "tomorrow at 3pm")');
                          if (scheduledTime) {
                            setSmsScheduledTime(scheduledTime);
                            toast({
                              title: 'SMS Scheduled',
                              description: `SMS scheduled for ${scheduledTime}`
                            });
                          }
                        }}
                        disabled={!smsTo || !textMessage}
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title="Schedule"
                      >
                        <Clock className="h-3 w-3" />
                      </Button>
                    </div>

                    {smsScheduledTime && (
                      <div className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                        <span className="text-muted-foreground">
                          Scheduled for: {smsScheduledTime}
                        </span>
                        <Button
                          onClick={() => setSmsScheduledTime(null)}
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    
                    {/* SMS Delivery Notice */}
                    {createTextMutation.isSuccess && (
                      <div className="text-xs bg-yellow-50 border border-yellow-200 rounded p-2 mt-2">
                        <p className="font-medium text-yellow-800">⚠️ SMS Configuration Required</p>
                        <p className="text-yellow-700 mt-1">
                          SMS sent to provider but may not be delivered. Please check:
                        </p>
                        <ul className="list-disc list-inside text-yellow-700 mt-1 space-y-0.5">
                          <li>Twilio phone number configuration</li>
                          <li>A2P 10DLC registration status</li>
                          <li>Recipient number verification</li>
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Log Call Tab Content */}
              <TabsContent value="call" className="mt-4">
                <div className="border rounded-lg p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="Duration (minutes)"
                      value={callDuration}
                      onChange={(e) => setCallDuration(e.target.value)}
                    />
                    <Select value={callOutcome} onValueChange={setCallOutcome}>
                      <SelectTrigger>
                        <SelectValue placeholder="Call outcome" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="answered">Answered</SelectItem>
                        <SelectItem value="voicemail">Voicemail</SelectItem>
                        <SelectItem value="no_answer">No Answer</SelectItem>
                        <SelectItem value="busy">Busy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Textarea
                    placeholder="Call notes..."
                    value={newCallNotes}
                    onChange={(e) => setNewCallNotes(e.target.value)}
                    className="min-h-[100px]"
                  />
                  <div className="flex justify-end">
                    <Button onClick={() => {
                      if (newCallNotes.trim()) {
                        createCallMutation.mutate({
                          contactName: loanData?.borrowerName || 'Borrower',
                          contactPhone: phoneNumbers[0]?.number || emailTo || '',
                          direction: 'outbound',
                          status: 'completed',
                          duration: callDuration || '0',
                          outcome: callOutcome || 'answered',
                          notes: newCallNotes
                        });
                      }
                    }}>
                      <Phone className="h-4 w-4 mr-2" />
                      Log Call
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Activity List (All Types) */}
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {activity.map((item: any) => {
                  // Get description based on activity type
                  let description = '';
                  let icon = null;
                  
                  if (item.activityType === 'email') {
                    description = `Sent email: ${item.activityData?.subject || 'No subject'}`;
                    icon = <Mail className="h-4 w-4 text-blue-500" />;
                  } else if (item.activityType === 'call') {
                    description = item.activityData?.description || 'Call logged';
                    icon = <Phone className="h-4 w-4 text-green-500" />;
                  } else if (item.activityType === 'text') {
                    description = `Text: ${item.activityData?.message || 'Message sent'}`;
                    icon = <MessageCircle className="h-4 w-4 text-purple-500" />;
                  } else if (item.activityType === 'note') {
                    description = item.activityData?.description || item.content || 'Note added';
                    icon = <MessageSquare className="h-4 w-4 text-gray-500" />;
                  } else if (item.activityType === 'contact_update') {
                    description = item.activityData?.description || 'Updated contact information';
                    icon = <Edit className="h-4 w-4 text-orange-500" />;
                  } else if (item.activityType === 'profile_photo') {
                    description = item.activityData?.description || 'Updated profile photo';
                    icon = <Camera className="h-4 w-4 text-indigo-500" />;
                  } else {
                    description = item.activityData?.description || `Activity: ${item.activityType}`;
                    icon = <Activity className="h-4 w-4 text-gray-500" />;
                  }
                  
                  return (
                    <div key={item.id} className="border-l-2 border-primary pl-4">
                      <div className="flex items-start space-x-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            {item.userName?.split(' ').map((n: string) => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              {icon}
                              <span className="font-medium">{item.userName}</span>
                              <span className="text-sm text-muted-foreground">
                                {formatTimeAgo(item.createdAt)}
                              </span>
                            </div>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="mt-1 text-sm">{description}</div>
                          {item.activityData?.attachmentCount > 0 && (
                            <div className="mt-2 flex items-center space-x-2">
                              <Paperclip className="h-4 w-4" />
                              <span className="text-sm text-muted-foreground">
                                {item.activityData.attachmentCount} attachment(s)
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>


      </div>

      {/* Sidebar - Right Side */}
      {/* Right Column - Payment Breakdown, Activity Timeline and Sidebar */}
      <div className="col-span-3 space-y-6">
        {/* Payment Breakdown Card */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
              <Calculator className="h-3 w-3" />
              Payment Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {calculations ? (() => {
              // Calculate principal and interest separately
              const monthlyRate = (parseFloat(loanData?.interestRate || '0') / 100) / 12;
              const principalBalance = parseFloat(loanData?.principalBalance || loanData?.originalAmount || '0');
              const monthlyInterest = principalBalance * monthlyRate;
              const monthlyPrincipal = (calculations?.principalAndInterest || 0) - monthlyInterest;
              
              // Check for escrow items with values
              const hasHazardInsurance = (calculations.breakdown?.hazardInsurance || 0) > 0;
              const hasPropertyTaxes = (calculations.breakdown?.propertyTaxes || 0) > 0;
              const hasEscrowCushion = (calculations.breakdown?.escrowCushion || 0) > 0;
              const hasHOA = (calculations.breakdown?.hoa || calculations?.hoaFees || 0) > 0;
              const hasPMI = (calculations?.pmi || 0) > 0;
              const hasServicingFee = (calculations?.servicingFee || 0) > 0;
              const hasOtherFees = (calculations.breakdown?.other || 0) > 0;
              const hasAnyEscrow = (calculations?.escrow || 0) > 0;
              
              return (
                <div className="text-xs space-y-1">
                  {/* Escrow Items - only show if non-zero */}
                  {hasHazardInsurance && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-normal">Hazard Insurance:</span>
                      <span className="font-normal">{formatCurrency(calculations.breakdown.hazardInsurance)}</span>
                    </div>
                  )}
                  {hasPropertyTaxes && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-normal">Property Taxes:</span>
                      <span className="font-normal">{formatCurrency(calculations.breakdown.propertyTaxes)}</span>
                    </div>
                  )}
                  {hasEscrowCushion && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-normal">Escrow Cushion:</span>
                      <span className="font-normal">{formatCurrency(calculations.breakdown.escrowCushion)}</span>
                    </div>
                  )}
                  {hasAnyEscrow && (
                    <div className="flex justify-between pt-1 border-t">
                      <span className="text-muted-foreground font-normal">Sub-Total Escrows:</span>
                      <span className="font-normal">{formatCurrency(calculations.escrow)}</span>
                    </div>
                  )}
                  
                  {/* Principal and Interest - separated */}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-normal">+ Principal:</span>
                    <span className="font-normal">{formatCurrency(monthlyPrincipal > 0 ? monthlyPrincipal : 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-normal">+ Interest:</span>
                    <span className="font-normal">{formatCurrency(monthlyInterest > 0 ? monthlyInterest : 0)}</span>
                  </div>
                  
                  {/* Other fees - only show if non-zero */}
                  {hasHOA && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-normal">+ HOA:</span>
                      <span className="font-normal">{formatCurrency(calculations.breakdown?.hoa || calculations.hoaFees)}</span>
                    </div>
                  )}
                  {hasPMI && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-normal">+ PMI:</span>
                      <span className="font-normal">{formatCurrency(calculations.pmi)}</span>
                    </div>
                  )}
                  {hasServicingFee && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-normal">+ Servicing Fee:</span>
                      <span className="font-normal">{formatCurrency(calculations.servicingFee)}</span>
                    </div>
                  )}
                  {hasOtherFees && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-normal">+ Other:</span>
                      <span className="font-normal">{formatCurrency(calculations.breakdown.other)}</span>
                    </div>
                  )}
                  
                  {/* Total */}
                  <div className="flex justify-between pt-1 border-t">
                    <span className="font-medium">Total Payment:</span>
                    <span className="font-medium">{formatCurrency(calculations?.totalMonthlyPayment || 0)}</span>
                  </div>
                </div>
              );
            })() : (
              <div className="text-xs text-muted-foreground">No payment data available</div>
            )}
          </CardContent>
        </Card>

        {/* Loan Terms Card */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
                <FileText className="h-3 w-3" />
                Loan Terms
              </CardTitle>
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-5 w-5 p-0"
                onClick={() => setEditLoanTermsModal(true)}
              >
                <Edit className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground font-normal">Original Amount:</span>
                <span className="font-normal">{formatCurrency(parseFloat(loanData?.originalAmount || '0'))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-normal">Principal Balance:</span>
                <span className="font-normal">{formatCurrency(parseFloat(loanData?.principalBalance || '0'))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-normal">Interest Rate:</span>
                <span className="font-normal">{loanData?.interestRate || '0'}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-normal">Loan Term:</span>
                <span className="font-normal">{loanData?.loanTerm || '0'} months</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-normal">Payment Frequency:</span>
                <span className="font-normal capitalize">{loanData?.paymentFrequency || 'monthly'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-normal">First Payment:</span>
                <span className="font-normal">
                  {loanData?.firstPaymentDate ? format(new Date(loanData.firstPaymentDate), 'MMM dd, yyyy') : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-normal">Maturity Date:</span>
                <span className="font-normal">
                  {loanData?.maturityDate ? format(new Date(loanData.maturityDate), 'MMM dd, yyyy') : 'N/A'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Servicing Settings Card */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
                <Settings className="h-3 w-3" />
                Servicing Settings
              </CardTitle>
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-5 w-5 p-0"
                onClick={() => setEditServicingModal(true)}
              >
                <Edit className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground font-normal">Servicing Fee:</span>
                <span className="font-normal">
                  {loanData?.servicingFee ? 
                    `${loanData?.servicingFeeType === 'percentage' ? `${loanData.servicingFee}%` : formatCurrency(parseFloat(loanData.servicingFee))}` : 
                    'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-normal">Late Charge:</span>
                <span className="font-normal">
                  {loanData?.lateCharge ? 
                    `${loanData?.lateChargeType === 'percentage' ? `${loanData.lateCharge}%` : formatCurrency(parseFloat(loanData.lateCharge))}` : 
                    'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-normal">Fee Payer:</span>
                <span className="font-normal">
                  {loanData?.feePayer === 'B' ? 'Borrower' : 
                   loanData?.feePayer === 'S' ? 'Servicer' : 
                   loanData?.feePayer === 'SP' ? 'Split' : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-normal">Grace Period:</span>
                <span className="font-normal">{loanData?.gracePeriodDays || '0'} days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-normal">Investor Loan #:</span>
                <span className="font-normal">{loanData?.investorLoanNumber || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-normal">Pool Number:</span>
                <span className="font-normal">{loanData?.poolNumber || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-normal">Prepayment Penalty:</span>
                <span className="font-normal">{loanData?.prepaymentPenalty ? 'Yes' : 'No'}</span>
              </div>
              {loanData?.prepaymentPenalty && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-normal">Penalty Amount:</span>
                    <span className="font-normal">
                      {loanData?.prepaymentPenaltyAmount ? formatCurrency(parseFloat(loanData.prepaymentPenaltyAmount)) : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-normal">Penalty Expires:</span>
                    <span className="font-normal">
                      {loanData?.prepaymentExpirationDate ? 
                        format(parseISO(loanData.prepaymentExpirationDate), 'MMM dd, yyyy') : 'N/A'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Appointments */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Calendar className="h-5 w-5" />
                <CardTitle className="text-base">Appointments</CardTitle>
              </div>
              <Button size="sm" variant="ghost">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {appointments.slice(0, 3).map((apt: any) => (
                <div key={apt.id} className="flex items-start space-x-3">
                  <div className="flex-shrink-0 w-12 text-center">
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(apt.startTime), 'MMM')}
                    </div>
                    <div className="text-lg font-bold">
                      {format(new Date(apt.startTime), 'dd')}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{apt.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(apt.startTime), 'h:mm a')}
                    </div>
                  </div>
                </div>
              ))}
              {appointments.length === 0 && (
                <p className="text-sm text-muted-foreground">No upcoming appointments</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Follow Up Calls */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Phone className="h-5 w-5" />
                <CardTitle className="text-base">Follow Up Calls</CardTitle>
              </div>
              <Button size="sm" variant="ghost">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {calls.filter((c: any) => c.status === 'scheduled').slice(0, 3).map((call: any) => (
                <div key={call.id} className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{call.contactName}</div>
                    <div className="text-xs text-muted-foreground">{call.contactPhone}</div>
                  </div>
                  <Button size="sm" variant="outline">
                    <PhoneCall className="h-3 w-3 mr-1" />
                    Call
                  </Button>
                </div>
              ))}
              {calls.filter((c: any) => c.status === 'scheduled').length === 0 && (
                <p className="text-sm text-muted-foreground">No scheduled calls</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Collaborators */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Users className="h-3 w-3" />
                <CardTitle className="text-xs font-medium">Collaborators</CardTitle>
              </div>
              <Button size="sm" variant="ghost" className="h-5 w-5 p-0">
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {collaborators.map((collab: any) => (
                <div key={collab.id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">
                        {collab.userName?.split(' ').map((n: string) => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-normal text-xs">{collab.userName}</div>
                      <div className="text-xs text-muted-foreground">{collab.role}</div>
                    </div>
                  </div>
                </div>
              ))}
              {collaborators.length === 0 && (
                <p className="text-xs text-muted-foreground">No collaborators</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Activity Timeline */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center space-x-1.5">
              <Activity className="h-3 w-3" />
              <CardTitle className="text-xs font-medium">Activity</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[180px] overflow-y-auto">
              <div className="text-xs font-semibold mb-2 text-blue-600">Total activities: {activity.length}</div>
              <div className="text-xs text-red-600 mb-2">Activity types: {activity.map((a: any) => a.activityType).join(', ')}</div>
              <div className="text-xs text-green-600 mb-2">First 3: {JSON.stringify(activity.slice(0, 3))}</div>
              {activity.length === 0 ? (
                <p className="text-xs text-muted-foreground">No activity yet</p>
              ) : (
                activity.slice(0, 10).map((item: any, index: number) => {
                  // Get description from proper location
                  let description = '';
                  
                  if (item.activityType === 'email') {
                    description = item.activityData?.subject ? 
                      `Email: ${item.activityData.subject}` : 
                      'Email sent';
                  } else if (item.activityType === 'call') {
                    description = item.activityData?.description || 
                      'Call logged';
                  } else if (item.activityType === 'text') {
                    description = item.activityData?.message ? 
                      `Text: ${item.activityData.message}` : 
                      'Text sent';
                  } else if (item.activityType === 'note') {
                    description = item.activityData?.description || 
                      item.description || 
                      'Note added';
                  } else {
                    description = item.activityData?.description || 
                      item.description || 
                      'Activity';
                  }
                  
                  console.log(`Rendering activity: type=${item.activityType}, desc="${description}"`);
                  
                  return (
                    <div key={item.id} className="p-2 border border-blue-500 bg-yellow-50 mb-1" data-activity-type={item.activityType}>
                      <div className="text-xs text-black font-bold">
                        Activity #{index + 1}: {item.activityType}
                      </div>
                      <div className="text-xs text-black">
                        Description: {description}
                      </div>
                      <div className="text-xs text-gray-600">
                        Time: {formatTimeAgo(item.createdAt)}
                      </div>
                    </div>
                  );
                })
                )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Phone Numbers Modal */}
      <Dialog open={editPhoneModal} onOpenChange={setEditPhoneModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Phone className="h-4 w-4" />
              <span>Edit Phone Numbers</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="grid grid-cols-[200px_140px_60px_40px] gap-2 text-sm font-medium text-muted-foreground">
                <span>Phone Number</span>
                <span>Label</span>
                <span>Bad Number</span>
                <span></span>
              </div>
              {phoneNumbers.map((phone, index) => (
                <div key={index} className="grid grid-cols-[200px_140px_60px_40px] gap-2 items-center">
                  <Input 
                    value={phone.number}
                    onChange={(e) => {
                      const updated = [...phoneNumbers];
                      updated[index].number = e.target.value;
                      setPhoneNumbers(updated);
                    }}
                    placeholder="(555) 555-5555"
                  />
                  <Input 
                    value={phone.label}
                    onChange={(e) => {
                      const updated = [...phoneNumbers];
                      updated[index].label = e.target.value;
                      setPhoneNumbers(updated);
                    }}
                    placeholder="mobile"
                  />
                  <div className="flex justify-center">
                    <input 
                      type="checkbox"
                      checked={phone.isBad || false}
                      onChange={(e) => {
                        const updated = [...phoneNumbers];
                        updated[index].isBad = e.target.checked;
                        setPhoneNumbers(updated);
                      }}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPhoneNumbers(phoneNumbers.filter((_, i) => i !== index));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={() => setPhoneNumbers([...phoneNumbers, { number: '', label: '', isBad: false }])}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add another phone
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPhoneModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              // Save phone numbers
              const validPhones = phoneNumbers.filter(p => p.number && p.number.trim() !== '');
              // Use the already parsed email addresses from state
              const validEmails = emailAddresses.filter(e => e.email && e.email.trim() !== '');
              console.log('Saving phones with existing emails:', { phones: validPhones, emails: validEmails });
              updateContactInfoMutation.mutate({ phones: validPhones, emails: validEmails }, {
                onSuccess: () => {
                  setEditPhoneModal(false);
                }
              });
            }}>
              Save Phone Numbers
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Email Modal */}
      <Dialog open={editEmailModal} onOpenChange={setEditEmailModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Mail className="h-4 w-4" />
              <span>Edit Email Addresses</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="grid grid-cols-[250px_120px_40px] gap-2 text-sm font-medium text-muted-foreground">
                <span>Email Address</span>
                <span>Label</span>
                <span></span>
              </div>
              {emailAddresses.map((email, index) => (
                <div key={index} className="grid grid-cols-[250px_120px_40px] gap-2 items-center">
                  <Input 
                    value={email.email}
                    onChange={(e) => {
                      const updated = [...emailAddresses];
                      updated[index].email = e.target.value;
                      setEmailAddresses(updated);
                    }}
                    placeholder="email@example.com"
                  />
                  <Input 
                    value={email.label}
                    onChange={(e) => {
                      const updated = [...emailAddresses];
                      updated[index].label = e.target.value;
                      setEmailAddresses(updated);
                    }}
                    placeholder="work"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEmailAddresses(emailAddresses.filter((_, i) => i !== index));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={() => setEmailAddresses([...emailAddresses, { email: '', label: '' }])}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add another email
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEmailModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              // Save email addresses
              const validEmails = emailAddresses.filter(e => e.email && e.email.trim() !== '');
              // Use the already parsed phone numbers from state
              const currentPhones = phoneNumbers.filter(p => p.number && p.number.trim() !== '');
              console.log('Saving emails with existing phones:', { emails: validEmails, phones: currentPhones });
              updateContactInfoMutation.mutate({ emails: validEmails, phones: currentPhones }, {
                onSuccess: () => {
                  console.log('Emails saved successfully');
                  setEditEmailModal(false);
                },
                onError: (error) => {
                  console.error('Failed to save emails:', error);
                }
              });
            }}>
              Save Email Addresses
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Loan Terms Modal */}
      <Dialog open={editLoanTermsModal} onOpenChange={setEditLoanTermsModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span>Edit Loan Terms</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Original Amount</label>
              <Input 
                type="number"
                value={loanTermsForm.originalAmount}
                onChange={(e) => setLoanTermsForm({...loanTermsForm, originalAmount: e.target.value})}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Principal Balance</label>
              <Input 
                type="number"
                value={loanTermsForm.principalBalance}
                onChange={(e) => setLoanTermsForm({...loanTermsForm, principalBalance: e.target.value})}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Interest Rate (%)</label>
              <Input 
                type="number"
                step="0.001"
                value={loanTermsForm.interestRate}
                onChange={(e) => setLoanTermsForm({...loanTermsForm, interestRate: e.target.value})}
                placeholder="0.000"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Loan Term (months)</label>
              <Input 
                type="number"
                value={loanTermsForm.loanTerm}
                onChange={(e) => setLoanTermsForm({...loanTermsForm, loanTerm: e.target.value})}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Payment Frequency</label>
              <Select 
                value={loanTermsForm.paymentFrequency}
                onValueChange={(value) => setLoanTermsForm({...loanTermsForm, paymentFrequency: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annually">Annually</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">First Payment Date</label>
              <Input 
                type="date"
                value={loanTermsForm.firstPaymentDate}
                onChange={(e) => setLoanTermsForm({...loanTermsForm, firstPaymentDate: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Maturity Date</label>
              <Input 
                type="date"
                value={loanTermsForm.maturityDate}
                onChange={(e) => setLoanTermsForm({...loanTermsForm, maturityDate: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLoanTermsModal(false)}>
              Cancel
            </Button>
            <Button onClick={saveLoanTerms}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Servicing Settings Modal */}
      <Dialog open={editServicingModal} onOpenChange={setEditServicingModal}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Servicing Settings</DialogTitle>
            <p className="text-sm text-muted-foreground">Loan servicing configuration and fee settings</p>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {/* Row 1: Servicing Fee and Late Charge */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Servicing Fee</label>
                <div className="flex gap-1">
                  <Input 
                    type="number"
                    step="0.01"
                    value={servicingForm.servicingFee || ''}
                    onChange={(e) => setServicingForm({...servicingForm, servicingFee: e.target.value})}
                    placeholder="0.00"
                    className="flex-1"
                  />
                  <div className="flex border rounded-md">
                    <Button
                      type="button"
                      variant={servicingForm.servicingFeeType === 'amount' ? 'secondary' : 'ghost'}
                      className="px-3 h-10 rounded-r-none"
                      onClick={() => setServicingForm({...servicingForm, servicingFeeType: 'amount'})}
                    >
                      $
                    </Button>
                    <Button
                      type="button"
                      variant={servicingForm.servicingFeeType === 'percentage' ? 'secondary' : 'ghost'}
                      className="px-3 h-10 rounded-l-none"
                      onClick={() => setServicingForm({...servicingForm, servicingFeeType: 'percentage'})}
                    >
                      %
                    </Button>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Late Charge</label>
                <div className="flex gap-1">
                  <Input 
                    type="number"
                    step="0.01"
                    value={servicingForm.lateCharge || ''}
                    onChange={(e) => setServicingForm({...servicingForm, lateCharge: e.target.value})}
                    placeholder="0.00"
                    className="flex-1"
                  />
                  <div className="flex border rounded-md">
                    <Button
                      type="button"
                      variant={servicingForm.lateChargeType === 'fixed' ? 'secondary' : 'ghost'}
                      className="px-3 h-10 rounded-r-none"
                      onClick={() => setServicingForm({...servicingForm, lateChargeType: 'fixed'})}
                    >
                      $
                    </Button>
                    <Button
                      type="button"
                      variant={servicingForm.lateChargeType === 'percentage' ? 'secondary' : 'ghost'}
                      className="px-3 h-10 rounded-l-none"
                      onClick={() => setServicingForm({...servicingForm, lateChargeType: 'percentage'})}
                    >
                      %
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2: Fee Payer */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Fee Payer</label>
              <Select 
                value={servicingForm.feePayer || ''}
                onValueChange={(value) => setServicingForm({...servicingForm, feePayer: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select fee payer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="B">Borrower (B)</SelectItem>
                  <SelectItem value="S">Servicer (S)</SelectItem>
                  <SelectItem value="SP">Split (SP)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Row 3: Grace Period and Investor Loan Number */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Grace Period (Days)</label>
                <Input 
                  type="number"
                  value={servicingForm.gracePeriodDays || ''}
                  onChange={(e) => setServicingForm({...servicingForm, gracePeriodDays: e.target.value})}
                  placeholder="15"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Investor Loan Number</label>
                <Input 
                  type="text"
                  value={servicingForm.investorLoanNumber || ''}
                  onChange={(e) => setServicingForm({...servicingForm, investorLoanNumber: e.target.value})}
                  placeholder="Enter investor loan"
                />
              </div>
            </div>

            {/* Row 4: Pool Number */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Pool Number</label>
              <Input 
                type="text"
                value={servicingForm.poolNumber || ''}
                onChange={(e) => setServicingForm({...servicingForm, poolNumber: e.target.value})}
                placeholder="Enter pool number"
              />
            </div>

            {/* Row 5: Prepayment Penalty */}
            <div className="flex items-center space-x-2">
              <input 
                type="checkbox"
                id="prepaymentPenalty"
                checked={servicingForm.prepaymentPenalty || false}
                onChange={(e) => setServicingForm({...servicingForm, prepaymentPenalty: e.target.checked})}
                className="h-4 w-4"
              />
              <label htmlFor="prepaymentPenalty" className="text-sm font-medium">
                Prepayment Penalty
              </label>
            </div>
            {servicingForm.prepaymentPenalty && (
              <div className="grid grid-cols-2 gap-4 pl-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Penalty Amount</label>
                  <Input 
                    type="number"
                    step="0.01"
                    value={servicingForm.prepaymentPenaltyAmount || ''}
                    onChange={(e) => setServicingForm({...servicingForm, prepaymentPenaltyAmount: e.target.value})}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Expiration Date</label>
                  <Input 
                    type="date"
                    value={servicingForm.prepaymentExpirationDate || ''}
                    onChange={(e) => setServicingForm({...servicingForm, prepaymentExpirationDate: e.target.value})}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditServicingModal(false)}>
              Cancel
            </Button>
            <Button onClick={saveServicingSettings}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attachment Selection Modal */}
      <Dialog open={showAttachmentModal} onOpenChange={setShowAttachmentModal}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Paperclip className="h-4 w-4" />
              <span>Select Attachments</span>
            </DialogTitle>
            <DialogDescription>
              Choose documents from the system or upload new files
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="documents" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="documents">System Documents</TabsTrigger>
              <TabsTrigger value="upload">Upload Files</TabsTrigger>
            </TabsList>
            
            <TabsContent value="documents" className="mt-4">
              <ScrollArea className="h-[400px] w-full border rounded-md p-4">
                <DocumentSelector 
                  loanId={loanId}
                  selectedDocuments={emailAttachments.filter(a => a.id).map(a => a.id!)}
                  onSelectionChange={(docs) => {
                    // Update attachments with selected documents
                    const docAttachments = docs.map(doc => ({
                      id: doc.id,
                      name: doc.name,
                      size: doc.size
                    }));
                    // Keep uploaded files and add selected documents
                    const uploadedFiles = emailAttachments.filter(a => !a.id);
                    setEmailAttachments([...uploadedFiles, ...docAttachments]);
                  }}
                />
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="upload" className="mt-4">
              <div className="space-y-4">
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      const newAttachments = files.map(file => ({
                        name: file.name,
                        size: file.size,
                        file: file
                      }));
                      setEmailAttachments(prev => [...prev, ...newAttachments]);
                      if (attachmentInputRef.current) {
                        attachmentInputRef.current.value = '';
                      }
                    }}
                  />
                  <Paperclip className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Click to browse or drag and drop files here
                  </p>
                  <Button
                    onClick={() => attachmentInputRef.current?.click()}
                    variant="secondary"
                  >
                    Browse Files
                  </Button>
                </div>
                
                {/* Show uploaded files */}
                {emailAttachments.filter(a => a.file).length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Uploaded Files:</label>
                    <div className="border rounded-md p-2 space-y-1">
                      {emailAttachments.filter(a => a.file).map((attachment, index) => (
                        <div key={index} className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1">
                          <div className="flex items-center space-x-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span>{attachment.name}</span>
                            <span className="text-muted-foreground">
                              ({(attachment.size! / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                          <Button
                            onClick={() => {
                              setEmailAttachments(prev => prev.filter((a) => a !== attachment));
                            }}
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAttachmentModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => setShowAttachmentModal(false)}>
              Done ({emailAttachments.length} selected)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Templates Modal */}
      <Dialog open={showTemplatesModal} onOpenChange={setShowTemplatesModal}>
        <DialogContent className="sm:max-w-[700px] max-h-[600px] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Email Templates</DialogTitle>
            <DialogDescription>
              Select a template to use for your email
            </DialogDescription>
          </DialogHeader>
          <EmailTemplatesContent 
            onSelectTemplate={(template: any) => {
              setEmailSubject(template.subject);
              setEmailContent(template.body);  // Changed from template.content to template.body
              setShowTemplatesModal(false);
              toast({
                title: 'Template Loaded',
                description: `${template.name} has been loaded into your email`
              });
            }}
            onClose={() => setShowTemplatesModal(false)}
          />
        </DialogContent>
      </Dialog>

      {/* SMS Templates Modal */}
      <Dialog open={showSmsTemplatesModal} onOpenChange={setShowSmsTemplatesModal}>
        <DialogContent className="sm:max-w-[700px] max-h-[600px] overflow-hidden">
          <DialogHeader>
            <DialogTitle>SMS Templates</DialogTitle>
            <DialogDescription>
              Select a template to use for your SMS
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            {/* Built-in SMS Templates */}
            <ScrollArea className="h-[400px] w-full border rounded-md p-4">
              <div className="space-y-3">
                {/* Payment Reminder Template */}
                <div 
                  className="border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => {
                    setTextMessage('Your loan payment of [AMOUNT] is due on [DATE]. Please ensure timely payment to avoid late fees. Reply STOP to unsubscribe.');
                    setShowSmsTemplatesModal(false);
                    toast({
                      title: 'Template Loaded',
                      description: 'Payment reminder template loaded'
                    });
                  }}
                >
                  <div className="font-medium text-sm">Payment Reminder</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Remind borrower about upcoming payment
                  </div>
                  <div className="text-xs bg-muted rounded p-2 mt-2 font-mono">
                    Your loan payment of [AMOUNT] is due on [DATE]...
                  </div>
                </div>

                {/* Late Notice Template */}
                <div 
                  className="border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => {
                    setTextMessage('Your loan payment is [DAYS] days overdue. Please make payment immediately to avoid additional fees. Contact us at [PHONE] for assistance.');
                    setShowSmsTemplatesModal(false);
                    toast({
                      title: 'Template Loaded',
                      description: 'Late notice template loaded'
                    });
                  }}
                >
                  <div className="font-medium text-sm">Late Payment Notice</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Notify borrower about overdue payment
                  </div>
                  <div className="text-xs bg-muted rounded p-2 mt-2 font-mono">
                    Your loan payment is [DAYS] days overdue...
                  </div>
                </div>

                {/* Payment Received Template */}
                <div 
                  className="border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => {
                    setTextMessage('Payment of [AMOUNT] received for loan [LOAN_NUMBER]. Thank you for your payment. Your new balance is [BALANCE].');
                    setShowSmsTemplatesModal(false);
                    toast({
                      title: 'Template Loaded',
                      description: 'Payment received template loaded'
                    });
                  }}
                >
                  <div className="font-medium text-sm">Payment Received</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Confirm payment receipt
                  </div>
                  <div className="text-xs bg-muted rounded p-2 mt-2 font-mono">
                    Payment of [AMOUNT] received for loan [LOAN_NUMBER]...
                  </div>
                </div>

                {/* Escrow Shortage Template */}
                <div 
                  className="border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => {
                    setTextMessage('Escrow shortage detected on your loan. Amount needed: [AMOUNT]. Please contact us to discuss payment options.');
                    setShowSmsTemplatesModal(false);
                    toast({
                      title: 'Template Loaded',
                      description: 'Escrow shortage template loaded'
                    });
                  }}
                >
                  <div className="font-medium text-sm">Escrow Shortage</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Notify about escrow shortage
                  </div>
                  <div className="text-xs bg-muted rounded p-2 mt-2 font-mono">
                    Escrow shortage detected on your loan...
                  </div>
                </div>

                {/* Rate Change Template */}
                <div 
                  className="border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => {
                    setTextMessage('Your loan interest rate will change from [OLD_RATE]% to [NEW_RATE]% effective [DATE]. Your new payment will be [AMOUNT].');
                    setShowSmsTemplatesModal(false);
                    toast({
                      title: 'Template Loaded',
                      description: 'Rate change template loaded'
                    });
                  }}
                >
                  <div className="font-medium text-sm">Rate Change Notice</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Notify about interest rate change
                  </div>
                  <div className="text-xs bg-muted rounded p-2 mt-2 font-mono">
                    Your loan interest rate will change from [OLD_RATE]%...
                  </div>
                </div>

                {/* General Update Template */}
                <div 
                  className="border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => {
                    setTextMessage('Important update regarding your loan [LOAN_NUMBER]: [MESSAGE]. Please contact us if you have questions.');
                    setShowSmsTemplatesModal(false);
                    toast({
                      title: 'Template Loaded',
                      description: 'General update template loaded'
                    });
                  }}
                >
                  <div className="font-medium text-sm">General Update</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Send general loan update
                  </div>
                  <div className="text-xs bg-muted rounded p-2 mt-2 font-mono">
                    Important update regarding your loan [LOAN_NUMBER]...
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSmsTemplatesModal(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Property Modal */}
      <Dialog open={editPropertyModal} onOpenChange={setEditPropertyModal}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <MapPin className="h-4 w-4" />
              <span>Edit Property Information</span>
            </DialogTitle>
            <p className="text-sm text-muted-foreground">Update property details and location</p>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {/* Property Address */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Property Address</label>
              <Input 
                type="text"
                value={propertyForm.propertyAddress || ''}
                onChange={(e) => setPropertyForm({...propertyForm, propertyAddress: e.target.value})}
                placeholder="Enter street address"
              />
            </div>
            
            {/* City, State, Zip Row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">City</label>
                <Input 
                  type="text"
                  value={propertyForm.propertyCity || ''}
                  onChange={(e) => setPropertyForm({...propertyForm, propertyCity: e.target.value})}
                  placeholder="City"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">State</label>
                <Input 
                  type="text"
                  value={propertyForm.propertyState || ''}
                  onChange={(e) => setPropertyForm({...propertyForm, propertyState: e.target.value})}
                  placeholder="State"
                  maxLength={2}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">ZIP Code</label>
                <Input 
                  type="text"
                  value={propertyForm.propertyZip || ''}
                  onChange={(e) => setPropertyForm({...propertyForm, propertyZip: e.target.value})}
                  placeholder="ZIP"
                />
              </div>
            </div>

            {/* Property Type */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Property Type</label>
              <Select 
                value={propertyForm.propertyType || ''}
                onValueChange={(value) => setPropertyForm({...propertyForm, propertyType: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select property type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single_family">Single Family</SelectItem>
                  <SelectItem value="condo">Condominium</SelectItem>
                  <SelectItem value="townhouse">Townhouse</SelectItem>
                  <SelectItem value="multi_family">Multi-Family</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                  <SelectItem value="land">Land</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Property Value and Down Payment Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Property Value</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
                  <Input 
                    type="number"
                    step="0.01"
                    value={propertyForm.propertyValue || ''}
                    onChange={(e) => setPropertyForm({...propertyForm, propertyValue: e.target.value})}
                    placeholder="0.00"
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Down Payment</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
                  <Input 
                    type="number"
                    step="0.01"
                    value={propertyForm.downPayment || ''}
                    onChange={(e) => setPropertyForm({...propertyForm, downPayment: e.target.value})}
                    placeholder="0.00"
                    className="pl-8"
                  />
                </div>
              </div>
            </div>

            {/* Parcel Number (APN) */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Parcel Number (APN)</label>
              <Input 
                type="text"
                value={propertyForm.parcelNumber || ''}
                onChange={(e) => setPropertyForm({...propertyForm, parcelNumber: e.target.value})}
                placeholder="Enter parcel number"
              />
            </div>

            {/* Legal Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Legal Description</label>
              <textarea 
                value={propertyForm.legalDescription || ''}
                onChange={(e) => setPropertyForm({...propertyForm, legalDescription: e.target.value})}
                placeholder="Enter legal description"
                className="w-full p-2 border rounded-md min-h-[80px] text-sm"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPropertyModal(false)}>
              Cancel
            </Button>
            <Button onClick={saveProperty}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}