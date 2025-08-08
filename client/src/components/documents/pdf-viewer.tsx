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
        {!loadError ? (
          <object
            data={`${fileUrl}#toolbar=1&navpanes=1&scrollbar=1&page=1&view=FitH`}
            type="application/pdf"
            className="w-full h-full"
            onError={() => setLoadError(true)}
          >
            <embed
              src={`${fileUrl}#toolbar=1&navpanes=1&scrollbar=1&page=1&view=FitH`}
              type="application/pdf"
              className="w-full h-full"
              onError={() => setLoadError(true)}
            />
          </object>
        ) : (
          <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-800">
            <div className="text-center p-8">
              <AlertTriangle className="h-16 w-16 mx-auto mb-4 text-yellow-500" />
              <h3 className="font-medium text-lg mb-2">PDF Preview Unavailable</h3>
              <p className="text-sm text-gray-600 mb-4">
                This PDF cannot be displayed inline. Please download or open in a new tab.
              </p>
              
              <div className="space-y-3">
                <Button asChild className="w-full">
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer">
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}