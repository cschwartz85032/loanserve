import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Loader2, RotateCcw, Info, Zap, Shield, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ConsumerPrefetchConfig {
  payment_validation: number;
  payment_processing: number;
  payment_distribution: number;
  payment_reversal: number;
  payment_classifier: number;
  rules_engine: number;
  notification: number;
  audit_log: number;
  poster_service: number;
  compliance_check: number;
  aml_screening: number;
  servicing_cycle: number;
  investor_reporting: number;
  clawback_processor: number;
  ach_return: number;
  wire_processor: number;
  default: number;
}

const consumerDescriptions: Record<keyof ConsumerPrefetchConfig, { label: string; description: string; recommended: string }> = {
  payment_validation: {
    label: "Payment Validation",
    description: "Validates payment data and business rules",
    recommended: "Fast processing, can handle 15-30"
  },
  payment_processing: {
    label: "Payment Processing",
    description: "Core payment processing and ledger updates",
    recommended: "Heavy processing, keep at 3-5"
  },
  payment_distribution: {
    label: "Payment Distribution",
    description: "Distributes payments to investors",
    recommended: "Moderate processing, 8-12"
  },
  payment_reversal: {
    label: "Payment Reversal",
    description: "Handles payment reversals and corrections",
    recommended: "Critical operations, keep at 1-3"
  },
  payment_classifier: {
    label: "Payment Classifier",
    description: "Classifies payment types and routing",
    recommended: "Fast classification, 15-25"
  },
  rules_engine: {
    label: "Rules Engine",
    description: "Evaluates business rules and compliance",
    recommended: "Moderate evaluation, 8-15"
  },
  notification: {
    label: "Notifications",
    description: "Sends email and SMS notifications",
    recommended: "Very fast, can handle 40-60"
  },
  audit_log: {
    label: "Audit Logging",
    description: "Records audit trail events",
    recommended: "Extremely fast writes, 80-120"
  },
  poster_service: {
    label: "External Posting",
    description: "Posts to external APIs",
    recommended: "API calls, keep at 5-10"
  },
  compliance_check: {
    label: "Compliance Checks",
    description: "Performs regulatory compliance checks",
    recommended: "Heavy processing, 3-5"
  },
  aml_screening: {
    label: "AML Screening",
    description: "Anti-money laundering screening",
    recommended: "Very heavy processing, 1-3"
  },
  servicing_cycle: {
    label: "Daily Servicing",
    description: "Daily loan servicing calculations",
    recommended: "Critical batch processing, 1"
  },
  investor_reporting: {
    label: "Investor Reports",
    description: "Generates investor reports",
    recommended: "Heavy report generation, 3-5"
  },
  clawback_processor: {
    label: "Clawback Processing",
    description: "Processes investor clawbacks",
    recommended: "Critical financial operations, 1-3"
  },
  ach_return: {
    label: "ACH Returns",
    description: "Processes ACH return notifications",
    recommended: "Return handling, 5-8"
  },
  wire_processor: {
    label: "Wire Processing",
    description: "Processes wire transfers",
    recommended: "Wire operations, 8-12"
  },
  default: {
    label: "Default (Fallback)",
    description: "Default prefetch for unknown consumers",
    recommended: "General purpose, 10"
  }
};

