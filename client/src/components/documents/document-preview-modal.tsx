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
  RotateCw,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

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
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [rotation, setRotation] = useState(0);


  useEffect(() => {
    if (document) {
      // Reset states when document changes
      setError('');
      setLoading(true);
      
      // Use direct URL for better compatibility
      const documentUrl = `/api/documents/${document.id}/file`;
      setPreviewUrl(documentUrl);
      
      // Test if the URL is accessible
      fetch(documentUrl, { method: 'HEAD' })
        .then(response => {
          if (response.ok) {
            setLoading(false);
          } else {
            setError('Document could not be loaded');
            setLoading(false);
          }
        })
        .catch(() => {
          setError('Document could not be loaded');
          setLoading(false);
        });
    }
  }, [document]);

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
                  {(fileType?.startsWith('image/') || fileType?.includes('pdf')) && (
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
                    {loading ? (
                      <div className="text-center">
                        <FileText className="w-24 h-24 text-slate-300 mx-auto mb-4 animate-pulse" />
                        <p className="text-slate-600">Loading document...</p>
                      </div>
                    ) : error ? (
                      <div className="text-center">
                        <FileText className="w-24 h-24 text-red-300 mx-auto mb-4" />
                        <p className="text-red-600 font-medium">Preview Error</p>
                        <p className="text-sm text-slate-500 mt-2">{error}</p>
                        <a
                          href={previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors mt-4"
                        >
                          <Download className="w-3.5 h-3.5 mr-1.5" />
                          Open in New Tab
                        </a>
                      </div>
                    ) : fileType?.startsWith('image/') ? (
                      <img
                        src={previewUrl}
                        alt={document.fileName || document.originalFileName}
                        className="max-w-full h-auto shadow-lg"
                        style={{
                          transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                          transition: 'transform 0.3s ease'
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-white rounded-lg overflow-hidden">
                        <div className="w-full h-full relative">
                          <iframe
                            src={previewUrl}
                            className="w-full h-full border-0"
                            style={{
                              minHeight: '400px',
                              backgroundColor: 'white'
                            }}
                            title="Document Preview"
                            allowFullScreen
                            sandbox="allow-same-origin allow-scripts"
                            onLoad={() => setLoading(false)}
                            onError={() => setError('Chrome blocked this preview. Use "Open in New Tab" button below.')}
                          />
                          <div className="absolute top-4 right-4">
                            <a
                              href={previewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors shadow-lg"
                            >
                              <Download className="w-3.5 h-3.5 mr-1.5" />
                              Open in New Tab
                            </a>
                          </div>
                          {/* Chrome blocking notice */}
                          <div className="absolute bottom-4 left-4 right-4">
                            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                              <div className="flex items-center">
                                <div className="flex-shrink-0">
                                  <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                  </svg>
                                </div>
                                <div className="ml-3">
                                  <p className="text-sm text-amber-700">
                                    If preview doesn't load, click "Open in New Tab" above
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
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