/**
 * MFA Verification Component
 * Used during login to verify MFA codes
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertCircle } from 'lucide-react';

interface MfaVerificationProps {
  challengeId: string;
  factors: Array<{ id: number; factorName: string; factorType: string }>;
  onSuccess: (userId: number) => void;
  onCancel: () => void;
}

export function MfaVerification({
  challengeId,
  factors,
  onSuccess,
  onCancel
}: MfaVerificationProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [selectedFactorId, setSelectedFactorId] = useState<number | undefined>(
    factors.length === 1 ? factors[0].id : undefined
  );

  const verifyMutation = useMutation({
    mutationFn: async (data: { challengeId: string; code: string; factorId?: number }) => {
      const res = await apiRequest('/api/mfa/verify', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Verification failed');
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      if (data.requiresAdditionalFactor) {
        // Handle multi-factor requirement if needed
        setCode('');
        setError('Additional verification required');
      } else {
        onSuccess(data.userId);
      }
    },
    onError: (error: any) => {
      setError(error.message || 'Invalid verification code');
      setCode('');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6 && code.length !== 8) {
      setError('Code must be 6 digits or 8 characters for backup code');
      return;
    }
    setError('');
    verifyMutation.mutate({ challengeId, code, factorId: selectedFactorId });
  };

  const isBackupCode = code.length === 8;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle>Two-Factor Authentication</CardTitle>
        </div>
        <CardDescription>
          Enter the verification code from your authenticator app
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {factors.length > 1 && (
            <div>
              <Label>Select Device</Label>
              <select
                className="w-full p-2 border rounded"
                value={selectedFactorId}
                onChange={(e) => setSelectedFactorId(Number(e.target.value))}
              >
                <option value="">Select a device</option>
                {factors.map((factor) => (
                  <option key={factor.id} value={factor.id}>
                    {factor.factorName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Label htmlFor="mfa-code">
              {isBackupCode ? 'Backup Code' : 'Verification Code'}
            </Label>
            <Input
              id="mfa-code"
              type="text"
              placeholder={isBackupCode ? 'XXXXXXXX' : '000000'}
              value={code}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9A-Fa-f]/g, '');
                setCode(value.toUpperCase());
              }}
              maxLength={8}
              autoComplete="one-time-code"
              autoFocus
              className="text-center text-2xl font-mono tracking-wider"
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="text-sm text-muted-foreground">
            <p>Enter the 6-digit code from your authenticator app.</p>
            <p className="mt-1">
              Or use an 8-character backup code if you don't have access to your device.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={verifyMutation.isPending || code.length < 6}
          >
            {verifyMutation.isPending ? 'Verifying...' : 'Verify'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}