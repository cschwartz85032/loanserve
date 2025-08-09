import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { MetricsCards } from "@/components/dashboard/metrics-cards";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { PortfolioOverview } from "@/components/dashboard/portfolio-overview";
import { LoanTable } from "@/components/loans/loan-table";
import { EscrowSummary } from "@/components/escrow/escrow-summary";
import { SimpleNewLoanDialog } from "@/components/loans/simple-new-loan-dialog";
import { Bell, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const [newLoanOpen, setNewLoanOpen] = useState(false);
  

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Loan Portfolio Dashboard</h1>
              <p className="text-sm text-slate-600">Manage and monitor your mortgage loan servicing operations</p>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full"></span>
              </Button>
              <Button onClick={() => setNewLoanOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Loan
              </Button>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="p-6">
          <MetricsCards />
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2">
              <RecentActivity />
            </div>
            <div className="lg:col-span-1">
              <PortfolioOverview />
            </div>
          </div>

          <LoanTable />
          
          <div className="mt-6">
            <EscrowSummary />
          </div>
        </div>
      </main>
      
      <SimpleNewLoanDialog open={newLoanOpen} onOpenChange={setNewLoanOpen} />
    </div>
  );
}
