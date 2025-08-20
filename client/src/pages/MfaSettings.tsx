/**
 * MFA Settings Page
 * Allows users to configure Multi-Factor Authentication
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Sidebar } from "@/components/layout/sidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import {
  Shield,
  Smartphone,
  Key,
  Trash2,
  Plus,
  Copy,
  CheckCircle,
  AlertCircle,
  Download,
  QrCode,
  RefreshCw
} from 'lucide-react';

interface MfaFactor {
  id: number;
  type: string;
  name: string;
  verified: boolean;
  lastUsedAt: string | null;
}

interface MfaStatus {
  mfaEnabled: boolean;
  mfaRequired: boolean;
  requireMfaForSensitive: boolean;
  factors: MfaFactor[];
}

export default function MfaSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // State for dialogs
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [backupCodesDialogOpen, setBackupCodesDialogOpen] = useState(false);
  const [deleteFactorDialogOpen, setDeleteFactorDialogOpen] = useState(false);
  
  // State for enrollment
  const [factorName, setFactorName] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [enrolledFactorId, setEnrolledFactorId] = useState<number | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [factorToDelete, setFactorToDelete] = useState<number | null>(null);

  // Fetch MFA status
  const { data: mfaStatus, isLoading } = useQuery<MfaStatus>({
    queryKey: ['/api/mfa/status'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Fetch backup codes count
  const { data: backupCodesCount } = useQuery<{ remainingCodes: number }>({
    queryKey: ['/api/mfa/backup-codes/count'],
    enabled: mfaStatus?.mfaEnabled
  });

  // Begin TOTP enrollment
  const enrollMutation = useMutation({
    mutationFn: async (data: { factorName: string }) => {
      const res = await apiRequest('/api/mfa/totp/enroll', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      return res.json();
    },
    onSuccess: (data) => {
      setTotpSecret(data.secret);
      setQrCodeUrl(data.qrCode);
      setEnrolledFactorId(data.factorId);
      setVerifyDialogOpen(true);
      setEnrollDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Enrollment failed',
        description: error.message || 'Failed to begin enrollment',
        variant: 'destructive'
      });
    }
  });

  // Verify TOTP enrollment
  const verifyMutation = useMutation({
    mutationFn: async (data: { factorId: number; code: string }) => {
      const res = await apiRequest('/api/mfa/totp/verify-enrollment', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      return res.json();
    },
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setVerifyDialogOpen(false);
      setBackupCodesDialogOpen(true);
      queryClient.invalidateQueries({ queryKey: ['/api/mfa/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/mfa/backup-codes/count'] });
      toast({
        title: 'MFA enabled successfully',
        description: 'Your authenticator app has been configured'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Verification failed',
        description: error.message || 'Invalid verification code',
        variant: 'destructive'
      });
    }
  });

  // Generate backup codes
  const generateBackupCodesMutation = useMutation({
    mutationFn: async (regenerate: boolean = false) => {
      const res = await apiRequest('/api/mfa/backup-codes/generate', {
        method: 'POST',
        body: JSON.stringify({ regenerate })
      });
      return res.json();
    },
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setBackupCodesDialogOpen(true);
      queryClient.invalidateQueries({ queryKey: ['/api/mfa/backup-codes/count'] });
      toast({
        title: 'Backup codes generated',
        description: data.message
      });
    }
  });

  // Remove MFA factor
  const removeFactorMutation = useMutation({
    mutationFn: async (factorId: number) => {
      const res = await apiRequest(`/api/mfa/factors/${factorId}`, {
        method: 'DELETE'
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mfa/status'] });
      setDeleteFactorDialogOpen(false);
      setFactorToDelete(null);
      toast({
        title: 'Factor removed',
        description: 'The authentication factor has been removed'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to remove factor',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Update MFA settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: { requireMfaForSensitive?: boolean }) => {
      const res = await apiRequest('/api/mfa/settings', {
        method: 'POST',
        body: JSON.stringify(settings)
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mfa/status'] });
      toast({
        title: 'Settings updated',
        description: 'Your MFA settings have been updated'
      });
    }
  });

  const handleBeginEnrollment = () => {
    setFactorName('');
    setEnrollDialogOpen(true);
  };

  const handleEnroll = () => {
    if (!factorName.trim()) {
      toast({
        title: 'Invalid input',
        description: 'Please enter a name for this device',
        variant: 'destructive'
      });
      return;
    }
    enrollMutation.mutate({ factorName });
  };

  const handleVerify = () => {
    if (!verificationCode || !enrolledFactorId) return;
    verifyMutation.mutate({
      factorId: enrolledFactorId,
      code: verificationCode
    });
  };

  const handleCopySecret = () => {
    navigator.clipboard.writeText(totpSecret);
    toast({
      title: 'Copied',
      description: 'Secret key copied to clipboard'
    });
  };

  const handleCopyBackupCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: 'Copied',
      description: 'Backup code copied to clipboard'
    });
  };

  const handleDownloadBackupCodes = () => {
    const content = `LoanServe Pro - MFA Backup Codes
Generated: ${new Date().toISOString()}

IMPORTANT: Store these codes in a safe place. Each code can only be used once.

${backupCodes.map((code, i) => `${i + 1}. ${code}`).join('\n')}

Once you have used a backup code, it cannot be used again.
`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'loanserve-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDeleteFactor = (factorId: number) => {
    setFactorToDelete(factorId);
    setDeleteFactorDialogOpen(true);
  };

  const confirmDeleteFactor = () => {
    if (factorToDelete) {
      removeFactorMutation.mutate(factorToDelete);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex bg-slate-50">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="p-8">
            <div className="animate-pulse">
              <div className="h-8 bg-slate-200 rounded w-1/4 mb-4"></div>
              <div className="h-4 bg-slate-200 rounded w-1/2"></div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Security Settings</h1>
              <p className="text-sm text-slate-600">Manage your Multi-Factor Authentication (MFA) settings</p>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6">
          <div className="max-w-4xl mx-auto">
            {/* MFA Status Card */}
            <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Shield className="h-6 w-6 text-primary" />
              <div>
                <CardTitle>Multi-Factor Authentication</CardTitle>
                <CardDescription>
                  Add an extra layer of security to your account
                </CardDescription>
              </div>
            </div>
            {mfaStatus?.mfaEnabled ? (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle className="h-3 w-3 mr-1" />
                Enabled
              </Badge>
            ) : (
              <Badge variant="outline">Disabled</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!mfaStatus?.mfaEnabled && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Enable MFA to protect your account from unauthorized access.
                You'll need an authenticator app like Google Authenticator or Authy.
              </AlertDescription>
            </Alert>
          )}

          {mfaStatus?.mfaEnabled && (
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label>Require MFA for sensitive actions</Label>
                  <p className="text-sm text-muted-foreground">
                    Require verification for password changes, transfers, etc.
                  </p>
                </div>
                <Switch
                  checked={mfaStatus?.requireMfaForSensitive}
                  onCheckedChange={(checked) => 
                    updateSettingsMutation.mutate({ requireMfaForSensitive: checked })
                  }
                />
              </div>

              {backupCodesCount && (
                <Alert>
                  <Key className="h-4 w-4" />
                  <AlertDescription>
                    You have {backupCodesCount.remainingCodes} backup codes remaining.
                    {backupCodesCount.remainingCodes < 3 && ' Consider generating new codes.'}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configured Factors */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Authentication Devices</CardTitle>
            <Button onClick={handleBeginEnrollment} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Device
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {mfaStatus?.factors && mfaStatus.factors.length > 0 ? (
            <div className="space-y-3">
              {mfaStatus.factors.map((factor) => (
                <div
                  key={factor.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <Smartphone className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{factor.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {factor.lastUsedAt
                          ? `Last used: ${new Date(factor.lastUsedAt).toLocaleDateString()}`
                          : 'Never used'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteFactor(factor.id)}
                    disabled={mfaStatus.factors.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No authentication devices configured
            </p>
          )}
        </CardContent>
            </Card>

            {/* Backup Codes */}
            {mfaStatus?.mfaEnabled && (
              <Card>
                <CardHeader>
                  <CardTitle>Backup Codes</CardTitle>
                  <CardDescription>
                    Use these codes to access your account if you lose your device
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => generateBackupCodesMutation.mutate(true)}
                    variant="outline"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Generate New Codes
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Enrollment Dialog */}
      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Authentication Device</DialogTitle>
            <DialogDescription>
              Set up a new device to generate verification codes
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="factor-name">Device Name</Label>
              <Input
                id="factor-name"
                placeholder="e.g., iPhone, Work Phone"
                value={factorName}
                onChange={(e) => setFactorName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEnroll} disabled={enrollMutation.isPending}>
              {enrollMutation.isPending ? 'Setting up...' : 'Continue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verification Dialog */}
      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Scan QR Code</DialogTitle>
            <DialogDescription>
              Scan this QR code with your authenticator app, then enter the verification code
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {qrCodeUrl && (
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48" />
              </div>
            )}
            
            <div>
              <Label>Manual Entry</Label>
              <div className="flex items-center space-x-2">
                <Input
                  value={totpSecret}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopySecret}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="verification-code">Verification Code</Label>
              <Input
                id="verification-code"
                placeholder="000000"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleVerify} 
              disabled={verifyMutation.isPending || verificationCode.length !== 6}
            >
              {verifyMutation.isPending ? 'Verifying...' : 'Verify'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Backup Codes Dialog */}
      <Dialog open={backupCodesDialogOpen} onOpenChange={setBackupCodesDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Save Your Backup Codes</DialogTitle>
            <DialogDescription>
              Store these codes in a safe place. Each code can only be used once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                These codes won't be shown again. Make sure to save them now.
              </AlertDescription>
            </Alert>
            
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-slate-50 rounded font-mono text-sm"
                >
                  <span>{code}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCopyBackupCode(code)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleDownloadBackupCodes}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button onClick={() => setBackupCodesDialogOpen(false)}>
              I've Saved My Codes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Factor Confirmation Dialog */}
      <Dialog open={deleteFactorDialogOpen} onOpenChange={setDeleteFactorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Authentication Device</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this device? You'll need another device or backup codes to access your account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFactorDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteFactor}
              disabled={removeFactorMutation.isPending}
            >
              {removeFactorMutation.isPending ? 'Removing...' : 'Remove Device'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}