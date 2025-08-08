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
  X,
  ZoomIn,
  ZoomOut,
  RotateCw
} from "lucide-react";

interface DocumentPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: string;
    fileName: string;
    originalFileName?: string;
    fileType?: string;
    mimeType?: string;
    fileSize: number;
    fileUrl?: string;
    filePath?: string;
    documentType: string;
    title?: string;
    description?: string;
    uploadedBy?: string;
    uploadedAt?: string;
    createdAt?: string;
    loanId?: string;
    borrowerId?: string;
  } | null;
}

export function DocumentPreviewModal({ open, onOpenChange, document }: DocumentPreviewModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (document?.filePath || document?.fileUrl) {
      const fileType = document.mimeType || document.fileType;
      // In production, this would fetch the actual file from object storage
      // For now, we'll simulate different preview types
      if (fileType?.startsWith('image/')) {
        // For images, we'd use the actual URL
        setPreviewUrl(document.filePath || document.fileUrl || '');
      } else if (fileType?.includes('pdf')) {
        // For PDFs, we'd use a PDF viewer or convert to image
        setPreviewUrl('/api/documents/' + document.id + '/preview');
      } else {
        // For other documents, show metadata only
        setPreviewUrl('');
      }
    }
  }, [document]);

  if (!document) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
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

  const getDocumentTypeLabel = (type: string) => {
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const handleDownload = () => {
    // In production, this would trigger actual file download
    if (!document) return;
    const link = window.document.createElement('a');
    link.href = document.filePath || document.fileUrl || '#';
    link.download = document.fileName || document.originalFileName || 'document';
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 25, 50));
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const fileType = document.mimeType || document.fileType;
  const isPreviewable = fileType?.startsWith('image/') || fileType?.includes('pdf');

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
            <TabsTrigger value="preview" disabled={!isPreviewable}>
              Preview
            </TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="mt-4">
            {isPreviewable ? (
              <div className="relative">
                {/* Preview Controls */}
                <div className="absolute top-2 right-2 z-10 flex items-center space-x-2 bg-white rounded-lg shadow-md p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleZoomOut}
                    disabled={zoomLevel <= 50}
                  >
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium px-2">
                    {zoomLevel}%
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleZoomIn}
                    disabled={zoomLevel >= 200}
                  >
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                  {fileType?.startsWith('image/') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRotate}
                    >
                      <RotateCw className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {/* Preview Area */}
                <ScrollArea className="h-[500px] w-full border rounded-lg bg-slate-50">
                  <div className="flex items-center justify-center p-8">
                    {fileType?.startsWith('image/') ? (
                      <img
                        src={previewUrl}
                        alt={document.fileName || document.originalFileName}
                        className="max-w-full h-auto shadow-lg"
                        style={{
                          transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                          transition: 'transform 0.3s ease'
                        }}
                      />
                    ) : fileType?.includes('pdf') ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                          <FileText className="w-24 h-24 text-slate-300 mx-auto mb-4" />
                          <p className="text-slate-600">PDF Preview</p>
                          <p className="text-sm text-slate-500 mt-2">
                            Full preview would be available with PDF viewer integration
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <FileText className="w-24 h-24 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-600">Preview not available</p>
                        <p className="text-sm text-slate-500 mt-2">
                          This file type cannot be previewed
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="h-[500px] flex items-center justify-center border rounded-lg bg-slate-50">
                <div className="text-center">
                  <FileText className="w-24 h-24 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600">Preview not available</p>
                  <p className="text-sm text-slate-500 mt-2">
                    This file type cannot be previewed. Use the download button to view the file.
                  </p>
                </div>
              </div>
            )}
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
                    {getDocumentTypeLabel(document.documentType)}
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