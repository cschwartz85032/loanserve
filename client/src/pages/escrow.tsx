import { Sidebar } from "@/components/layout/sidebar";
import { EscrowSummary } from "@/components/escrow/escrow-summary";
import { PaymentScheduler } from "@/components/escrow/payment-scheduler";

export default function Escrow() {
  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Escrow Management</h1>
              <p className="text-sm text-slate-600">Manage escrow accounts and scheduled payments</p>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6 space-y-6">
          <EscrowSummary />
          <PaymentScheduler />
        </div>
      </main>
    </div>
  );
}
