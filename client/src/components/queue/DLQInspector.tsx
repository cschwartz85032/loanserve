import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AlertCircle, 
  RefreshCw, 
  Trash2, 
  Eye, 
  ArrowRight, 
  Clock, 
  XCircle,
  CheckCircle2,
  Edit3,
  Send,
  AlertTriangle,
  Info,
  Database,
  CreditCard,
  FileText,
  Users
} from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

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

// Helper to determine message type and provide context
function getMessageContext(queueName: string, message: DLQMessage) {
  const content = message.content;
  const routingKey = message.routingKey;
  
  // Payment queue messages
  if (queueName.includes('payment')) {
    if (content?.paymentId) {
      return {
        type: 'Payment Processing',
        icon: CreditCard,
        description: `Payment ${content.paymentId} for loan ${content.loanId || 'Unknown'}`,
        details: {
          'Payment ID': content.paymentId,
          'Loan ID': content.loanId,
          'Amount': content.amount ? `$${content.amount}` : 'Unknown',
          'Type': content.type || 'Unknown',
          'Status': content.status || 'Failed'
        }
      };
    }
  }
  
  // Settlement queue messages
  if (queueName.includes('settlement')) {
    return {
      type: 'Settlement Transaction',
      icon: Database,
      description: `Settlement for ${content.type || 'Unknown'} transaction`,
      details: {
        'Transaction ID': content.transactionId || 'Unknown',
        'Settlement Type': content.type || 'Unknown',
        'Amount': content.amount ? `$${content.amount}` : 'Unknown',
        'Bank': content.bankId || 'Unknown'
      }
    };
  }
  
  // Reconciliation queue messages
  if (queueName.includes('reconciliation')) {
    return {
      type: 'Bank Reconciliation',
      icon: FileText,
      description: `Reconciliation for ${content.bankId || 'Unknown'} bank`,
      details: {
        'Bank ID': content.bankId || 'Unknown',
        'Date': content.date || 'Unknown',
        'Records': content.recordCount || 'Unknown',
        'Status': 'Failed to reconcile'
      }
    };
  }
  
  // Default context
  return {
    type: 'Message',
    icon: Info,
    description: `Message from ${message.exchange || 'Unknown'} exchange`,
    details: {
      'Exchange': message.exchange,
      'Routing Key': message.routingKey,
      'Size': `${message.contentSize} bytes`
    }
  };
}

// Helper to analyze failure and provide recommendations
function analyzeFailure(failureReason: any) {
  if (!failureReason) {
    return {
      category: 'Unknown',
      severity: 'low',
      description: 'No failure reason provided',
      recommendations: ['Check consumer logs for more details']
    };
  }
  
  const reasonStr = typeof failureReason === 'string' 
    ? failureReason 
    : failureReason.reason || JSON.stringify(failureReason);
  
  // Database errors
  if (reasonStr.toLowerCase().includes('database') || 
      reasonStr.toLowerCase().includes('column') ||
      reasonStr.toLowerCase().includes('table')) {
    return {
      category: 'Database Error',
      severity: 'high',
      description: 'Database operation failed',
      recommendations: [
        'Check if the database schema is up to date',
        'Verify the data types match expected format',
        'Ensure referenced records exist'
      ]
    };
  }
  
  // Validation errors
  if (reasonStr.toLowerCase().includes('validation') || 
      reasonStr.toLowerCase().includes('invalid') ||
      reasonStr.toLowerCase().includes('required')) {
    return {
      category: 'Validation Error',
      severity: 'medium',
      description: 'Message failed validation',
      recommendations: [
        'Review and correct the message content',
        'Ensure all required fields are present',
        'Check data formats (dates, amounts, IDs)'
      ]
    };
  }
  
  // Network/timeout errors
  if (reasonStr.toLowerCase().includes('timeout') || 
      reasonStr.toLowerCase().includes('connection') ||
      reasonStr.toLowerCase().includes('network')) {
    return {
      category: 'Network Error',
      severity: 'medium',
      description: 'Network or timeout issue',
      recommendations: [
        'This may be a temporary issue - retry might work',
        'Check if external services are available',
        'Verify network connectivity'
      ]
    };
  }
  
  // Permission errors
  if (reasonStr.toLowerCase().includes('permission') || 
      reasonStr.toLowerCase().includes('denied') ||
      reasonStr.toLowerCase().includes('unauthorized')) {
    return {
      category: 'Permission Error',
      severity: 'high',
      description: 'Authorization or permission denied',
      recommendations: [
        'Check API keys and credentials',
        'Verify user permissions',
        'Ensure service accounts have proper access'
      ]
    };
  }
  
  // Default
  return {
    category: 'Processing Error',
    severity: 'medium',
    description: reasonStr.substring(0, 200),
    recommendations: [
      'Review the error details carefully',
      'Check if the message format is correct',
      'Consider if the target system is ready to process this message'
    ]
  };
}

