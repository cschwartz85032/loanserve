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
import { AlertTriangle, HelpCircle, Mail, Send, Shield, X } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';

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
      <Card className="w-full max-w-4xl" data-testid="enhanced-email-compose">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Compose Email</CardTitle>
              {emailSent && correlationId && (
                <Badge variant="outline" className="ml-2" data-testid="audit-badge">
                  <Shield className="mr-1 h-3 w-3" />
                  ID: {correlationId.substring(0, 8)}
                </Badge>
              )}
            </div>
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-email">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <CardDescription>
            Send email communications to borrowers and related parties
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Category Selector */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="email-category">Email Category</Label>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p>
                    <strong>Transactional:</strong> Required business communications (payment notices, statements, legal notices).
                    These cannot be blocked by recipients.
                  </p>
                  <p className="mt-2">
                    <strong>Marketing:</strong> Promotional communications that recipients can opt out of.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Select 
              value={emailData.category} 
              onValueChange={(value: 'transactional' | 'marketing') => handleInputChange('category', value)}
            >
              <SelectTrigger data-testid="select-email-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transactional">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-600" />
                    <span>Transactional (Always Delivered)</span>
                  </div>
                </SelectItem>
                <SelectItem value="marketing">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-blue-600" />
                    <span>Marketing (Subject to DNC)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
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

          {/* Recipients */}
          <div className="space-y-2">
            <Label htmlFor="email-to">To</Label>
            <Input
              id="email-to"
              type="email"
              placeholder="recipient@example.com, another@example.com"
              value={emailData.to}
              onChange={(e) => handleInputChange('to', e.target.value)}
              data-testid="input-email-to"
            />
          </div>

          {/* CC Field */}
          {showCc && (
            <div className="space-y-2">
              <Label htmlFor="email-cc">CC</Label>
              <Input
                id="email-cc"
                type="email"
                placeholder="cc@example.com"
                value={emailData.cc}
                onChange={(e) => handleInputChange('cc', e.target.value)}
                data-testid="input-email-cc"
              />
            </div>
          )}

          {/* BCC Field */}
          {showBcc && (
            <div className="space-y-2">
              <Label htmlFor="email-bcc">BCC</Label>
              <Input
                id="email-bcc"
                type="email"
                placeholder="bcc@example.com"
                value={emailData.bcc}
                onChange={(e) => handleInputChange('bcc', e.target.value)}
                data-testid="input-email-bcc"
              />
            </div>
          )}

          {/* CC/BCC Toggles */}
          <div className="flex gap-2">
            {!showCc && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCc(true)}
                data-testid="button-show-cc"
              >
                Add CC
              </Button>
            )}
            {!showBcc && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBcc(true)}
                data-testid="button-show-bcc"
              >
                Add BCC
              </Button>
            )}
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              placeholder="Enter email subject"
              value={emailData.subject}
              onChange={(e) => handleInputChange('subject', e.target.value)}
              data-testid="input-email-subject"
            />
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="email-content">Message</Label>
            <Textarea
              id="email-content"
              placeholder="Enter your message..."
              className="min-h-[200px]"
              value={emailData.content}
              onChange={(e) => handleInputChange('content', e.target.value)}
              data-testid="textarea-email-content"
            />
          </div>

          {/* Send Button */}
          <div className="flex justify-end pt-4">
            <Button
              onClick={handleSend}
              disabled={!canSend}
              data-testid="button-send-email"
            >
              <Send className="mr-2 h-4 w-4" />
              {sendEmailMutation.isPending ? 'Sending...' : 'Send Email'}
            </Button>
          </div>

          {/* Success Message */}
          {emailSent && correlationId && (
            <Alert className="mt-4" data-testid="success-message">
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Email sent successfully. Audit ID: <code className="font-mono">{correlationId}</code>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}