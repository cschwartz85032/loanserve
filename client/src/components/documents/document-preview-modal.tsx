import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Download, 
  ExternalLink, 
  FileText, 
  Calendar, 
  User, 
  Hash,
  FileImage,
  X
} from "lucide-react";
import { DocumentViewer } from "./document-viewer";

interface DocumentPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: string | number;
    fileName?: string;
    originalFileName?: string;
    fileType?: string;
    mimeType?: string;
    fileSize?: number;
    fileUrl?: string;
    filePath?: string;
    storageUrl?: string;
    documentType?: string;
    category?: string;
    title?: string;
    description?: string;
    uploadedBy?: string | number;
    uploadedAt?: string;
    createdAt?: string;
    loanId?: string | number;
    borrowerId?: string | number;
  } | null;
}

export function DocumentPreviewModal({ open, onOpenChange, document }: DocumentPreviewModalProps) {

  if (!document) return null;

  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDocumentTypeLabel = (type: string | undefined) => {
    if (!type) return 'Document';
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const handleDownload = () => {
    const downloadUrl = `/api/documents/${document.id}/file`;
    const link = window.document.createElement('a');
    link.href = downloadUrl;
    link.download = document.fileName || document.originalFileName || 'document';
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center space-x-2">
              <FileText className="w-5 h-5" />
              <span>{document.fileName || document.originalFileName || document.title}</span>
            </DialogTitle>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="preview" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="preview">
              Preview
            </TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="mt-4">
            <div className="max-h-[70vh] overflow-auto">
              <DocumentViewer 
                file={{
                  id: Number(document.id),
                  fileName: document.fileName,
                  originalFileName: document.originalFileName,
                  mimeType: document.mimeType,
                  fileType: document.fileType
                }} 
              />
            </div>
          </TabsContent>

          <TabsContent value="details" className="mt-4 space-y-4">
            {/* File Information */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-sm text-slate-700">File Information</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">File Name</p>
                  <p className="font-medium">{document.fileName || document.originalFileName}</p>
                </div>
                <div>
                  <p className="text-slate-500">File Type</p>
                  <p className="font-medium">{document.mimeType || document.fileType || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-slate-500">File Size</p>
                  <p className="font-medium">{formatFileSize(document.fileSize)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Document Type</p>
                  <Badge variant="secondary">
                    {getDocumentTypeLabel(document.category || document.documentType)}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Upload Information */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-sm text-slate-700">Upload Information</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Uploaded By</p>
                  <p className="font-medium flex items-center">
                    <User className="w-4 h-4 mr-1" />
                    {document.uploadedBy || 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Upload Date</p>
                  <p className="font-medium flex items-center">
                    <Calendar className="w-4 h-4 mr-1" />
                    {formatDate(document.uploadedAt || document.createdAt)}
                  </p>
                </div>
                {document.loanId && (
                  <div>
                    <p className="text-slate-500">Loan ID</p>
                    <p className="font-medium flex items-center">
                      <Hash className="w-4 h-4 mr-1" />
                      {document.loanId}
                    </p>
                  </div>
                )}
                {document.borrowerId && (
                  <div>
                    <p className="text-slate-500">Borrower ID</p>
                    <p className="font-medium flex items-center">
                      <User className="w-4 h-4 mr-1" />
                      {document.borrowerId}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            {document.description && (
              <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-sm text-slate-700">Description</h3>
                <p className="text-sm text-slate-600">{document.description}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                Download File
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}