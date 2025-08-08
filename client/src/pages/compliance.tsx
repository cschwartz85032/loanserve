import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, AlertTriangle, CheckCircle, Clock, FileText, Eye } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { PRIORITY_LEVELS } from "@/lib/constants";

export default function CompliancePage() {
  const [selectedPeriod, setSelectedPeriod] = useState("current");
  const [complianceFilter, setComplianceFilter] = useState("all");

  const { data: complianceData, isLoading } = useQuery({
    queryKey: ["/api/compliance", selectedPeriod, complianceFilter],
  });

  const complianceIssues = [
    {
      id: "1",
      type: "Documentation",
      description: "Missing insurance verification for Loan #4523",
      priority: "high",
      status: "pending",
      dueDate: new Date(Date.now() + 86400000 * 3),
      assignedTo: "John Smith",
    },
    {
      id: "2",
      type: "Regulatory",
      description: "RESPA disclosure required for Loan #7891",
      priority: "urgent",
      status: "in_progress",
      dueDate: new Date(Date.now() + 86400000),
      assignedTo: "Jane Doe",
    },
    {
      id: "3",
      type: "Audit",
      description: "Annual escrow analysis pending for 15 accounts",
      priority: "normal",
      status: "pending",
      dueDate: new Date(Date.now() + 86400000 * 7),
      assignedTo: "Mike Johnson",
    },
  ];

  const auditTrail = [
    {
      id: "1",
      timestamp: new Date(Date.now() - 3600000),
      user: "admin@loanserve.com",
      action: "Viewed loan details",
      entityType: "loan",
      entityId: "4523",
      ipAddress: "192.168.1.100",
    },
    {
      id: "2",
      timestamp: new Date(Date.now() - 7200000),
      user: "escrow@loanserve.com",
      action: "Updated escrow payment",
      entityType: "escrow_payment",
      entityId: "8912",
      ipAddress: "192.168.1.101",
    },
    {
      id: "3",
      timestamp: new Date(Date.now() - 10800000),
      user: "legal@loanserve.com",
      action: "Downloaded document",
      entityType: "document",
      entityId: "1234",
      ipAddress: "192.168.1.102",
    },
  ];

  const getPriorityColor = (priority: string) => {
    const level = PRIORITY_LEVELS.find(p => p.value === priority);
    return level?.color || "text-gray-600";
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "default",
      in_progress: "secondary",
      completed: "outline",
      overdue: "destructive",
    };
    return variants[status] || "default";
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Compliance Management</h1>
          <p className="text-muted-foreground">Monitor regulatory compliance and audit trails</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <FileText className="mr-2 h-4 w-4" />
            Generate Report
          </Button>
          <Button>
            <Shield className="mr-2 h-4 w-4" />
            Run Compliance Check
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliance Score</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">94.5%</div>
            <p className="text-xs text-muted-foreground">+2.1% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Issues</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">3 urgent, 4 high priority</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved This Month</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">47</div>
            <p className="text-xs text-muted-foreground">Average resolution: 2.3 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Next Audit</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">15 days</div>
            <p className="text-xs text-muted-foreground">Quarterly review scheduled</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="issues" className="space-y-4">
        <TabsList>
          <TabsTrigger value="issues">Compliance Issues</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
          <TabsTrigger value="regulations">Regulations</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="issues">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Active Compliance Issues</CardTitle>
                <Select value={complianceFilter} onValueChange={setComplianceFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter issues" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Issues</SelectItem>
                    <SelectItem value="urgent">Urgent Only</SelectItem>
                    <SelectItem value="regulatory">Regulatory</SelectItem>
                    <SelectItem value="documentation">Documentation</SelectItem>
                    <SelectItem value="audit">Audit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {complianceIssues.map((issue) => (
                    <TableRow key={issue.id}>
                      <TableCell>{issue.type}</TableCell>
                      <TableCell>{issue.description}</TableCell>
                      <TableCell>
                        <span className={getPriorityColor(issue.priority)}>
                          {PRIORITY_LEVELS.find(p => p.value === issue.priority)?.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadge(issue.status)}>
                          {issue.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(issue.dueDate, "MMM dd, yyyy")}</TableCell>
                      <TableCell>{issue.assignedTo}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle>Audit Trail</CardTitle>
              <CardDescription>Recent system activity and changes</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity Type</TableHead>
                      <TableHead>Entity ID</TableHead>
                      <TableHead>IP Address</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditTrail.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{format(entry.timestamp, "MMM dd, HH:mm:ss")}</TableCell>
                        <TableCell>{entry.user}</TableCell>
                        <TableCell>{entry.action}</TableCell>
                        <TableCell>{entry.entityType}</TableCell>
                        <TableCell>{entry.entityId}</TableCell>
                        <TableCell>{entry.ipAddress}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regulations">
          <Card>
            <CardHeader>
              <CardTitle>Regulatory Requirements</CardTitle>
              <CardDescription>Active regulations and compliance requirements</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>RESPA (Real Estate Settlement Procedures Act)</AlertTitle>
                  <AlertDescription>
                    Requires disclosure of settlement costs and prohibits kickbacks. All loans must comply with RESPA requirements.
                  </AlertDescription>
                </Alert>
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertTitle>TILA (Truth in Lending Act)</AlertTitle>
                  <AlertDescription>
                    Mandates clear disclosure of loan terms and costs. APR calculations must be accurate to within 1/8 of 1%.
                  </AlertDescription>
                </Alert>
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertTitle>FCRA (Fair Credit Reporting Act)</AlertTitle>
                  <AlertDescription>
                    Governs the collection and use of credit information. Adverse action notices required when credit impacts decisions.
                  </AlertDescription>
                </Alert>
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertTitle>HMDA (Home Mortgage Disclosure Act)</AlertTitle>
                  <AlertDescription>
                    Requires reporting of mortgage data for monitoring discrimination. Annual LAR submission deadline: March 1st.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle>Compliance Documents</CardTitle>
              <CardDescription>Templates and regulatory documentation</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 border rounded">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span>RESPA Compliance Checklist</span>
                  </div>
                  <Button size="sm" variant="ghost">Download</Button>
                </div>
                <div className="flex items-center justify-between p-2 border rounded">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span>TILA Disclosure Template</span>
                  </div>
                  <Button size="sm" variant="ghost">Download</Button>
                </div>
                <div className="flex items-center justify-between p-2 border rounded">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span>Annual Escrow Analysis Form</span>
                  </div>
                  <Button size="sm" variant="ghost">Download</Button>
                </div>
                <div className="flex items-center justify-between p-2 border rounded">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span>Compliance Audit Report Template</span>
                  </div>
                  <Button size="sm" variant="ghost">Download</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}