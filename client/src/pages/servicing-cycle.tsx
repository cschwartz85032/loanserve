import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import {
  Zap, Calendar as CalendarIcon, Play, Pause, CheckCircle, AlertCircle,
  Info, RefreshCw, FileText, DollarSign, Users, TrendingUp, Clock,
  Activity, Download, Filter, Search, ChevronRight, AlertTriangle,
  CheckCircle2, XCircle, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ServicingRun {
  id: number;
  runId: string;
  valuationDate: string;
  startTime: string;
  endTime?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  loansProcessed: number;
  totalLoans: number;
  eventsCreated: number;
  exceptionsCreated: number;
  totalDisbursedBeneficiary: string;
  totalDisbursedInvestors: string;
  reconciliationStatus: 'pending' | 'balanced' | 'imbalanced';
  errors?: string[];
  dryRun: boolean;
}

interface ServicingEvent {
  id: number;
  runId: string;
  eventKey: string;
  eventType: string;
  loanId: number;
  loanNumber: string;
  timestamp: string;
  amount?: string;
  details: any;
  status: 'success' | 'failed' | 'pending';
}

interface Exception {
  id: number;
  runId: string;
  loanId: number;
  loanNumber: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  suggestedAction: string;
  dueDate: string;
  status: 'open' | 'resolved' | 'escalated';
  createdAt: string;
}

export default function ServicingCycle() {
  const { toast } = useToast();
  const [valuationDate, setValuationDate] = useState<Date>(new Date());
  const [selectedLoans, setSelectedLoans] = useState<string>("");
  const [dryRun, setDryRun] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Fetch current run status
  const { data: currentRun, isLoading: isLoadingCurrentRun } = useQuery({
    queryKey: ['/api/servicing-cycle/current'],
    refetchInterval: (data) => {
      // Poll every 2 seconds if running
      return data?.status === 'running' ? 2000 : false;
    }
  });

  // Fetch recent runs
  const { data: recentRuns = [], isLoading: isLoadingRuns } = useQuery({
    queryKey: ['/api/servicing-cycle/runs'],
  });

  // Fetch exceptions
  const { data: exceptions = [], isLoading: isLoadingExceptions } = useQuery({
    queryKey: ['/api/servicing-cycle/exceptions'],
  });

  // Fetch today's summary
  const { data: todaySummary } = useQuery({
    queryKey: ['/api/servicing-cycle/summary', format(new Date(), 'yyyy-MM-dd')],
  });

  // Start servicing cycle mutation
  const startCycleMutation = useMutation({
    mutationFn: async (params: { valuationDate: string; loanIds?: string[]; dryRun: boolean }) => {
      const response = await fetch('/api/servicing-cycle/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(params)
      });
      if (!response.ok) throw new Error('Failed to start servicing cycle');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Servicing Cycle Started",
        description: `Run ID: ${data.runId}. Processing ${data.totalLoans} loans.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/servicing-cycle'] });
    },
    onError: (error) => {
      toast({
        title: "Failed to Start Cycle",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Cancel current run mutation
  const cancelCycleMutation = useMutation({
    mutationFn: async (runId: string) => {
      const response = await fetch(`/api/servicing-cycle/cancel/${runId}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to cancel servicing cycle');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Servicing Cycle Cancelled",
        description: "The current run has been cancelled.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/servicing-cycle'] });
    }
  });

  // Export run report
  const exportReport = async (runId: string, format: 'json' | 'csv') => {
    try {
      const response = await fetch(`/api/servicing-cycle/export/${runId}?format=${format}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to export report');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `servicing-run-${runId}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Report Exported",
        description: `Report downloaded as ${format.toUpperCase()}`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export report",
        variant: "destructive",
      });
    }
  };

  const handleStartCycle = () => {
    const loanIds = selectedLoans 
      ? selectedLoans.split(',').map(id => id.trim()).filter(Boolean)
      : undefined;

    startCycleMutation.mutate({
      valuationDate: format(valuationDate, 'yyyy-MM-dd'),
      loanIds,
      dryRun
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-yellow-500 rounded-lg flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Daily Servicing Cycle</h1>
                <p className="text-sm text-slate-600">Process loans, payments, and distributions</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {currentRun?.status === 'running' && (
                <div className="flex items-center space-x-2">
                  <Activity className="h-5 w-5 text-blue-500 animate-pulse" />
                  <span className="text-sm font-medium">Cycle in Progress</span>
                  <Progress 
                    value={(currentRun.loansProcessed / currentRun.totalLoans) * 100} 
                    className="w-32 h-2"
                  />
                  <span className="text-sm text-slate-600">
                    {currentRun.loansProcessed}/{currentRun.totalLoans}
                  </span>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6">
          {/* Control Panel */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Cycle Control Panel</CardTitle>
              <CardDescription>Configure and execute the daily servicing cycle</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Valuation Date */}
                <div className="space-y-2">
                  <Label>Valuation Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !valuationDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {valuationDate ? format(valuationDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={valuationDate}
                        onSelect={(date) => date && setValuationDate(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Loan Filter */}
                <div className="space-y-2">
                  <Label>Loan IDs (Optional)</Label>
                  <Input
                    placeholder="e.g., 17,18,19"
                    value={selectedLoans}
                    onChange={(e) => setSelectedLoans(e.target.value)}
                    disabled={currentRun?.status === 'running'}
                  />
                </div>

                {/* Dry Run Toggle */}
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <div className="flex items-center space-x-2 pt-2">
                    <Switch
                      id="dry-run"
                      checked={dryRun}
                      onCheckedChange={setDryRun}
                      disabled={currentRun?.status === 'running'}
                    />
                    <Label htmlFor="dry-run" className="cursor-pointer">
                      {dryRun ? "Dry Run (Test Mode)" : "Live Run"}
                    </Label>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2">
                  <Label>&nbsp;</Label>
                  {currentRun?.status === 'running' ? (
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => cancelCycleMutation.mutate(currentRun.runId)}
                      disabled={cancelCycleMutation.isPending}
                    >
                      <Pause className="mr-2 h-4 w-4" />
                      Cancel Cycle
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={handleStartCycle}
                      disabled={startCycleMutation.isPending}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Start Cycle
                    </Button>
                  )}
                </div>
              </div>

              {!dryRun && (
                <Alert className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Live Mode Active</AlertTitle>
                  <AlertDescription>
                    This will process actual transactions and update loan balances. Ensure all preconditions are met.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Today's Processed</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{todaySummary?.loansProcessed || 0}</div>
                <p className="text-xs text-muted-foreground">
                  of {todaySummary?.totalLoans || 0} total loans
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Payments Posted</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${todaySummary?.paymentsPosted || '0.00'}
                </div>
                <p className="text-xs text-muted-foreground">
                  {todaySummary?.paymentCount || 0} transactions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Investor Distributions</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${todaySummary?.investorDistributions || '0.00'}
                </div>
                <p className="text-xs text-muted-foreground">
                  to {todaySummary?.investorCount || 0} investors
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Exceptions</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{exceptions.filter((e: Exception) => e.status === 'open').length}</div>
                <p className="text-xs text-muted-foreground">
                  {exceptions.filter((e: Exception) => e.severity === 'critical').length} critical
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="history">Run History</TabsTrigger>
              <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
              <TabsTrigger value="events">Events Log</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              {currentRun ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Current Run: {currentRun.runId}</CardTitle>
                      <Badge variant={currentRun.dryRun ? "secondary" : "default"}>
                        {currentRun.dryRun ? "Dry Run" : "Live"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Status</span>
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(currentRun.status)}
                          <span className="text-sm capitalize">{currentRun.status}</span>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Progress</span>
                          <span>{currentRun.loansProcessed} / {currentRun.totalLoans}</span>
                        </div>
                        <Progress value={(currentRun.loansProcessed / currentRun.totalLoans) * 100} />
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Events Created</p>
                          <p className="text-lg font-semibold">{currentRun.eventsCreated}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Exceptions</p>
                          <p className="text-lg font-semibold">{currentRun.exceptionsCreated}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Beneficiary Disbursed</p>
                          <p className="text-lg font-semibold">${currentRun.totalDisbursedBeneficiary}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Investor Disbursed</p>
                          <p className="text-lg font-semibold">${currentRun.totalDisbursedInvestors}</p>
                        </div>
                      </div>

                      {currentRun.status === 'completed' && (
                        <div className="flex space-x-2 pt-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => exportReport(currentRun.runId, 'json')}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Export JSON
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => exportReport(currentRun.runId, 'csv')}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Export CSV
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Zap className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Active Cycle</h3>
                    <p className="text-sm text-muted-foreground text-center max-w-md">
                      Configure your parameters above and click "Start Cycle" to begin processing loans for the selected valuation date.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history">
              <Card>
                <CardHeader>
                  <CardTitle>Run History</CardTitle>
                  <CardDescription>Previous servicing cycle executions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {recentRuns.map((run: ServicingRun) => (
                      <div key={run.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-4">
                          {getStatusIcon(run.status)}
                          <div>
                            <p className="font-medium">{run.runId}</p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(run.valuationDate), 'PPP')} · {run.loansProcessed} loans
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {run.dryRun && <Badge variant="secondary">Dry Run</Badge>}
                          <Badge className={cn(
                            run.reconciliationStatus === 'balanced' 
                              ? 'bg-green-100 text-green-800'
                              : run.reconciliationStatus === 'imbalanced'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          )}>
                            {run.reconciliationStatus}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => exportReport(run.runId, 'json')}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Exceptions Tab */}
            <TabsContent value="exceptions">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Exceptions</CardTitle>
                      <CardDescription>Issues requiring attention</CardDescription>
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="escalated">Escalated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {exceptions
                      .filter((e: Exception) => statusFilter === 'all' || e.status === statusFilter)
                      .map((exception: Exception) => (
                        <div key={exception.id} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <Badge className={getSeverityColor(exception.severity)}>
                                {exception.severity}
                              </Badge>
                              <Badge variant="outline">{exception.type}</Badge>
                              <span className="text-sm text-muted-foreground">
                                Loan {exception.loanNumber}
                              </span>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(exception.createdAt), 'PPp')}
                            </span>
                          </div>
                          <p className="font-medium mb-1">{exception.message}</p>
                          <p className="text-sm text-muted-foreground mb-3">
                            Suggested Action: {exception.suggestedAction}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">
                              Due: {format(new Date(exception.dueDate), 'PP')}
                            </span>
                            <Button variant="outline" size="sm">
                              <ChevronRight className="h-4 w-4 mr-1" />
                              View Details
                            </Button>
                          </div>
                        </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Events Log Tab */}
            <TabsContent value="events">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Events Log</CardTitle>
                      <CardDescription>Detailed cycle event history</CardDescription>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search events..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="pl-8 w-64"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground text-center py-8">
                    Events will be displayed here when a servicing cycle is running or completed.
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}