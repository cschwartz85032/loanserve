import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Edit2, Trash2, Eye, ChevronUp, ChevronDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";

interface LoanTableProps {
  onEditLoan?: (loanId: string) => void;
  onViewLoan?: (loanId: string) => void;
  onDeleteLoan?: (loanId: string) => void;
}

export function LoanTable({ onEditLoan, onViewLoan, onDeleteLoan }: LoanTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedLoans, setSelectedLoans] = useState<Set<number>>(new Set());
  const [holdLoans, setHoldLoans] = useState<Set<number>>(new Set());
  const limit = 50; // Show more loans like in the image

  const { data: loans, isLoading } = useQuery({
    queryKey: ["/api/loans", { limit, offset: page * limit, status: statusFilter === "all" ? undefined : statusFilter }],
  });

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "current":
        return "default";
      case "delinquent_30":
        return "secondary";
      case "delinquent_60":
      case "delinquent_90":
        return "destructive";
      default:
        return "outline";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "current":
        return "Current";
      case "delinquent_30":
        return "30+ Days Late";
      case "delinquent_60":
        return "60+ Days Late";
      case "delinquent_90":
        return "90+ Days Late";
      case "foreclosure":
        return "In Foreclosure";
      case "paid_off":
        return "Paid Off";
      default:
        return status;
    }
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`;
  };

  const toggleACH = (loanId: number) => {
    const newSelected = new Set(selectedLoans);
    if (newSelected.has(loanId)) {
      newSelected.delete(loanId);
    } else {
      newSelected.add(loanId);
    }
    setSelectedLoans(newSelected);
  };

  const toggleHold = (loanId: number) => {
    const newHold = new Set(holdLoans);
    if (newHold.has(loanId)) {
      newHold.delete(loanId);
    } else {
      newHold.add(loanId);
    }
    setHoldLoans(newHold);
  };

  // Calculate totals
  const totals = loans && Array.isArray(loans) ? loans.reduce((acc: any, loan: any) => {
    acc.principal += parseFloat(loan.principalBalance || 0);
    acc.payment += parseFloat(loan.paymentAmount || 0);
    acc.count += 1;
    return acc;
  }, { principal: 0, payment: 0, count: 0 }) : { principal: 0, payment: 0, count: 0 };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const loansList = Array.isArray(loans) ? loans : [];

  return (
    <div className="w-full bg-white">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">All Loans</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 border-y border-gray-300">
              <th className="border-r border-gray-300 px-2 py-2 text-xs font-medium text-gray-700 text-center">
                ACH
              </th>
              <th className="border-r border-gray-300 px-2 py-2 text-xs font-medium text-gray-700 text-center">
                HOLD
              </th>
              <th className="border-r border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 text-left">
                <div className="flex items-center">
                  ACCOUNT
                  <ChevronUp className="w-3 h-3 ml-1" />
                </div>
              </th>
              <th className="border-r border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 text-left">
                BORROWER NAME
              </th>
              <th className="border-r border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 text-left">
                BY LAST NAME
              </th>
              <th className="border-r border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 text-left">
                FIRST NAME
              </th>
              <th className="border-r border-gray-300 px-2 py-2 text-xs font-medium text-gray-700 text-center">
                MI
              </th>
              <th className="border-r border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 text-left">
                LAST NAME
              </th>
              <th className="border-r border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 text-center">
                INTEREST PAID TO
              </th>
              <th className="border-r border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 text-center">
                PAYMENT DUE DATE
              </th>
              <th className="border-r border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 text-center">
                PAYMENT FREQUENCY
              </th>
              <th className="border-r border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 text-right">
                REGULAR PAYMENT
              </th>
              <th className="px-3 py-2 text-xs font-medium text-gray-700 text-right">
                APPLY TO P & I
              </th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {loansList.length > 0 ? (
              loansList.map((loan: any, index: number) => {
                // Parse borrower name
                const borrowerName = loan.borrower?.borrowerName || '';
                const nameParts = borrowerName.split(' ');
                const firstName = nameParts[0] || '';
                const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
                const middleInitial = nameParts.length > 2 ? nameParts[1].charAt(0) : '';
                
                return (
                  <tr 
                    key={loan.id} 
                    className={`border-b border-gray-200 ${index % 2 === 0 ? 'bg-blue-50' : 'bg-white'}`}
                  >
                    <td className="border-r border-gray-200 px-2 py-2 text-center">
                      <Checkbox 
                        checked={selectedLoans.has(loan.id)}
                        onCheckedChange={() => toggleACH(loan.id)}
                      />
                    </td>
                    <td className="border-r border-gray-200 px-2 py-2 text-center">
                      <Checkbox 
                        checked={holdLoans.has(loan.id)}
                        onCheckedChange={() => toggleHold(loan.id)}
                      />
                    </td>
                    <td className="border-r border-gray-200 px-3 py-2 text-sm">
                      <button
                        onClick={() => onEditLoan?.(loan.id.toString())}
                        className="text-blue-600 hover:underline"
                      >
                        {loan.loanNumber}
                      </button>
                    </td>
                    <td className="border-r border-gray-200 px-3 py-2 text-sm">
                      {borrowerName}
                    </td>
                    <td className="border-r border-gray-200 px-3 py-2 text-sm">
                      {lastName}, {firstName}
                    </td>
                    <td className="border-r border-gray-200 px-3 py-2 text-sm">
                      {firstName}
                    </td>
                    <td className="border-r border-gray-200 px-2 py-2 text-sm text-center">
                      {middleInitial}
                    </td>
                    <td className="border-r border-gray-200 px-3 py-2 text-sm">
                      {lastName}
                    </td>
                    <td className="border-r border-gray-200 px-3 py-2 text-sm text-center">
                      {formatDate(loan.interestPaidTo)}
                    </td>
                    <td className="border-r border-gray-200 px-3 py-2 text-sm text-center">
                      {formatDate(loan.nextPaymentDate)}
                    </td>
                    <td className="border-r border-gray-200 px-3 py-2 text-sm text-center">
                      {loan.paymentFrequency || 'Monthly'}
                    </td>
                    <td className="border-r border-gray-200 px-3 py-2 text-sm text-right">
                      {formatCurrency(loan.paymentAmount)}
                    </td>
                    <td className="px-3 py-2 text-sm text-right">
                      {formatCurrency(loan.principalBalance)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={13} className="px-6 py-12 text-center text-gray-500">
                  No loans found
                </td>
              </tr>
            )}
          </tbody>
          {loansList.length > 0 && (
            <tfoot className="bg-gray-100 border-t-2 border-gray-400">
              <tr>
                <td colSpan={3} className="border-r border-gray-300 px-3 py-2 text-sm font-semibold">
                  {totals.count} loans
                </td>
                <td colSpan={8} className="border-r border-gray-300"></td>
                <td className="border-r border-gray-300 px-3 py-2 text-sm font-semibold text-right">
                  {formatCurrency(totals.payment)}
                </td>
                <td className="px-3 py-2 text-sm font-semibold text-right">
                  {formatCurrency(totals.principal)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}