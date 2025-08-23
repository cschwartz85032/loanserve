import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, Activity, Users, MessageSquare, RefreshCw, AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface QueueMetrics {
  name: string;
  messages: number;
  messagesReady: number;
  messagesUnacknowledged: number;
  consumers: number;
  type?: string;
}

interface ConnectionMetrics {
  connected: boolean;
  reconnectAttempts: number;
  publisherConnected: boolean;
  consumerConnected: boolean;
  activeConsumers: number;
  uptime?: number;
}

interface QueueHealth {
  queue: string;
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  recommendations?: string[];
}

interface AggregatedStats {
  totalQueues: number;
  totalMessages: number;
  totalConsumers: number;
  queuesByType: Record<string, number>;
  healthSummary: {
    healthy: number;
    warning: number;
    critical: number;
  };
}

interface MetricsHistory {
  timestamps: number[];
  totalMessages: number[];
  totalReady: number[];
  totalUnacked: number[];
  totalConsumers: number[];
  throughput: number[];
  queueData: {
    [queueName: string]: {
      messages: number[];
      consumers: number[];
    };
  };
}

interface TopQueue {
  name: string;
  messages: number;
  consumers: number;
  trend: 'up' | 'down' | 'stable';
}

interface ProcessingRates {
  averagePublishRate: number;
  averageDeliverRate: number;
  peakPublishRate: number;
  peakDeliverRate: number;
}

