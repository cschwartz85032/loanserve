import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertCircle, Loader2, Database } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

export function MigrateDatabase() {
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState<string[]>([]);

  const runMigration = async () => {
    setStatus('running');
    setMessage('Running database migration...');
    setDetails([]);

    try {
      const response = await apiRequest('/api/migrate-database', {
        method: 'POST',
      });

      if (response.success) {
        setStatus('success');
        setMessage('Migration completed successfully!');
        setDetails(response.details || []);
      } else {
        setStatus('error');
        setMessage(response.error || 'Migration failed');
        setDetails(response.details || []);
      }
    } catch (error: any) {
      setStatus('error');
      setMessage(error.message || 'Failed to run migration');
      setDetails([]);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Migration Tool
          </CardTitle>
          <CardDescription>
            Update your production database schema to match the latest application requirements
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This tool will add missing columns to your production database. It's safe to run multiple times - existing columns won't be affected.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">This migration will add:</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Servicing settings fields (fee type, late charge type, fee payer, etc.)</li>
              <li>Payment settings fields (property tax, home insurance, PMI, etc.)</li>
              <li>APN field for properties</li>
              <li>Escrow number field</li>
            </ul>
          </div>

          <Button 
            onClick={runMigration} 
            disabled={status === 'running'}
            className="w-full"
          >
            {status === 'running' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running Migration...
              </>
            ) : (
              'Run Database Migration'
            )}
          </Button>

          {status !== 'idle' && (
            <Alert className={status === 'success' ? 'border-green-500' : status === 'error' ? 'border-red-500' : ''}>
              {status === 'success' && <CheckCircle className="h-4 w-4 text-green-500" />}
              {status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
              {status === 'running' && <Loader2 className="h-4 w-4 animate-spin" />}
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">{message}</p>
                  {details.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {details.map((detail, index) => (
                        <p key={index} className="text-xs">{detail}</p>
                      ))}
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}