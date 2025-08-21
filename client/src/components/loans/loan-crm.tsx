import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
  MessageCircle
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
  const [textMessage, setTextMessage] = useState('');
  const [callDuration, setCallDuration] = useState('');
  const [callOutcome, setCallOutcome] = useState('');

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
  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: [`/api/loans/${loanId}/crm/notes`],
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: [`/api/loans/${loanId}/crm/tasks`],
  });

  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery({
    queryKey: [`/api/loans/${loanId}/crm/appointments`],
  });

  const { data: calls = [], isLoading: callsLoading } = useQuery({
    queryKey: [`/api/loans/${loanId}/crm/calls`],
  });

  const { data: activity = [], isLoading: activityLoading } = useQuery({
    queryKey: [`/api/loans/${loanId}/crm/activity`],
  });

  const { data: collaborators = [], isLoading: collaboratorsLoading } = useQuery({
    queryKey: [`/api/loans/${loanId}/crm/collaborators`],
  });

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
            <div className="flex items-center space-x-3 mb-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-lg">
                  {loanData?.borrowerName?.split(' ').map((n: string) => n[0]).join('') || 'N/A'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">{loanData?.borrowerName || 'Unknown Borrower'}</h3>
                <p className="text-sm text-muted-foreground">
                  Last Payment: {loanData?.lastPaymentDate ? 
                    format(new Date(loanData.lastPaymentDate), 'MMM dd, yyyy') : 
                    'No payments recorded'}
                </p>
              </div>
            </div>
            
            {/* Contact Information */}
            <div className="space-y-3 border-t pt-3">
              {/* Phone Numbers */}
              {loanData?.borrowerPhone && (
                <div className="flex items-center space-x-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{loanData.borrowerPhone}</span>
                </div>
              )}
              {loanData?.borrowerMobile && (
                <div className="flex items-center space-x-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{loanData.borrowerMobile} (Mobile)</span>
                </div>
              )}
              
              {/* Email */}
              {loanData?.borrowerEmail && (
                <div className="flex items-center space-x-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{loanData.borrowerEmail}</span>
                </div>
              )}
              
              {/* Property Address */}
              {loanData?.propertyAddress && (
                <div className="flex items-start space-x-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p>{loanData.propertyAddress}</p>
                    {loanData.propertyCity && loanData.propertyState && (
                      <p>{loanData.propertyCity}, {loanData.propertyState} {loanData.propertyZip}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Payment Breakdown Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Payment Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {calculations ? (
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Hazard Insurance:</span>
                  <span>{formatCurrency(calculations.breakdown?.hazardInsurance || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Property Taxes:</span>
                  <span>{formatCurrency(calculations.breakdown?.propertyTaxes || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Escrow Cushion:</span>
                  <span>{formatCurrency(calculations.breakdown?.escrowCushion || 0)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t">
                  <span>Sub-Total Escrows:</span>
                  <span>{formatCurrency(calculations?.escrow || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>+ Principal & Interest:</span>
                  <span>{formatCurrency(calculations?.principalAndInterest || 0)}</span>
                </div>
                {calculations?.hoaFees > 0 && (
                  <div className="flex justify-between">
                    <span>+ HOA:</span>
                    <span>{formatCurrency(calculations.hoaFees)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>+ Servicing Fees:</span>
                  <span>{formatCurrency(calculations?.servicingFee || 0)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t">
                  <span>Total Payment:</span>
                  <span>{formatCurrency(calculations?.totalMonthlyPayment || 0)}</span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No payment data available</div>
            )}
          </CardContent>
        </Card>
        
        {/* Quick Stats Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Quick Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Total Notes:</span>
                <span className="font-medium">{notes.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Open Tasks:</span>
                <span className="font-medium">{tasks.filter((t: any) => t.status !== 'completed').length}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Calls:</span>
                <span className="font-medium">{calls.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Collaborators:</span>
                <span className="font-medium">{collaborators.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle Column - Main Content Area */}
      <div className="col-span-6 space-y-6">
        {/* Notes Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MessageSquare className="h-5 w-5" />
                <CardTitle>Notes</CardTitle>
              </div>
              <Button size="sm" variant="outline">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Communication Type Tabs */}
            <Tabs value={communicationType} onValueChange={setCommunicationType} className="mb-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="note">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Create Note
                </TabsTrigger>
                <TabsTrigger value="email">
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </TabsTrigger>
                <TabsTrigger value="text">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Text
                </TabsTrigger>
                <TabsTrigger value="call">
                  <Phone className="h-4 w-4 mr-2" />
                  Log Call
                </TabsTrigger>
              </TabsList>

              {/* Note Tab Content */}
              <TabsContent value="note" className="mt-4">
                <div className="border rounded-lg p-3">
                  <div className="flex items-center space-x-2 mb-3 border-b pb-2">
                    <Button variant="ghost" size="sm">
                      <Bold className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Italic className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Link className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <List className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Image className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Paperclip className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Add notes or type @name to notify"
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    className="min-h-[100px] border-0 p-0 focus:ring-0"
                  />
                  <div className="flex justify-between items-center mt-3">
                    <div className="text-sm text-muted-foreground">
                      My Team Members
                    </div>
                    <Button 
                      onClick={handleAddNote}
                      disabled={!newNoteContent.trim() || createNoteMutation.isPending}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Send Note
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Email Tab Content */}
              <TabsContent value="email" className="mt-4">
                <div className="border rounded-lg p-3 space-y-3">
                  <Input
                    placeholder="Subject"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                  />
                  <Textarea
                    placeholder="Email content..."
                    value={emailContent}
                    onChange={(e) => setEmailContent(e.target.value)}
                    className="min-h-[150px]"
                  />
                  <div className="flex justify-end">
                    <Button>
                      <Mail className="h-4 w-4 mr-2" />
                      Send Email
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
      {/* Right Column - Activity Timeline and Sidebar */}
      <div className="col-span-3 space-y-6">
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
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <CardTitle className="text-base">Collaborators</CardTitle>
              </div>
              <Button size="sm" variant="ghost">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {collaborators.map((collab: any) => (
                <div key={collab.id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {collab.userName?.split(' ').map((n: string) => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium text-sm">{collab.userName}</div>
                      <div className="text-xs text-muted-foreground">{collab.role}</div>
                    </div>
                  </div>
                </div>
              ))}
              {collaborators.length === 0 && (
                <p className="text-sm text-muted-foreground">No collaborators</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Activity Timeline */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Activity className="h-5 w-5" />
              <CardTitle className="text-base">Activity</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-3">
                {activity.slice(0, 10).map((item: any) => (
                  <div key={item.id} className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                      {item.activityType === 'note' && <MessageSquare className="h-4 w-4" />}
                      {item.activityType === 'task' && <CheckSquare className="h-4 w-4" />}
                      {item.activityType === 'call' && <Phone className="h-4 w-4" />}
                      {item.activityType === 'appointment' && <Calendar className="h-4 w-4" />}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm">{item.activityData.description}</div>
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
    </div>
  );
}