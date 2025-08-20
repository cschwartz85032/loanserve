/**
 * Admin User Detail Page
 * Comprehensive view of individual user with tabs for Profile, Roles, IP Allowlist, Sessions, and Audit Log
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  User,
  Shield,
  Globe,
  Activity,
  FileText,
  Lock,
  Unlock,
  UserCheck,
  UserX,
  Mail,
  Phone,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  Edit,
  RefreshCw,
  LogOut,
  Info,
  MapPin,
  Monitor,
  Smartphone,
  Wifi,
  WifiOff,
  Key
} from 'lucide-react';

interface UserDetail {
  user: {
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
    address?: string;
    address2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  roles: Array<{
    roleId: string;
    roleName: string;
    roleDescription?: string;
    assignedAt: string;
    assignedBy?: number;
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

interface AuditLog {
  id: string;
  occurredAt: string;
  eventType: string;
  actorUserId?: number;
  targetUserId?: number;
  ip?: string;
  userAgent?: string;
  details: any;
}

export function AdminUserDetail() {
  const params = useParams();
  const id = params.id;
  console.log('AdminUserDetail params:', params, 'id:', id);
  
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('profile');
  const [editMode, setEditMode] = useState(false);
  const [userForm, setUserForm] = useState<any>({});

  // Fetch user details
  const { data: userDetail, isLoading } = useQuery<UserDetail>({
    queryKey: [`/api/admin/users/${id}`],
    enabled: !!id
  });

  // Fetch audit logs
  const { data: auditLogs } = useQuery<{ auditLogs: AuditLog[] }>({
    queryKey: [`/api/admin/users/${id}/audit-logs`],
    enabled: activeTab === 'audit' && !!id
  });

  // Fetch available roles
  const { data: rolesData } = useQuery({
    queryKey: ['/api/admin/users/roles']
  });

  const availableRoles = rolesData?.roles || [];

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      toast({ title: "User updated successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${id}`] });
      setEditMode(false);
    }
  });

  // Assign role mutation
  const assignRoleMutation = useMutation({
    mutationFn: (roleId: string) =>
      apiRequest(`/api/admin/users/${id}/roles`, {
        method: 'POST',
        body: JSON.stringify({ roleId })
      }),
    onSuccess: () => {
      toast({ title: "Role assigned successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${id}`] });
    }
  });

  // Remove role mutation
  const removeRoleMutation = useMutation({
    mutationFn: (roleId: string) =>
      apiRequest(`/api/admin/users/${id}/roles/${roleId}`, {
        method: 'DELETE'
      }),
    onSuccess: () => {
      toast({ title: "Role removed successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${id}`] });
    }
  });

  // Revoke session mutation
  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest(`/api/admin/users/${id}/sessions/${sessionId}/revoke`, {
        method: 'POST'
      }),
    onSuccess: () => {
      toast({ title: "Session revoked successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${id}`] });
    }
  });

  // Resend invitation mutation
  const resendInviteMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/admin/users/${id}/resend-invite`, {
        method: 'POST'
      }),
    onSuccess: (data) => {
      toast({ 
        title: "Invitation resent successfully",
        description: `Email sent to ${data.email}`
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to resend invitation",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Send password reset mutation
  const sendPasswordResetMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/admin/users/${id}/send-password-reset`, {
        method: 'POST'
      }),
    onSuccess: (data) => {
      toast({ 
        title: "Password reset sent successfully",
        description: `Email sent to ${data.email}`
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to send password reset",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  if (isLoading) {
    return <div className="p-8 text-center">Loading user details...</div>;
  }

  if (!userDetail) {
    return <div className="p-8 text-center">User not found</div>;
  }

  const { user, roles, recentLogins, activeSessions, ipAllowlist } = userDetail;

  const getUserStatus = () => {
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      return 'locked';
    }
    if (!user.isActive) {
      return 'suspended';
    }
    if (!user.emailVerified && !user.lastLogin) {
      return 'invited';
    }
    if (!user.emailVerified) {
      return 'unverified';
    }
    return 'active';
  };

  const getUserStatusBadge = () => {
    const status = getUserStatus();
    const badges: Record<string, JSX.Element> = {
      locked: <Badge variant="destructive" className="cursor-pointer"><Lock className="w-3 h-3 mr-1" />Locked</Badge>,
      suspended: <Badge variant="secondary" className="cursor-pointer"><UserX className="w-3 h-3 mr-1" />Suspended</Badge>,
      invited: <Badge variant="outline" className="cursor-pointer"><Mail className="w-3 h-3 mr-1" />Invited</Badge>,
      unverified: <Badge variant="outline" className="cursor-pointer"><AlertTriangle className="w-3 h-3 mr-1" />Unverified</Badge>,
      active: <Badge variant="default" className="cursor-pointer"><UserCheck className="w-3 h-3 mr-1" />Active</Badge>
    };
    return badges[status] || badges.active;
  };

  const cycleUserStatus = async () => {
    const currentStatus = getUserStatus();
    const statusOrder = ['active', 'suspended', 'locked'];
    const currentIndex = statusOrder.indexOf(currentStatus === 'invited' || currentStatus === 'unverified' ? 'active' : currentStatus);
    const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length];
    
    try {
      let endpoint = '';
      let body = {};
      
      switch(nextStatus) {
        case 'active':
          endpoint = `/api/admin/users/${id}/activate`;
          break;
        case 'suspended':
          endpoint = `/api/admin/users/${id}/suspend`;
          body = { reason: 'Status cycle' };
          break;
        case 'locked':
          endpoint = `/api/admin/users/${id}/lock`;
          body = { duration: 30 };
          break;
      }
      
      await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      
      toast({ title: `User status changed to ${nextStatus}` });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${id}`] });
    } catch (error) {
      toast({ 
        title: "Failed to change status", 
        variant: "destructive" 
      });
    }
  };

  const getLoginOutcomeBadge = (outcome: string) => {
    switch (outcome) {
      case 'succeeded':
        return <Badge variant="default"><CheckCircle className="w-3 h-3 mr-1" />Success</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'locked':
        return <Badge variant="secondary"><Lock className="w-3 h-3 mr-1" />Locked</Badge>;
      default:
        return <Badge variant="outline">{outcome}</Badge>;
    }
  };

  const getDeviceIcon = (userAgent?: string) => {
    if (!userAgent) return <Monitor className="w-4 h-4 text-muted-foreground" />;
    if (userAgent.toLowerCase().includes('mobile')) {
      return <Smartphone className="w-4 h-4 text-muted-foreground" />;
    }
    return <Monitor className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation('/admin/users')}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            {user.username}
            <div onClick={cycleUserStatus}>
              {getUserStatusBadge()}
            </div>
          </h1>
          <p className="text-muted-foreground">{user.email}</p>
        </div>
        <UserActions 
          user={user}
          userStatus={getUserStatus()}
          onResendInvite={() => resendInviteMutation.mutate()}
          onSendPasswordReset={() => sendPasswordResetMutation.mutate()}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="profile">
            <User className="w-4 h-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="roles">
            <Shield className="w-4 h-4 mr-2" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="ip-allowlist">
            <Globe className="w-4 h-4 mr-2" />
            IP Allowlist
          </TabsTrigger>
          <TabsTrigger value="sessions">
            <Activity className="w-4 h-4 mr-2" />
            Sessions
          </TabsTrigger>
          <TabsTrigger value="audit">
            <FileText className="w-4 h-4 mr-2" />
            Audit Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>User Profile</CardTitle>
                {editMode ? (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditMode(false)}>
                      Cancel
                    </Button>
                    <Button onClick={() => updateUserMutation.mutate(userForm)}>
                      Save Changes
                    </Button>
                  </div>
                ) : (
                  <Button onClick={() => {
                    setEditMode(true);
                    setUserForm({
                      username: user.username,
                      email: user.email,
                      firstName: user.firstName || '',
                      lastName: user.lastName || '',
                      phone: user.phone || '',
                      isActive: user.isActive,
                      emailVerified: user.emailVerified
                    });
                  }}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Profile
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Username</Label>
                  {editMode ? (
                    <Input
                      value={userForm.username}
                      onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm mt-1">{user.username}</p>
                  )}
                </div>
                <div>
                  <Label>Email</Label>
                  {editMode ? (
                    <Input
                      type="email"
                      value={userForm.email}
                      onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm mt-1">{user.email}</p>
                  )}
                </div>
                <div>
                  <Label>First Name</Label>
                  {editMode ? (
                    <Input
                      value={userForm.firstName}
                      onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm mt-1">{user.firstName || 'Not set'}</p>
                  )}
                </div>
                <div>
                  <Label>Last Name</Label>
                  {editMode ? (
                    <Input
                      value={userForm.lastName}
                      onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm mt-1">{user.lastName || 'Not set'}</p>
                  )}
                </div>
                <div>
                  <Label>Phone</Label>
                  {editMode ? (
                    <Input
                      value={userForm.phone}
                      onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm mt-1">{user.phone || 'Not set'}</p>
                  )}
                </div>
                <div>
                  <Label>Created</Label>
                  <p className="text-sm mt-1">
                    {format(new Date(user.createdAt), 'PPP')}
                  </p>
                </div>
              </div>

              {editMode && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Account Active</Label>
                        <p className="text-sm text-muted-foreground">
                          Allow user to sign in to their account
                        </p>
                      </div>
                      <Switch
                        checked={userForm.isActive}
                        onCheckedChange={(checked) => 
                          setUserForm({ ...userForm, isActive: checked })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Email Verified</Label>
                        <p className="text-sm text-muted-foreground">
                          Mark email address as verified
                        </p>
                      </div>
                      <Switch
                        checked={userForm.emailVerified}
                        onCheckedChange={(checked) => 
                          setUserForm({ ...userForm, emailVerified: checked })
                        }
                      />
                    </div>
                  </div>
                </>
              )}

              <Separator />

              <div className="space-y-2">
                <h3 className="font-semibold">Account Status</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Last Login:</span>
                    <p className="font-medium">
                      {user.lastLogin 
                        ? formatDistanceToNow(new Date(user.lastLogin), { addSuffix: true })
                        : 'Never'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Failed Login Attempts:</span>
                    <p className="font-medium">{user.failedLoginCount}</p>
                  </div>
                  {user.lockedUntil && (
                    <div>
                      <span className="text-muted-foreground">Locked Until:</span>
                      <p className="font-medium text-destructive">
                        {format(new Date(user.lockedUntil), 'PPP p')}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <h3 className="font-semibold">Recent Login Attempts</h3>
                <div className="space-y-2">
                  {recentLogins.slice(0, 5).map((login) => (
                    <div key={login.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {getLoginOutcomeBadge(login.outcome)}
                        <span className="text-muted-foreground">
                          {format(new Date(login.attemptedAt), 'MMM d, HH:mm')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{login.ip}</span>
                        {getDeviceIcon(login.userAgent)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle>User Roles</CardTitle>
              <CardDescription>
                Click tags to manage roles. Similar to labels or tags interface.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {/* Assigned roles as tags */}
                {roles.map((role) => (
                  <div
                    key={role.roleId}
                    className="group relative inline-flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-full cursor-move hover:bg-primary/20 transition-colors"
                  >
                    <Shield className="w-3 h-3" />
                    <span className="text-sm font-medium">{role.roleName}</span>
                    <button
                      onClick={() => removeRoleMutation.mutate(role.roleId)}
                      className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <XCircle className="w-3.5 h-3.5 hover:text-destructive" />
                    </button>
                  </div>
                ))}
                
                {/* Add role button styled as tag */}
                <AssignRoleDialog 
                  availableRoles={availableRoles}
                  currentRoles={roles}
                  onAssign={(roleId) => assignRoleMutation.mutate(roleId)}
                />
              </div>
              
              {/* Role details section */}
              {roles.length > 0 && (
                <div className="mt-6 space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Role Details</h4>
                  {roles.map((role) => (
                    <div key={role.roleId} className="text-sm text-muted-foreground">
                      <span className="font-medium">{role.roleName}:</span> Assigned {formatDistanceToNow(new Date(role.assignedAt), { addSuffix: true })}
                      {role.assignedBy && ` by User #${role.assignedBy}`}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ip-allowlist">
          <IpAllowlistTab userId={user.id} ipAllowlist={ipAllowlist} />
        </TabsContent>

        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle>Active Sessions</CardTitle>
              <CardDescription>
                Manage user's active sessions and revoke access if needed
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeSessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No active sessions
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Session ID</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Last Seen</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeSessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell className="font-mono text-xs">
                          {session.id.slice(0, 8)}...
                        </TableCell>
                        <TableCell>
                          {format(new Date(session.createdAt), 'MMM d, HH:mm')}
                        </TableCell>
                        <TableCell>
                          {formatDistanceToNow(new Date(session.lastSeenAt), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {session.ip || 'Unknown'}
                        </TableCell>
                        <TableCell>
                          {getDeviceIcon(session.userAgent)}
                        </TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <LogOut className="w-4 h-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Revoke Session</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to revoke this session? The user will be logged out.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => revokeSessionMutation.mutate(session.id)}
                                >
                                  Revoke Session
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle>Audit Log</CardTitle>
              <CardDescription>
                View all actions performed by or on this user
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!auditLogs?.auditLogs || auditLogs.auditLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No audit logs found
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <div className="space-y-2">
                    {auditLogs.auditLogs.map((log) => (
                      <div key={log.id} className="border rounded-lg p-3">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{log.eventType}</Badge>
                              <span className="text-sm text-muted-foreground">
                                {format(new Date(log.occurredAt), 'MMM d, yyyy HH:mm:ss')}
                              </span>
                            </div>
                            {log.details && (
                              <pre className="text-xs bg-muted p-2 rounded">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            )}
                          </div>
                          <div className="text-right text-sm">
                            {log.ip && (
                              <div className="font-mono text-xs">{log.ip}</div>
                            )}
                            {log.actorUserId && (
                              <div className="text-muted-foreground">
                                By User #{log.actorUserId}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UserActions({ 
  user, 
  userStatus,
  onResendInvite, 
  onSendPasswordReset 
}: { 
  user: any;
  userStatus?: string;
  onResendInvite?: () => void;
  onSendPasswordReset?: () => void;
}) {
  const { toast } = useToast();
  
  const lockMutation = useMutation({
    mutationFn: (duration: number) => 
      apiRequest(`/api/admin/users/${user.id}/lock`, {
        method: 'POST',
        body: JSON.stringify({ duration })
      }),
    onSuccess: () => {
      toast({ title: "User locked successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${user.id}`] });
    }
  });

  const unlockMutation = useMutation({
    mutationFn: () => 
      apiRequest(`/api/admin/users/${user.id}/unlock`, { method: 'POST' }),
    onSuccess: () => {
      toast({ title: "User unlocked successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${user.id}`] });
    }
  });

  const suspendMutation = useMutation({
    mutationFn: (reason: string) => 
      apiRequest(`/api/admin/users/${user.id}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      }),
    onSuccess: () => {
      toast({ title: "User suspended successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${user.id}`] });
    }
  });

  const activateMutation = useMutation({
    mutationFn: () => 
      apiRequest(`/api/admin/users/${user.id}/activate`, { method: 'POST' }),
    onSuccess: () => {
      toast({ title: "User activated successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${user.id}`] });
    }
  });

  return (
    <div className="flex gap-2">
      {/* Resend Invite - only for invited users */}
      {userStatus === 'invited' && onResendInvite && (
        <Button onClick={onResendInvite} variant="outline">
          <Mail className="w-4 h-4 mr-2" />
          Resend Invite
        </Button>
      )}
      
      {/* Send Password Reset - for active users who are not invited */}
      {userStatus !== 'invited' && userStatus !== 'disabled' && onSendPasswordReset && (
        <Button onClick={onSendPasswordReset} variant="outline">
          <Key className="w-4 h-4 mr-2" />
          Send Password Reset
        </Button>
      )}
    </div>
  );
}

function AssignRoleDialog({ availableRoles, currentRoles, onAssign }: any) {
  const [open, setOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');

  const currentRoleIds = currentRoles.map((r: any) => r.roleId);
  const assignableRoles = availableRoles.filter((r: any) => !currentRoleIds.includes(r.id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 rounded-full border-dashed hover:bg-primary/10"
        >
          <Plus className="w-3 h-3 mr-1" />
          Add Role
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Role</DialogTitle>
          <DialogDescription>
            Select a role to assign to this user
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger>
              <SelectValue placeholder="Select a role" />
            </SelectTrigger>
            <SelectContent>
              {assignableRoles.map((role: any) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                  {role.description && (
                    <span className="text-muted-foreground ml-2">
                      - {role.description}
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={() => {
              onAssign(selectedRole);
              setOpen(false);
              setSelectedRole('');
            }}
            disabled={!selectedRole}
          >
            Assign Role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IpAllowlistTab({ userId, ipAllowlist }: any) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newEntry, setNewEntry] = useState({ label: '', cidr: '', expiresAt: '' });
  const { toast } = useToast();

  const addMutation = useMutation({
    mutationFn: async (data: { label: string; cidr: string; expiresAt?: string }) => {
      const res = await apiRequest('/api/ip-allowlist', {
        method: 'POST',
        body: JSON.stringify({ ...data, userId })
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "IP allowlist entry added" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${userId}`] });
      setShowAddDialog(false);
      setNewEntry({ label: '', cidr: '', expiresAt: '' });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to add IP entry", 
        description: error.message || "This IP might already be in the allowlist",
        variant: "destructive"
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest(`/api/ip-allowlist/${id}`, { method: 'DELETE' });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "IP allowlist entry removed" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${userId}`] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to remove IP entry", 
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest(`/api/ip-allowlist/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive })
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "IP allowlist entry updated" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${userId}`] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update IP entry", 
        description: error.message,
        variant: "destructive"
      });
    }
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>IP Allowlist</CardTitle>
            <CardDescription>
              Restrict user access to specific IP addresses or ranges
            </CardDescription>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add IP Range
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add IP Allowlist Entry</DialogTitle>
                <DialogDescription>
                  Add an IP address or CIDR range to the allowlist
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Label</Label>
                  <Input
                    placeholder="Home office"
                    value={newEntry.label}
                    onChange={(e) => setNewEntry({ ...newEntry, label: e.target.value })}
                  />
                </div>
                <div>
                  <Label>IP Address or CIDR Range</Label>
                  <Input
                    placeholder="192.168.1.0/24 or 10.0.0.1"
                    value={newEntry.cidr}
                    onChange={(e) => setNewEntry({ ...newEntry, cidr: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Examples: 192.168.1.0/24, 10.0.0.1, 2001:db8::/32
                  </p>
                </div>
                <div>
                  <Label>Expiration Date (Optional)</Label>
                  <Input
                    type="datetime-local"
                    value={newEntry.expiresAt}
                    onChange={(e) => setNewEntry({ ...newEntry, expiresAt: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave empty for permanent access, or set a date for temporary access (e.g., during travel)
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => addMutation.mutate(newEntry)}
                  disabled={!newEntry.label || !newEntry.cidr}
                >
                  Add Entry
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {ipAllowlist.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Globe className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No IP restrictions configured</p>
            <p className="text-sm">User can login from any IP address</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>IP/CIDR</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ipAllowlist.map((entry: any) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{entry.label}</TableCell>
                  <TableCell className="font-mono text-sm">{entry.cidr}</TableCell>
                  <TableCell>
                    {entry.isActive ? (
                      <Badge variant="default">
                        <Wifi className="w-3 h-3 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <WifiOff className="w-3 h-3 mr-1" />
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {entry.expiresAt ? (
                      <div>
                        {new Date(entry.expiresAt) < new Date() ? (
                          <Badge variant="destructive" className="text-xs">
                            Expired {format(new Date(entry.expiresAt), 'MMM d')}
                          </Badge>
                        ) : (
                          <span className="text-sm">
                            {format(new Date(entry.expiresAt), 'MMM d, yyyy')}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Never</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {format(new Date(entry.createdAt), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Switch
                        checked={entry.isActive}
                        onCheckedChange={(checked) => 
                          toggleMutation.mutate({ id: entry.id, isActive: checked })
                        }
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove IP Entry</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove this IP allowlist entry?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(entry.id)}
                            >
                              Remove Entry
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}