export default function RabbitMQSettings() {
  const { toast } = useToast();
  const [config, setConfig] = useState<ConsumerPrefetchConfig | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  
  // Session management state
  const [sessionSettings, setSessionSettings] = useState({
    sessionTimeoutMinutes: 30,
    extendSessionOnActivity: true,
    requireReauthForSensitive: true,
    allowMultipleSessions: false,
    maxConcurrentSessions: 1
  });
  const [sessionDirty, setSessionDirty] = useState(false);

  // Fetch current configuration
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/admin/rabbitmq/config"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  
  // Fetch session settings
  const { data: adminSettings } = useQuery({
    queryKey: ["/api/admin/settings"],
    enabled: true
  });

  useEffect(() => {
    if (data?.config) {
      setConfig(data.config);
    }
  }, [data]);
  
  useEffect(() => {
    if (adminSettings?.sessionSettings) {
      setSessionSettings(adminSettings.sessionSettings);
    }
  }, [adminSettings]);

  // Save configuration mutation
  const saveMutation = useMutation({
    mutationFn: async (newConfig: ConsumerPrefetchConfig) => {
      const response = await fetch("/api/admin/rabbitmq/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ config: newConfig }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save configuration");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Configuration Saved",
        description: "RabbitMQ prefetch settings have been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rabbitmq/config"] });
      setIsDirty(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Save Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Reset to defaults mutation
  const resetMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/rabbitmq/config/reset", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to reset configuration");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Reset to Defaults",
        description: "RabbitMQ prefetch settings have been reset to default values.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rabbitmq/config"] });
      setIsDirty(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Reset Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Save session settings mutation
  const saveSessionMutation = useMutation({
    mutationFn: async (sessionData: any) => {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionSettings: sessionData })
      });
      if (!response.ok) throw new Error("Failed to update session settings");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({
        title: "Session settings updated",
        description: "Session management settings have been saved successfully.",
      });
      setSessionDirty(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Force disconnect RabbitMQ connections mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/rabbitmq/force-disconnect", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to disconnect RabbitMQ connections");
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Connections Closed",
        description: `${data.message}. Active connections: ${data.connectionStats?.activeConnections || 0}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Disconnect Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleInputChange = (key: keyof ConsumerPrefetchConfig, value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 1 && numValue <= 1000) {
      setConfig(prev => prev ? { ...prev, [key]: numValue } : null);
      setIsDirty(true);
    }
  };
  
  const handleSessionInputChange = (key: string, value: any) => {
    setSessionSettings(prev => ({ ...prev, [key]: value }));
    setSessionDirty(true);
  };
  
  const handleSessionSave = () => {
    saveSessionMutation.mutate(sessionSettings);
  };

  const handleForceDisconnect = () => {
    if (confirm("Are you sure you want to force close all RabbitMQ connections? This will temporarily disrupt message processing.")) {
      disconnectMutation.mutate();
    }
  };

  const handleSave = () => {
    if (config) {
      saveMutation.mutate(config);
    }
  };

  const handleReset = () => {
    if (confirm("Are you sure you want to reset all prefetch values to defaults?")) {
      resetMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error Loading Configuration</AlertTitle>
        <AlertDescription>Failed to load RabbitMQ configuration. Please try again later.</AlertDescription>
      </Alert>
    );
  }

  if (!config) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Session Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Session Management
          </CardTitle>
          <CardDescription>Configure session timeout and security settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="session-timeout">Session Timeout (minutes)</Label>
              <Input
                id="session-timeout"
                type="number"
                value={sessionSettings.sessionTimeoutMinutes}
                onChange={(e) => handleSessionInputChange('sessionTimeoutMinutes', parseInt(e.target.value))}
                min="5"
                max="1440"
              />
            </div>
            <div>
              <Label htmlFor="max-sessions">Max Concurrent Sessions</Label>
              <Input
                id="max-sessions"
                type="number"
                value={sessionSettings.maxConcurrentSessions}
                onChange={(e) => handleSessionInputChange('maxConcurrentSessions', parseInt(e.target.value))}
                min="1"
                max="10"
                disabled={!sessionSettings.allowMultipleSessions}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Maximum concurrent sessions per user
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Extend Session on Activity</Label>
              <Switch
                checked={sessionSettings.extendSessionOnActivity}
                onCheckedChange={(checked) => handleSessionInputChange('extendSessionOnActivity', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Require Re-authentication for Sensitive Operations</Label>
              <Switch
                checked={sessionSettings.requireReauthForSensitive}
                onCheckedChange={(checked) => handleSessionInputChange('requireReauthForSensitive', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Allow Multiple Sessions</Label>
              <Switch
                checked={sessionSettings.allowMultipleSessions}
                onCheckedChange={(checked) => handleSessionInputChange('allowMultipleSessions', checked)}
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button 
              onClick={handleSessionSave} 
              disabled={!sessionDirty || saveSessionMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {saveSessionMutation.isPending ? "Saving..." : "Save Session Settings"}
            </Button>
            <Button 
              onClick={handleForceDisconnect} 
              variant="destructive"
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? 'Disconnecting...' : 'Force Close All Connections'}
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* RabbitMQ Consumer Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            RabbitMQ Consumer Prefetch Configuration
          </CardTitle>
          <CardDescription>
            Configure prefetch values for each consumer type to optimize message processing based on processing time and network latency.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-6">
            <Info className="h-4 w-4" />
            <AlertTitle>Optimization Guide</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li><strong>Fast processors ({"<"}10ms):</strong> Set prefetch to 50-100</li>
                <li><strong>Moderate processors (10-50ms):</strong> Set prefetch to 10-20</li>
                <li><strong>Slow processors (50-200ms):</strong> Set prefetch to 3-10</li>
                <li><strong>Very slow processors ({">"}200ms):</strong> Set prefetch to 1-3</li>
                <li><strong>Critical operations:</strong> Always use low prefetch (1-3) for safety</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <TooltipProvider>
              {Object.entries(consumerDescriptions).map(([key, info]) => (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={key}>{info.label}</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-semibold">{info.description}</p>
                        <p className="text-sm mt-1">Recommended: {info.recommended}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id={key}
                    type="number"
                    min="1"
                    max="1000"
                    value={config[key as keyof ConsumerPrefetchConfig]}
                    onChange={(e) => handleInputChange(key as keyof ConsumerPrefetchConfig, e.target.value)}
                    className="w-full"
                  />
                </div>
              ))}
            </TooltipProvider>
          </div>

          <div className="flex justify-between items-center mt-6 pt-6 border-t">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Reset to Defaults
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setConfig(data?.config || null);
                  setIsDirty(false);
                }}
                disabled={!isDirty}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!isDirty || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Save Changes
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}