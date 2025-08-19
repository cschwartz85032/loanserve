import React from 'react';
import { Link, useLocation } from 'wouter';
import { 
  FileText, 
  Wallet, 
  Settings, 
  Users,
  ChevronLeft,
  ChevronRight,
  Menu,
  Building2,
  Undo2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const [location] = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [activeRole, setActiveRole] = React.useState('admin');

  const navItems = [
    {
      title: 'Documents',
      href: '/admin/documents',
      icon: FileText,
    },
    {
      title: 'Escrow Management',
      href: '/admin/escrow',
      icon: Wallet,
    },
    {
      title: 'Users',
      href: '/users',
      icon: Users,
    },
    {
      title: 'Settings',
      href: '/settings',
      icon: Settings,
    },
  ];

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside
        className={cn(
          "bg-white border-r border-slate-200 transition-all duration-300 flex flex-col sticky top-0 h-screen",
          sidebarCollapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo and Company Name */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={cn(
                "bg-primary-600 rounded-lg flex items-center justify-center",
                sidebarCollapsed ? "w-8 h-8" : "w-10 h-10"
              )}>
                <Building2 className={cn("text-white", sidebarCollapsed ? "w-5 h-5" : "w-6 h-6")} />
              </div>
              {!sidebarCollapsed && (
                <div>
                  <h1 className="text-lg font-bold text-slate-900">LoanServe Pro</h1>
                  <p className="text-sm text-slate-500">Enterprise Edition</p>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={cn("transition-all", sidebarCollapsed && "ml-auto")}
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Active Role Selector */}
        {!sidebarCollapsed && (
          <div className="p-4 border-b border-slate-200">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Active Role
            </label>
            <Select value={activeRole} onValueChange={setActiveRole}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin Portal</SelectItem>
                <SelectItem value="lender">Lender Portal</SelectItem>
                <SelectItem value="borrower">Borrower Portal</SelectItem>
                <SelectItem value="investor">Investor Portal</SelectItem>
                <SelectItem value="escrow_officer">Escrow Officer Portal</SelectItem>
                <SelectItem value="legal">Legal Portal</SelectItem>
                <SelectItem value="servicer">Servicer Portal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 p-4 space-y-2">
          {/* Return to Main Button - positioned to the right */}
          <div className="flex justify-end mb-4">
            <Link 
              href="/"
              className={cn(
                "p-2 rounded-lg transition-colors",
                "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
              title="Return to Main Dashboard"
            >
              <Undo2 className="h-5 w-5" />
            </Link>
          </div>
          
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || 
                           (item.href === '/admin/documents' && location === '/documents') ||
                           (item.href === '/admin/escrow' && location === '/escrow');
            
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                  isActive
                    ? "bg-primary-50 text-primary-700"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                  sidebarCollapsed && "justify-center"
                )}
                title={sidebarCollapsed ? item.title : undefined}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!sidebarCollapsed && (
                  <span className="text-sm font-medium">{item.title}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-200">
          <div className={cn(
            "flex items-center gap-3",
            sidebarCollapsed && "justify-center"
          )}>
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
              A
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">Admin User</p>
                <p className="text-xs text-slate-500">Administrator</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Top Bar */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-slate-800">
              {navItems.find(item => 
                location === item.href || 
                (item.href === '/admin/documents' && location === '/documents') ||
                (item.href === '/admin/escrow' && location === '/escrow')
              )?.title || 'Admin'}
            </h1>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;