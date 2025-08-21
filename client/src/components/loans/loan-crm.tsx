import React, { useState, useEffect } from 'react';
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
import { format } from 'date-fns';
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
  Trash2
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

interface LoanCRMProps {
  loanId: number;
  calculations?: any;
  loanData?: any;
}

export function LoanCRM({ loanId, calculations, loanData }: LoanCRMProps) {
  const { user } = useAuth();
  const [selectedTab, setSelectedTab] = useState('notes');
  const [communicationType, setCommunicationType] = useState('note');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
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
  const [callDuration, setCallDuration] = useState('');
  const [callOutcome, setCallOutcome] = useState('');
  
  // Contact editing states
  const [hoveredContact, setHoveredContact] = useState<string | null>(null);
  const [editPhoneModal, setEditPhoneModal] = useState(false);
  const [editEmailModal, setEditEmailModal] = useState(false);
  const [editAddressModal, setEditAddressModal] = useState(false);
  const [phoneNumbers, setPhoneNumbers] = useState<Array<{number: string, label: string, isBad?: boolean}>>([]);
  const [emailAddresses, setEmailAddresses] = useState<Array<{email: string, label: string}>>([]);

  // Initialize contact data from loanData
  useEffect(() => {
    const phones = [];
    // Parse stored phone data which might include isBad status
    if (loanData?.borrowerPhone) {
      try {
        // Try to parse as JSON first (new format)
        const phoneData = JSON.parse(loanData.borrowerPhone);
        phones.push(phoneData);
      } catch {
        // Fallback to plain string (old format)
        phones.push({ number: loanData.borrowerPhone, label: 'Primary', isBad: false });
      }
    }
    if (loanData?.borrowerMobile) {
      try {
        // Try to parse as JSON first (new format)
        const phoneData = JSON.parse(loanData.borrowerMobile);
        phones.push(phoneData);
      } catch {
        // Fallback to plain string (old format)
        phones.push({ number: loanData.borrowerMobile, label: 'Mobile', isBad: false });
      }
    }
    if (phones.length === 0) {
      phones.push({ number: '', label: '', isBad: false });
    }
    setPhoneNumbers(phones);

    const emails = [];
    if (loanData?.borrowerEmail) {
      try {
        // Try to parse as JSON array first (new format)
        const emailData = JSON.parse(loanData.borrowerEmail);
        if (Array.isArray(emailData)) {
          emails.push(...emailData);
        } else {
          // Single email object from old JSON format
          emails.push(emailData);
        }
      } catch {
        // Fallback to plain string (old format)
        emails.push({ email: loanData.borrowerEmail, label: 'Primary' });
      }
    }
    if (emails.length === 0) {
      emails.push({ email: '', label: '' });
    }
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

  // Fetch CRM data
  const { data: notes = [], isLoading: notesLoading } = useQuery<any[]>({
    queryKey: [`/api/loans/${loanId}/crm/notes`],
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<any[]>({
    queryKey: [`/api/loans/${loanId}/crm/tasks`],
  });

  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery<any[]>({
    queryKey: [`/api/loans/${loanId}/crm/appointments`],
  });

  const { data: calls = [], isLoading: callsLoading } = useQuery<any[]>({
    queryKey: [`/api/loans/${loanId}/crm/calls`],
  });

  const { data: activity = [], isLoading: activityLoading } = useQuery<any[]>({
    queryKey: [`/api/loans/${loanId}/crm/activity`],
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
  }, [communicationType, emailAddresses]);

  // Mutations
  const createNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest(`/api/loans/${loanId}/crm/notes`, {
        method: 'POST',
        body: JSON.stringify({ content }),
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

  const createTaskMutation = useMutation({
    mutationFn: async (task: { title: string; description: string }) => {
      const response = await apiRequest(`/api/loans/${loanId}/crm/tasks`, {
        method: 'POST',
        body: JSON.stringify(task),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/crm/tasks`] });
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/crm/activity`] });
      setNewTaskTitle('');
      setNewTaskDescription('');
      toast({ title: 'Success', description: 'Task created successfully' });
    },
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: string }) => {
      const response = await apiRequest(`/api/loans/${loanId}/crm/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/crm/tasks`] });
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/crm/activity`] });
    },
  });

  const createCallMutation = useMutation({
    mutationFn: async (call: any) => {
      const response = await apiRequest(`/api/loans/${loanId}/crm/calls`, {
        method: 'POST',
        body: JSON.stringify(call),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/crm/calls`] });
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/crm/activity`] });
      setNewCallNotes('');
      toast({ title: 'Success', description: 'Call logged successfully' });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (emailData: { to: string; cc?: string; bcc?: string; subject: string; content: string }) => {
      const response = await apiRequest(`/api/loans/${loanId}/crm/send-email`, {
        method: 'POST',
        body: JSON.stringify(emailData),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/crm/activity`] });
      setEmailTo('');
      setEmailCc('');
      setEmailBcc('');
      setEmailSubject('');
      setEmailContent('');
      setShowCc(false);
      setShowBcc(false);
      toast({ title: 'Success', description: 'Email sent successfully' });
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

  const handleAddTask = () => {
    if (newTaskTitle.trim()) {
      createTaskMutation.mutate({
        title: newTaskTitle,
        description: newTaskDescription,
      });
    }
  };

  const handleTaskStatusChange = (taskId: number, status: string) => {
    updateTaskStatusMutation.mutate({ taskId, status });
  };

  const handleSendEmail = () => {
    if (emailTo && emailSubject && emailContent) {
      sendEmailMutation.mutate({
        to: emailTo,
        cc: emailCc || undefined,
        bcc: emailBcc || undefined,
        subject: emailSubject,
        content: emailContent
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
              <Avatar className="h-12 w-12">
                <AvatarFallback className="text-sm font-normal">
                  {loanData?.borrowerName?.split(' ').map((n: string) => n[0]).join('') || 'N/A'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="text-base font-medium">{loanData?.borrowerName || 'Unknown Borrower'}</h3>
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
              {(phoneNumbers[0]?.number || phoneNumbers[1]?.number) ? (
                <>
                  {phoneNumbers[0]?.number && (
                    <div 
                      className="flex items-center justify-between text-xs group cursor-pointer hover:bg-muted/20 px-1 py-0.5 rounded transition-colors"
                      onMouseEnter={() => setHoveredContact('phone1')}
                      onMouseLeave={() => setHoveredContact(null)}
                    >
                      <div className="flex items-center space-x-2">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <span className={`font-normal ${phoneNumbers[0]?.isBad ? 'text-red-500 line-through' : 'text-muted-foreground'}`}>
                          {phoneNumbers[0]?.number || loanData.borrowerPhone}
                        </span>
                        {phoneNumbers[0]?.label && (
                          <span className="text-xs text-muted-foreground">({phoneNumbers[0].label})</span>
                        )}
                      </div>
                      {hoveredContact === 'phone1' && (
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
                  )}
                  {phoneNumbers[1]?.number && (
                    <div 
                      className="flex items-center justify-between text-xs group cursor-pointer hover:bg-muted/20 px-1 py-0.5 rounded transition-colors"
                      onMouseEnter={() => setHoveredContact('phone2')}
                      onMouseLeave={() => setHoveredContact(null)}
                    >
                      <div className="flex items-center space-x-2">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <span className={`font-normal ${phoneNumbers[1]?.isBad ? 'text-red-500 line-through' : 'text-muted-foreground'}`}>
                          {phoneNumbers[1]?.number || loanData.borrowerMobile}
                        </span>
                        {phoneNumbers[1]?.label && (
                          <span className="text-xs text-muted-foreground">({phoneNumbers[1].label})</span>
                        )}
                      </div>
                      {hoveredContact === 'phone2' && (
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
                  )}
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
              
              {/* Property Address */}
              {loanData?.propertyAddress ? (
                <div 
                  className="flex items-start justify-between text-xs group cursor-pointer hover:bg-muted/20 px-1 py-0.5 rounded transition-colors"
                  onMouseEnter={() => setHoveredContact('address')}
                  onMouseLeave={() => setHoveredContact(null)}
                >
                  <div className="flex items-start space-x-2">
                    <MapPin className="h-3 w-3 text-muted-foreground mt-0.5" />
                    <div className="text-muted-foreground font-normal">
                      <p>{loanData.propertyAddress}</p>
                      {loanData.propertyCity && loanData.propertyState && (
                        <p>{loanData.propertyCity}, {loanData.propertyState} {loanData.propertyZip}</p>
                      )}
                    </div>
                  </div>
                  {hoveredContact === 'address' && (
                    <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-5 w-5 p-0"
                        onClick={() => setEditAddressModal(true)}
                      >
                        <Edit className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <button 
                  className="flex items-center space-x-2 text-xs text-primary hover:underline"
                  onClick={() => setEditAddressModal(true)}
                >
                  <MapPin className="h-3 w-3" />
                  <span>Add address</span>
                </button>
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

                  {/* Email Content */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Message:</label>
                    <Textarea
                      placeholder="Email content..."
                      value={emailContent}
                      onChange={(e) => setEmailContent(e.target.value)}
                      className="min-h-[150px] text-xs"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button 
                      onClick={handleSendEmail}
                      disabled={!emailTo || !emailSubject || !emailContent || sendEmailMutation.isPending}
                      size="sm"
                      className="h-7 text-xs"
                    >
                      <Mail className="h-3 w-3 mr-1" />
                      {sendEmailMutation.isPending ? 'Sending...' : 'Send Email'}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Text Tab Content */}
              <TabsContent value="text" className="mt-4">
                <div className="border rounded-lg p-3 space-y-3">
                  <Textarea
                    placeholder="Type your message..."
                    value={textMessage}
                    onChange={(e) => setTextMessage(e.target.value)}
                    className="min-h-[100px]"
                  />
                  <div className="flex justify-end">
                    <Button>
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Send Text
                    </Button>
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
                    <Button>
                      <Phone className="h-4 w-4 mr-2" />
                      Log Call
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Notes List */}
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {notes.map((note: any) => (
                  <div key={note.id} className="border-l-2 border-primary pl-4">
                    <div className="flex items-start space-x-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {note.userName?.split(' ').map((n: string) => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium">{note.userName}</span>
                            <span className="text-sm text-muted-foreground">
                              {formatTimeAgo(note.createdAt)}
                            </span>
                          </div>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="mt-1 text-sm">{note.content}</div>
                        {note.attachments?.length > 0 && (
                          <div className="mt-2 flex items-center space-x-2">
                            <Paperclip className="h-4 w-4" />
                            <span className="text-sm text-muted-foreground">
                              {note.attachments.length} attachment(s)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Tasks Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckSquare className="h-5 w-5" />
                <CardTitle>Tasks</CardTitle>
                <Badge variant="secondary">{tasks.length}</Badge>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Task
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Task</DialogTitle>
                    <DialogDescription>
                      Add a new task for this loan
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input
                      placeholder="Task title"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                    />
                    <Textarea
                      placeholder="Task description"
                      value={newTaskDescription}
                      onChange={(e) => setNewTaskDescription(e.target.value)}
                    />
                    <Button onClick={handleAddTask} className="w-full">
                      Create Task
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tasks.map((task: any) => (
                <div key={task.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                  <input
                    type="checkbox"
                    checked={task.status === 'completed'}
                    onChange={(e) => handleTaskStatusChange(
                      task.id,
                      e.target.checked ? 'completed' : 'pending'
                    )}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className={`font-medium ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                        {task.title}
                      </h4>
                      <Badge variant={task.priority === 'high' ? 'destructive' : 'secondary'}>
                        {task.priority}
                      </Badge>
                    </div>
                    {task.description && (
                      <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                    )}
                    <div className="flex items-center space-x-4 mt-2">
                      {task.assignedToName && (
                        <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>{task.assignedToName}</span>
                        </div>
                      )}
                      {task.dueDate && (
                        <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{format(new Date(task.dueDate), 'MMM dd')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
            {calculations ? (
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-normal">Hazard Insurance:</span>
                  <span className="font-normal">{formatCurrency(calculations.breakdown?.hazardInsurance || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-normal">Property Taxes:</span>
                  <span className="font-normal">{formatCurrency(calculations.breakdown?.propertyTaxes || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-normal">Escrow Cushion:</span>
                  <span className="font-normal">{formatCurrency(calculations.breakdown?.escrowCushion || 0)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t">
                  <span className="text-muted-foreground font-normal">Sub-Total Escrows:</span>
                  <span className="font-normal">{formatCurrency(calculations?.escrow || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-normal">+ Principal & Interest:</span>
                  <span className="font-normal">{formatCurrency(calculations?.principalAndInterest || 0)}</span>
                </div>
                {calculations?.hoaFees > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-normal">+ HOA:</span>
                    <span className="font-normal">{formatCurrency(calculations.hoaFees)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-normal">+ Servicing Fees:</span>
                  <span className="font-normal">{formatCurrency(calculations?.servicingFee || 0)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t">
                  <span className="font-medium">Total Payment:</span>
                  <span className="font-medium">{formatCurrency(calculations?.totalMonthlyPayment || 0)}</span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No payment data available</div>
            )}
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
            <ScrollArea className="h-[180px]">
              <div className="space-y-2">
                {activity.slice(0, 10).map((item: any) => (
                  <div key={item.id} className="flex items-start space-x-2">
                    <div className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                      {item.activityType === 'note' && <MessageSquare className="h-3 w-3" />}
                      {item.activityType === 'task' && <CheckSquare className="h-3 w-3" />}
                      {item.activityType === 'call' && <Phone className="h-3 w-3" />}
                      {item.activityType === 'appointment' && <Calendar className="h-3 w-3" />}
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-normal">{item.activityData.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatTimeAgo(item.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
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
              const currentEmails = loanData?.borrowerEmail ? [{ email: loanData.borrowerEmail, label: 'Primary' }] : [];
              console.log('Saving phones with existing emails:', { phones: validPhones, emails: currentEmails });
              updateContactInfoMutation.mutate({ phones: validPhones, emails: currentEmails }, {
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
    </div>
  );
}