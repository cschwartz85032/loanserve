import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  FileText, 
  Eye,
  Activity,
  Lock,
  Database,
  Hash,
  Search,
  Download,
  RefreshCw,
  AlertCircle,
  XCircle,
  Info,
  ShieldCheck,
  ShieldAlert,
  FileCheck,
  Trash2,
  Scale
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { PRIORITY_LEVELS } from "@/lib/constants";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Event type color mapping
const getEventTypeColor = (eventType: string) => {
  const [category] = eventType.split('.');
  const colors: Record<string, string> = {
    SECURITY: "text-red-600 bg-red-50",
    COMPLIANCE: "text-purple-600 bg-purple-50",
    ERROR: "text-orange-600 bg-orange-50",
    LOAN: "text-blue-600 bg-blue-50",
    PAYMENT: "text-green-600 bg-green-50",
    DOCUMENT: "text-yellow-600 bg-yellow-50",
    USER: "text-indigo-600 bg-indigo-50",
    ESCROW: "text-teal-600 bg-teal-50",
    CRM: "text-pink-600 bg-pink-50",
    FEE: "text-amber-600 bg-amber-50"
  };
  return colors[category] || "text-gray-600 bg-gray-50";
};

// Actor type icons
const getActorIcon = (actorType: string) => {
  switch (actorType) {
    case 'user':
      return <Shield className="h-3 w-3" />;
    case 'system':
      return <Activity className="h-3 w-3" />;
    case 'integration':
      return <Database className="h-3 w-3" />;
    default:
      return <Info className="h-3 w-3" />;
  }
};

