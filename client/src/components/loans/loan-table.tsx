import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Edit2, Trash2, Eye, ChevronUp, ChevronDown, Mail, Zap } from "lucide-react";
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
  const [checkedLoans, setCheckedLoans] = useState<Set<number>>(new Set());
  const [sortField, setSortField] = useState<string>("loanNumber");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
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

  const toggleCheckbox = (loanId: number) => {
    const newChecked = new Set(checkedLoans);
    if (newChecked.has(loanId)) {
      newChecked.delete(loanId);
    } else {
      newChecked.add(loanId);
    }
    setCheckedLoans(newChecked);
  };

  const toggleAllCheckboxes = (loans: any[]) => {
    if (checkedLoans.size === loans.length && loans.length > 0) {
      setCheckedLoans(new Set());
    } else {
      const allIds = loans.map((loan: any) => loan.id);
      setCheckedLoans(new Set(allIds));
    }
  };

  const handleDeleteSelected = () => {
    // Handle delete selected loans
    console.log('Delete selected loans:', Array.from(checkedLoans));
  };

  const handleEmailSelected = () => {
    // Handle email selected loans
    console.log('Email selected loans:', Array.from(checkedLoans));
  };

  const handleProcessSelected = () => {
    // Handle process selected loans
    console.log('Process selected loans:', Array.from(checkedLoans));
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

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Sort loans
  const sortedLoans = Array.isArray(loans) ? [...loans].sort((a: any, b: any) => {
    let aValue = a;
    let bValue = b;

    // Navigate to nested values
    if (sortField === "borrowerName") {
      // Get borrower name directly from the loan's borrowerName field
      aValue = a.borrowerName || '';
      bValue = b.borrowerName || '';
    } else if (sortField.includes('.')) {
      const fields = sortField.split('.');
      aValue = fields.reduce((obj, field) => obj?.[field], a);
      bValue = fields.reduce((obj, field) => obj?.[field], b);
    } else {
      aValue = a[sortField];
      bValue = b[sortField];
    }

    // Handle different data types
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === "asc" 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }
    
    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  }) : [];

  const loansList = sortedLoans;

  return (
    <div className="w-full bg-white">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">All Loans</h2>
        {checkedLoans.size > 0 && (
          <div className="flex items-center gap-2 mt-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDeleteSelected}
                    className="h-8 w-8"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Delete selected loans</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleEmailSelected}
                    className="h-8 w-8"
                  >
                    <Mail className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Email selected loans</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleProcessSelected}
                    className="h-8 w-8"
                  >
                    <Zap className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Process selected loans</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span className="text-sm text-gray-600 ml-2">
              {checkedLoans.size} loan{checkedLoans.size !== 1 ? 's' : ''} selected
            </span>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 border-y border-gray-300">
              <th className="border-r border-gray-300 px-2 py-2 text-xs font-medium text-gray-700 text-center">
                <Checkbox 
                  checked={checkedLoans.size === loansList.length && loansList.length > 0}
                  onCheckedChange={() => toggleAllCheckboxes(loansList)}
                />
              </th>
              <th className="border-r border-gray-300 px-2 py-2 text-xs font-medium text-gray-700 text-center">
                ACH
              </th>
              <th className="border-r border-gray-300 px-2 py-2 text-xs font-medium text-gray-700 text-center">
                HOLD
              </th>
              <th className="border-r border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 text-left">
                <button
                  onClick={() => handleSort("loanNumber")}
                  className="flex items-center hover:text-gray-900"
                >
                  ACCOUNT
                  {sortField === "loanNumber" && (
                    sortDirection === "asc" ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />
                  )}
                </button>
              </th>
              <th className="border-r border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 text-left">
                <button
                  onClick={() => handleSort("borrowerName")}
                  className="flex items-center hover:text-gray-900"
                >
                  BORROWER NAME
                  {sortField === "borrowerName" && (
                    sortDirection === "asc" ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />
                  )}
                </button>
              </th>
              <th className="border-r border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 text-center">
                <button
                  onClick={() => handleSort("interestPaidTo")}
                  className="hover:text-gray-900"
                >
                  INTEREST PAID TO
                  {sortField === "interestPaidTo" && (
                    sortDirection === "asc" ? <ChevronUp className="w-3 h-3 ml-1 inline" /> : <ChevronDown className="w-3 h-3 ml-1 inline" />
                  )}
                </button>
              </th>
              <th className="border-r border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 text-center">
                <button
                  onClick={() => handleSort("nextPaymentDate")}
                  className="hover:text-gray-900"
                >
                  PAYMENT DUE DATE
                  {sortField === "nextPaymentDate" && (
                    sortDirection === "asc" ? <ChevronUp className="w-3 h-3 ml-1 inline" /> : <ChevronDown className="w-3 h-3 ml-1 inline" />
                  )}
                </button>
              </th>
              <th className="border-r border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 text-center">
                PAYMENT FREQUENCY
              </th>
              <th className="border-r border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 text-right">
                <button
                  onClick={() => handleSort("paymentAmount")}
                  className="hover:text-gray-900"
                >
                  REGULAR PAYMENT
                  {sortField === "paymentAmount" && (
                    sortDirection === "asc" ? <ChevronUp className="w-3 h-3 ml-1 inline" /> : <ChevronDown className="w-3 h-3 ml-1 inline" />
                  )}
                </button>
              </th>
              <th className="px-3 py-2 text-xs font-medium text-gray-700 text-right">
                <button
                  onClick={() => handleSort("principalBalance")}
                  className="hover:text-gray-900"
                >
                  APPLY TO P & I
                  {sortField === "principalBalance" && (
                    sortDirection === "asc" ? <ChevronUp className="w-3 h-3 ml-1 inline" /> : <ChevronDown className="w-3 h-3 ml-1 inline" />
                  )}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {loansList.length > 0 ? (
              loansList.map((loan: any, index: number) => {
                // Get borrower name directly from the loan's borrowerName field
                const borrowerName = loan.borrowerName || '';
                
                return (
                  <tr 
                    key={loan.id} 
                    className={`border-b border-gray-200 ${index % 2 === 0 ? 'bg-blue-50' : 'bg-white'}`}
                  >
                    <td className="border-r border-gray-200 px-2 py-2 text-center">
                      <Checkbox 
                        checked={checkedLoans.has(loan.id)}
                        onCheckedChange={() => toggleCheckbox(loan.id)}
                      />
                    </td>
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
                <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                  No loans found
                </td>
              </tr>
            )}
          </tbody>
          {loansList.length > 0 && (
            <tfoot className="bg-gray-100 border-t-2 border-gray-400">
              <tr>
                <td colSpan={4} className="border-r border-gray-300 px-3 py-2 text-sm font-semibold">
                  {totals.count} loans
                </td>
                <td colSpan={4} className="border-r border-gray-300"></td>
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