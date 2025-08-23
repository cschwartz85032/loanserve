import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, RefreshCw, Trash2, Eye, ArrowRight, Clock, XCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';

interface DLQMessage {
  messageId: string;
  correlationId: string;
  timestamp: number;
  headers: Record<string, any>;
  exchange: string;
  routingKey: string;
  redelivered: boolean;
  deliveryTag: string;
  content: any;
  contentSize: number;
  failureReason: any;
}

interface DLQInfo {
  queue: string;
  messageCount: number;
  consumerCount: number;
  originalQueue: string;
  info: any;
}

interface DLQInspectorProps {
  queueName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function DLQInspector({ queueName, isOpen, onClose }: DLQInspectorProps) {
  const [selectedMessage, setSelectedMessage] = useState<DLQMessage | null>(null);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const queryClient = useQueryClient();

  // Fetch DLQ info
  const { data: dlqInfo, isLoading: isLoadingInfo } = useQuery<DLQInfo>({
    queryKey: [`/api/dlq/${queueName}/info`],
    enabled: isOpen && !!queueName,
    refetchInterval: 5000
  });

  // Fetch DLQ messages
  const { data: messagesData, isLoading: isLoadingMessages, refetch: refetchMessages } = useQuery<{
    queue: string;
    messages: DLQMessage[];
    totalFetched: number;
  }>({
    queryKey: [`/api/dlq/${queueName}/messages?limit=50`],
    enabled: isOpen && !!queueName
  });

  // Retry message mutation
  const retryMutation = useMutation({
    mutationFn: (messageCount: number) => 
      apiRequest(`/api/dlq/${queueName}/retry`, {
        method: 'POST',
        body: JSON.stringify({ messageCount })
      }),
    onSuccess: () => {
      toast({
        title: 'Messages Retried',
        description: 'Messages have been moved back to the original queue for reprocessing'
      });
      refetchMessages();
      queryClient.invalidateQueries({ queryKey: [`/api/dlq/${queueName}/info`] });
    },
    onError: (error: any) => {
      toast({
        title: 'Retry Failed',
        description: error.message || 'Failed to retry messages',
        variant: 'destructive'
      });
    }
  });

  // Remove single message mutation
  const removeMutation = useMutation({
    mutationFn: () => 
      apiRequest(`/api/dlq/${queueName}/message`, {
        method: 'DELETE'
      }),
    onSuccess: () => {
      toast({
        title: 'Message Removed',
        description: 'Message has been removed from the DLQ'
      });
      refetchMessages();
      queryClient.invalidateQueries({ queryKey: [`/api/dlq/${queueName}/info`] });
    },
    onError: (error: any) => {
      toast({
        title: 'Remove Failed',
        description: error.message || 'Failed to remove message',
        variant: 'destructive'
      });
    }
  });

  // Purge queue mutation
  const purgeMutation = useMutation({
    mutationFn: () => 
      apiRequest(`/api/dlq/${queueName}/purge`, {
        method: 'DELETE'
      }),
    onSuccess: (data: any) => {
      toast({
        title: 'Queue Purged',
        description: `Removed ${data.messagesPurged} messages from the DLQ`
      });
      setShowPurgeConfirm(false);
      refetchMessages();
      queryClient.invalidateQueries({ queryKey: [`/api/dlq/${queueName}/info`] });
    },
    onError: (error: any) => {
      toast({
        title: 'Purge Failed',
        description: error.message || 'Failed to purge queue',
        variant: 'destructive'
      });
    }
  });

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatFailureReason = (failureReason: any) => {
    if (!failureReason) return 'Unknown';
    
    if (failureReason.reason) {
      return failureReason.reason;
    }
    
    if (typeof failureReason === 'string') {
      return failureReason;
    }
    
    return JSON.stringify(failureReason, null, 2);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Dead Letter Queue Inspector: {queueName}
            </DialogTitle>
            <DialogDescription>
              Review and manage failed messages in the DLQ
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            {dlqInfo && (
              <div className="mb-4 flex items-center justify-between">
                <div className="flex gap-4">
                  <Badge variant="secondary">
                    {dlqInfo.messageCount} Messages
                  </Badge>
                  <Badge variant="outline">
                    Original Queue: {dlqInfo.originalQueue}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchMessages()}
                    disabled={isLoadingMessages}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => retryMutation.mutate(1)}
                    disabled={!dlqInfo.messageCount || retryMutation.isPending}
                  >
                    <ArrowRight className="h-4 w-4 mr-1" />
                    Retry One
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowPurgeConfirm(true)}
                    disabled={!dlqInfo.messageCount}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Purge All
                  </Button>
                </div>
              </div>
            )}

            <Tabs defaultValue="messages" className="flex-1">
              <TabsList>
                <TabsTrigger value="messages">Messages</TabsTrigger>
                <TabsTrigger value="details" disabled={!selectedMessage}>
                  Message Details
                </TabsTrigger>
              </TabsList>

              <TabsContent value="messages" className="mt-4">
                <ScrollArea className="h-[500px] border rounded-lg">
                  {isLoadingMessages ? (
                    <div className="p-4 text-center text-muted-foreground">
                      Loading messages...
                    </div>
                  ) : messagesData?.messages.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      No messages in DLQ
                    </div>
                  ) : (
                    <div className="p-4 space-y-2">
                      {messagesData?.messages.map((message) => (
                        <Card 
                          key={message.deliveryTag}
                          className="cursor-pointer hover:bg-accent"
                          onClick={() => setSelectedMessage(message)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="space-y-1 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm">
                                    {message.messageId || 'No ID'}
                                  </span>
                                  {message.redelivered && (
                                    <Badge variant="outline" className="text-xs">
                                      Redelivered
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  <Clock className="inline h-3 w-3 mr-1" />
                                  {formatTimestamp(message.timestamp)}
                                </div>
                                <div className="text-sm">
                                  <span className="text-muted-foreground">Routing: </span>
                                  <span className="font-mono">{message.routingKey}</span>
                                </div>
                                {message.failureReason && (
                                  <div className="text-sm text-red-500">
                                    <XCircle className="inline h-3 w-3 mr-1" />
                                    {formatFailureReason(message.failureReason).substring(0, 100)}...
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedMessage(message);
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeMutation.mutate();
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="details" className="mt-4">
                {selectedMessage && (
                  <ScrollArea className="h-[500px] border rounded-lg p-4">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-2">Message Properties</h4>
                        <div className="space-y-1 text-sm">
                          <div><span className="text-muted-foreground">Message ID:</span> {selectedMessage.messageId || 'None'}</div>
                          <div><span className="text-muted-foreground">Correlation ID:</span> {selectedMessage.correlationId || 'None'}</div>
                          <div><span className="text-muted-foreground">Timestamp:</span> {formatTimestamp(selectedMessage.timestamp)}</div>
                          <div><span className="text-muted-foreground">Exchange:</span> {selectedMessage.exchange}</div>
                          <div><span className="text-muted-foreground">Routing Key:</span> {selectedMessage.routingKey}</div>
                          <div><span className="text-muted-foreground">Content Size:</span> {selectedMessage.contentSize} bytes</div>
                          <div><span className="text-muted-foreground">Redelivered:</span> {selectedMessage.redelivered ? 'Yes' : 'No'}</div>
                        </div>
                      </div>

                      {selectedMessage.failureReason && (
                        <div>
                          <h4 className="font-semibold mb-2">Failure Information</h4>
                          <pre className="text-sm bg-muted p-2 rounded overflow-x-auto">
                            {formatFailureReason(selectedMessage.failureReason)}
                          </pre>
                        </div>
                      )}

                      <div>
                        <h4 className="font-semibold mb-2">Headers</h4>
                        <pre className="text-sm bg-muted p-2 rounded overflow-x-auto">
                          {JSON.stringify(selectedMessage.headers, null, 2)}
                        </pre>
                      </div>

                      <div>
                        <h4 className="font-semibold mb-2">Message Content</h4>
                        <pre className="text-sm bg-muted p-2 rounded overflow-x-auto">
                          {JSON.stringify(selectedMessage.content, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPurgeConfirm} onOpenChange={setShowPurgeConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Purge</DialogTitle>
            <DialogDescription>
              Are you sure you want to purge all {dlqInfo?.messageCount} messages from the DLQ?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Alert className="bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              All messages will be permanently deleted. Consider retrying or inspecting them first.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPurgeConfirm(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => purgeMutation.mutate()}
              disabled={purgeMutation.isPending}
            >
              {purgeMutation.isPending ? 'Purging...' : 'Purge All Messages'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}