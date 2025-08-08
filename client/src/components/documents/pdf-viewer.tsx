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
    
    // Set a timeout to hide loading state after a reasonable time
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
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

        {/* PDF Content */}
        {!isLoading && (
          <div className="relative w-full h-full bg-gray-100 dark:bg-gray-800">
            {/* Direct PDF display attempt */}
            <iframe
              src={`${fileUrl}#view=FitH&toolbar=1&navpanes=1`}
              className="w-full h-full border-0 absolute inset-0"
              style={{ minHeight: '600px' }}
              title={fileName}
              onLoad={() => {
                console.log('PDF iframe loaded:', fileName);
              }}
            />
            
            {/* User-friendly overlay for Chrome blocking */}
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-8 max-w-md mx-4 border border-gray-200 dark:border-gray-700">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {fileName}
                  </h3>
                  
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                    PDF document ready to view
                  </p>
                  
                  <div className="space-y-3">
                    <Button asChild className="w-full bg-blue-600 hover:bg-blue-700">
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-4 w-4 mr-2" />
                        Open PDF
                      </a>
                    </Button>
                    
                    <Button variant="outline" asChild className="w-full">
                      <a href={fileUrl} download={fileName}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </a>
                    </Button>
                  </div>
                  
                  <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                    <div className="flex items-start">
                      <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 mr-2 flex-shrink-0" />
                      <div className="text-left">
                        <p className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-1">
                          Best Experience
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-400">
                          Open in new tab for full PDF controls, zoom, and navigation.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error overlay only shows if there's an actual error */}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-600">
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
                    Open PDF in New Tab
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
                      Some browsers restrict PDF display for security. New tabs provide full PDF controls and better performance.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

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