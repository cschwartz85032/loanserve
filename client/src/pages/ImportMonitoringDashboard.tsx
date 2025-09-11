import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  RefreshCw,
  TrendingUp,
  Upload,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';

interface ImportProgress {
  importId: string;
  stage: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  recordsProcessed?: number;
  recordsTotal?: number;
  errorDetails?: any;
  startedAt?: string;
  completedAt?: string;
}

interface DashboardMetrics {
  activeImports: number;
  completedToday: number;
  failedToday: number;
  averageProcessingTime: number;
  recordsProcessedToday: number;
  recentImports: Array<{
    id: string;
    filename: string;
    status: string;
    recordsTotal: number;
    recordsProcessed: number;
    startedAt: string;
  }>;
  errorsByType: Record<string, number>;
}

export default function ImportMonitoringDashboard() {
  const [selectedImport, setSelectedImport] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch dashboard metrics
  const { data: dashboardData, refetch: refetchDashboard } = useQuery<DashboardMetrics>({
    queryKey: ['/api/imports/monitoring/dashboard'],
    refetchInterval: autoRefresh ? 5000 : false,
  });

  // Fetch active imports
  const { data: activeImports, refetch: refetchActive } = useQuery<{
    activeImports: Array<any>;
    count: number;
  }>({
    queryKey: ['/api/imports/monitoring/active'],
    refetchInterval: autoRefresh ? 3000 : false,
  });

  // Fetch import errors
  const { data: importErrors } = useQuery<{
    errors: Array<any>;
    errorsByType: Record<string, number>;
    count: number;
    since: string;
  }>({
    queryKey: ['/api/imports/monitoring/errors'],
    refetchInterval: autoRefresh ? 10000 : false,
  });

  // Fetch specific import progress if selected
  const { data: importProgress } = useQuery({
    queryKey: [`/api/imports/monitoring/${selectedImport}/progress`],
    enabled: !!selectedImport,
    refetchInterval: autoRefresh && selectedImport ? 2000 : false,
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'in_progress':
      case 'processing':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      completed: 'default',
      failed: 'destructive',
      processing: 'secondary',
      in_progress: 'secondary',
      pending: 'outline',
    };
    
    return (
      <Badge variant={variants[status] || 'outline'} className="flex items-center gap-1">
        {getStatusIcon(status)}
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const calculateProgress = (processed?: number, total?: number) => {
    if (!processed || !total || total === 0) return 0;
    return Math.round((processed / total) * 100);
  };

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-import-monitoring">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Import Monitoring</h1>
          <p className="text-muted-foreground">Real-time monitoring of file imports and processing</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            data-testid="button-toggle-refresh"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchDashboard();
              refetchActive();
            }}
            data-testid="button-manual-refresh"
          >
            Refresh Now
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Imports</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-imports">
              {dashboardData?.activeImports || 0}
            </div>
            <p className="text-xs text-muted-foreground">Currently processing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-completed-today">
              {dashboardData?.completedToday || 0}
            </div>
            <p className="text-xs text-muted-foreground">Successfully processed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed Today</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-failed-today">
              {dashboardData?.failedToday || 0}
            </div>
            <p className="text-xs text-muted-foreground">Require attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Processing Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-time">
              {dashboardData?.averageProcessingTime 
                ? `${Math.round(dashboardData.averageProcessingTime / 60)}m`
                : '0m'}
            </div>
            <p className="text-xs text-muted-foreground">Per import</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Records Today</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-records-today">
              {dashboardData?.recordsProcessedToday?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground">Total processed</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active" data-testid="tab-active">Active Imports</TabsTrigger>
          <TabsTrigger value="recent" data-testid="tab-recent">Recent Imports</TabsTrigger>
          <TabsTrigger value="errors" data-testid="tab-errors">Errors</TabsTrigger>
        </TabsList>

        {/* Active Imports Tab */}
        <TabsContent value="active" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Currently Processing</CardTitle>
              <CardDescription>
                Real-time status of active import jobs
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeImports && activeImports.activeImports && activeImports.activeImports.length > 0 ? (
                <div className="space-y-4">
                  {activeImports.activeImports.map((imp: any) => 
                    imp && imp.import ? (
                      <div
                        key={imp.import.id}
                        className="border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-accent"
                        onClick={() => setSelectedImport(imp.import.id)}
                        data-testid={`card-import-${imp.import.id}`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{imp.import.filename}</p>
                            <p className="text-sm text-muted-foreground">
                              ID: {imp.import.id}
                            </p>
                          </div>
                          {getStatusBadge(imp.import.status)}
                        </div>
                        
                        {imp.currentStage && (
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>Stage: {imp.currentStage}</span>
                              <span>
                                {imp.recordsProcessed || 0} / {imp.recordsTotal || 0} records
                              </span>
                            </div>
                            <Progress 
                              value={calculateProgress(imp.recordsProcessed, imp.recordsTotal)} 
                              className="h-2"
                            />
                          </div>
                        )}
                        
                        <p className="text-xs text-muted-foreground">
                          Started: {imp.startedAt ? format(new Date(imp.startedAt), 'HH:mm:ss') : 'Unknown'}
                        </p>
                      </div>
                    ) : null
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No active imports</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recent Imports Tab */}
        <TabsContent value="recent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Import History</CardTitle>
              <CardDescription>
                Imports processed in the last 24 hours
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filename</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboardData?.recentImports?.map((imp) => (
                      <TableRow key={imp.id} data-testid={`row-recent-${imp.id}`}>
                        <TableCell className="font-medium">
                          {imp.filename}
                        </TableCell>
                        <TableCell>{getStatusBadge(imp.status)}</TableCell>
                        <TableCell>
                          {imp.recordsProcessed}/{imp.recordsTotal}
                        </TableCell>
                        <TableCell>
                          {format(new Date(imp.startedAt), 'MMM d, HH:mm')}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedImport(imp.id)}
                            data-testid={`button-view-${imp.id}`}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Errors Tab */}
        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Import Errors</CardTitle>
              <CardDescription>
                Errors encountered during import processing
              </CardDescription>
            </CardHeader>
            <CardContent>
              {importErrors?.errorsByType && Object.keys(importErrors.errorsByType).length > 0 ? (
                <div className="space-y-4">
                  <div className="grid gap-2">
                    {Object.entries(importErrors.errorsByType).map(([type, count]) => (
                      <div key={type} className="flex justify-between items-center p-2 border rounded">
                        <span className="font-medium">{type}</span>
                        <Badge variant="destructive">{count as number}</Badge>
                      </div>
                    ))}
                  </div>
                  
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2">
                      {importErrors?.errors?.map((error: any, idx: number) => (
                        <div 
                          key={idx} 
                          className="border rounded p-3 space-y-1"
                          data-testid={`card-error-${idx}`}
                        >
                          <div className="flex justify-between items-start">
                            <p className="text-sm font-medium">{error.filename}</p>
                            <Badge variant="destructive" className="text-xs">
                              {error.stage}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{error.message}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(error.createdAt), 'MMM d, HH:mm:ss')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500 opacity-50" />
                  <p>No errors in the last 24 hours</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Import Detail Modal/Sidebar */}
      {selectedImport && importProgress && (
        <Card className="fixed right-4 top-20 w-96 max-h-[80vh] overflow-auto shadow-lg z-50">
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              Import Details
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedImport(null)}
                data-testid="button-close-details"
              >
                ×
              </Button>
            </CardTitle>
            <CardDescription>ID: {selectedImport}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Processing Stages</h4>
                <div className="space-y-2">
                  {(importProgress as any)?.stages?.map((stage: ImportProgress) => (
                    <div key={stage.stage} className="flex items-center gap-2">
                      {getStatusIcon(stage.status)}
                      <span className="text-sm flex-1">{stage.stage}</span>
                      {stage.recordsTotal && (
                        <span className="text-xs text-muted-foreground">
                          {stage.recordsProcessed}/{stage.recordsTotal}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              {(importProgress as any)?.summary && (
                <div>
                  <h4 className="font-medium mb-2">Summary</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Total Stages:</div>
                    <div>{(importProgress as any).summary.totalStages}</div>
                    <div>Completed:</div>
                    <div>{(importProgress as any).summary.completedStages}</div>
                    <div>Failed:</div>
                    <div>{(importProgress as any).summary.failedStages}</div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}