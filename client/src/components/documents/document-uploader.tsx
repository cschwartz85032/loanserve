import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { 
  Upload, 
  FileText, 
  X, 
  CheckCircle, 
  AlertCircle,
  File,
  FileImage,
  FileVideo,
  FileAudio
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";

interface UploadedFile {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  documentId?: number;
}

interface DocumentUploaderProps {
  loanId?: number;
  onUploadComplete?: () => void;
  standalone?: boolean;
}

export function DocumentUploader({ loanId: propLoanId, onUploadComplete, standalone = false }: DocumentUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedLoanId, setSelectedLoanId] = useState<number | undefined>(propLoanId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedLoanIdRef = useRef<number | undefined>(propLoanId);
  const { toast } = useToast();

  // Keep ref in sync with state
  useEffect(() => {
    selectedLoanIdRef.current = selectedLoanId;
  }, [selectedLoanId]);

  // Fetch loans for selection if no loanId is provided
  const { data: loans } = useQuery({
    queryKey: ['/api/loans'],
    enabled: !propLoanId && standalone
  });

  // Auto-select first loan if there's any loans and no loan is selected
  useEffect(() => {
    if (Array.isArray(loans) && loans.length > 0 && !propLoanId && standalone) {
      // Only set if not already set
      if (!selectedLoanId) {
        console.log('Auto-selecting first loan:', loans[0].id);
        setSelectedLoanId(loans[0].id);
      }
    }
  }, [loans]); // Only re-run when loans change

  const uploadMutation = useMutation({
    mutationFn: async ({ file, loanId }: { file: File; loanId: number }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('loanId', loanId.toString());
      formData.append('category', 'other');
      formData.append('description', `Uploaded ${file.name}`);

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      setFiles(prev => prev.map(f => 
        f.file === variables.file 
          ? { ...f, status: 'success', documentId: data.id }
          : f
      ));
      
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      
      toast({
        title: "Document uploaded",
        description: `${variables.file.name} has been uploaded successfully.`,
      });
    },
    onError: (error, variables) => {
      setFiles(prev => prev.map(f => 
        f.file === variables.file 
          ? { ...f, status: 'error', error: error.message }
          : f
      ));
      
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      handleFiles(selectedFiles);
    }
  };

  const handleFiles = (newFiles: File[]) => {
    const loanIdToUse = selectedLoanIdRef.current || propLoanId;
    
    console.log('handleFiles called with:', {
      selectedLoanId: selectedLoanIdRef.current,
      propLoanId,
      loanIdToUse,
      standalone,
      filesCount: newFiles.length
    });
    
    if (!loanIdToUse && standalone) {
      toast({
        title: "Select a loan",
        description: "Please select a loan to attach the documents to.",
        variant: "destructive",
      });
      return;
    }

    const uploadFiles: UploadedFile[] = newFiles.map(file => ({
      file,
      progress: 0,
      status: 'pending'
    }));

    setFiles(prev => [...prev, ...uploadFiles]);

    // Start uploading each file
    uploadFiles.forEach(uploadFile => {
      uploadDocument(uploadFile.file);
    });
  };

  const uploadDocument = async (file: File) => {
    const loanIdToUse = selectedLoanId || propLoanId;
    if (!loanIdToUse) return;

    setFiles(prev => prev.map(f => 
      f.file === file 
        ? { ...f, status: 'uploading', progress: 50 }
        : f
    ));

    uploadMutation.mutate({ file, loanId: loanIdToUse });
  };

  const removeFile = (file: File) => {
    setFiles(prev => prev.filter(f => f.file !== file));
  };

  const getFileIcon = (file: File) => {
    const type = file.type.toLowerCase();
    if (type.includes('image')) return <FileImage className="h-5 w-5" />;
    if (type.includes('video')) return <FileVideo className="h-5 w-5" />;
    if (type.includes('audio')) return <FileAudio className="h-5 w-5" />;
    if (type.includes('pdf')) return <FileText className="h-5 w-5 text-red-500" />;
    return <File className="h-5 w-5" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-4">
      {/* Loan Selection for Standalone Mode */}
      {standalone && !propLoanId && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Select Loan</label>
          <Select 
            value={selectedLoanId?.toString()} 
            onValueChange={(value) => {
              console.log('Loan selected:', value);
              setSelectedLoanId(parseInt(value));
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a loan to attach documents" />
            </SelectTrigger>
            <SelectContent>
              {Array.isArray(loans) && loans.map((loan: any) => {
                console.log('Loan in dropdown:', loan);
                return (
                  <SelectItem key={loan.id} value={loan.id.toString()}>
                    {loan.loanNumber} - {loan.borrower?.name || loan.borrowerName || 'ALEX MARANTO'}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Drop Zone */}
      <Card
        className={`border-2 border-dashed transition-colors ${
          isDragging 
            ? 'border-primary bg-primary/5' 
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="p-8 text-center">
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-lg font-medium mb-2">
            Drag and drop documents here
          </p>
          <p className="text-sm text-gray-500 mb-4">
            or click to browse from your computer
          </p>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            Select Files
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt,.csv"
          />
          <p className="text-xs text-gray-400 mt-4">
            Supported formats: PDF, DOC, DOCX, XLS, XLSX, Images, TXT, CSV
          </p>
        </div>
      </Card>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Uploaded Files</h3>
          {files.map((uploadFile, index) => (
            <Card key={index} className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1">
                  {getFileIcon(uploadFile.file)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {uploadFile.file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(uploadFile.file.size)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  {uploadFile.status === 'pending' && (
                    <div className="text-xs text-gray-500">Waiting...</div>
                  )}
                  
                  {uploadFile.status === 'uploading' && (
                    <div className="w-24">
                      <Progress value={uploadFile.progress} className="h-2" />
                    </div>
                  )}
                  
                  {uploadFile.status === 'success' && (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  )}
                  
                  {uploadFile.status === 'error' && (
                    <div className="flex items-center space-x-1">
                      <AlertCircle className="h-5 w-5 text-red-500" />
                      <span className="text-xs text-red-500">{uploadFile.error}</span>
                    </div>
                  )}
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(uploadFile.file)}
                    disabled={uploadFile.status === 'uploading'}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Complete Button for Standalone Mode */}
      {standalone && files.some(f => f.status === 'success') && (
        <div className="flex justify-end">
          <Button onClick={onUploadComplete}>
            Complete Upload
          </Button>
        </div>
      )}
    </div>
  );
}