import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, FileText, AlertTriangle, DollarSign } from "lucide-react";

export function RecentActivity() {
  // In a real app, this would come from an API
  const activities = [
    {
      id: 1,
      type: "payment",
      title: "Payment Received",
      description: "Loan #45892 - $2,847.32 payment processed",
      time: "2 hours ago",
      icon: CheckCircle,
      iconColor: "text-green-600",
      iconBg: "bg-green-100"
    },
    {
      id: 2,
      type: "document",
      title: "Document Uploaded",
      description: "Loan #45891 - Insurance certificate updated",
      time: "4 hours ago",
      icon: FileText,
      iconColor: "text-blue-600",
      iconBg: "bg-blue-100"
    },
    {
      id: 3,
      type: "delinquent",
      title: "Late Payment Notice",
      description: "Loan #45889 - 15 days past due",
      time: "6 hours ago",
      icon: AlertTriangle,
      iconColor: "text-yellow-600",
      iconBg: "bg-yellow-100"
    },
    {
      id: 4,
      type: "escrow",
      title: "Escrow Payment",
      description: "Property taxes paid - $4,582.17",
      time: "1 day ago",
      icon: DollarSign,
      iconColor: "text-purple-600",
      iconBg: "bg-purple-100"
    }
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Loan Activity</CardTitle>
          <Button variant="ghost" size="sm">
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-center space-x-4 p-4 bg-slate-50 rounded-lg">
              <div className={`w-10 h-10 ${activity.iconBg} rounded-full flex items-center justify-center`}>
                <activity.icon className={`w-5 h-5 ${activity.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900">{activity.title}</p>
                <p className="text-sm text-slate-600 truncate">{activity.description}</p>
                <p className="text-xs text-slate-500 mt-1">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
