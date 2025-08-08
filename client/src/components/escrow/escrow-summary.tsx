import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Shield, Building, Users } from "lucide-react";

export function EscrowSummary() {
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["/api/escrow/metrics"],
  });

  const { data: upcomingPayments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["/api/escrow-payments", { limit: 5 }],
  });

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      notation: "compact"
    }).format(num);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "approved":
        return "default";
      case "pending":
        return "secondary";
      case "paid":
        return "outline";
      default:
        return "destructive";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Escrow Management</CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              Track and manage escrow accounts for taxes, insurance, and HOA payments
            </p>
          </div>
          <Button variant="outline">
            Schedule Payment
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-800">Total Escrow Balance</p>
                <p className="text-2xl font-bold text-blue-900">
                  {metricsLoading ? "..." : formatCurrency(metrics?.totalBalance || 0)}
                </p>
              </div>
              <div className="w-10 h-10 bg-blue-200 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-blue-700" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-800">Insurance Payments</p>
                <p className="text-2xl font-bold text-green-900">
                  {metricsLoading ? "..." : formatCurrency(metrics?.insurancePayments || 0)}
                </p>
              </div>
              <div className="w-10 h-10 bg-green-200 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-green-700" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 p-4 rounded-lg border border-yellow-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-yellow-800">Tax Payments</p>
                <p className="text-2xl font-bold text-yellow-900">
                  {metricsLoading ? "..." : formatCurrency(metrics?.taxPayments || 0)}
                </p>
              </div>
              <div className="w-10 h-10 bg-yellow-200 rounded-lg flex items-center justify-center">
                <Building className="w-5 h-5 text-yellow-700" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-800">HOA Payments</p>
                <p className="text-2xl font-bold text-purple-900">
                  {metricsLoading ? "..." : formatCurrency(metrics?.hoaPayments || 0)}
                </p>
              </div>
              <div className="w-10 h-10 bg-purple-200 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-purple-700" />
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming Payments Table */}
        <div>
          <h4 className="text-lg font-semibold text-slate-900 mb-4">Upcoming Payments</h4>
          {paymentsLoading ? (
            <div className="animate-pulse space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-slate-200 rounded"></div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Loan
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Payee
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Due Date
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {upcomingPayments && upcomingPayments.length > 0 ? (
                    upcomingPayments.map((payment: any) => (
                      <tr key={payment.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm text-primary-600 font-medium">
                          #{payment.loanId?.slice(-8)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {payment.payeeName}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">
                          {formatCurrency(payment.amount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {formatDate(payment.dueDate)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={getStatusBadgeVariant(payment.status)}>
                            {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        No upcoming payments scheduled.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
