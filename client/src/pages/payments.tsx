import { Sidebar } from "@/components/layout/sidebar";
import { PaymentProcessor } from "@/components/payments/payment-processor";

export default function Payments() {
  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Payment Management</h1>
            <p className="text-sm text-slate-600">
              Process and track loan payments with Column Bank integration
            </p>
          </div>
        </header>

        {/* Content */}
        <div className="p-6">
          <PaymentProcessor />
        </div>
      </main>
    </div>
  );
}