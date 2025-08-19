import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface EventsLogProps {
  runId: string;
  searchFilter: string;
}

export function EventsLog({ runId, searchFilter }: EventsLogProps) {
  const { data: report, isLoading } = useQuery({
    queryKey: ['/api/servicing-cycle/export/' + runId],
    enabled: !!runId
  });

  if (isLoading) {
    return <div className="text-center py-4">Loading events...</div>;
  }

  if (!report || !report.events) {
    return <div className="text-center py-4 text-muted-foreground">No events found for this run.</div>;
  }

  // Filter events based on search
  const filteredEvents = report.events.filter((event: any) => {
    if (!searchFilter) return true;
    const searchLower = searchFilter.toLowerCase();
    
    // Parse details if it's a JSON string
    let details = {};
    try {
      if (event.details && typeof event.details === 'string') {
        details = JSON.parse(event.details);
      } else if (event.details && typeof event.details === 'object') {
        details = event.details;
      }
    } catch (e) {
      // If parsing fails, use empty object
    }
    
    // Search in various fields
    return (
      event.eventType?.toLowerCase().includes(searchLower) ||
      event.loanId?.toString().includes(searchFilter) ||
      JSON.stringify(details).toLowerCase().includes(searchLower)
    );
  });

  // Separate detailed logs from regular events
  const detailedLogs = filteredEvents.filter((e: any) => e.eventType?.startsWith('LOG_'));
  const regularEvents = filteredEvents.filter((e: any) => !e.eventType?.startsWith('LOG_'));

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
          <div className="text-sm text-muted-foreground">Total Events</div>
          <div className="text-2xl font-bold">{report.events.length}</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
          <div className="text-sm text-muted-foreground">Detailed Logs</div>
          <div className="text-2xl font-bold">{detailedLogs.length}</div>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
          <div className="text-sm text-muted-foreground">Business Events</div>
          <div className="text-2xl font-bold">{regularEvents.length}</div>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg">
          <div className="text-sm text-muted-foreground">Loans Processed</div>
          <div className="text-2xl font-bold">{new Set(report.events.map((e: any) => e.loanId)).size}</div>
        </div>
      </div>

      {/* Detailed Event Logs */}
      <div className="space-y-2">
        <h3 className="font-medium text-lg mb-3">Detailed Decision Logs</h3>
        <ScrollArea className="h-[600px]">
          {detailedLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No detailed logs found. The servicing cycle ran without detailed logging.
            </div>
          ) : (
            detailedLogs.map((event: any, index: number) => {
              let details: any = {};
              try {
                details = typeof event.details === 'string' ? JSON.parse(event.details) : event.details || {};
              } catch (e) {
                details = { raw: event.details };
              }

              const eventTypeClean = event.eventType.replace('LOG_', '').replace(/_/g, ' ');
              
              return (
                <div key={index} className="border rounded-lg p-4 mb-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className="text-xs">
                        {eventTypeClean}
                      </Badge>
                      {event.loanId && (
                        <span className="text-sm text-muted-foreground">
                          Loan #{event.loanId}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {event.timestamp ? format(new Date(event.timestamp), 'HH:mm:ss.SSS') : ''}
                    </span>
                  </div>
                  
                  {/* Main message */}
                  {details.message && (
                    <div className="font-medium mb-2">{details.message}</div>
                  )}
                  
                  {/* Decision and Reason */}
                  {details.decision && (
                    <div className="mb-2">
                      <Badge className={
                        details.decision.includes('ERROR') ? 'bg-red-500' :
                        details.decision.includes('SKIP') || details.decision.includes('NO_') ? 'bg-gray-500' :
                        details.decision.includes('PROCEED') || details.decision.includes('SUCCESS') ? 'bg-green-500' :
                        'bg-blue-500'
                      }>
                        Decision: {details.decision}
                      </Badge>
                    </div>
                  )}
                  
                  {details.reason && (
                    <div className="text-sm text-muted-foreground mb-2">
                      <strong>Reason:</strong> {details.reason}
                    </div>
                  )}
                  
                  {/* Additional Details */}
                  <div className="text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded mt-2">
                    <pre className="whitespace-pre-wrap break-words">
                      {JSON.stringify(
                        Object.fromEntries(
                          Object.entries(details).filter(([key]) => 
                            !['message', 'decision', 'reason'].includes(key)
                          )
                        ),
                        null,
                        2
                      )}
                    </pre>
                  </div>
                </div>
              );
            })
          )}
        </ScrollArea>
      </div>
    </div>
  );
}