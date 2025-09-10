import { Router, Route, Switch } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { ProtectedRoute } from "@/lib/protected-route";
import { useAuth, AuthProvider } from "@/hooks/use-auth";

// Import pages with correct imports
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import Loans from "@/pages/loans";
import Payments from "@/pages/payments";
import Documents from "@/pages/documents";
import Escrow from "@/pages/escrow";
import Reports from "@/pages/reports";
import Settings from "@/pages/Settings";
import MfaSettings from "@/pages/MfaSettings";
import Compliance from "@/pages/compliance";
import FeeManagement from "@/pages/FeeManagement";
import ServicingCycle from "@/pages/servicing-cycle";
import Mailroom from "@/pages/Mailroom";

import { queryClient } from "@/lib/queryClient";

function AppRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
          <p className="mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Switch>
        {/* Auth page */}
        <Route path="/auth" component={AuthPage} />
        
        {/* Main app routes */}
        <Route path="/">
          {() => (
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/dashboard">
          {() => (
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/loans">
          {() => (
            <ProtectedRoute>
              <Loans />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/payments">
          {() => (
            <ProtectedRoute>
              <Payments />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/documents">
          {() => (
            <ProtectedRoute>
              <Documents />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/escrow">
          {() => (
            <ProtectedRoute>
              <Escrow />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/reports">
          {() => (
            <ProtectedRoute>
              <Reports />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/settings">
          {() => (
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/mfa">
          {() => (
            <ProtectedRoute>
              <MfaSettings />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/compliance">
          {() => (
            <ProtectedRoute>
              <Compliance />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/fees">
          {() => (
            <ProtectedRoute>
              <FeeManagement />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/servicing">
          {() => (
            <ProtectedRoute>
              <ServicingCycle />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/mailroom">
          {() => (
            <ProtectedRoute>
              <Mailroom />
            </ProtectedRoute>
          )}
        </Route>

        {/* 404 page */}
        <Route>
          <NotFound />
        </Route>
      </Switch>
    </Router>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRoutes />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}