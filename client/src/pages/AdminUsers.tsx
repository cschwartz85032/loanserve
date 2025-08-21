/**
 * Admin Users Management Page
 * Comprehensive user administration interface
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Lock, 
  Unlock, 
  Shield, 
  Mail, 
  Search,
  Plus,
  MoreVertical,
  Activity,
  Key,
  Globe,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  User
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

interface User {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
  lastLogin?: string;
  failedLoginCount: number;
  lockedUntil?: string;
  roles?: string[];
}

interface UserDetail {
  user: User;
  roles: Array<{
    roleId: string;
    roleName: string;
    roleDescription?: string;
    createdAt: string;
    updatedAt?: string;
  }>;
  recentLogins: Array<{
    id: string;
    attemptedAt: string;
    ip: string;
    userAgent?: string;
    outcome: 'succeeded' | 'failed' | 'locked';
    reason?: string;
  }>;
  activeSessions: Array<{
    id: string;
    createdAt: string;
    lastSeenAt: string;
    ip?: string;
    userAgent?: string;
  }>;
  ipAllowlist: Array<{
    id: string;
    label: string;
    cidr: string;
    isActive: boolean;
    createdAt: string;
  }>;
}

interface Role {
  id: string;
  name: string;
  description?: string;
  permissions?: Array<{
    resource: string;
    level: string;
  }>;
}

interface UsersResponse {
  users: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface RolesResponse {
  roles: Role[];
}

// Component for clickable status badges
function UserStatusBadge({ user }: { user: User }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Determine current status
  const getCurrentStatus = () => {
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      return 'locked';
    }
    if (!user.isActive) {
      return 'suspended';
    }
    if (!user.emailVerified && !user.lastLogin) {
      return 'invited';
    }
    return 'active';
  };
  
  const currentStatus = getCurrentStatus();
  
  const lockMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/admin/users/${user.id}/lock`, { 
        method: 'POST',
        body: JSON.stringify({ duration: 30 }) // Lock for 30 minutes
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User locked successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    }
  });
  
  const unlockMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/admin/users/${user.id}/unlock`, { method: 'POST' });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User unlocked successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    }
  });
  
  const activateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/admin/users/${user.id}/activate`, { method: 'POST' });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User activated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    }
  });
  
  const suspendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/admin/users/${user.id}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Admin action' })
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User suspended successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    }
  });
  
  const handleStatusClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click navigation
    
    // Cycle through statuses: locked → suspended → invited → active → locked
    switch (currentStatus) {
      case 'locked':
        // Move from locked to suspended
        unlockMutation.mutate();
        // Ensure user is suspended after unlock
        setTimeout(() => {
          if (user.isActive) {
            suspendMutation.mutate();
          }
        }, 200);
        break;
        
      case 'suspended':
        // Move from suspended to active (or invited if never logged in)
        activateMutation.mutate();
        break;
        
      case 'invited':
        // Move from invited to active
        activateMutation.mutate();
        break;
        
      case 'active':
        // Move from active to locked
        lockMutation.mutate();
        break;
    }
  };
  
  // Loading state
  if (unlockMutation.isPending || activateMutation.isPending || suspendMutation.isPending || lockMutation.isPending) {
    return <Badge variant="outline">Updating...</Badge>;
  }
  
  if (currentStatus === 'locked') {
    return (
      <Badge 
        variant="destructive" 
        className="cursor-pointer hover:opacity-80 transition-opacity"
        onClick={handleStatusClick}
        title="Click to unlock and suspend"
      >
        <Lock className="w-3 h-3 mr-1" />
        Locked
      </Badge>
    );
  }
  
  if (currentStatus === 'suspended') {
    return (
      <Badge 
        variant="secondary"
        className="cursor-pointer hover:opacity-80 transition-opacity"
        onClick={handleStatusClick}
        title="Click to activate"
      >
        <UserX className="w-3 h-3 mr-1" />
        Suspended
      </Badge>
    );
  }
  
  if (currentStatus === 'invited') {
    return (
      <Badge 
        variant="outline"
        className="cursor-pointer hover:opacity-80 transition-opacity"
        onClick={handleStatusClick}
        title="Click to activate"
      >
        <Mail className="w-3 h-3 mr-1" />
        Invited
      </Badge>
    );
  }
  
  return (
    <Badge 
      className="bg-green-600 hover:bg-green-700 cursor-pointer transition-colors text-white"
      onClick={handleStatusClick}
      title="Click to lock"
    >
      <UserCheck className="w-3 h-3 mr-1" />
      Active
    </Badge>
  );
}

export function AdminUsers() {
  const [location, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  // Fetch users list
  const { data: usersData, isLoading } = useQuery<UsersResponse>({
    queryKey: ['/api/admin/users', { 
      page, 
      search: searchTerm, 
      role: selectedRole === 'all' ? undefined : selectedRole, 
      isActive: activeFilter === 'all' ? undefined : activeFilter 
    }]
  });

  // Fetch available roles
  const { data: rolesData } = useQuery<RolesResponse>({
    queryKey: ['/api/admin/users/roles']
  });

  const roles = rolesData?.roles || [];

  const getUserStatusBadge = (user: User) => {
    return <UserStatusBadge user={user} />;
  };

  const getRoleBadges = (roles?: string[]) => {
    if (!roles || roles.length === 0) return <span className="text-muted-foreground">No roles</span>;
    return (
      <div className="flex gap-1 flex-wrap">
        {roles.map(role => (
          <Badge key={role} variant="outline" className="text-xs">
            {role}
          </Badge>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Manage user accounts, roles, and permissions</p>
        </div>
        <div className="flex gap-2">
          <BulkInviteDialog roles={roles} />
          <InviteUserDialog roles={roles} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Users</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {roles.map((role: Role) => (
                    <SelectItem key={role.id} value={role.name}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={activeFilter} onValueChange={setActiveFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="All status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading users...</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersData?.users?.map((user: User) => (
                    <TableRow 
                      key={user.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={(e) => {
                        // Prevent navigation when clicking on actions menu
                        const target = e.target as HTMLElement;
                        if (target.closest('[role="button"]') || target.closest('[role="menu"]')) {
                          return;
                        }
                        console.log('Navigating to user:', user.id);
                        setLocation(`/admin/users/${user.id}`);
                      }}
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium">{user.username}</div>
                          <div className="text-sm text-muted-foreground">{user.email}</div>
                          {(user.firstName || user.lastName) && (
                            <div className="text-sm text-muted-foreground">
                              {user.firstName} {user.lastName}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getUserStatusBadge(user)}</TableCell>
                      <TableCell>{getRoleBadges(user.roles)}</TableCell>
                      <TableCell>
                        {user.lastLogin ? (
                          <div className="text-sm">
                            {formatDistanceToNow(new Date(user.lastLogin), { addSuffix: true })}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {format(new Date(user.createdAt), 'MMM d, yyyy')}
                        </div>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <UserActionsMenu user={user} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {usersData?.pagination && (
                <div className="flex justify-between items-center mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, usersData.pagination.total)} of {usersData.pagination.total} users
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => p + 1)}
                      disabled={page >= usersData.pagination.pages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UserActionsMenu({ user }: { user: User }) {
  const { toast } = useToast();
  
  const lockMutation = useMutation({
    mutationFn: async (duration: number) => {
      const res = await apiRequest(`/api/admin/users/${user.id}/lock`, {
        method: 'POST',
        body: JSON.stringify({ duration })
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User locked successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    }
  });

  const unlockMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/admin/users/${user.id}/unlock`, { method: 'POST' });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User unlocked successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    }
  });

  const suspendMutation = useMutation({
    mutationFn: async (reason: string) => {
      const res = await apiRequest(`/api/admin/users/${user.id}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User suspended successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    }
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/admin/users/${user.id}/activate`, { method: 'POST' });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User activated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    }
  });

  const resendInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/admin/users/${user.id}/resend-invite`, {
        method: 'POST'
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to resend invitation');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Invitation resent successfully",
        description: data.email ? `Email sent to ${data.email}` : data.message
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to resend invitation",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e: any) => e.stopPropagation()}>
        <Button variant="ghost" size="icon">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.lockedUntil && new Date(user.lockedUntil) > new Date() ? (
          <DropdownMenuItem onClick={() => unlockMutation.mutate()}>
            <Unlock className="w-4 h-4 mr-2" />
            Unlock Account
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => lockMutation.mutate(30)}>
            <Lock className="w-4 h-4 mr-2" />
            Lock Account (30 min)
          </DropdownMenuItem>
        )}
        {user.isActive ? (
          <DropdownMenuItem 
            onClick={() => suspendMutation.mutate('Admin action')}
            className="text-destructive"
          >
            <UserX className="w-4 h-4 mr-2" />
            Suspend Account
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => activateMutation.mutate()}>
            <UserCheck className="w-4 h-4 mr-2" />
            Activate Account
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <RefreshCw className="w-4 h-4 mr-2" />
          Reset Password
        </DropdownMenuItem>
        {!user.emailVerified && !user.lastLogin && (
          <DropdownMenuItem onClick={() => resendInviteMutation.mutate()}>
            <Mail className="w-4 h-4 mr-2" />
            Resend Invitation
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InviteUserDialog({ roles }: { roles: Role[] }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const { toast } = useToast();

  const inviteMutation = useMutation({
    mutationFn: async (data: { invitations: Array<{ email: string; roleId: string }> }) => {
      const res = await apiRequest('/api/admin/users/bulk-invite', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.summary.successful > 0) {
        toast({ 
          title: "User invited successfully",
          description: `Invitation sent to ${email}`
        });
        setOpen(false);
        setEmail('');
        setSelectedRoleId('');
      } else if (data.errors && data.errors.length > 0) {
        toast({ 
          title: "Failed to invite user",
          description: data.errors[0].error,
          variant: 'destructive'
        });
      }
    },
    onError: (error) => {
      toast({ 
        title: "Failed to invite user",
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const handleSubmit = () => {
    if (!email.trim() || !selectedRoleId) return;
    
    inviteMutation.mutate({ 
      invitations: [{
        email: email.trim(),
        roleId: selectedRoleId
      }]
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Invite User
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
          <DialogDescription>
            Send an invitation to a new user
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Email Address</Label>
            <Input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={!email.trim() || !selectedRoleId || inviteMutation.isPending}
          >
            {inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkInviteDialog({ roles }: { roles: Role[] }) {
  const [open, setOpen] = useState(false);
  const [invitations, setInvitations] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const { toast } = useToast();

  const bulkInviteMutation = useMutation({
    mutationFn: async (data: { invitations: Array<{ email: string; roleId: string }> }) => {
      const res = await apiRequest('/api/admin/users/bulk-invite', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Bulk invite complete",
        description: `${data.summary.successful} successful, ${data.summary.failed} failed`
      });
      setOpen(false);
      setInvitations('');
    }
  });

  const handleSubmit = () => {
    const emails = invitations.split('\n').filter(e => e.trim());
    const invitationList = emails.map(email => ({
      email: email.trim(),
      roleId: selectedRoleId
    }));
    bulkInviteMutation.mutate({ invitations: invitationList });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Users className="w-4 h-4 mr-2" />
          Bulk Invite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk Invite Users</DialogTitle>
          <DialogDescription>
            Enter email addresses (one per line) and select a default role
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Email Addresses</Label>
            <Textarea
              placeholder="john@example.com&#10;jane@example.com&#10;bob@example.com"
              value={invitations}
              onChange={(e) => setInvitations(e.target.value)}
              rows={6}
            />
          </div>
          <div>
            <Label>Default Role</Label>
            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map(role => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={!invitations.trim() || !selectedRoleId}
          >
            Send Invitations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}