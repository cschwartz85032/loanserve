import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, HelpCircle, Mail, MessageSquare, Phone, Save, X } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';

interface CommunicationPreferencesProps {
  borrowerId: string;
  loanId: number;
}

interface PreferenceState {
  doNotEmail: boolean;
  doNotText: boolean;
  doNotCall: boolean;
  reason: string;
  policyBasis: string;
}

export function CommunicationPreferences({ borrowerId, loanId }: CommunicationPreferencesProps) {
  const [preferences, setPreferences] = useState<PreferenceState>({
    doNotEmail: false,
    doNotText: false,
    doNotCall: false,
    reason: '',
    policyBasis: ''
  });
  
  const [originalPreferences, setOriginalPreferences] = useState<PreferenceState>(preferences);
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [pendingChange, setPendingChange] = useState<{ field: keyof PreferenceState; value: boolean } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [tempReason, setTempReason] = useState('');
  const [tempPolicyBasis, setTempPolicyBasis] = useState('');
  const [isOptimisticUpdate, setIsOptimisticUpdate] = useState(false);

  // Fetch current preferences
  const { data: preferencesData, isLoading } = useQuery({
    queryKey: [`/api/communication-preferences/${borrowerId}`],
    queryFn: async () => {
      const response = await fetch(`/api/communication-preferences/${borrowerId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch preferences');
      return response.json();
    }
  });

  // Update mutation
  const updatePreferenceMutation = useMutation({
    mutationFn: async (updateData: { channel: string; topic: string; allowed: boolean; reason?: string; policy_basis?: string }) => {
      return apiRequest(`/api/communication-preferences/${borrowerId}`, {
        method: 'PUT',
        body: updateData
      });
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Communication preferences updated successfully'
      });
      queryClient.invalidateQueries({ queryKey: [`/api/communication-preferences/${borrowerId}`] });
      setOriginalPreferences({ ...preferences });
      setHasChanges(false);
      setIsOptimisticUpdate(false);
    },
    onError: (error: any) => {
      // Rollback optimistic update
      setPreferences({ ...originalPreferences });
      setIsOptimisticUpdate(false);
      setHasChanges(false);
      
      toast({
        title: 'Error',
        description: error.message || 'Failed to update communication preferences',
        variant: 'destructive'
      });
    }
  });

  // Initialize preferences from API data
  useEffect(() => {
    if (preferencesData?.data) {
      const prefs = preferencesData.data;
      const newPrefs: PreferenceState = {
        doNotEmail: !prefs.email?.marketing_general?.allowed ?? false,
        doNotText: !prefs.sms?.marketing_general?.allowed ?? false,
        doNotCall: !prefs.phone?.marketing_general?.allowed ?? false,
        reason: '',
        policyBasis: ''
      };
      setPreferences(newPrefs);
      setOriginalPreferences(newPrefs);
    }
  }, [preferencesData]);

  // Check for changes
  useEffect(() => {
    const changed = JSON.stringify(preferences) !== JSON.stringify(originalPreferences);
    setHasChanges(changed);
  }, [preferences, originalPreferences]);

  const handleToggleChange = (field: keyof PreferenceState, checked: boolean) => {
    // If trying to disable communication, require reason and policy basis
    if (checked && (field === 'doNotEmail' || field === 'doNotText' || field === 'doNotCall')) {
      setPendingChange({ field, value: checked });
      setTempReason('');
      setTempPolicyBasis('');
      setShowReasonDialog(true);
    } else {
      // Optimistic update for enabling communication (no reason needed)
      setPreferences(prev => ({ ...prev, [field]: checked }));
    }
  };

  const handleReasonSubmit = () => {
    if (!tempReason.trim() || !tempPolicyBasis.trim()) {
      toast({
        title: 'Error',
        description: 'Both reason and policy basis are required',
        variant: 'destructive'
      });
      return;
    }

    if (pendingChange) {
      setPreferences(prev => ({
        ...prev,
        [pendingChange.field]: pendingChange.value,
        reason: tempReason,
        policyBasis: tempPolicyBasis
      }));
    }

    setShowReasonDialog(false);
    setPendingChange(null);
  };

  const handleReasonCancel = () => {
    setShowReasonDialog(false);
    setPendingChange(null);
    setTempReason('');
    setTempPolicyBasis('');
  };

  const handleSave = async () => {
    if (!hasChanges) return;

    setIsOptimisticUpdate(true);

    try {
      const updates = [];

      // Check email preference change
      if (preferences.doNotEmail !== originalPreferences.doNotEmail) {
        updates.push({
          channel: 'email',
          topic: 'marketing_general',
          allowed: !preferences.doNotEmail,
          reason: preferences.reason,
          policy_basis: preferences.policyBasis
        });
      }

      // Check SMS preference change
      if (preferences.doNotText !== originalPreferences.doNotText) {
        updates.push({
          channel: 'sms',
          topic: 'marketing_general',
          allowed: !preferences.doNotText,
          reason: preferences.reason,
          policy_basis: preferences.policyBasis
        });
      }

      // Check phone preference change
      if (preferences.doNotCall !== originalPreferences.doNotCall) {
        updates.push({
          channel: 'phone',
          topic: 'marketing_general',
          allowed: !preferences.doNotCall,
          reason: preferences.reason,
          policy_basis: preferences.policyBasis
        });
      }

      // Execute updates sequentially
      for (const update of updates) {
        await updatePreferenceMutation.mutateAsync(update);
      }
    } catch (error) {
      // Error handling is done in the mutation onError
    }
  };

  const isDisabled = !hasChanges || !preferences.reason.trim() || !preferences.policyBasis.trim();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Communication Preferences</CardTitle>
          <CardDescription>Loading preferences...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card data-testid="communication-preferences-panel">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Communication Preferences</CardTitle>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p>
                  These preferences control marketing communications only. 
                  Transactional emails (payment notices, account updates, legal notices) 
                  are required by regulation and cannot be disabled.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <CardDescription>
            Manage communication preferences for marketing materials
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Preference */}
          <div className="flex items-center justify-between space-x-4" data-testid="email-preference-toggle">
            <div className="flex items-center space-x-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="do-not-email" className="text-sm font-medium">
                  Do not email
                </Label>
                <p className="text-xs text-muted-foreground">
                  Block marketing emails (transactional emails always allowed)
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {isOptimisticUpdate && <Badge variant="outline">Saving...</Badge>}
              <Switch
                id="do-not-email"
                checked={preferences.doNotEmail}
                onCheckedChange={(checked) => handleToggleChange('doNotEmail', checked)}
                disabled={updatePreferenceMutation.isPending}
                data-testid="switch-do-not-email"
              />
            </div>
          </div>

          {/* SMS Preference */}
          <div className="flex items-center justify-between space-x-4" data-testid="sms-preference-toggle">
            <div className="flex items-center space-x-3">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="do-not-text" className="text-sm font-medium">
                  Do not text
                </Label>
                <p className="text-xs text-muted-foreground">
                  Block marketing SMS messages
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {isOptimisticUpdate && <Badge variant="outline">Saving...</Badge>}
              <Switch
                id="do-not-text"
                checked={preferences.doNotText}
                onCheckedChange={(checked) => handleToggleChange('doNotText', checked)}
                disabled={updatePreferenceMutation.isPending}
                data-testid="switch-do-not-text"
              />
            </div>
          </div>

          {/* Phone Preference */}
          <div className="flex items-center justify-between space-x-4" data-testid="phone-preference-toggle">
            <div className="flex items-center space-x-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="do-not-call" className="text-sm font-medium">
                  Do not call
                </Label>
                <p className="text-xs text-muted-foreground">
                  Block marketing phone calls
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {isOptimisticUpdate && <Badge variant="outline">Saving...</Badge>}
              <Switch
                id="do-not-call"
                checked={preferences.doNotCall}
                onCheckedChange={(checked) => handleToggleChange('doNotCall', checked)}
                disabled={updatePreferenceMutation.isPending}
                data-testid="switch-do-not-call"
              />
            </div>
          </div>

          {/* Warning for transactional communications */}
          {(preferences.doNotEmail || preferences.doNotText || preferences.doNotCall) && (
            <div className="flex items-start space-x-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-700 dark:text-amber-300">
                <p className="font-medium">Important:</p>
                <p>
                  You will still receive required transactional communications such as 
                  payment notices, account statements, and legal notices regardless of these settings.
                </p>
              </div>
            </div>
          )}

          {/* Save Button */}
          {hasChanges && (
            <div className="pt-4 border-t">
              <Button
                onClick={handleSave}
                disabled={isDisabled || updatePreferenceMutation.isPending}
                className="w-full"
                data-testid="button-save-preferences"
              >
                <Save className="mr-2 h-4 w-4" />
                {updatePreferenceMutation.isPending ? 'Saving...' : 'Save Preferences'}
              </Button>
            </div>
          )}
        </CardContent>

        {/* Reason Dialog */}
        <Dialog open={showReasonDialog} onOpenChange={setShowReasonDialog}>
          <DialogContent data-testid="reason-dialog">
            <DialogHeader>
              <DialogTitle>Communication Preference Change</DialogTitle>
              <DialogDescription>
                Please provide a reason and policy basis for this communication restriction.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="reason">Reason for restriction</Label>
                <Textarea
                  id="reason"
                  placeholder="e.g., Customer request, TCPA compliance, etc."
                  value={tempReason}
                  onChange={(e) => setTempReason(e.target.value)}
                  className="mt-1"
                  data-testid="input-reason"
                />
              </div>
              <div>
                <Label htmlFor="policy-basis">Policy basis</Label>
                <Select value={tempPolicyBasis} onValueChange={setTempPolicyBasis}>
                  <SelectTrigger data-testid="select-policy-basis">
                    <SelectValue placeholder="Select policy basis" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer_request">Customer Request</SelectItem>
                    <SelectItem value="tcpa_compliance">TCPA Compliance</SelectItem>
                    <SelectItem value="regulatory_requirement">Regulatory Requirement</SelectItem>
                    <SelectItem value="company_policy">Company Policy</SelectItem>
                    <SelectItem value="legal_notice">Legal Notice</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleReasonCancel} data-testid="button-cancel-reason">
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button
                onClick={handleReasonSubmit}
                disabled={!tempReason.trim() || !tempPolicyBasis.trim()}
                data-testid="button-submit-reason"
              >
                Confirm Change
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>
    </TooltipProvider>
  );
}