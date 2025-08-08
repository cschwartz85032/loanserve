import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, FileText, AlertTriangle, TrendingUp } from "lucide-react";

export function MetricsCards() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ["/api/loans/metrics"],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-16 bg-slate-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(1)}M`;
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(num);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Total Portfolio</p>
              <p className="text-3xl font-bold text-slate-900">
                {metrics ? formatCurrency(metrics.totalPortfolio) : "$0"}
              </p>
            </div>
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-primary-600" />
            </div>
          </div>
          <p className="text-sm text-green-600 mt-2">+12.5% from last month</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Active Loans</p>
              <p className="text-3xl font-bold text-slate-900">
                {metrics?.activeLoans.toLocaleString() || "0"}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <p className="text-sm text-green-600 mt-2">+3.2% from last month</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Delinquent Loans</p>
              <p className="text-3xl font-bold text-slate-900">
                {metrics?.delinquentLoans || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
          <p className="text-sm text-red-600 mt-2">-8.1% from last month</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Collections YTD</p>
              <p className="text-3xl font-bold text-slate-900">
                {metrics ? formatCurrency(metrics.collectionsYTD) : "$0"}
              </p>
            </div>
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-teal-600" />
            </div>
          </div>
          <p className="text-sm text-green-600 mt-2">+18.3% from last year</p>
        </CardContent>
      </Card>
    </div>
  );
}
