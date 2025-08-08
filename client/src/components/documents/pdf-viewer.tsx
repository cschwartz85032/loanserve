import React, { useState, useEffect } from 'react';
import { FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PDFViewerProps {
  fileUrl: string;
  fileName: string;
}

export default function PDFViewer({ fileUrl, fileName }: PDFViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // Reset states when fileUrl changes
    setIsLoading(true);
    setHasError(false);
  }, [fileUrl]);

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
    console.log('PDF loaded successfully:', fileName);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
    console.error('Failed to load PDF:', fileName);
  };

  return (
    <div className="bg-white dark:bg-gray-900 border rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-gray-600" />
          <span className="font-medium text-sm truncate">{fileName}</span>
          <Badge variant="secondary" className="text-xs">
            PDF
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <a href={fileUrl} download={fileName}>
              <Download className="h-4 w-4" />
            </a>
          </Button>
          
          <Button variant="ghost" size="sm" asChild>
            <a href={fileUrl} target="_blank" rel="noopener noreferrer">
              Open in New Tab
            </a>
          </Button>
        </div>
      </div>

      {/* PDF Content */}
      <div className="relative" style={{ height: '600px' }}>
        {/* Loading state */}
        {isLoading && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
            <div className="text-center">
              <FileText className="h-8 w-8 mx-auto mb-2 text-blue-500 animate-pulse" />
              <p className="text-sm text-gray-600">Loading PDF...</p>
            </div>
          </div>
        )}

        {/* PDF Object - Chrome compatible */}
        <object
          data={fileUrl}
          type="application/pdf"
          className="w-full h-full"
          onLoad={handleLoad}
          onError={handleError}
          style={{ display: hasError ? 'none' : 'block' }}
        >
          <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-800">
            <div className="text-center p-8">
              <FileText className="h-16 w-16 mx-auto mb-4 text-blue-500" />
              <h3 className="font-medium text-lg mb-2">PDF Viewer</h3>
              <p className="text-sm text-gray-600 mb-4">
                Your browser doesn't support embedded PDFs.
              </p>
              
              <div className="space-y-3">
                <Button asChild className="w-full">
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                    <FileText className="h-4 w-4 mr-2" />
                    View PDF
                  </a>
                </Button>
                
                <Button variant="outline" asChild className="w-full">
                  <a href={fileUrl} download={fileName}>
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </object>

        {/* Error fallback */}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
            <div className="text-center p-8">
              <FileText className="h-16 w-16 mx-auto mb-4 text-blue-500" />
              <h3 className="font-medium text-lg mb-2">PDF Document</h3>
              <p className="text-sm text-gray-600 mb-4">
                Click to open this PDF in a new tab for the best viewing experience.
              </p>
              
              <div className="space-y-3">
                <Button asChild className="w-full">
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                    <FileText className="h-4 w-4 mr-2" />
                    View PDF
                  </a>
                </Button>
                
                <Button variant="outline" asChild className="w-full">
                  <a href={fileUrl} download={fileName}>
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </a>
                </Button>
              </div>

              <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-lg">
                <div className="flex items-start text-left">
                  <FileText className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-800 mb-1">
                      Why New Tab?
                    </p>
                    <p className="text-xs text-blue-700">
                      Chrome blocks PDF display in modals for security. New tabs provide full PDF controls and better performance.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}