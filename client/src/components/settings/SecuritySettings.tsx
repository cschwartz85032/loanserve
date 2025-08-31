import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Shield, Lock, AlertCircle, Save, UserCheck, CheckCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function SecuritySettings() {
  const { toast } = useToast();
  
  const { data: settings, isLoading } = useQuery({
    queryKey: ["/api/admin/settings"],
    enabled: true
  });

  const [passwordPolicy, setPasswordPolicy] = useState({
    enabled: false,
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    preventPasswordReuse: true,
    passwordHistoryCount: 5,
    passwordExpiryDays: 90
  });

  const [lockoutPolicy, setLockoutPolicy] = useState({
    enabled: false,
    maxFailedAttempts: 5,
    lockoutDurationMinutes: 30,
    lockoutStrategy: "progressive"
  });


  const [callerVerification, setCallerVerification] = useState({
    enabled: false,
    requireForPIIAccess: true,
    verificationMethods: {
      lastFourSSN: true,
      dateOfBirth: true,
      accountNumber: false,
      securityQuestions: false,
      twoFactorAuth: false
    },
    maxVerificationAttempts: 3,
    lockoutDurationMinutes: 15,
    requireReVerificationAfterMinutes: 60,
    applicableRoles: ['borrower', 'lender', 'investor', 'escrow_officer', 'legal', 'servicer'],
    exemptRoles: ['admin'],
    auditAllAccess: true,
    notifyOnFailedVerification: true
  });

  const availableRoles = [
    { value: 'admin', label: 'Admin' },
    { value: 'borrower', label: 'Borrower' },
    { value: 'lender', label: 'Lender' },
    { value: 'investor', label: 'Investor' },
    { value: 'escrow_officer', label: 'Escrow Officer' },
    { value: 'legal', label: 'Legal' },
    { value: 'servicer', label: 'Servicer' }
  ];

  useEffect(() => {
    if (settings) {
      if (settings.passwordPolicy) {
        setPasswordPolicy(settings.passwordPolicy);
      }
      if (settings.lockoutPolicy) {
        setLockoutPolicy(settings.lockoutPolicy);
      }
      if (settings.callerVerification) {
        setCallerVerification(settings.callerVerification);
      }
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error("Failed to update settings");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({
        title: "Settings updated",
        description: "Security settings have been saved successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleSave = () => {
    updateSettingsMutation.mutate({
      passwordPolicy,
      lockoutPolicy,
      callerVerification
    });
  };

  if (isLoading) {
    return <div>Loading security settings...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Caller Verification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Caller Verification
          </CardTitle>
          <CardDescription>Configure verification requirements for accessing PII data in loan files</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="caller-verification-enabled">Enable Caller Verification</Label>
            <Switch
              id="caller-verification-enabled"
              checked={callerVerification.enabled}
              onCheckedChange={(checked) => setCallerVerification({ ...callerVerification, enabled: checked })}
            />
          </div>

          {callerVerification.enabled && (
            <>
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold mb-2">Verification Methods</Label>
                  <div className="space-y-2 mt-2">
                    <div className="flex items-center justify-between">
                      <Label className="font-normal">Last Four SSN</Label>
                      <Switch
                        checked={callerVerification.verificationMethods.lastFourSSN}
                        onCheckedChange={(checked) => 
                          setCallerVerification({
                            ...callerVerification,
                            verificationMethods: { ...callerVerification.verificationMethods, lastFourSSN: checked }
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="font-normal">Date of Birth</Label>
                      <Switch
                        checked={callerVerification.verificationMethods.dateOfBirth}
                        onCheckedChange={(checked) => 
                          setCallerVerification({
                            ...callerVerification,
                            verificationMethods: { ...callerVerification.verificationMethods, dateOfBirth: checked }
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="font-normal">Account Number</Label>
                      <Switch
                        checked={callerVerification.verificationMethods.accountNumber}
                        onCheckedChange={(checked) => 
                          setCallerVerification({
                            ...callerVerification,
                            verificationMethods: { ...callerVerification.verificationMethods, accountNumber: checked }
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="font-normal">Security Questions</Label>
                      <Switch
                        checked={callerVerification.verificationMethods.securityQuestions}
                        onCheckedChange={(checked) => 
                          setCallerVerification({
                            ...callerVerification,
                            verificationMethods: { ...callerVerification.verificationMethods, securityQuestions: checked }
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="font-normal">Two-Factor Authentication</Label>
                      <Switch
                        checked={callerVerification.verificationMethods.twoFactorAuth}
                        onCheckedChange={(checked) => 
                          setCallerVerification({
                            ...callerVerification,
                            verificationMethods: { ...callerVerification.verificationMethods, twoFactorAuth: checked }
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="max-verification-attempts">Max Verification Attempts</Label>
                    <Input
                      id="max-verification-attempts"
                      type="number"
                      value={callerVerification.maxVerificationAttempts}
                      onChange={(e) => setCallerVerification({ ...callerVerification, maxVerificationAttempts: parseInt(e.target.value) })}
                      min="1"
                      max="10"
                    />
                  </div>
                  <div>
                    <Label htmlFor="verification-lockout-duration">Lockout Duration (minutes)</Label>
                    <Input
                      id="verification-lockout-duration"
                      type="number"
                      value={callerVerification.lockoutDurationMinutes}
                      onChange={(e) => setCallerVerification({ ...callerVerification, lockoutDurationMinutes: parseInt(e.target.value) })}
                      min="5"
                      max="60"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="reverification-time">Re-verification Required After (minutes)</Label>
                  <Input
                    id="reverification-time"
                    type="number"
                    value={callerVerification.requireReVerificationAfterMinutes}
                    onChange={(e) => setCallerVerification({ ...callerVerification, requireReVerificationAfterMinutes: parseInt(e.target.value) })}
                    min="15"
                    max="1440"
                  />
                </div>

                <div>
                  <Label className="text-base font-semibold mb-2">Applicable Roles</Label>
                  <p className="text-sm text-muted-foreground mb-2">Select which roles require caller verification for PII access</p>
                  <div className="space-y-2">
                    {availableRoles.map((role) => (
                      <div key={role.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`role-${role.value}`}
                          checked={callerVerification.applicableRoles.includes(role.value)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setCallerVerification({
                                ...callerVerification,
                                applicableRoles: [...callerVerification.applicableRoles, role.value]
                              });
                            } else {
                              setCallerVerification({
                                ...callerVerification,
                                applicableRoles: callerVerification.applicableRoles.filter(r => r !== role.value)
                              });
                            }
                          }}
                        />
                        <Label htmlFor={`role-${role.value}`} className="font-normal cursor-pointer">
                          {role.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Audit All PII Access</Label>
                    <Switch
                      checked={callerVerification.auditAllAccess}
                      onCheckedChange={(checked) => setCallerVerification({ ...callerVerification, auditAllAccess: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Notify on Failed Verification</Label>
                    <Switch
                      checked={callerVerification.notifyOnFailedVerification}
                      onCheckedChange={(checked) => setCallerVerification({ ...callerVerification, notifyOnFailedVerification: checked })}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Password Policy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Password Policy
          </CardTitle>
          <CardDescription>Configure password requirements and security policies</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="password-policy-enabled">Enable Password Policy</Label>
            <Switch
              id="password-policy-enabled"
              checked={passwordPolicy.enabled}
              onCheckedChange={(checked) => setPasswordPolicy({ ...passwordPolicy, enabled: checked })}
            />
          </div>

          {passwordPolicy.enabled && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="min-length">Minimum Length</Label>
                  <Input
                    id="min-length"
                    type="number"
                    value={passwordPolicy.minLength}
                    onChange={(e) => setPasswordPolicy({ ...passwordPolicy, minLength: parseInt(e.target.value) })}
                    min="4"
                    max="32"
                  />
                </div>
                <div>
                  <Label htmlFor="history-count">Password History Count</Label>
                  <Input
                    id="history-count"
                    type="number"
                    value={passwordPolicy.passwordHistoryCount}
                    onChange={(e) => setPasswordPolicy({ ...passwordPolicy, passwordHistoryCount: parseInt(e.target.value) })}
                    min="0"
                    max="24"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Require Uppercase Letters</Label>
                  <Switch
                    checked={passwordPolicy.requireUppercase}
                    onCheckedChange={(checked) => setPasswordPolicy({ ...passwordPolicy, requireUppercase: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Require Lowercase Letters</Label>
                  <Switch
                    checked={passwordPolicy.requireLowercase}
                    onCheckedChange={(checked) => setPasswordPolicy({ ...passwordPolicy, requireLowercase: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Require Numbers</Label>
                  <Switch
                    checked={passwordPolicy.requireNumbers}
                    onCheckedChange={(checked) => setPasswordPolicy({ ...passwordPolicy, requireNumbers: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Require Special Characters</Label>
                  <Switch
                    checked={passwordPolicy.requireSpecialChars}
                    onCheckedChange={(checked) => setPasswordPolicy({ ...passwordPolicy, requireSpecialChars: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Prevent Password Reuse</Label>
                  <Switch
                    checked={passwordPolicy.preventPasswordReuse}
                    onCheckedChange={(checked) => setPasswordPolicy({ ...passwordPolicy, preventPasswordReuse: checked })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="expiry-days">Password Expiry (days)</Label>
                <Input
                  id="expiry-days"
                  type="number"
                  value={passwordPolicy.passwordExpiryDays}
                  onChange={(e) => setPasswordPolicy({ ...passwordPolicy, passwordExpiryDays: parseInt(e.target.value) })}
                  min="0"
                  max="365"
                />
                <p className="text-sm text-muted-foreground mt-1">Set to 0 to disable password expiry</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Account Lockout Policy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Account Lockout Policy
          </CardTitle>
          <CardDescription>Configure account lockout settings for failed login attempts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="lockout-enabled">Enable Account Lockout</Label>
            <Switch
              id="lockout-enabled"
              checked={lockoutPolicy.enabled}
              onCheckedChange={(checked) => setLockoutPolicy({ ...lockoutPolicy, enabled: checked })}
            />
          </div>

          {lockoutPolicy.enabled && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="max-attempts">Max Failed Attempts</Label>
                <Input
                  id="max-attempts"
                  type="number"
                  value={lockoutPolicy.maxFailedAttempts}
                  onChange={(e) => setLockoutPolicy({ ...lockoutPolicy, maxFailedAttempts: parseInt(e.target.value) })}
                  min="3"
                  max="10"
                />
              </div>
              <div>
                <Label htmlFor="lockout-duration">Lockout Duration (minutes)</Label>
                <Input
                  id="lockout-duration"
                  type="number"
                  value={lockoutPolicy.lockoutDurationMinutes}
                  onChange={(e) => setLockoutPolicy({ ...lockoutPolicy, lockoutDurationMinutes: parseInt(e.target.value) })}
                  min="5"
                  max="1440"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>


      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateSettingsMutation.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}