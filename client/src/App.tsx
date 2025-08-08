import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import Loans from "@/pages/loans";
import Payments from "@/pages/payments";
import Documents from "@/pages/documents";
import Escrow from "@/pages/escrow";
import Reports from "@/pages/reports";
import Compliance from "@/pages/compliance";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={Dashboard} />
      <ProtectedRoute path="/loans" component={Loans} />
      <ProtectedRoute path="/payments" component={Payments} />
      <ProtectedRoute path="/documents" component={Documents} />
      <ProtectedRoute path="/escrow" component={Escrow} />
      <ProtectedRoute path="/reports" component={Reports} />
      <ProtectedRoute path="/compliance" component={Compliance} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
