import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, HelpCircle, Mail, Send, Shield, X, Bold, Italic, Link as LinkIcon, List, Image, Paperclip, FileText, Trash2, Clock } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';
import { EmailAttachmentModal } from './email-attachment-modal';
import { EmailTemplateSelectorModal } from './email-template-selector-modal';

interface EnhancedEmailComposeProps {
  loanId: number;
  defaultTo?: string[];
  onClose?: () => void;
}

interface DNCCheckResult {
  allowed: boolean;
  restrictions: Array<{
    email: string;
    reason: string;
    category: 'transactional' | 'marketing';
    topic?: string;
  }>;
  category: 'transactional' | 'marketing';
}

interface AttachmentFile {
  id: string;
  file: File;
  name: string;
  size: number;
  path: string;
}

interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  content: string;
  folderId: number | null;
  folderName?: string;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
}

export function EnhancedEmailCompose({ loanId, defaultTo = [], onClose }: EnhancedEmailComposeProps) {
  const [emailData, setEmailData] = useState({
    to: defaultTo.join(', '),
    cc: '',
    bcc: '',
    subject: '',
    content: '',
    category: 'transactional' as 'transactional' | 'marketing',
    template_id: ''
  });

  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [dncCheckResult, setDncCheckResult] = useState<DNCCheckResult | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [showAttachmentsModal, setShowAttachmentsModal] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);

  // DNC check mutation
  const dncCheckMutation = useMutation({
    mutationFn: async (checkData: { 
      loan_id: number; 
      to: string[]; 
      subject: string; 
      template_id?: string; 
      category: 'transactional' | 'marketing' 
    }) => {
      return apiRequest('/api/crm/emails/check-dnc', {
        method: 'POST',
        body: checkData
      });
    },
    onSuccess: (data) => {
      setDncCheckResult(data);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: 'Failed to check communication restrictions',
        variant: 'destructive'
      });
    }
  });

  // Email send mutation
  const sendEmailMutation = useMutation({
    mutationFn: async (emailPayload: any) => {
      return apiRequest('/api/crm/emails/send', {
        method: 'POST',
        body: emailPayload
      });
    },
    onSuccess: (data) => {
      setCorrelationId(data.correlation_id);
      setEmailSent(true);
      toast({
        title: 'Success',
        description: 'Email sent successfully'
      });
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/crm/activity`] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send email',
        variant: 'destructive'
      });
    }
  });

  // Check DNC restrictions when category changes or recipients change
  useEffect(() => {
    if (emailData.category === 'marketing' && emailData.to.trim() && emailData.subject.trim()) {
      const recipients = emailData.to.split(',').map(email => email.trim()).filter(Boolean);
      if (recipients.length > 0) {
        dncCheckMutation.mutate({
          loan_id: loanId,
          to: recipients,
          subject: emailData.subject,
          template_id: emailData.template_id || undefined,
          category: emailData.category
        });
      }
    } else {
      setDncCheckResult(null);
    }
  }, [emailData.category, emailData.to, emailData.subject, emailData.template_id, loanId]);

  const handleInputChange = (field: string, value: string) => {
    setEmailData(prev => ({ ...prev, [field]: value }));
    setEmailSent(false);
    setCorrelationId(null);
  };

  const handleSend = async () => {
    const recipients = emailData.to.split(',').map(email => email.trim()).filter(Boolean);
    const ccRecipients = emailData.cc ? emailData.cc.split(',').map(email => email.trim()).filter(Boolean) : [];
    const bccRecipients = emailData.bcc ? emailData.bcc.split(',').map(email => email.trim()).filter(Boolean) : [];

    if (recipients.length === 0) {
      toast({
        title: 'Error',
        description: 'Please enter at least one recipient',
        variant: 'destructive'
      });
      return;
    }

    if (!emailData.subject.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a subject',
        variant: 'destructive'
      });
      return;
    }

    if (!emailData.content.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter email content',
        variant: 'destructive'
      });
      return;
    }

    // Check if marketing email is blocked
    if (emailData.category === 'marketing' && dncCheckResult && !dncCheckResult.allowed) {
      toast({
        title: 'Error',
        description: 'Cannot send marketing email due to DNC restrictions',
        variant: 'destructive'
      });
      return;
    }

    const emailPayload = {
      loan_id: loanId,
      to: recipients,
      cc: ccRecipients.length > 0 ? ccRecipients : undefined,
      bcc: bccRecipients.length > 0 ? bccRecipients : undefined,
      subject: emailData.subject,
      content: emailData.content,
      template_id: emailData.template_id || undefined,
      variables: {
        loan_id: loanId,
        category: emailData.category
      }
    };

    await sendEmailMutation.mutateAsync(emailPayload);
  };

  const handleTemplateSelect = (template: EmailTemplate) => {
    setEmailData(prev => ({
      ...prev,
      subject: template.subject,
      content: template.content,
      template_id: template.id.toString()
    }));
  };

  const isMarketingBlocked = emailData.category === 'marketing' && 
                            dncCheckResult && 
                            !dncCheckResult.allowed && 
                            dncCheckResult.restrictions.length > 0;

  const canSend = emailData.to.trim() && 
                  emailData.subject.trim() && 
                  emailData.content.trim() && 
                  !isMarketingBlocked &&
                  !sendEmailMutation.isPending;

  return (
    <TooltipProvider>
      <div className="border rounded-lg p-3 space-y-3" data-testid="enhanced-email-compose">
        {/* Top Row - To field with CC/BCC buttons */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium">To:</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowCc(!showCc)}
                className={`text-xs ${showCc ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-blue-600'} underline`}
                data-testid="button-cc"
              >
                CC
              </button>
              <button
                type="button"
                onClick={() => setShowBcc(!showBcc)}
                className={`text-xs ${showBcc ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-blue-600'} underline`}
                data-testid="button-bcc"
              >
                BCC
              </button>
            </div>
          </div>
          <Input
            type="email"
            placeholder="recipient@example.com"
            value={emailData.to}
            onChange={(e) => handleInputChange('to', e.target.value)}
            className="text-xs"
            data-testid="input-email-to"
          />
        </div>

        {/* CC Field */}
        {showCc && (
          <div className="space-y-2">
            <label className="text-xs font-medium">CC:</label>
            <Input
              type="email"
              placeholder="cc@example.com"
              value={emailData.cc}
              onChange={(e) => handleInputChange('cc', e.target.value)}
              className="text-xs"
              data-testid="input-email-cc"
            />
          </div>
        )}

        {/* BCC Field */}
        {showBcc && (
          <div className="space-y-2">
            <label className="text-xs font-medium">BCC:</label>
            <Input
              type="email"
              placeholder="bcc@example.com"
              value={emailData.bcc}
              onChange={(e) => handleInputChange('bcc', e.target.value)}
              className="text-xs"
              data-testid="input-email-bcc"
            />
          </div>
        )}

        {/* Subject Field */}
        <div className="space-y-2">
          <label className="text-xs font-medium">Subject:</label>
          <Input
            placeholder="Email subject"
            value={emailData.subject}
            onChange={(e) => handleInputChange('subject', e.target.value)}
            className="text-xs"
            data-testid="input-email-subject"
          />
        </div>

        {/* Message Field with Toolbar */}
        <div className="space-y-2">
          <label className="text-xs font-medium">Message:</label>
          <div className="border rounded-lg">
            {/* Formatting Toolbar */}
            <div className="flex items-center space-x-1 border-b p-2">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <Bold className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <Italic className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <LinkIcon className="h-3 w-3" />
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
              value={emailData.content}
              onChange={(e) => handleInputChange('content', e.target.value)}
              className="min-h-[200px] border-0 focus:ring-0 text-xs resize-none"
              data-testid="textarea-email-content"
            />
          </div>
        </div>

        {/* DNC Warning Banner */}
        {isMarketingBlocked && (
          <Alert variant="destructive" data-testid="dnc-warning-banner">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Marketing email blocked:</strong> The following recipients have opted out of marketing communications:
              <ul className="mt-2 list-disc list-inside">
                {dncCheckResult!.restrictions.map((restriction, index) => (
                  <li key={index} className="text-sm">
                    {restriction.email.replace(/(.{2}).*(@.*)/, '$1***$2')} - {restriction.reason}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Bottom Action Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost" 
              size="sm" 
              className="h-7 text-xs px-2"
              onClick={() => setShowAttachmentsModal(true)}
              data-testid="button-attachments"
            >
              <Paperclip className="h-3 w-3 mr-1" />
              Attachments
              {attachments.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {attachments.length}
                </Badge>
              )}
            </Button>
            <Button
              variant="ghost" 
              size="sm" 
              className="h-7 text-xs px-2"
              onClick={() => setShowTemplatesModal(true)}
              data-testid="button-templates"
            >
              <FileText className="h-3 w-3 mr-1" />
              Templates
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => {
                setEmailData(prev => ({ ...prev, to: '', cc: '', bcc: '', subject: '', content: '' }));
                setAttachments([]);
              }}
              title="Delete"
              data-testid="button-delete"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              onClick={handleSend}
              disabled={!canSend}
              size="sm"
              className="h-7 text-xs"
              data-testid="button-send-email"
            >
              <Send className="h-3 w-3 mr-1" />
              Send Email
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              title="Schedule"
              data-testid="button-schedule"
            >
              <Clock className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Success Message */}
        {emailSent && correlationId && (
          <Alert data-testid="success-message">
            <Shield className="h-4 w-4" />
            <AlertDescription>
              Email sent successfully. Audit ID: <code className="font-mono">{correlationId}</code>
            </AlertDescription>
          </Alert>
        )}

        {/* Attachment List Preview */}
        {attachments.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Attachments ({attachments.length}):</Label>
            <div className="flex flex-wrap gap-1">
              {attachments.map((attachment) => (
                <Badge
                  key={attachment.id}
                  variant="outline"
                  className="text-xs py-1 px-2 flex items-center gap-1"
                >
                  <Paperclip className="h-3 w-3" />
                  {attachment.name}
                  <button
                    onClick={() => setAttachments(prev => prev.filter(a => a.id !== attachment.id))}
                    className="ml-1 hover:text-red-500"
                    title="Remove attachment"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Attachment Modal */}
        <EmailAttachmentModal
          open={showAttachmentsModal}
          onOpenChange={setShowAttachmentsModal}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
        />

        {/* Template Selector Modal */}
        <EmailTemplateSelectorModal
          open={showTemplatesModal}
          onOpenChange={setShowTemplatesModal}
          onTemplateSelect={handleTemplateSelect}
        />
      </div>
    </TooltipProvider>
  );
}