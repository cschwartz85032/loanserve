import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Shield, Lock, AlertCircle, Save } from "lucide-react";

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

  const [sessionSettings, setSessionSettings] = useState({
    sessionTimeoutMinutes: 30,
    extendSessionOnActivity: true,
    requireReauthForSensitive: true,
    allowMultipleSessions: false
  });

  useEffect(() => {
    if (settings) {
      if (settings.passwordPolicy) {
        setPasswordPolicy(settings.passwordPolicy);
      }
      if (settings.lockoutPolicy) {
        setLockoutPolicy(settings.lockoutPolicy);
      }
      if (settings.sessionSettings) {
        setSessionSettings(settings.sessionSettings);
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
      sessionSettings
    });
  };

  if (isLoading) {
    return <div>Loading security settings...</div>;
  }

  return (
    <div className="space-y-6">
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

      {/* Session Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Session Management
          </CardTitle>
          <CardDescription>Configure session timeout and security settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="session-timeout">Session Timeout (minutes)</Label>
            <Input
              id="session-timeout"
              type="number"
              value={sessionSettings.sessionTimeoutMinutes}
              onChange={(e) => setSessionSettings({ ...sessionSettings, sessionTimeoutMinutes: parseInt(e.target.value) })}
              min="5"
              max="1440"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Extend Session on Activity</Label>
              <Switch
                checked={sessionSettings.extendSessionOnActivity}
                onCheckedChange={(checked) => setSessionSettings({ ...sessionSettings, extendSessionOnActivity: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Require Re-authentication for Sensitive Operations</Label>
              <Switch
                checked={sessionSettings.requireReauthForSensitive}
                onCheckedChange={(checked) => setSessionSettings({ ...sessionSettings, requireReauthForSensitive: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Allow Multiple Sessions</Label>
              <Switch
                checked={sessionSettings.allowMultipleSessions}
                onCheckedChange={(checked) => setSessionSettings({ ...sessionSettings, allowMultipleSessions: checked })}
              />
            </div>
          </div>
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