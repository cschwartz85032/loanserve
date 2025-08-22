/**
 * MFA Settings Component
 * Component for Multi-Factor Authentication configuration within the Settings page
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
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
      if (data.backupCodes) {
        setBackupCodes(data.backupCodes);
        setBackupCodesDialogOpen(true);
      }
      setVerifyDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/mfa/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/mfa/backup-codes/count'] });
      toast({
        title: 'MFA enabled',
        description: 'Multi-factor authentication has been successfully enabled'
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

  // Generate new backup codes
  const generateBackupCodesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('/api/mfa/backup-codes/generate', {
        method: 'POST'
      });
      return res.json();
    },
    onSuccess: (data) => {
      setBackupCodes(data.codes);
      setBackupCodesDialogOpen(true);
      queryClient.invalidateQueries({ queryKey: ['/api/mfa/backup-codes/count'] });
      toast({
        title: 'Backup codes generated',
        description: 'New backup codes have been generated successfully'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Generation failed',
        description: error.message || 'Failed to generate backup codes',
        variant: 'destructive'
      });
    }
  });

  // Delete MFA factor
  const deleteFactorMutation = useMutation({
    mutationFn: async (factorId: number) => {
      await apiRequest(`/api/mfa/factors/${factorId}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mfa/status'] });
      setDeleteFactorDialogOpen(false);
      toast({
        title: 'Factor removed',
        description: 'The authentication factor has been removed'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Deletion failed',
        description: error.message || 'Failed to remove authentication factor',
        variant: 'destructive'
      });
    }
  });

  // Toggle MFA requirement for sensitive operations
  const toggleSensitiveMutation = useMutation({
    mutationFn: async (require: boolean) => {
      const res = await apiRequest('/api/mfa/require-for-sensitive', {
        method: 'POST',
        body: JSON.stringify({ require })
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mfa/status'] });
      toast({
        title: 'Setting updated',
        description: 'MFA requirement for sensitive operations has been updated'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Update failed',
        description: error.message || 'Failed to update MFA requirement',
        variant: 'destructive'
      });
    }
  });

  const handleEnrollFactor = () => {
    if (!factorName.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter a name for this authenticator',
        variant: 'destructive'
      });
      return;
    }
    enrollMutation.mutate({ factorName: factorName.trim() });
  };

  const handleVerifyEnrollment = () => {
    if (!verificationCode.trim() || !enrolledFactorId) {
      toast({
        title: 'Code required',
        description: 'Please enter the verification code from your authenticator app',
        variant: 'destructive'
      });
      return;
    }
    verifyMutation.mutate({ 
      factorId: enrolledFactorId, 
      code: verificationCode.trim() 
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Copied to clipboard'
    });
  };

  const downloadBackupCodes = () => {
    const element = document.createElement('a');
    const file = new Blob(
      [`Backup Codes\n\nStore these codes in a safe place. Each code can only be used once.\n\n${backupCodes.join('\n')}`],
      { type: 'text/plain' }
    );
    element.href = URL.createObjectURL(file);
    element.download = 'mfa-backup-codes.txt';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    
    toast({
      title: 'Downloaded',
      description: 'Backup codes have been downloaded'
    });
  };

  if (isLoading) {
    return <div>Loading MFA settings...</div>;
  }

  return (
    <div className="space-y-6">
      {/* MFA Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Multi-Factor Authentication
          </CardTitle>
          <CardDescription>
            Add an extra layer of security to your account with 2-step verification
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">MFA Status</p>
              <p className="text-sm text-muted-foreground">
                {mfaStatus?.mfaEnabled 
                  ? 'Your account is protected with multi-factor authentication'
                  : 'Enable MFA to secure your account'}
              </p>
            </div>
            <Badge variant={mfaStatus?.mfaEnabled ? 'default' : 'secondary'}>
              {mfaStatus?.mfaEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>

          {mfaStatus?.mfaEnabled && (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Require MFA for sensitive operations</p>
                <p className="text-sm text-muted-foreground">
                  Require verification for password changes and API key management
                </p>
              </div>
              <Switch
                checked={mfaStatus?.requireMfaForSensitive}
                onCheckedChange={(checked) => toggleSensitiveMutation.mutate(checked)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Authentication Factors Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Authentication Factors</CardTitle>
              <CardDescription>
                Manage your authentication methods
              </CardDescription>
            </div>
            <Button onClick={() => setEnrollDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Authenticator
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!mfaStatus?.factors || mfaStatus.factors.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No authentication factors configured. Add an authenticator app to enable MFA.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {mfaStatus.factors.map((factor) => (
                <div key={factor.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
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
                  <div className="flex items-center gap-2">
                    {factor.verified && (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFactorToDelete(factor.id);
                        setDeleteFactorDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Backup Codes Card */}
      {mfaStatus?.mfaEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Backup Codes
            </CardTitle>
            <CardDescription>
              Use backup codes to access your account if you lose your authenticator
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {backupCodesCount?.remainingCodes || 0} codes remaining
                </p>
                <p className="text-sm text-muted-foreground">
                  Generate new codes if you're running low
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => generateBackupCodesMutation.mutate()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Generate New Codes
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enroll Factor Dialog */}
      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Authenticator App</DialogTitle>
            <DialogDescription>
              Use an authenticator app like Google Authenticator or Authy
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="factor-name">Authenticator name</Label>
              <Input
                id="factor-name"
                placeholder="e.g., My Phone"
                value={factorName}
                onChange={(e) => setFactorName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEnrollFactor} disabled={enrollMutation.isPending}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verify Enrollment Dialog */}
      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Verify Authenticator</DialogTitle>
            <DialogDescription>
              Scan the QR code with your authenticator app
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {qrCodeUrl && (
              <div className="flex justify-center">
                <img src={qrCodeUrl} alt="QR Code" className="border rounded" />
              </div>
            )}
            
            <div>
              <Label>Manual entry key</Label>
              <div className="flex items-center gap-2">
                <Input value={totpSecret} readOnly />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(totpSecret)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="verification-code">Enter 6-digit code</Label>
              <Input
                id="verification-code"
                placeholder="000000"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                maxLength={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleVerifyEnrollment} disabled={verifyMutation.isPending}>
              Verify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Backup Codes Dialog */}
      <Dialog open={backupCodesDialogOpen} onOpenChange={setBackupCodesDialogOpen}>
        <DialogContent>
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
                You won't be able to see these codes again after closing this dialog.
              </AlertDescription>
            </Alert>
            
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code, index) => (
                <div key={index} className="font-mono text-sm p-2 bg-muted rounded">
                  {code}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={downloadBackupCodes}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button onClick={() => setBackupCodesDialogOpen(false)}>
              I've saved my codes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Factor Dialog */}
      <Dialog open={deleteFactorDialogOpen} onOpenChange={setDeleteFactorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Authenticator</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this authenticator? You'll need to set up a new one to use MFA.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFactorDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => factorToDelete && deleteFactorMutation.mutate(factorToDelete)}
              disabled={deleteFactorMutation.isPending}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}