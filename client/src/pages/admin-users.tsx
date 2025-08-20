import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function AdminUsersPage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center space-x-3">
          <div className="bg-primary-100 p-3 rounded-lg">
            <Users className="h-6 w-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-600 mt-1">Manage system users, roles, and permissions</p>
          </div>
        </div>

        {/* Main Content Card */}
        <Card>
          <CardHeader>
            <CardTitle>System Users</CardTitle>
            <CardDescription>
              View and manage all users in the LoanServe Pro system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">User management interface coming soon...</p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}