export default function CompliancePage() {
  const [selectedPeriod, setSelectedPeriod] = useState("7days");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [actorTypeFilter, setActorTypeFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [auditLogPage, setAuditLogPage] = useState(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch compliance dashboard metrics
  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ["/api/compliance/dashboard"],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Fetch audit logs with pagination and filters
  const { data: auditLogs, isLoading: logsLoading } = useQuery({
    queryKey: ["/api/compliance/audit-logs", { 
      page: auditLogPage, 
      limit: 50,
      eventType: eventTypeFilter !== 'all' ? eventTypeFilter : undefined,
      actorType: actorTypeFilter !== 'all' ? actorTypeFilter : undefined,
      search: searchTerm || undefined
    }]
  });

  // Fetch event types for filtering
  const { data: eventTypes } = useQuery({
    queryKey: ["/api/compliance/event-types"]
  });

  // Fetch chain integrity status
  const { data: chainIntegrity, refetch: refetchIntegrity } = useQuery({
    queryKey: ["/api/compliance/chain-integrity"]
  });

  // Fetch retention policies
  const { data: retentionPolicies } = useQuery({
    queryKey: ["/api/compliance/retention-policies"]
  });

  // Fetch legal holds
  const { data: legalHolds } = useQuery({
    queryKey: ["/api/compliance/legal-holds", { active: true }]
  });

  // Fetch deletion receipts
  const { data: deletionReceipts } = useQuery({
    queryKey: ["/api/compliance/deletion-receipts", { limit: 50 }]
  });

  // Fetch activity timeline
  const { data: timeline } = useQuery({
    queryKey: ["/api/compliance/activity-timeline", { hours: 24 }]
  });

  // Generate audit pack mutation
  const generateAuditPack = useMutation({
    mutationFn: async (dates: { startDate: string; endDate: string }) => {
      return apiRequest('/api/compliance/audit-pack', {
        method: 'POST',
        body: JSON.stringify(dates)
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Audit Pack Generated",
        description: `Generated audit pack with ${data.entries?.length || 0} entries`,
      });
      // Download the audit pack as JSON
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-pack-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate audit pack",
        variant: "destructive"
      });
    }
  });

  const getComplianceScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 70) return "text-yellow-600";
    return "text-red-600";
  };

  const getIntegrityStatus = () => {
    if (!chainIntegrity) return { icon: <Info />, text: "Unknown", color: "text-gray-500" };
    if (chainIntegrity.isValid) {
      return { icon: <CheckCircle />, text: "Valid", color: "text-green-600" };
    }
    return { icon: <XCircle />, text: "Compromised", color: "text-red-600" };
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Phase 9 Compliance Management</h1>
              <p className="text-muted-foreground">
                Complete monitoring of all critical behaviors, requests, and actions
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => refetchIntegrity()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Verify Integrity
              </Button>
              <Button
                onClick={() => {
                  const today = new Date();
                  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
                  generateAuditPack.mutate({
                    startDate: lastMonth.toISOString(),
                    endDate: today.toISOString()
                  });
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                Generate Audit Pack
              </Button>
            </div>
          </div>

          {/* Key Metrics Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Compliance Score</CardTitle>
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${getComplianceScoreColor(dashboard?.metrics?.complianceScore || 0)}`}>
                  {dashboard?.metrics?.complianceScore?.toFixed(1) || 0}%
                </div>
                <Progress 
                  value={dashboard?.metrics?.complianceScore || 0} 
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Chain: {getIntegrityStatus().text}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Today's Events</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {dashboard?.metrics?.todayEvents || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {dashboard?.metrics?.criticalEvents || 0} critical events
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Legal Holds</CardTitle>
                <Scale className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {dashboard?.metrics?.activeHolds || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {dashboard?.metrics?.retentionPolicies || 0} retention policies
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Hash Chain Status</CardTitle>
                <Hash className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold ${getIntegrityStatus().color}`}>
                    {getIntegrityStatus().icon}
                  </span>
                  <span className="text-xl font-semibold">
                    {getIntegrityStatus().text}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {dashboard?.metrics?.chainIntegrity?.brokenLinks || 0} broken links
                </p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="audit-logs" className="space-y-4">
            <TabsList className="grid grid-cols-6 w-full">
              <TabsTrigger value="audit-logs">Audit Logs</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="integrity">Chain Integrity</TabsTrigger>
              <TabsTrigger value="retention">Retention</TabsTrigger>
              <TabsTrigger value="legal-holds">Legal Holds</TabsTrigger>
              <TabsTrigger value="deletions">Deletions</TabsTrigger>
            </TabsList>

            {/* Audit Logs Tab */}
            <TabsContent value="audit-logs">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>Compliance Audit Trail</CardTitle>
                      <CardDescription>
                        Immutable hash-chained audit logs with complete event tracking
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Search logs..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-[200px]"
                      />
                      <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Event Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Events</SelectItem>
                          <SelectItem value="SECURITY">Security</SelectItem>
                          <SelectItem value="COMPLIANCE">Compliance</SelectItem>
                          <SelectItem value="ERROR">Errors</SelectItem>
                          <SelectItem value="LOAN">Loans</SelectItem>
                          <SelectItem value="PAYMENT">Payments</SelectItem>
                          <SelectItem value="DOCUMENT">Documents</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={actorTypeFilter} onValueChange={setActorTypeFilter}>
                        <SelectTrigger className="w-[150px]">
                          <SelectValue placeholder="Actor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Actors</SelectItem>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="system">System</SelectItem>
                          <SelectItem value="integration">Integration</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[600px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[150px]">Timestamp</TableHead>
                          <TableHead>Event Type</TableHead>
                          <TableHead>Actor</TableHead>
                          <TableHead>Resource</TableHead>
                          <TableHead>Details</TableHead>
                          <TableHead className="w-[100px]">Hash</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditLogs?.logs?.map((log: any) => (
                          <TableRow key={log.id} className="hover:bg-muted/50">
                            <TableCell className="font-mono text-xs">
                              {format(new Date(log.createdAt), "MMM dd HH:mm:ss")}
                            </TableCell>
                            <TableCell>
                              <Badge className={getEventTypeColor(log.eventType)}>
                                {log.eventType}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {getActorIcon(log.actorType)}
                                <span className="text-sm">
                                  {log.actorId || log.actorType}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <div className="font-medium">{log.resourceType}</div>
                                {log.resourceId && (
                                  <div className="text-muted-foreground text-xs">
                                    ID: {log.resourceId}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="max-w-[300px] truncate text-xs">
                                {log.payloadJson && (
                                  <code className="bg-muted px-1 rounded">
                                    {typeof log.payloadJson === 'string' 
                                      ? log.payloadJson 
                                      : JSON.stringify(log.payloadJson).substring(0, 100)}
                                  </code>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <code className="text-xs font-mono text-muted-foreground">
                                {log.recordHash?.substring(0, 8)}...
                              </code>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                  
                  {/* Pagination */}
                  {auditLogs?.pagination && (
                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm text-muted-foreground">
                        Page {auditLogs.pagination.page} of {auditLogs.pagination.totalPages}
                        {" "}({auditLogs.pagination.total} total events)
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAuditLogPage(p => Math.max(1, p - 1))}
                          disabled={auditLogPage === 1}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAuditLogPage(p => p + 1)}
                          disabled={auditLogPage >= (auditLogs.pagination?.totalPages || 1)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Activity Timeline Tab */}
            <TabsContent value="timeline">
              <Card>
                <CardHeader>
                  <CardTitle>Activity Timeline</CardTitle>
                  <CardDescription>24-hour system activity overview</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {timeline?.timeline?.map((hour: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-4 p-2 rounded hover:bg-muted/50">
                        <div className="w-[120px] text-sm font-mono">
                          {format(new Date(hour.hour), "MMM dd HH:00")}
                        </div>
                        <div className="flex-1">
                          <Progress 
                            value={(hour.eventCount / Math.max(...(timeline?.timeline?.map((h: any) => h.eventCount) || [1]))) * 100} 
                            className="h-6"
                          />
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">{hour.eventCount}</span> events
                          {hour.criticalCount > 0 && (
                            <span className="text-red-600 ml-2">
                              ({hour.criticalCount} critical)
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Chain Integrity Tab */}
            <TabsContent value="integrity">
              <Card>
                <CardHeader>
                  <CardTitle>Hash Chain Integrity</CardTitle>
                  <CardDescription>
                    Verify the cryptographic integrity of the audit trail
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 p-4 border rounded-lg">
                    <div className={`text-4xl ${getIntegrityStatus().color}`}>
                      {getIntegrityStatus().icon}
                    </div>
                    <div className="flex-1">
                      <div className="text-lg font-semibold">
                        Chain Status: {getIntegrityStatus().text}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Last verified: {chainIntegrity ? formatDistanceToNow(new Date()) + ' ago' : 'Never'}
                      </div>
                    </div>
                    <Button onClick={() => refetchIntegrity()}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Verify Now
                    </Button>
                  </div>

                  {chainIntegrity?.brokenLinks?.length > 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Integrity Violation Detected</AlertTitle>
                      <AlertDescription>
                        Found {chainIntegrity.brokenLinks.length} broken links in the hash chain.
                        This may indicate tampering or data corruption.
                      </AlertDescription>
                    </Alert>
                  )}

                  {chainIntegrity?.brokenLinks?.map((link: any) => (
                    <div key={link.id} className="p-3 border border-red-200 bg-red-50 rounded">
                      <div className="text-sm">
                        <div>Record ID: {link.id}</div>
                        <div>Expected: {link.expected}</div>
                        <div>Actual: {link.actual}</div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Retention Policies Tab */}
            <TabsContent value="retention">
              <Card>
                <CardHeader>
                  <CardTitle>Data Retention Policies</CardTitle>
                  <CardDescription>
                    Automated data lifecycle management and GDPR/CCPA compliance
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data Class</TableHead>
                        <TableHead>Retention Period</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Compliance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {retentionPolicies?.policies?.map((policy: any) => (
                        <TableRow key={policy.id}>
                          <TableCell>
                            <Badge variant="outline">{policy.dataClass}</Badge>
                          </TableCell>
                          <TableCell>
                            {policy.maxRetentionDays} days
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {policy.policyName}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {policy.gdprCompliant && (
                                <Badge variant="secondary" className="text-xs">GDPR</Badge>
                              )}
                              {policy.ccpaCompliant && (
                                <Badge variant="secondary" className="text-xs">CCPA</Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Legal Holds Tab */}
            <TabsContent value="legal-holds">
              <Card>
                <CardHeader>
                  <CardTitle>Legal Holds</CardTitle>
                  <CardDescription>
                    Active legal preservation orders preventing data deletion
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hold ID</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Imposed By</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {legalHolds?.holds?.map((hold: any) => (
                        <TableRow key={hold.id}>
                          <TableCell className="font-mono text-xs">
                            {hold.id.substring(0, 8)}...
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{hold.scopeType}</div>
                              <div className="text-xs text-muted-foreground">
                                {hold.scopeId}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {hold.reason}
                          </TableCell>
                          <TableCell>{hold.imposedBy}</TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(hold.createdAt), "MMM dd, yyyy")}
                          </TableCell>
                          <TableCell>
                            <Badge variant={hold.active ? "default" : "secondary"}>
                              {hold.active ? "Active" : "Released"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Deletion Receipts Tab */}
            <TabsContent value="deletions">
              <Card>
                <CardHeader>
                  <CardTitle>Deletion Receipts</CardTitle>
                  <CardDescription>
                    Proof of data deletion for regulatory compliance
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Receipt ID</TableHead>
                          <TableHead>Data Class</TableHead>
                          <TableHead>Record Count</TableHead>
                          <TableHead>Deletion Method</TableHead>
                          <TableHead>Deleted At</TableHead>
                          <TableHead>Certificate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deletionReceipts?.receipts?.map((receipt: any) => (
                          <TableRow key={receipt.id}>
                            <TableCell className="font-mono text-xs">
                              {receipt.id.substring(0, 8)}...
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{receipt.dataClass}</Badge>
                            </TableCell>
                            <TableCell>{receipt.recordCount}</TableCell>
                            <TableCell className="text-sm">
                              {receipt.deletionMethod}
                            </TableCell>
                            <TableCell className="text-sm">
                              {format(new Date(receipt.deletedAtUtc), "MMM dd, yyyy HH:mm")}
                            </TableCell>
                            <TableCell>
                              <Button size="sm" variant="ghost">
                                <FileCheck className="h-4 w-4" />
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
          </Tabs>
        </div>
      </main>
    </div>
  );
}