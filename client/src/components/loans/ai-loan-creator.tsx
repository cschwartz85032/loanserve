import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CloudUpload, File, X, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface AILoanCreatorProps {
  open: boolean;
  onClose: () => void;
  onLoanCreated: (loanId: string) => void;
}

interface UploadedFile {
  file: File;
  status: 'pending' | 'processing' | 'completed' | 'error';
  documentType?: string;
  extractedData?: any;
  error?: string;
}

export function AILoanCreator({ open, onClose, onLoanCreated }: AILoanCreatorProps) {
  const { toast } = useToast();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(-1);

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
      const newFiles = Array.from(e.dataTransfer.files).map(file => ({
        file,
        status: 'pending' as const
      }));
      setFiles(prev => [...prev, ...newFiles]);
    }
  }, []);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const processDocuments = async () => {
    if (files.length === 0) {
      toast({
        title: "No documents",
        description: "Please add some documents first",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      // Process each document one by one
      for (let i = 0; i < files.length; i++) {
        setCurrentProcessingIndex(i);
        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: 'processing' } : f
        ));

        const formData = new FormData();
        formData.append('file', files[i].file);
        
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
          
          setFiles(prev => prev.map((f, idx) => 
            idx === i ? { 
              ...f, 
              status: 'completed',
              documentType: result.documentType,
              extractedData: result.extractedData
            } : f
          ));

        } catch (error) {
          console.error(`Error processing file ${files[i].file.name}:`, error);
          setFiles(prev => prev.map((f, idx) => 
            idx === i ? { 
              ...f, 
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            } : f
          ));
        }
      }

      // Combine all extracted data
      const allExtractedData = files
        .filter(f => f.status === 'completed' && f.extractedData)
        .reduce((combined, f) => {
          // Merge data, with later documents taking precedence for conflicts
          return { ...combined, ...f.extractedData };
        }, {});

      // Create the loan with AI-extracted data
      const response = await fetch('/api/loans/create-from-documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          extractedData: allExtractedData,
          documentTypes: files.map(f => f.documentType).filter(Boolean)
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create loan from extracted data');
      }

      const newLoan = await response.json();
      
      toast({
        title: "Loan Created",
        description: `Loan #${newLoan.id} has been created with AI-extracted data`,
      });

      onLoanCreated(newLoan.id);
      handleClose();

    } catch (error) {
      console.error('Error processing documents:', error);
      toast({
        title: "Processing failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
      setCurrentProcessingIndex(-1);
    }
  };

  const handleClose = () => {
    setFiles([]);
    setIsProcessing(false);
    setCurrentProcessingIndex(-1);
    onClose();
  };

  const completedCount = files.filter(f => f.status === 'completed').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const progressPercent = files.length > 0 ? (completedCount + errorCount) / files.length * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Loan with AI Document Analysis</DialogTitle>
          <DialogDescription>
            Drop all loan documents here. AI will analyze each document and extract relevant information to populate the loan database.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Drop Zone */}
          <Card 
            className={cn(
              "border-2 border-dashed transition-colors",
              dragActive ? "border-primary bg-primary/5" : "border-gray-300",
              isProcessing && "pointer-events-none opacity-50"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <CardContent className="p-8">
              <div className="text-center">
                <CloudUpload className="mx-auto h-16 w-16 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Drop Loan Documents Here</h3>
                <p className="text-gray-600 mb-4">
                  Upload all relevant loan documents including applications, property deeds, 
                  income statements, credit reports, appraisals, insurance policies, etc.
                </p>
                <p className="text-sm text-gray-500">
                  Supports PDF, DOC, DOCX, JPG, PNG files up to 10MB each
                </p>
              </div>
            </CardContent>
          </Card>

          {/* File List */}
          {files.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Uploaded Documents ({files.length})</span>
                  {isProcessing && (
                    <div className="flex items-center gap-2">
                      <Progress value={progressPercent} className="w-32" />
                      <span className="text-sm text-gray-600">
                        {completedCount + errorCount}/{files.length}
                      </span>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {files.map((uploadedFile, index) => (
                    <div 
                      key={index} 
                      className={cn(
                        "flex items-center justify-between p-3 border rounded-lg",
                        currentProcessingIndex === index && "bg-blue-50 border-blue-200",
                        uploadedFile.status === 'completed' && "bg-green-50 border-green-200",
                        uploadedFile.status === 'error' && "bg-red-50 border-red-200"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <File className="h-5 w-5 text-gray-500" />
                        <div>
                          <p className="font-medium">{uploadedFile.file.name}</p>
                          <p className="text-sm text-gray-500">
                            {(uploadedFile.file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                          {uploadedFile.documentType && (
                            <Badge variant="secondary" className="mt-1">
                              {uploadedFile.documentType}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {uploadedFile.status === 'pending' && (
                          <Badge variant="outline">Pending</Badge>
                        )}
                        {uploadedFile.status === 'processing' && (
                          <Badge variant="default">Processing...</Badge>
                        )}
                        {uploadedFile.status === 'completed' && (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        )}
                        {uploadedFile.status === 'error' && (
                          <AlertCircle className="h-5 w-5 text-red-600" />
                        )}
                        {!isProcessing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
              Cancel
            </Button>
            <Button 
              onClick={processDocuments} 
              disabled={files.length === 0 || isProcessing}
            >
              {isProcessing ? "Processing Documents..." : "Analyze & Create Loan"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}