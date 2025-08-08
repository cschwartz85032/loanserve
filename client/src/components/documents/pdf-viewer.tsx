import React from 'react';
import { FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PDFViewerProps {
  fileUrl: string;
  fileName: string;
}

export default function PDFViewer({ fileUrl, fileName }: PDFViewerProps) {
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

      {/* PDF Content Area */}
      <div className="relative" style={{ height: '600px' }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-8 max-w-sm">
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
  );
}