import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, CalendarIcon, TrendingUp, DollarSign, AlertCircle, FileText, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { CHART_COLORS } from "@/lib/constants";

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: new Date(new Date().getFullYear(), 0, 1),
    to: new Date(),
  });
  const [reportType, setReportType] = useState("portfolio");

  const { data: reportData, isLoading } = useQuery({
    queryKey: ["/api/reports", reportType, dateRange],
    enabled: !!dateRange.from && !!dateRange.to,
  });

  const performanceData = [
    { month: "Jan", collections: 125000, delinquency: 2.5 },
    { month: "Feb", collections: 132000, delinquency: 2.3 },
    { month: "Mar", collections: 128000, delinquency: 2.8 },
    { month: "Apr", collections: 141000, delinquency: 2.1 },
    { month: "May", collections: 138000, delinquency: 2.4 },
    { month: "Jun", collections: 145000, delinquency: 2.0 },
  ];

  const portfolioDistribution = [
    { name: "Current", value: 850, color: CHART_COLORS.success },
    { name: "30+ Days", value: 45, color: CHART_COLORS.warning },
    { name: "60+ Days", value: 25, color: CHART_COLORS.danger },
    { name: "90+ Days", value: 15, color: CHART_COLORS.danger },
  ];

  const downloadReport = (format: string) => {
    // Implementation for downloading reports
    console.log(`Downloading ${reportType} report in ${format} format`);
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Reports & Analytics</h1>
              <p className="text-muted-foreground">Generate comprehensive reports and analyze portfolio performance</p>
            </div>
        <div className="flex gap-2">
          <Button onClick={() => downloadReport("pdf")} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
          <Button onClick={() => downloadReport("excel")}>
            <Download className="mr-2 h-4 w-4" />
            Export Excel
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report Parameters</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Select value={reportType} onValueChange={setReportType}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select report type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="portfolio">Portfolio Summary</SelectItem>
              <SelectItem value="delinquency">Delinquency Report</SelectItem>
              <SelectItem value="collections">Collections Report</SelectItem>
              <SelectItem value="escrow">Escrow Analysis</SelectItem>
              <SelectItem value="compliance">Compliance Report</SelectItem>
              <SelectItem value="investor">Investor Report</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[280px] justify-start text-left font-normal")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                    </>
                  ) : (
                    format(dateRange.from, "LLL dd, y")
                  )
                ) : (
                  <span>Pick a date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={{ from: dateRange.from, to: dateRange.to }}
                onSelect={(range: any) => setDateRange(range || { from: undefined, to: undefined })}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          <Button>Generate Report</Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="distribution">Distribution</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Loans</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">935</div>
                <p className="text-xs text-muted-foreground">+12 from last month</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">$285.4M</div>
                <p className="text-xs text-muted-foreground">+2.5% from last month</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Delinquency Rate</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">2.1%</div>
                <p className="text-xs text-muted-foreground">-0.3% from last month</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Collections YTD</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">$18.2M</div>
                <p className="text-xs text-muted-foreground">98.5% of target</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance">
          <Card>
            <CardHeader>
              <CardTitle>Collections & Delinquency Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="collections" stroke={CHART_COLORS.primary} name="Collections ($)" />
                  <Line yAxisId="right" type="monotone" dataKey="delinquency" stroke={CHART_COLORS.danger} name="Delinquency Rate (%)" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="distribution">
          <Card>
            <CardHeader>
              <CardTitle>Portfolio Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={portfolioDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                    outerRadius={150}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {portfolioDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Collection Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="collections" fill={CHART_COLORS.primary} name="Collections ($)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-6">
          {/* First Row of Report Categories */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Loan Transactions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Loan Transactions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Add Funding (Conventional)
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Add Funding (Government)
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Add Funding (Construction)
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Add Funding (Line Of Credit)
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Regular Payment
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Payoff Payment
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Other Cash From Borrower
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Other Cash From Lender
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Automated Payments (LOCKBOX)
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Printable Payment
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Adjustments
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Add Charges
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Payment Register
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Payment Receipts
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Payment Statements
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Payment Coupons
                </Button>
              </CardContent>
            </Card>

            {/* Lender & Vendor Transactions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Lender & Vendor Transactions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Cash & Print Checks
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  From Remittance Report
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Funding Check Report
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Check Register
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Verification of Electronic Deposit
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Other Cash Received
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Adjustments
                </Button>
              </CardContent>
            </Card>

            {/* Borrower Reports & Notices */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Borrower Reports & Notices</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Borrower Statement of Account
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Borrower Late Notices
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Insurance Expiration Notices
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Demand for Payoff
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Beneficiary Statement
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Reinstatement Notice
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Balloon Payment Notice
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  IDD Delinquency Notice
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Outstanding Charges Report
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Write Borrower Letters
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Write Funding Lenders In 1 Late Letters
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Name & Address Listing
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Mailing Labels
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Second Row of Report Categories */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Lender Reports & Notices */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Lender Reports & Notices</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Lender Statement of Account
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Lender Interest Accrual Report
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Outstanding Lender Notices Report
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Maturity Report
                </Button>
              </CardContent>
            </Card>

            {/* Vendor Reports & Notices */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Vendor Reports & Notices</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Vendor Statement of Account
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Outstanding Charges Report
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Vendor Distribution Report
                </Button>
              </CardContent>
            </Card>

            {/* Loan Management Reports */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Loan Management Reports</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Loan Report
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Maturity Report
                </Button>
                <Button variant="link" className="w-full justify-start p-0 h-auto text-blue-600 hover:text-blue-800">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Delinquency Report
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
        </div>
      </main>
    </div>
  );
}