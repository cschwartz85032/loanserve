import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2 } from 'lucide-react';

export default function ActivateTestPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Test Activation Page</CardTitle>
          <CardDescription>
            This is a simple test page to verify routing works.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-slate-600">
            If you can see this page, the routing is working correctly.
          </p>
          <Button className="w-full mt-4">Test Button</Button>
        </CardContent>
      </Card>
    </div>
  );
}