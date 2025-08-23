import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Building2, 
  LayoutDashboard, 
  FileText, 
  CreditCard, 
  DollarSign, 
  BarChart3, 
  Shield, 
  LogOut,
  Receipt,
  Zap,
  Settings,
  Users,
  Mail
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const [activeRole, setActiveRole] = useState(user?.role || "lender");
  
  // Check if user has admin role - supports both legacy and RBAC systems
  const hasAdminRole = user?.role === 'admin' || 
                       user?.roleNames?.includes('admin') || 
                       user?.roles?.some(r => r.roleName === 'admin');
  
  // Build navigation dynamically based on user roles
  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Loan Portfolio", href: "/loans", icon: FileText },
    { name: "Payments", href: "/payments", icon: CreditCard },
    { name: "Fee Management", href: "/fees", icon: Receipt },
    { name: "Daily Servicing Cycle", href: "/servicing-cycle", icon: Zap },
    { name: "Mailroom", href: "/mailroom", icon: Mail },
    { name: "Reports & Analytics", href: "/reports", icon: BarChart3 },
    { name: "Compliance", href: "/compliance", icon: Shield },
    { name: "Settings", href: "/settings", icon: Settings },
    // Only show Admin menu if user has admin role
    ...(hasAdminRole ? [{ name: "Admin", href: "/admin/users", icon: Settings }] : []),
  ];

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const getRoleDisplayName = (role: string) => {
    const roleMap: Record<string, string> = {
      lender: "Lender Portal",
      borrower: "Borrower Portal",
      investor: "Investor Portal",
      escrow_officer: "Escrow Officer",
      legal: "Legal Portal"
    };
    return roleMap[role] || "Portal";
  };

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
      {/* Logo Section */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">LoanServe Pro</h1>
            <p className="text-sm text-slate-500">Enterprise Edition</p>
          </div>
        </div>
      </div>

      {/* Role Selection */}
      <div className="p-4 border-b border-slate-200">
        <label className="block text-sm font-medium text-slate-700 mb-2">Active Role</label>
        <Select value={activeRole} onValueChange={(value) => setActiveRole(value as typeof activeRole)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lender">Lender Portal</SelectItem>
            <SelectItem value="borrower">Borrower Portal</SelectItem>
            <SelectItem value="investor">Investor Portal</SelectItem>
            <SelectItem value="escrow_officer">Escrow Officer</SelectItem>
            <SelectItem value="legal">Legal Portal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <li key={item.name}>
                <Link 
                  href={item.href}
                  className={cn(
                    "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary-50 text-primary-700"
                      : "text-slate-700 hover:bg-slate-100"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-slate-200">
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-8 h-8 bg-slate-400 rounded-full flex items-center justify-center">
            <span className="text-xs font-medium text-white">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {user?.email}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
        >
          <LogOut className="w-4 h-4 mr-2" />
          {logoutMutation.isPending ? "Signing Out..." : "Sign Out"}
        </Button>
      </div>
    </aside>
  );
}
