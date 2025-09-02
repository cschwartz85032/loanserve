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
import FeeManagement from "@/pages/FeeManagement";
import ServicingCycle from "@/pages/servicing-cycle";
import Mailroom from "@/pages/Mailroom";
import AdminEscrow from "@/pages/admin/AdminEscrow";
import { AdminUsers } from "@/pages/AdminUsers";
import { AdminUserDetail } from "@/pages/AdminUserDetail";
import QueueMonitor from "@/pages/admin/QueueMonitor";
import { MigrateDatabase } from "@/pages/migrate-database";
import MfaSettings from "@/pages/MfaSettings";
import Settings from "@/pages/Settings";
import ActivatePage from "@/pages/activate";
import ActivateTestPage from "@/pages/activate-test";
import NotFound from "@/pages/not-found";

// Borrower Portal Pages
import { BorrowerDashboard } from "@/pages/portal/dashboard";
import { BorrowerLoanDetails } from "@/pages/portal/loan-details";
import { BorrowerMakePayment } from "@/pages/portal/make-payment";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={Dashboard} />
      <ProtectedRoute path="/dashboard" component={Dashboard} />
      <ProtectedRoute path="/loans" component={Loans} />
      <ProtectedRoute path="/payments" component={Payments} />
      <ProtectedRoute path="/documents" component={Documents} />
      <ProtectedRoute path="/mailroom" component={Mailroom} />
      <ProtectedRoute path="/escrow" component={Escrow} />
      <ProtectedRoute path="/admin/escrow" component={AdminEscrow} />
      <ProtectedRoute path="/admin/users" component={AdminUsers} />
      <ProtectedRoute path="/admin/users/:id" component={AdminUserDetail} />
      <ProtectedRoute path="/admin/queue-monitor" component={QueueMonitor} />
      <ProtectedRoute path="/reports" component={Reports} />
      <ProtectedRoute path="/compliance" component={Compliance} />
      <ProtectedRoute path="/fees" component={FeeManagement} />
      <ProtectedRoute path="/servicing-cycle" component={ServicingCycle} />
      <ProtectedRoute path="/migrate-database" component={MigrateDatabase} />
      <ProtectedRoute path="/investors" component={Dashboard} />
      <ProtectedRoute path="/users" component={Dashboard} />
      <ProtectedRoute path="/settings" component={Settings} />
      <ProtectedRoute path="/mfa-settings" component={MfaSettings} />
      
      {/* Borrower Portal Routes */}
      <ProtectedRoute path="/borrowerportal" component={BorrowerDashboard} />
      <ProtectedRoute path="/borrowerportal/dashboard" component={BorrowerDashboard} />
      <ProtectedRoute path="/borrowerportal/loans/:loanId" component={BorrowerLoanDetails} />
      <ProtectedRoute path="/borrowerportal/loans/:loanId/pay" component={BorrowerMakePayment} />
      <ProtectedRoute path="/borrowerportal/payment" component={BorrowerMakePayment} />
      
      <Route path="/auth" component={AuthPage} />
      <Route path="/activate" component={ActivatePage} />
      <Route path="/activate-test" component={ActivateTestPage} />
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
