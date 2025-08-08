import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { LoanTable } from "@/components/loans/loan-table";
import { NewLoanDialog } from "@/components/loans/new-loan-dialog";
import { Button } from "@/components/ui/button";
import { Plus, Filter } from "lucide-react";

export default function Loans() {
  const [showNewLoanDialog, setShowNewLoanDialog] = useState(false);

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Loan Portfolio</h1>
              <p className="text-sm text-slate-600">Manage and monitor all loan accounts</p>
            </div>
            <div className="flex items-center space-x-3">
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Advanced Filters
              </Button>
              <Button onClick={() => setShowNewLoanDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Loan
              </Button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6">
          <LoanTable />
        </div>
      </main>

      {/* New Loan Dialog */}
      <NewLoanDialog 
        open={showNewLoanDialog} 
        onOpenChange={setShowNewLoanDialog} 
      />
    </div>
  );
}
