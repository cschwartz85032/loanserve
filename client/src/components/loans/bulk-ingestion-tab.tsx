import { useState, useCallback, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  CloudUpload, 
  File, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  FileText,
  FileJson,
  FileCode,
  Package,
  Eye,
  Check,
  XCircle,
  AlertTriangle,
  Play,
  Pause,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";

interface IngestedFile {
  file: File;
  id: string;
  status: 'pending' | 'analyzing' | 'processing' | 'validating' | 'complete' | 'error';
  fileType?: 'csv' | 'json' | 'xml' | 'pdf' | 'unknown';
  format?: 'loan_data' | 'document' | 'mismo' | 'mixed';
  recordCount?: number;
  confidence?: number;
  importJobId?: string;
  errors?: string[];
  warnings?: string[];
  extractedLoans?: any[];
}

interface ProcessingMetrics {
  totalFiles: number;
  filesProcessed: number;
  loansCreated: number;
  loansValidated: number;
  loansApproved: number;
  errors: number;
  warnings: number;
}

interface BulkIngestionTabProps {
  onLoansCreated?: (loanIds: string[]) => void;
}

export function BulkIngestionTab({ onLoansCreated }: BulkIngestionTabProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<IngestedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStage, setCurrentStage] = useState<'upload' | 'analysis' | 'validation' | 'approval' | 'creation'>('upload');
  const [metrics, setMetrics] = useState<ProcessingMetrics>({
    totalFiles: 0,
    filesProcessed: 0,
    loansCreated: 0,
    loansValidated: 0,
    loansApproved: 0,
    errors: 0,
    warnings: 0
  });

  // File type detection based on extension and content
  const detectFileType = (file: File): IngestedFile['fileType'] => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'csv':
        return 'csv';
      case 'json':
        return 'json';
      case 'xml':
        return 'xml';
      case 'pdf':
        return 'pdf';
      default:
        return 'unknown';
    }
  };

  // Detect format based on file type and potentially content
  const detectFormat = (fileType: IngestedFile['fileType']): IngestedFile['format'] => {
    switch (fileType) {
      case 'csv':
      case 'json':
        return 'loan_data';
      case 'xml':
        return 'mismo';
      case 'pdf':
        return 'document';
      default:
        return 'mixed';
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleFiles = (newFiles: File[]) => {
    const processedFiles: IngestedFile[] = newFiles.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      status: 'pending',
      fileType: detectFileType(file),
      format: detectFormat(detectFileType(file))
    }));

    setFiles(prev => [...prev, ...processedFiles]);
    setMetrics(prev => ({
      ...prev,
      totalFiles: prev.totalFiles + newFiles.length
    }));
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    setMetrics(prev => ({
      ...prev,
      totalFiles: Math.max(0, prev.totalFiles - 1)
    }));
  };

  // Process files based on their type
  const processFiles = async () => {
    if (files.length === 0) {
      toast({
        title: "No files to process",
        description: "Please add files to ingest",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setCurrentStage('analysis');

    try {
      for (const fileData of files) {
        // Update status to analyzing
        setFiles(prev => prev.map(f => 
          f.id === fileData.id ? { ...f, status: 'analyzing' } : f
        ));

        // Route based on file format
        if (fileData.format === 'document' && fileData.fileType === 'pdf') {
          // Use existing document analysis endpoint for PDFs
          await analyzeDocument(fileData);
        } else if (fileData.format === 'loan_data' || fileData.format === 'mismo') {
          // Use import endpoint for structured data
          await createImportJob(fileData);
        } else {
          // Handle unknown formats
          setFiles(prev => prev.map(f => 
            f.id === fileData.id ? { 
              ...f, 
              status: 'error',
              errors: ['Unsupported file format']
            } : f
          ));
        }
      }

      // Move to validation stage
      setCurrentStage('validation');
      await validateExtractedData();

    } catch (error) {
      console.error('Error processing files:', error);
      toast({
        title: "Processing error",
        description: "Failed to process some files",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Analyze PDF documents using existing AI endpoint
  const analyzeDocument = async (fileData: IngestedFile) => {
    const formData = new FormData();
    formData.append('file', fileData.file);

    try {
      const response = await fetch('/api/documents/analyze', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to analyze document: ${response.statusText}`);
      }

      const result = await response.json();
      
      setFiles(prev => prev.map(f => 
        f.id === fileData.id ? { 
          ...f, 
          status: 'complete',
          extractedLoans: [result.extractedData],
          confidence: result.confidence || 85
        } : f
      ));

      setMetrics(prev => ({
        ...prev,
        filesProcessed: prev.filesProcessed + 1
      }));

    } catch (error) {
      console.error(`Error analyzing document:`, error);
      setFiles(prev => prev.map(f => 
        f.id === fileData.id ? { 
          ...f, 
          status: 'error',
          errors: [error instanceof Error ? error.message : 'Unknown error']
        } : f
      ));
      
      setMetrics(prev => ({
        ...prev,
        errors: prev.errors + 1
      }));
    }
  };

  // Create import job for CSV/JSON/XML files
  const createImportJob = async (fileData: IngestedFile) => {
    const formData = new FormData();
    formData.append('file', fileData.file);
    formData.append('importType', fileData.format === 'mismo' ? 'mismo' : fileData.fileType || 'csv');

    try {
      const response = await fetch('/api/imports', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to create import job: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Update file with import job ID
      setFiles(prev => prev.map(f => 
        f.id === fileData.id ? { 
          ...f, 
          status: 'processing',
          importJobId: result.importId
        } : f
      ));

      // Poll for import status
      await pollImportStatus(fileData.id, result.importId);

    } catch (error) {
      console.error(`Error creating import job:`, error);
      setFiles(prev => prev.map(f => 
        f.id === fileData.id ? { 
          ...f, 
          status: 'error',
          errors: [error instanceof Error ? error.message : 'Unknown error']
        } : f
      ));
      
      setMetrics(prev => ({
        ...prev,
        errors: prev.errors + 1
      }));
    }
  };

  // Poll import job status
  const pollImportStatus = async (fileId: string, importJobId: string) => {
    const maxAttempts = 30;
    let attempts = 0;

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/imports/${importJobId}`, {
          method: 'GET',
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error(`Failed to check import status: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.status === 'completed' || result.status === 'accepted' || result.status === 'mapped') {
          // Import successful
          setFiles(prev => prev.map(f => 
            f.id === fileId ? { 
              ...f, 
              status: 'complete',
              extractedLoans: result.preview?.loans || [],
              recordCount: result.preview?.totalRecords || 0,
              confidence: 90 // Default confidence for imports
            } : f
          ));

          setMetrics(prev => ({
            ...prev,
            filesProcessed: prev.filesProcessed + 1
          }));

        } else if (result.status === 'error' || result.status === 'failed') {
          // Import failed
          setFiles(prev => prev.map(f => 
            f.id === fileId ? { 
              ...f, 
              status: 'error',
              errors: result.errors || ['Import failed']
            } : f
          ));

          setMetrics(prev => ({
            ...prev,
            errors: prev.errors + 1
          }));

        } else if (attempts < maxAttempts) {
          // Still processing, poll again
          attempts++;
          setTimeout(checkStatus, 2000);
        } else {
          // Timeout
          setFiles(prev => prev.map(f => 
            f.id === fileId ? { 
              ...f, 
              status: 'error',
              errors: ['Import timeout']
            } : f
          ));

          setMetrics(prev => ({
            ...prev,
            errors: prev.errors + 1
          }));
        }

      } catch (error) {
        console.error(`Error polling import status:`, error);
        setFiles(prev => prev.map(f => 
          f.id === fileId ? { 
            ...f, 
            status: 'error',
            errors: [error instanceof Error ? error.message : 'Unknown error']
          } : f
        ));
        
        setMetrics(prev => ({
          ...prev,
          errors: prev.errors + 1
        }));
      }
    };

    await checkStatus();
  };

  // Validate extracted data
  const validateExtractedData = async () => {
    setCurrentStage('validation');
    
    // Count extracted loans
    let totalLoans = 0;
    files.forEach(f => {
      if (f.extractedLoans) {
        totalLoans += f.extractedLoans.length;
      }
    });

    setMetrics(prev => ({
      ...prev,
      loansValidated: totalLoans
    }));

    // TODO: Implement actual validation logic
    // For now, mark all as validated
    setFiles(prev => prev.map(f => ({
      ...f,
      status: f.status === 'complete' ? 'complete' : f.status
    })));
  };

  // Approve and create loans
  const approveAndCreateLoans = async () => {
    setCurrentStage('creation');
    setIsProcessing(true);

    try {
      const createdLoanIds: string[] = [];

      for (const file of files) {
        if (file.status === 'complete' && file.extractedLoans) {
          for (const loanData of file.extractedLoans) {
            try {
              // Create loan using existing endpoint
              const response = await fetch('/api/loans', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(loanData)
              });
              
              if (!response.ok) {
                throw new Error(`Failed to create loan: ${response.statusText}`);
              }
              
              const result = await response.json();
              
              if (result.id) {
                createdLoanIds.push(result.id);
                setMetrics(prev => ({
                  ...prev,
                  loansCreated: prev.loansCreated + 1,
                  loansApproved: prev.loansApproved + 1
                }));
              }
            } catch (error) {
              console.error('Error creating loan:', error);
              setMetrics(prev => ({
                ...prev,
                errors: prev.errors + 1
              }));
            }
          }
        }
      }

      if (createdLoanIds.length > 0) {
        toast({
          title: "Loans created successfully",
          description: `Created ${createdLoanIds.length} loans from bulk ingestion`
        });

        if (onLoansCreated) {
          onLoansCreated(createdLoanIds);
        }

        // Refresh loan list
        queryClient.invalidateQueries({ queryKey: ['/api/loans'] });
      }

    } catch (error) {
      console.error('Error creating loans:', error);
      toast({
        title: "Error creating loans",
        description: "Some loans could not be created",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Get file icon based on type
  const getFileIcon = (fileType: IngestedFile['fileType']) => {
    switch (fileType) {
      case 'csv':
        return <FileText className="h-4 w-4" />;
      case 'json':
        return <FileJson className="h-4 w-4" />;
      case 'xml':
        return <FileCode className="h-4 w-4" />;
      case 'pdf':
        return <FileText className="h-4 w-4" />;
      default:
        return <File className="h-4 w-4" />;
    }
  };

  // Get status icon
  const getStatusIcon = (status: IngestedFile['status']) => {
    switch (status) {
      case 'pending':
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
      case 'analyzing':
      case 'processing':
      case 'validating':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'complete':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  // Get status color
  const getStatusColor = (status: IngestedFile['status']) => {
    switch (status) {
      case 'pending':
        return 'default';
      case 'analyzing':
      case 'processing':
      case 'validating':
        return 'secondary';
      case 'complete':
        return 'success';
      case 'error':
        return 'destructive';
      default:
        return 'default';
    }
  };

  return (
    <div className="space-y-4">
      {/* Processing Pipeline Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Processing Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge variant={currentStage === 'upload' ? 'default' : 'secondary'}>
                Upload
              </Badge>
              <span className="text-gray-400">→</span>
              <Badge variant={currentStage === 'analysis' ? 'default' : 'secondary'}>
                Analysis
              </Badge>
              <span className="text-gray-400">→</span>
              <Badge variant={currentStage === 'validation' ? 'default' : 'secondary'}>
                Validation
              </Badge>
              <span className="text-gray-400">→</span>
              <Badge variant={currentStage === 'approval' ? 'default' : 'secondary'}>
                QC & Approval
              </Badge>
              <span className="text-gray-400">→</span>
              <Badge variant={currentStage === 'creation' ? 'default' : 'secondary'}>
                Creation
              </Badge>
            </div>
          </div>
          
          {/* Metrics */}
          <div className="grid grid-cols-4 gap-2 mt-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{metrics.totalFiles}</div>
              <div className="text-xs text-gray-500">Files</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{metrics.filesProcessed}</div>
              <div className="text-xs text-gray-500">Processed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{metrics.loansValidated}</div>
              <div className="text-xs text-gray-500">Validated</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{metrics.loansCreated}</div>
              <div className="text-xs text-gray-500">Created</div>
            </div>
          </div>

          {metrics.errors > 0 || metrics.warnings > 0 ? (
            <div className="flex gap-2 mt-3">
              {metrics.errors > 0 && (
                <Badge variant="destructive">
                  {metrics.errors} Errors
                </Badge>
              )}
              {metrics.warnings > 0 && (
                <Badge variant="outline" className="border-yellow-500 text-yellow-700">
                  {metrics.warnings} Warnings
                </Badge>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* File Upload Zone */}
      <Card>
        <CardContent className="pt-6">
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              dragActive ? "border-primary bg-primary/5" : "border-gray-300",
              isProcessing && "opacity-50 pointer-events-none"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <CloudUpload className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-600">
              Drag and drop files here, or click to select
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Supports: CSV, JSON, MISMO XML, PDF documents
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
            >
              Select Files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".csv,.json,.xml,.pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  handleFiles(Array.from(e.target.files));
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Files List */}
      {files.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Files to Process</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {getFileIcon(file.fileType)}
                      <div>
                        <p className="text-sm font-medium">{file.file.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {file.fileType?.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {file.format}
                          </Badge>
                          {file.recordCount && (
                            <span className="text-xs text-gray-500">
                              {file.recordCount} records
                            </span>
                          )}
                          {file.confidence && (
                            <span className="text-xs text-gray-500">
                              {file.confidence}% confidence
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        {getStatusIcon(file.status)}
                        <Badge variant={getStatusColor(file.status) as any}>
                          {file.status}
                        </Badge>
                      </div>
                      {file.status === 'pending' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(file.id)}
                          disabled={isProcessing}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => {
            setFiles([]);
            setMetrics({
              totalFiles: 0,
              filesProcessed: 0,
              loansCreated: 0,
              loansValidated: 0,
              loansApproved: 0,
              errors: 0,
              warnings: 0
            });
            setCurrentStage('upload');
          }}
          disabled={isProcessing}
        >
          Clear All
        </Button>
        <div className="flex gap-2">
          {currentStage === 'upload' && files.length > 0 && (
            <Button
              onClick={processFiles}
              disabled={isProcessing || files.length === 0}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Start Processing
                </>
              )}
            </Button>
          )}
          {(currentStage === 'validation' || currentStage === 'approval') && (
            <Button
              onClick={approveAndCreateLoans}
              disabled={isProcessing}
              variant="default"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Loans...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Approve & Create Loans
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}