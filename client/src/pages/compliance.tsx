import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, AlertTriangle, CheckCircle, Clock, FileText } from "lucide-react";

export default function Compliance() {
  // Mock compliance data - in real app this would come from API
  const complianceItems = [
    {
      id: 1,
      category: "HMDA Reporting",
      description: "Home Mortgage Disclosure Act compliance tracking",
      status: "compliant",
      lastReview: "2024-01-15",
      nextReview: "2024-07-15",
      priority: "high"
    },
    {
      id: 2,
      category: "Fair Lending",
      description: "Fair lending practices and anti-discrimination monitoring",
      status: "compliant",
      lastReview: "2024-01-10",
      nextReview: "2024-04-10",
      priority: "high"
    },
    {
      id: 3,
      category: "RESPA Compliance",
      description: "Real Estate Settlement Procedures Act requirements",
      status: "review_needed",
      lastReview: "2023-10-15",
      nextReview: "2024-01-15",
      priority: "medium"
    },
    {
      id: 4,
      category: "Privacy Protection",
      description: "Customer data privacy and protection protocols",
      status: "compliant",
      lastReview: "2024-01-20",
      nextReview: "2024-06-20",
      priority: "high"
    },
    {
      id: 5,
      category: "Escrow Analysis",
      description: "Annual escrow account analysis requirements",
      status: "pending",
      lastReview: "2023-12-01",
      nextReview: "2024-02-01",
      priority: "medium"
    }
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "compliant":
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case "review_needed":
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case "pending":
        return <Clock className="w-5 h-5 text-blue-600" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "compliant":
        return "default";
      case "review_needed":
        return "secondary";
      case "pending":
        return "outline";
      default:
        return "destructive";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "compliant":
        return "Compliant";
      case "review_needed":
        return "Review Needed";
      case "pending":
        return "Pending Review";
      default:
        return "Non-Compliant";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "text-red-600";
      case "medium":
        return "text-yellow-600";
      case "low":
        return "text-green-600";
      default:
        return "text-slate-600";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const compliantCount = complianceItems.filter(item => item.status === "compliant").length;
  const reviewNeededCount = complianceItems.filter(item => item.status === "review_needed").length;
  const pendingCount = complianceItems.filter(item => item.status === "pending").length;

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Compliance Management</h1>
              <p className="text-sm text-slate-600">Monitor regulatory compliance and audit requirements</p>
            </div>
            <div className="flex items-center space-x-3">
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4 mr-2" />
                Generate Audit Report
              </Button>
              <Button>
                <Shield className="h-4 w-4 mr-2" />
                Run Compliance Check
              </Button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Compliance Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Compliant Items</p>
                    <p className="text-3xl font-bold text-green-600">{compliantCount}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                </div>
                <p className="text-sm text-slate-500 mt-2">
                  {((compliantCount / complianceItems.length) * 100).toFixed(1)}% compliance rate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Review Needed</p>
                    <p className="text-3xl font-bold text-yellow-600">{reviewNeededCount}</p>
                  </div>
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-yellow-600" />
                  </div>
                </div>
                <p className="text-sm text-slate-500 mt-2">Requires immediate attention</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Pending Review</p>
                    <p className="text-3xl font-bold text-blue-600">{pendingCount}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
                <p className="text-sm text-slate-500 mt-2">Scheduled for review</p>
              </CardContent>
            </Card>
          </div>

          {/* Compliance Items Table */}
          <Card>
            <CardHeader>
              <CardTitle>Compliance Items</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-y border-slate-200">
                    <tr>
                      <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Priority
                      </th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Last Review
                      </th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Next Review
                      </th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {complianceItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            {getStatusIcon(item.status)}
                            <span className="text-sm font-medium text-slate-900">{item.category}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-600">{item.description}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={getStatusBadgeVariant(item.status)}>
                            {getStatusLabel(item.status)}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`text-sm font-medium capitalize ${getPriorityColor(item.priority)}`}>
                            {item.priority}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {formatDate(item.lastReview)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {formatDate(item.nextReview)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center space-x-2">
                            <Button variant="ghost" size="sm">
                              Review
                            </Button>
                            <Button variant="ghost" size="sm">
                              Update
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Audit Trail */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Audit Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-4 p-4 bg-slate-50 rounded-lg">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">HMDA Compliance Review Completed</p>
                    <p className="text-sm text-slate-600">Annual review passed with no issues identified</p>
                    <p className="text-xs text-slate-500 mt-1">2 hours ago</p>
                  </div>
                </div>

                <div className="flex items-center space-x-4 p-4 bg-slate-50 rounded-lg">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">Audit Report Generated</p>
                    <p className="text-sm text-slate-600">Q4 2024 compliance report created and distributed</p>
                    <p className="text-xs text-slate-500 mt-1">1 day ago</p>
                  </div>
                </div>

                <div className="flex items-center space-x-4 p-4 bg-slate-50 rounded-lg">
                  <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">RESPA Review Required</p>
                    <p className="text-sm text-slate-600">Quarterly review scheduled for next week</p>
                    <p className="text-xs text-slate-500 mt-1">3 days ago</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