function QueueMonitorContent() {
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch queue metrics
  const { data: queues, refetch: refetchQueues } = useQuery<QueueMetrics[]>({
    queryKey: ['/api/queue-monitor/queues'],
    refetchInterval: autoRefresh ? 5000 : false
  });

  // Fetch connection metrics
  const { data: connection } = useQuery<ConnectionMetrics>({
    queryKey: ['/api/queue-monitor/connections'],
    refetchInterval: autoRefresh ? 5000 : false
  });

  // Fetch health status
  const { data: health } = useQuery<QueueHealth[]>({
    queryKey: ['/api/queue-monitor/health'],
    refetchInterval: autoRefresh ? 10000 : false
  });

  // Fetch aggregated stats
  const { data: stats } = useQuery<AggregatedStats>({
    queryKey: ['/api/queue-monitor/stats'],
    refetchInterval: autoRefresh ? 5000 : false
  });

  // Fetch historical metrics
  const { data: history } = useQuery<MetricsHistory>({
    queryKey: ['/api/queue-monitor/history'],
    refetchInterval: autoRefresh ? 5000 : false
  });

  // Fetch top queues
  const { data: topQueues } = useQuery<TopQueue[]>({
    queryKey: ['/api/queue-monitor/top-queues'],
    refetchInterval: autoRefresh ? 5000 : false
  });

  // Fetch processing rates
  const { data: processingRates } = useQuery<ProcessingRates>({
    queryKey: ['/api/queue-monitor/processing-rates'],
    refetchInterval: autoRefresh ? 5000 : false
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Healthy</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-500"><AlertTriangle className="h-3 w-3 mr-1" />Warning</Badge>;
      case 'critical':
        return <Badge className="bg-red-500"><AlertCircle className="h-3 w-3 mr-1" />Critical</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getQueueTypeBadge = (type?: string) => {
    const colors: Record<string, string> = {
      'payment': 'bg-blue-500',
      'servicing': 'bg-green-500',
      'document': 'bg-purple-500',
      'notification': 'bg-yellow-500',
      'dead-letter': 'bg-red-500',
      'settlement': 'bg-cyan-500',
      'reconciliation': 'bg-indigo-500',
      'compliance': 'bg-orange-500'
    };

    if (!type) return null;
    return <Badge className={colors[type] || 'bg-gray-500'}>{type}</Badge>;
  };

  const formatUptime = (ms?: number) => {
    if (!ms) return 'N/A';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  // Prepare chart data
  const prepareChartData = () => {
    if (!history) return [];
    
    return history.timestamps.map((timestamp, index) => ({
      time: new Date(timestamp).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      messages: history.totalMessages[index],
      ready: history.totalReady[index],
      unacked: history.totalUnacked[index],
      consumers: history.totalConsumers[index],
      throughput: history.throughput[index]?.toFixed(2) || 0
    }));
  };

  const preparePieData = () => {
    if (!stats?.queuesByType) return [];
    
    return Object.entries(stats.queuesByType).map(([type, count]) => ({
      name: type.charAt(0).toUpperCase() + type.slice(1),
      value: count
    }));
  };

  const COLORS = ['#3b82f6', '#10b981', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4', '#6366f1', '#f97316'];

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-red-500" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-green-500" />;
      case 'stable':
        return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Queue Monitor</h1>
          <p className="text-muted-foreground">Real-time RabbitMQ queue metrics and health status</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto Refresh ON' : 'Auto Refresh OFF'}
          </Button>
          <Button onClick={() => refetchQueues()}>
            Refresh Now
          </Button>
        </div>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Connection Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-lg font-semibold">
                {connection?.connected ? (
                  <span className="text-green-500">Connected</span>
                ) : (
                  <span className="text-red-500">Disconnected</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Uptime</p>
              <p className="text-lg font-semibold">{formatUptime(connection?.uptime)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Consumers</p>
              <p className="text-lg font-semibold">{connection?.activeConsumers || 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Reconnect Attempts</p>
              <p className="text-lg font-semibold">{connection?.reconnectAttempts || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Queues</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.totalQueues}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.totalMessages.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Consumers</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.totalConsumers}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Health Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <span className="text-green-500">{stats.healthSummary.healthy}</span> /
                <span className="text-yellow-500">{stats.healthSummary.warning}</span> /
                <span className="text-red-500">{stats.healthSummary.critical}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Message Throughput Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Message Throughput</CardTitle>
            <CardDescription>Messages processed over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={prepareChartData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="messages" 
                  stroke="#3b82f6" 
                  name="Total Messages"
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="ready" 
                  stroke="#10b981" 
                  name="Ready"
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="unacked" 
                  stroke="#f59e0b" 
                  name="Unacknowledged"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Queue Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Queue Distribution</CardTitle>
            <CardDescription>Queues by type</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={preparePieData()}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {preparePieData().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Consumer Activity Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Consumer Activity</CardTitle>
            <CardDescription>Active consumers over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={prepareChartData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="consumers" 
                  stroke="#6366f1" 
                  fill="#6366f1" 
                  fillOpacity={0.6}
                  name="Active Consumers"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Queues by Message Count */}
        <Card>
          <CardHeader>
            <CardTitle>Top Queues</CardTitle>
            <CardDescription>Queues with most messages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topQueues?.slice(0, 5).map((queue) => (
                <div key={queue.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{queue.name}</span>
                    {getTrendIcon(queue.trend)}
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="outline">{queue.messages} msgs</Badge>
                    <Badge variant="secondary">{queue.consumers} consumers</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Processing Rates */}
      {processingRates && (
        <Card>
          <CardHeader>
            <CardTitle>Processing Rates</CardTitle>
            <CardDescription>Message publish and delivery rates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Avg Publish Rate</p>
                <p className="text-lg font-semibold">{processingRates.averagePublishRate.toFixed(2)} msg/s</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Delivery Rate</p>
                <p className="text-lg font-semibold">{processingRates.averageDeliverRate.toFixed(2)} msg/s</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Peak Publish Rate</p>
                <p className="text-lg font-semibold">{processingRates.peakPublishRate.toFixed(2)} msg/s</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Peak Delivery Rate</p>
                <p className="text-lg font-semibold">{processingRates.peakDeliverRate.toFixed(2)} msg/s</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs for different views */}
      <Tabs defaultValue="queues" className="space-y-4">
        <TabsList>
          <TabsTrigger value="queues">Queues</TabsTrigger>
          <TabsTrigger value="health">Health Status</TabsTrigger>
          <TabsTrigger value="dlq">Dead Letter Queues</TabsTrigger>
        </TabsList>

        {/* Queues Tab */}
        <TabsContent value="queues" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Queue Metrics</CardTitle>
              <CardDescription>Real-time message counts and consumer status</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Queue Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Messages</TableHead>
                    <TableHead className="text-right">Ready</TableHead>
                    <TableHead className="text-right">Unacked</TableHead>
                    <TableHead className="text-right">Consumers</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queues?.filter(q => !q.name.startsWith('dlq.')).map(queue => {
                    const queueHealth = health?.find(h => h.queue === queue.name);
                    return (
                      <TableRow key={queue.name}>
                        <TableCell className="font-medium">{queue.name}</TableCell>
                        <TableCell>{getQueueTypeBadge(queue.type)}</TableCell>
                        <TableCell className="text-right">
                          {queue.messages === -1 ? (
                            <span className="text-red-500">Error</span>
                          ) : (
                            queue.messages.toLocaleString()
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {queue.messagesReady === -1 ? '-' : queue.messagesReady.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {queue.messagesUnacknowledged === -1 ? '-' : queue.messagesUnacknowledged.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {queue.consumers === -1 ? '-' : queue.consumers}
                        </TableCell>
                        <TableCell>
                          {queueHealth && getStatusBadge(queueHealth.status)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Health Status Tab */}
        <TabsContent value="health" className="space-y-4">
          {health?.filter(h => h.status !== 'healthy').map(item => (
            <Alert key={item.queue} className={
              item.status === 'critical' ? 'border-red-500' : 'border-yellow-500'
            }>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <strong>{item.queue}</strong>
                    {getStatusBadge(item.status)}
                  </div>
                  <ul className="list-disc list-inside space-y-1">
                    {item.issues.map((issue, i) => (
                      <li key={i} className="text-sm">{issue}</li>
                    ))}
                  </ul>
                  {item.recommendations && (
                    <div className="mt-2 pt-2 border-t">
                      <p className="text-sm font-semibold">Recommendations:</p>
                      <ul className="list-disc list-inside space-y-1">
                        {item.recommendations.map((rec, i) => (
                          <li key={i} className="text-sm text-muted-foreground">{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          ))}
          {health?.filter(h => h.status !== 'healthy').length === 0 && (
            <Alert className="border-green-500">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                All queues are healthy!
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        {/* Dead Letter Queues Tab */}
        <TabsContent value="dlq" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Dead Letter Queues</CardTitle>
              <CardDescription>Messages that failed processing</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Queue Name</TableHead>
                    <TableHead className="text-right">Failed Messages</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queues?.filter(q => q.name.startsWith('dlq.')).map(queue => (
                    <TableRow key={queue.name}>
                      <TableCell className="font-medium">{queue.name}</TableCell>
                      <TableCell className="text-right">
                        {queue.messages === -1 ? (
                          <span className="text-red-500">Error</span>
                        ) : (
                          <span className={queue.messages > 0 ? 'text-red-500 font-semibold' : ''}>
                            {queue.messages.toLocaleString()}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {queue.messages > 0 && (
                          <Button size="sm" variant="outline">
                            Investigate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function QueueMonitor() {
  return (
    <AdminLayout>
      <QueueMonitorContent />
    </AdminLayout>
  );
}