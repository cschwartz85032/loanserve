import React, { useState } from 'react';
import { FileText, Download, ZoomIn, ZoomOut, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PDFViewerProps {
  fileUrl: string;
  fileName: string;
}

export default function PDFViewer({ fileUrl, fileName }: PDFViewerProps) {
  const [loadError, setLoadError] = useState(false);

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
      <div className="relative w-full" style={{ height: '600px' }}>
        <iframe
          src={fileUrl}
          className="w-full h-full border-0"
          title={fileName}
          style={{ backgroundColor: '#f8f9fa' }}
          onLoad={() => {
            console.log('PDF loaded successfully:', fileName);
          }}
          onError={() => {
            console.error('Failed to load PDF:', fileName);
            setLoadError(true);
          }}
        />
        
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
            <div className="text-center p-8">
              <FileText className="h-16 w-16 mx-auto mb-4 text-blue-500" />
              <h3 className="font-medium text-lg mb-2">PDF Document</h3>
              <p className="text-sm text-gray-600 mb-4">
                Click to open this PDF document in a new tab.
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
        )}
      </div>
    </div>
  );
}