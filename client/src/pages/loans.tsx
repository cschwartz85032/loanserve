import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { LoanTable } from "@/components/loans/loan-table";
import { NewLoanDialog } from "@/components/loans/new-loan-dialog";
import { AILoanCreator } from "@/components/loans/ai-loan-creator";
import { LoanEditForm } from "@/components/loans/loan-edit-form";
import { Button } from "@/components/ui/button";
import { Plus, Filter, Bot, Edit } from "lucide-react";
import { useLocation } from "wouter";

export default function Loans() {
  const [showNewLoanDialog, setShowNewLoanDialog] = useState(false);
  const [showAICreator, setShowAICreator] = useState(false);
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
              <Button variant="outline" onClick={() => setShowAICreator(true)}>
                <Bot className="h-4 w-4 mr-2" />
                AI Loan Creation
              </Button>
              <Button onClick={() => setShowNewLoanDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Manual Entry
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
            <LoanTable onEditLoan={setEditingLoanId} />
          )}
        </div>
      </main>

      {/* New Loan Dialog */}
      <NewLoanDialog 
        open={showNewLoanDialog} 
        onOpenChange={setShowNewLoanDialog} 
      />

      {/* AI Loan Creator */}
      <AILoanCreator 
        open={showAICreator}
        onClose={() => setShowAICreator(false)}
        onLoanCreated={(loanId) => {
          setShowAICreator(false);
          setEditingLoanId(loanId);
        }}
      />
    </div>
  );
}
