import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, File, X, CheckCircle, AlertCircle, FileText, FileImage, FileVideo, FileAudio, FilePlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface DocumentUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loanId?: string;
  borrowerId?: string;
}

interface FileWithProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
}

const DOCUMENT_TYPES = [
  { value: 'loan_application', label: 'Loan Application' },
  { value: 'credit_report', label: 'Credit Report' },
  { value: 'income_verification', label: 'Income Verification' },
  { value: 'property_appraisal', label: 'Property Appraisal' },
  { value: 'title_deed', label: 'Title Deed' },
  { value: 'insurance_policy', label: 'Insurance Policy' },
  { value: 'tax_return', label: 'Tax Return' },
  { value: 'bank_statement', label: 'Bank Statement' },
  { value: 'employment_letter', label: 'Employment Letter' },
  { value: 'legal_document', label: 'Legal Document' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'other', label: 'Other' }
];

export function DocumentUploadModal({ open, onOpenChange, loanId, borrowerId }: DocumentUploadModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [files, setFiles] = useState<FileWithProgress[]>([]);
  const [documentType, setDocumentType] = useState('');
  const [description, setDescription] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);

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

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = (fileList: FileList) => {
    const newFiles = Array.from(fileList).map(file => ({
      file,
      progress: 0,
      status: 'pending' as const
    }));
    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (file: File) => {
    const type = file.type;
    if (type.startsWith('image/')) return FileImage;
    if (type.startsWith('video/')) return FileVideo;
    if (type.startsWith('audio/')) return FileAudio;
    if (type.includes('pdf')) return FileText;
    return File;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const uploadFile = async (fileWithProgress: FileWithProgress, index: number) => {
    // Simulate file upload with progress
    const formData = new FormData();
    formData.append('file', fileWithProgress.file);
    formData.append('documentType', documentType);
    formData.append('description', description);
    if (loanId) formData.append('loanId', loanId);
    if (borrowerId) formData.append('borrowerId', borrowerId);

    // Update status to uploading
    setFiles(prev => prev.map((f, i) => 
      i === index ? { ...f, status: 'uploading' } : f
    ));

    // Simulate upload progress
    const progressInterval = setInterval(() => {
      setFiles(prev => prev.map((f, i) => {
        if (i === index && f.status === 'uploading') {
          const newProgress = Math.min(f.progress + 10, 90);
          return { ...f, progress: newProgress };
        }
        return f;
      }));
    }, 200);

    try {
      // In a real implementation, this would upload to object storage
      // For now, we'll create a document record
      const documentData = {
        fileName: fileWithProgress.file.name,
        fileType: fileWithProgress.file.type,
        fileSize: fileWithProgress.file.size,
        documentType,
        description,
        loanId: loanId || null,
        borrowerId: borrowerId || null,
        uploadedBy: user?.id,
        uploadedAt: new Date().toISOString(),
        fileUrl: `/documents/${Date.now()}_${fileWithProgress.file.name}` // Placeholder URL
      };

      const res = await apiRequest("POST", "/api/documents", documentData);
      if (!res.ok) throw new Error('Upload failed');

      clearInterval(progressInterval);
      
      // Update to complete
      setFiles(prev => prev.map((f, i) => 
        i === index ? { ...f, progress: 100, status: 'complete' } : f
      ));
    } catch (error) {
      clearInterval(progressInterval);
      setFiles(prev => prev.map((f, i) => 
        i === index ? { ...f, status: 'error', error: 'Upload failed' } : f
      ));
      throw error;
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select files to upload",
        variant: "destructive"
      });
      return;
    }

    if (!documentType) {
      toast({
        title: "Document type required",
        description: "Please select a document type",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);

    try {
      // Upload files sequentially
      for (let i = 0; i < files.length; i++) {
        if (files[i].status === 'pending') {
          await uploadFile(files[i], i);
        }
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      if (loanId) {
        queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}/documents`] });
      }

      toast({
        title: "Success",
        description: `${files.length} document(s) uploaded successfully`,
      });

      // Reset form
      setTimeout(() => {
        setFiles([]);
        setDocumentType('');
        setDescription('');
        onOpenChange(false);
      }, 1000);
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Some files failed to upload",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const allUploadsComplete = files.every(f => f.status === 'complete');
  const hasErrors = files.some(f => f.status === 'error');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>
            Upload documents related to {loanId ? `loan ${loanId}` : 'this account'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Document Type Selection */}
          <div className="space-y-2">
            <Label htmlFor="documentType">Document Type *</Label>
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger>
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add any relevant notes about these documents..."
              rows={2}
            />
          </div>

          {/* Drop Zone */}
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              dragActive ? "border-primary bg-primary/5" : "border-slate-300",
              "hover:border-primary hover:bg-primary/5"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="w-12 h-12 mx-auto mb-4 text-slate-400" />
            <p className="text-sm font-medium mb-1">
              Drag and drop files here, or click to browse
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Supports PDF, images, and common document formats (max 10MB per file)
            </p>
            <Input
              type="file"
              multiple
              onChange={handleFileInput}
              className="hidden"
              id="file-upload"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif"
            />
            <label htmlFor="file-upload">
              <Button type="button" variant="outline" size="sm" asChild>
                <span>
                  <FilePlus className="w-4 h-4 mr-2" />
                  Browse Files
                </span>
              </Button>
            </label>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <ScrollArea className="h-48 border rounded-lg p-4">
              <div className="space-y-2">
                {files.map((fileWithProgress, index) => {
                  const Icon = getFileIcon(fileWithProgress.file);
                  return (
                    <div key={index} className="flex items-center space-x-3 p-2 rounded hover:bg-slate-50">
                      <Icon className="w-8 h-8 text-slate-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {fileWithProgress.file.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatFileSize(fileWithProgress.file.size)}
                        </p>
                        {fileWithProgress.status === 'uploading' && (
                          <Progress value={fileWithProgress.progress} className="h-1 mt-1" />
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        {fileWithProgress.status === 'complete' && (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        )}
                        {fileWithProgress.status === 'error' && (
                          <AlertCircle className="w-5 h-5 text-red-500" />
                        )}
                        {fileWithProgress.status === 'pending' && !uploading && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploading || files.length === 0 || allUploadsComplete}
            >
              {uploading ? "Uploading..." : `Upload ${files.length} File${files.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}