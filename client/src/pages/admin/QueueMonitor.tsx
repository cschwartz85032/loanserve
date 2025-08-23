import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, Activity, Users, MessageSquare, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
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

export default function QueueMonitor() {
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