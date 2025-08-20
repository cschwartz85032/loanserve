import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Building2, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const activateSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
});

type ActivateFormData = z.infer<typeof activateSchema>;

export default function ActivatePage() {
  console.log('ActivatePage component rendered');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<any>(null);

  const form = useForm<ActivateFormData>({
    resolver: zodResolver(activateSchema),
    defaultValues: {
      username: '',
      firstName: '',
      lastName: '',
      password: '',
      confirmPassword: ''
    }
  });

  // Check if user is already logged in
  useEffect(() => {
    if (!authLoading && user) {
      console.log('User is already logged in, redirecting to dashboard');
      toast({
        title: "Already logged in",
        description: "You're already logged in. Redirecting to dashboard...",
        variant: "default"
      });
      setTimeout(() => {
        setLocation('/dashboard');
      }, 1000);
    }
  }, [authLoading, user, setLocation, toast]);

  // Extract token from URL
  useEffect(() => {
    // Don't validate token if user is logged in
    if (!authLoading && user) {
      return;
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    
    if (!tokenParam) {
      setIsValidating(false);
      setTokenError('No activation token provided');
      return;
    }
    
    setToken(tokenParam);
    validateToken(tokenParam);
  }, [authLoading, user]);

  // Validate the token
  const validateToken = async (tokenValue: string) => {
    try {
      const response = await fetch('/api/auth/validate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenValue, type: 'invitation' })
      });

      console.log('Token validation response status:', response.status);

      if (!response.ok) {
        const error = await response.json();
        console.log('Token validation error:', error);
        setTokenError(error.error || 'Invalid or expired activation token');
        setIsValidating(false);
        return;
      }

      const data = await response.json();
      console.log('Token validation success data:', data);
      setUserInfo(data.user);
      
      // Populate form with user info
      if (data.user) {
        form.setValue('username', data.user.username || '');
        form.setValue('firstName', data.user.firstName || '');
        form.setValue('lastName', data.user.lastName || '');
      }
      
      console.log('Setting tokenValid to true and isValidating to false');
      setTokenValid(true);
      setIsValidating(false);
      console.log('State updates complete');
    } catch (error) {
      setTokenError('Failed to validate activation token');
      setIsValidating(false);
    }
  };

  // Activate account mutation
  const activateMutation = useMutation({
    mutationFn: async (data: ActivateFormData) => {
      const res = await apiRequest('/api/auth/activate', {
        method: 'POST',
        body: JSON.stringify({
          token,
          username: data.username,
          password: data.password,
          firstName: data.firstName,
          lastName: data.lastName
        })
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to activate account');
      }
      
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Account activated successfully!",
        description: "You can now sign in with your new password."
      });
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        setLocation('/auth');
      }, 2000);
    },
    onError: (error: Error) => {
      toast({
        title: "Activation failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: ActivateFormData) => {
    activateMutation.mutate(data);
  };

  console.log('Render states:', { isValidating, tokenError, tokenValid, userInfo, authLoading, user: user?.username });

  // If user is logged in, show redirect message
  if (!authLoading && user) {
    console.log('User is logged in, showing redirect message');
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-slate-600">You're already logged in. Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  if (isValidating) {
    console.log('Rendering: Loading state');
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-slate-600">Validating activation link...</p>
        </div>
      </div>
    );
  }

  if (tokenError) {
    console.log('Rendering: Error state - ', tokenError);
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <CardTitle>Activation Link Invalid</CardTitle>
            <CardDescription>{tokenError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This activation link is invalid or has expired. Please contact your administrator to receive a new invitation.
              </AlertDescription>
            </Alert>
            <Button 
              className="w-full mt-4" 
              variant="outline"
              onClick={() => setLocation('/auth')}
            >
              Go to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  console.log('Rendering: Main form');
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Activate Your Account</CardTitle>
          <CardDescription>
            Welcome {userInfo?.email}! Set a password to complete your account setup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activateMutation.isSuccess ? (
            <div className="space-y-4">
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Your account has been activated successfully! Redirecting to sign in...
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your first name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your last name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter your password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Confirm your password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                  <p className="font-medium mb-1">Password Requirements:</p>
                  <ul className="space-y-1 text-xs">
                    <li>• At least 12 characters long</li>
                    <li>• At least one uppercase letter (A-Z)</li>
                    <li>• At least one lowercase letter (a-z)</li>
                    <li>• At least one number (0-9)</li>
                    <li>• At least one special character (!@#$%^&*)</li>
                  </ul>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={activateMutation.isPending}
                >
                  {activateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Activating Account...
                    </>
                  ) : (
                    'Activate Account'
                  )}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}