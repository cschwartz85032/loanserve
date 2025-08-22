import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Shield, Settings as SettingsIcon, Key, History, AlertCircle, Save, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import MfaSettings from './MfaSettings';

interface PasswordPolicySettings {
  enabled: boolean;
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  rejectWeakPasswords: boolean;
  useOnlineWeakPasswordCheck: boolean;
  enablePasswordHistory: boolean;
  passwordHistoryCount: number;
  passwordExpirationDays: number;
  enablePasswordExpiration: boolean;
}

interface SystemSettings {
  passwordPolicy: PasswordPolicySettings;
  [key: string]: any;
}

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDirty, setIsDirty] = useState(false);

  // Fetch current settings
  const { data: settings, isLoading } = useQuery<SystemSettings>({
    queryKey: ['/api/admin/settings'],
    queryFn: async () => {
      const response = await fetch('/api/admin/settings');
      if (!response.ok) {
        // Return default settings if none exist
        return {
          passwordPolicy: {
            enabled: false, // Default to weakest for development
            minLength: 4,
            requireUppercase: false,
            requireLowercase: false,
            requireNumbers: false,
            requireSpecialChars: false,
            rejectWeakPasswords: false,
            useOnlineWeakPasswordCheck: false,
            enablePasswordHistory: false,
            passwordHistoryCount: 5,
            passwordExpirationDays: 90,
            enablePasswordExpiration: false
          }
        };
      }
      return response.json();
    }
  });

  const [localSettings, setLocalSettings] = useState<SystemSettings>(settings || {
    passwordPolicy: {
      enabled: false,
      minLength: 4,
      requireUppercase: false,
      requireLowercase: false,
      requireNumbers: false,
      requireSpecialChars: false,
      rejectWeakPasswords: false,
      useOnlineWeakPasswordCheck: false,
      enablePasswordHistory: false,
      passwordHistoryCount: 5,
      passwordExpirationDays: 90,
      enablePasswordExpiration: false
    }
  });

  // Update local settings when fetched data changes
  useState(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  });

  // Save settings mutation
  const saveMutation = useMutation({
    mutationFn: async (data: SystemSettings) => {
      const response = await apiRequest('/api/admin/settings', {
        method: 'PUT',
        body: data
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: 'Settings saved',
        description: 'Your settings have been saved successfully.'
      });
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save settings',
        variant: 'destructive'
      });
    }
  });

  const updatePasswordPolicy = (updates: Partial<PasswordPolicySettings>) => {
    setLocalSettings(prev => ({
      ...prev,
      passwordPolicy: {
        ...prev.passwordPolicy,
        ...updates
      }
    }));
    setIsDirty(true);
  };

  const resetToDefaults = () => {
    const defaultSettings: SystemSettings = {
      passwordPolicy: {
        enabled: false,
        minLength: 4,
        requireUppercase: false,
        requireLowercase: false,
        requireNumbers: false,
        requireSpecialChars: false,
        rejectWeakPasswords: false,
        useOnlineWeakPasswordCheck: false,
        enablePasswordHistory: false,
        passwordHistoryCount: 5,
        passwordExpirationDays: 90,
        enablePasswordExpiration: false
      }
    };
    setLocalSettings(defaultSettings);
    setIsDirty(true);
  };

  const setStrongDefaults = () => {
    const strongSettings: SystemSettings = {
      passwordPolicy: {
        enabled: true,
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        rejectWeakPasswords: true,
        useOnlineWeakPasswordCheck: true,
        enablePasswordHistory: true,
        passwordHistoryCount: 10,
        passwordExpirationDays: 90,
        enablePasswordExpiration: true
      }
    };
    setLocalSettings(strongSettings);
    setIsDirty(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">System Settings</h1>
          <p className="text-muted-foreground mt-2">
            Configure system-wide settings and security policies
          </p>
        </div>
        {isDirty && (
          <Button 
            onClick={() => saveMutation.mutate(localSettings)}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        )}
      </div>

      <Tabs defaultValue="password-policy" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="password-policy">
            <Shield className="mr-2 h-4 w-4" />
            Password Policies
          </TabsTrigger>
          <TabsTrigger value="mfa">
            <Key className="mr-2 h-4 w-4" />
            Multi-Factor Auth
          </TabsTrigger>
          <TabsTrigger value="general">
            <SettingsIcon className="mr-2 h-4 w-4" />
            General
          </TabsTrigger>
        </TabsList>

        <TabsContent value="password-policy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Password Security Policies</CardTitle>
              <CardDescription>
                Configure password complexity requirements and security features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Main Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="password-policy-enabled" className="text-base">
                    Enable Password Policies
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    When disabled, allows any password (development mode)
                  </p>
                </div>
                <Switch
                  id="password-policy-enabled"
                  checked={localSettings.passwordPolicy.enabled}
                  onCheckedChange={(checked) => updatePasswordPolicy({ enabled: checked })}
                />
              </div>

              {!localSettings.passwordPolicy.enabled && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Password policies are disabled. Users can set any password without restrictions.
                    This is recommended only for development environments.
                  </AlertDescription>
                </Alert>
              )}

              {/* Quick Presets */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={resetToDefaults}>
                  Set Weak (Dev)
                </Button>
                <Button variant="outline" size="sm" onClick={setStrongDefaults}>
                  Set Strong (Production)
                </Button>
              </div>

              {/* Complexity Requirements */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-medium">Complexity Requirements</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="min-length" className="flex-1">
                      Minimum Password Length
                    </Label>
                    <Input
                      id="min-length"
                      type="number"
                      min="1"
                      max="128"
                      value={localSettings.passwordPolicy.minLength}
                      onChange={(e) => updatePasswordPolicy({ minLength: parseInt(e.target.value) || 4 })}
                      className="w-20"
                      disabled={!localSettings.passwordPolicy.enabled}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="require-uppercase">Require Uppercase Letters</Label>
                      <p className="text-xs text-muted-foreground">At least one capital letter (A-Z)</p>
                    </div>
                    <Switch
                      id="require-uppercase"
                      checked={localSettings.passwordPolicy.requireUppercase}
                      onCheckedChange={(checked) => updatePasswordPolicy({ requireUppercase: checked })}
                      disabled={!localSettings.passwordPolicy.enabled}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="require-lowercase">Require Lowercase Letters</Label>
                      <p className="text-xs text-muted-foreground">At least one lowercase letter (a-z)</p>
                    </div>
                    <Switch
                      id="require-lowercase"
                      checked={localSettings.passwordPolicy.requireLowercase}
                      onCheckedChange={(checked) => updatePasswordPolicy({ requireLowercase: checked })}
                      disabled={!localSettings.passwordPolicy.enabled}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="require-numbers">Require Numbers</Label>
                      <p className="text-xs text-muted-foreground">At least one numeric digit (0-9)</p>
                    </div>
                    <Switch
                      id="require-numbers"
                      checked={localSettings.passwordPolicy.requireNumbers}
                      onCheckedChange={(checked) => updatePasswordPolicy({ requireNumbers: checked })}
                      disabled={!localSettings.passwordPolicy.enabled}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="require-special">Require Special Characters</Label>
                      <p className="text-xs text-muted-foreground">At least one special character (!@#$%^&*)</p>
                    </div>
                    <Switch
                      id="require-special"
                      checked={localSettings.passwordPolicy.requireSpecialChars}
                      onCheckedChange={(checked) => updatePasswordPolicy({ requireSpecialChars: checked })}
                      disabled={!localSettings.passwordPolicy.enabled}
                    />
                  </div>
                </div>
              </div>

              {/* Weak Password Protection */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-medium">Weak Password Protection</h3>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="reject-weak">Reject Common Weak Passwords</Label>
                    <p className="text-xs text-muted-foreground">Block passwords like "password123", "qwerty", etc.</p>
                  </div>
                  <Switch
                    id="reject-weak"
                    checked={localSettings.passwordPolicy.rejectWeakPasswords}
                    onCheckedChange={(checked) => updatePasswordPolicy({ rejectWeakPasswords: checked })}
                    disabled={!localSettings.passwordPolicy.enabled}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="online-check">Use Online Weak Password Database</Label>
                    <p className="text-xs text-muted-foreground">Check against HaveIBeenPwned database (requires internet)</p>
                  </div>
                  <Switch
                    id="online-check"
                    checked={localSettings.passwordPolicy.useOnlineWeakPasswordCheck}
                    onCheckedChange={(checked) => updatePasswordPolicy({ useOnlineWeakPasswordCheck: checked })}
                    disabled={!localSettings.passwordPolicy.enabled}
                  />
                </div>
              </div>

              {/* Password History */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-medium">Password History</h3>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="enable-history">Enable Password History</Label>
                    <p className="text-xs text-muted-foreground">Prevent reuse of previous passwords</p>
                  </div>
                  <Switch
                    id="enable-history"
                    checked={localSettings.passwordPolicy.enablePasswordHistory}
                    onCheckedChange={(checked) => updatePasswordPolicy({ enablePasswordHistory: checked })}
                    disabled={!localSettings.passwordPolicy.enabled}
                  />
                </div>

                {localSettings.passwordPolicy.enablePasswordHistory && (
                  <div className="flex items-center justify-between">
                    <Label htmlFor="history-count" className="flex-1">
                      Number of Previous Passwords to Remember
                    </Label>
                    <Input
                      id="history-count"
                      type="number"
                      min="1"
                      max="24"
                      value={localSettings.passwordPolicy.passwordHistoryCount}
                      onChange={(e) => updatePasswordPolicy({ passwordHistoryCount: parseInt(e.target.value) || 5 })}
                      className="w-20"
                      disabled={!localSettings.passwordPolicy.enabled}
                    />
                  </div>
                )}
              </div>

              {/* Password Expiration */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-medium">Password Expiration</h3>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="enable-expiration">Enable Password Expiration</Label>
                    <p className="text-xs text-muted-foreground">Force users to change passwords periodically</p>
                  </div>
                  <Switch
                    id="enable-expiration"
                    checked={localSettings.passwordPolicy.enablePasswordExpiration}
                    onCheckedChange={(checked) => updatePasswordPolicy({ enablePasswordExpiration: checked })}
                    disabled={!localSettings.passwordPolicy.enabled}
                  />
                </div>

                {localSettings.passwordPolicy.enablePasswordExpiration && (
                  <div className="flex items-center justify-between">
                    <Label htmlFor="expiration-days" className="flex-1">
                      Password Expires After (days)
                    </Label>
                    <Input
                      id="expiration-days"
                      type="number"
                      min="1"
                      max="365"
                      value={localSettings.passwordPolicy.passwordExpirationDays}
                      onChange={(e) => updatePasswordPolicy({ passwordExpirationDays: parseInt(e.target.value) || 90 })}
                      className="w-20"
                      disabled={!localSettings.passwordPolicy.enabled}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mfa">
          <MfaSettings />
        </TabsContent>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>
                Configure general system settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Additional settings will be available here in future updates.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}