export function DLQInspector({ queueName, isOpen, onClose }: DLQInspectorProps) {
  const [selectedMessage, setSelectedMessage] = useState<DLQMessage | null>(null);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [showRetryDialog, setShowRetryDialog] = useState(false);
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
    mutationFn: (data: { messageCount?: number; editedMessage?: any }) => {
      if (data.editedMessage) {
        // If we have edited content, send it with the retry
        return apiRequest(`/api/dlq/${queueName}/retry`, {
          method: 'POST',
          body: JSON.stringify({ 
            messageCount: 1,
            editedMessage: data.editedMessage
          })
        });
      }
      return apiRequest(`/api/dlq/${queueName}/retry`, {
        method: 'POST',
        body: JSON.stringify({ messageCount: data.messageCount || 1 })
      });
    },
    onSuccess: () => {
      toast({
        title: 'Message Retried',
        description: 'Message has been moved back to the original queue for reprocessing'
      });
      refetchMessages();
      queryClient.invalidateQueries({ queryKey: [`/api/dlq/${queueName}/info`] });
      setShowRetryDialog(false);
      setEditMode(false);
      setSelectedMessage(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Retry Failed',
        description: error.message || 'Failed to retry message',
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
      setSelectedMessage(null);
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

  const handleEditMessage = () => {
    if (selectedMessage) {
      setEditedContent(JSON.stringify(selectedMessage.content, null, 2));
      setEditMode(true);
    }
  };

  const handleRetryWithEdit = () => {
    try {
      const parsed = JSON.parse(editedContent);
      setShowRetryDialog(true);
    } catch (error) {
      toast({
        title: 'Invalid JSON',
        description: 'Please fix the JSON syntax before retrying',
        variant: 'destructive'
      });
    }
  };

  const confirmRetry = () => {
    if (editMode && editedContent) {
      try {
        const parsed = JSON.parse(editedContent);
        retryMutation.mutate({ editedMessage: parsed });
      } catch (error) {
        toast({
          title: 'Invalid JSON',
          description: 'Please fix the JSON syntax before retrying',
          variant: 'destructive'
        });
      }
    } else {
      retryMutation.mutate({ messageCount: 1 });
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Dead Letter Queue Inspector: {queueName}
            </DialogTitle>
            <DialogDescription>
              Review, understand, and fix failed messages before retrying them
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            {dlqInfo && (
              <div className="mb-4 flex items-center justify-between">
                <div className="flex gap-4">
                  <Badge variant="secondary">
                    {dlqInfo.messageCount} Failed Messages
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

            {selectedMessage ? (
              // Message Detail View
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      setSelectedMessage(null);
                      setEditMode(false);
                    }}
                  >
                    ← Back to Messages
                  </Button>
                  <div className="flex gap-2">
                    {!editMode && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleEditMessage}
                      >
                        <Edit3 className="h-4 w-4 mr-1" />
                        Edit & Fix
                      </Button>
                    )}
                    {editMode && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditMode(false)}
                        >
                          Cancel Edit
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleRetryWithEdit}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Retry with Changes
                        </Button>
                      </>
                    )}
                    {!editMode && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setShowRetryDialog(true)}
                      >
                        <ArrowRight className="h-4 w-4 mr-1" />
                        Retry Original
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeMutation.mutate()}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>

                <ScrollArea className="h-[calc(90vh-250px)]">
                  <div className="space-y-6 pr-4">
                    {/* Message Context */}
                    {(() => {
                      const context = getMessageContext(queueName, selectedMessage);
                      const Icon = context.icon;
                      return (
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <Icon className="h-5 w-5" />
                              {context.type}
                            </CardTitle>
                            <CardDescription>{context.description}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 gap-4">
                              {Object.entries(context.details).map(([key, value]) => (
                                <div key={key}>
                                  <Label className="text-muted-foreground">{key}</Label>
                                  <div className="font-mono text-sm">{value}</div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })()}

                    {/* Failure Analysis */}
                    {selectedMessage.failureReason && (() => {
                      const analysis = analyzeFailure(selectedMessage.failureReason);
                      return (
                        <Alert className={
                          analysis.severity === 'high' ? 'border-red-500' :
                          analysis.severity === 'medium' ? 'border-yellow-500' :
                          'border-blue-500'
                        }>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle>
                            {analysis.category} - {analysis.severity.toUpperCase()} Priority
                          </AlertTitle>
                          <AlertDescription className="mt-2 space-y-2">
                            <p>{analysis.description}</p>
                            <div className="mt-3">
                              <p className="font-semibold mb-1">Recommended Actions:</p>
                              <ul className="list-disc list-inside space-y-1">
                                {analysis.recommendations.map((rec, idx) => (
                                  <li key={idx} className="text-sm">{rec}</li>
                                ))}
                              </ul>
                            </div>
                          </AlertDescription>
                        </Alert>
                      );
                    })()}

                    {/* Message Properties */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Message Properties</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <Label className="text-muted-foreground">Message ID</Label>
                            <div className="font-mono">{selectedMessage.messageId || 'None'}</div>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">Correlation ID</Label>
                            <div className="font-mono">{selectedMessage.correlationId || 'None'}</div>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">Failed At</Label>
                            <div>{formatTimestamp(selectedMessage.timestamp)}</div>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">Redelivered</Label>
                            <div>{selectedMessage.redelivered ? 
                              <Badge variant="outline">Yes - Multiple Attempts</Badge> : 
                              <Badge variant="secondary">No - First Attempt</Badge>
                            }</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Message Content Editor */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Message Content</CardTitle>
                        <CardDescription>
                          {editMode ? 
                            'Edit the JSON content below to fix any issues before retrying' :
                            'The actual message payload that failed to process'
                          }
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {editMode ? (
                          <Textarea
                            value={editedContent}
                            onChange={(e) => setEditedContent(e.target.value)}
                            className="font-mono text-sm min-h-[300px]"
                            placeholder="Edit message content..."
                          />
                        ) : (
                          <pre className="text-sm bg-muted p-4 rounded overflow-x-auto max-h-[400px]">
                            {JSON.stringify(selectedMessage.content, null, 2)}
                          </pre>
                        )}
                      </CardContent>
                    </Card>

                    {/* Headers */}
                    {selectedMessage.headers && Object.keys(selectedMessage.headers).length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Message Headers</CardTitle>
                          <CardDescription>
                            Metadata and routing information
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <pre className="text-sm bg-muted p-4 rounded overflow-x-auto">
                            {JSON.stringify(selectedMessage.headers, null, 2)}
                          </pre>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              // Message List View
              <ScrollArea className="h-[calc(90vh-200px)]">
                {isLoadingMessages ? (
                  <div className="p-4 text-center text-muted-foreground">
                    Loading messages...
                  </div>
                ) : messagesData?.messages.length === 0 ? (
                  <div className="p-8 text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <p className="text-lg font-semibold">No Failed Messages</p>
                    <p className="text-muted-foreground">
                      This queue is empty - all messages are processing successfully
                    </p>
                  </div>
                ) : (
                  <div className="p-4 space-y-3">
                    {messagesData?.messages.map((message) => {
                      const context = getMessageContext(queueName, message);
                      const analysis = analyzeFailure(message.failureReason);
                      const Icon = context.icon;
                      
                      return (
                        <Card 
                          key={message.deliveryTag}
                          className="cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => setSelectedMessage(message)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Icon className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-semibold">{context.type}</span>
                                  {message.redelivered && (
                                    <Badge variant="outline" className="text-xs">
                                      Retried
                                    </Badge>
                                  )}
                                  <Badge 
                                    variant={
                                      analysis.severity === 'high' ? 'destructive' :
                                      analysis.severity === 'medium' ? 'secondary' :
                                      'outline'
                                    }
                                    className="text-xs"
                                  >
                                    {analysis.category}
                                  </Badge>
                                </div>
                                
                                <p className="text-sm text-muted-foreground">
                                  {context.description}
                                </p>
                                
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatTimestamp(message.timestamp)}
                                  </span>
                                  <span className="font-mono">
                                    ID: {message.messageId || message.correlationId || 'Unknown'}
                                  </span>
                                </div>
                                
                                {analysis.description && (
                                  <div className="flex items-start gap-2 mt-2">
                                    <XCircle className="h-4 w-4 text-red-500 mt-0.5" />
                                    <p className="text-sm text-red-600 dark:text-red-400">
                                      {analysis.description.substring(0, 150)}
                                      {analysis.description.length > 150 && '...'}
                                    </p>
                                  </div>
                                )}
                              </div>
                              
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedMessage(message);
                                }}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Inspect
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retry Confirmation Dialog */}
      <Dialog open={showRetryDialog} onOpenChange={setShowRetryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Retry</DialogTitle>
            <DialogDescription>
              {editMode ? 
                'Are you sure you want to retry this message with your changes?' :
                'Are you sure you want to retry this message?'
              }
            </DialogDescription>
          </DialogHeader>
          
          {selectedMessage && (() => {
            const analysis = analyzeFailure(selectedMessage.failureReason);
            return (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Before Retrying</AlertTitle>
                <AlertDescription>
                  {analysis.severity === 'high' ? (
                    <p className="text-red-600 dark:text-red-400">
                      This message has a high-severity error. Make sure the underlying issue has been resolved before retrying.
                    </p>
                  ) : analysis.severity === 'medium' ? (
                    <p className="text-yellow-600 dark:text-yellow-400">
                      This message has a medium-severity error. It may succeed on retry if the issue was temporary.
                    </p>
                  ) : (
                    <p>This message may succeed on retry.</p>
                  )}
                </AlertDescription>
              </Alert>
            );
          })()}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRetryDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="default" 
              onClick={confirmRetry}
              disabled={retryMutation.isPending}
            >
              {retryMutation.isPending ? 'Retrying...' : 'Retry Message'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purge Confirmation Dialog */}
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
              All messages will be permanently deleted. Consider inspecting and fixing them first.
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