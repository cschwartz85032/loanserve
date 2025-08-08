import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PortfolioOverview() {
  // In a real app, this would come from an API
  const portfolioData = {
    performingLoans: 94.2,
    thirtyDaysPastDue: 4.1,
    ninetyDaysPastDue: 1.7,
    averageBalance: 297000
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      notation: "compact"
    }).format(value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-slate-600">Performing Loans</span>
              <span className="font-semibold text-green-600">{portfolioData.performingLoans}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full" 
                style={{ width: `${portfolioData.performingLoans}%` }}
              ></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-slate-600">30+ Days Past Due</span>
              <span className="font-semibold text-yellow-600">{portfolioData.thirtyDaysPastDue}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div 
                className="bg-yellow-500 h-2 rounded-full" 
                style={{ width: `${portfolioData.thirtyDaysPastDue}%` }}
              ></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-slate-600">90+ Days Past Due</span>
              <span className="font-semibold text-red-600">{portfolioData.ninetyDaysPastDue}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div 
                className="bg-red-500 h-2 rounded-full" 
                style={{ width: `${portfolioData.ninetyDaysPastDue}%` }}
              ></div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">
                {formatCurrency(portfolioData.averageBalance)}
              </p>
              <p className="text-sm text-slate-600">Average Loan Balance</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
