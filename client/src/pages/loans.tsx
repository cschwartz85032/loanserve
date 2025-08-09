import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { LoanTable } from "@/components/loans/loan-table";
import { EnhancedNewLoanDialog } from "@/components/loans/enhanced-new-loan-dialog";
import { LoanEditForm } from "@/components/loans/loan-edit-form";
import { Button } from "@/components/ui/button";
import { Plus, Filter } from "lucide-react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";

export default function Loans() {
  const [showNewLoanDialog, setShowNewLoanDialog] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [, setLocation] = useLocation();

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
                Create New Loan
              </Button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6">
          {editingLoanId ? (
            <div>
              <div className="mb-4">
                <Button 
                  variant="outline" 
                  onClick={() => setEditingLoanId(null)}
                  className="mb-4"
                >
                  ← Back to Loan List
                </Button>
              </div>
              <LoanEditForm 
                loanId={editingLoanId}
                onSave={() => setEditingLoanId(null)}
                onCancel={() => setEditingLoanId(null)}
              />
            </div>
          ) : (
            <LoanTable 
              onEditLoan={setEditingLoanId}
              onViewLoan={setEditingLoanId}
              onDeleteLoan={(loanId) => {
                // Direct delete without confirmation - use React Query for proper state management
                fetch(`/api/loans/${loanId}`, { method: 'DELETE' })
                  .then(() => {
                    // Invalidate queries to refresh data without screen clearing
                    queryClient.invalidateQueries({ queryKey: ['/api/loans'] });
                    queryClient.invalidateQueries({ queryKey: ['/api/loans/metrics'] });
                  })
                  .catch(error => console.error('Error deleting loan:', error));
              }}
            />
          )}
        </div>
      </main>

      {/* Enhanced New Loan Dialog with AI */}
      <EnhancedNewLoanDialog 
        open={showNewLoanDialog} 
        onOpenChange={setShowNewLoanDialog}
        onLoanCreated={(loanId) => {
          setShowNewLoanDialog(false);
          setEditingLoanId(loanId);
        }}
      />
    </div>
  );
}
