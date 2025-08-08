import React, { useState } from 'react';
import { FileText, Download, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
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
            <a href={fileUrl} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4 mr-1" />
              Download
            </a>
          </Button>
        </div>
      </div>

      {/* Content - Direct approach without iframe */}
      <div className="p-8 text-center">
        <FileText className="h-16 w-16 mx-auto mb-4 text-blue-500" />
        <h3 className="font-medium text-lg mb-2">PDF Document Ready</h3>
        <p className="text-sm text-gray-600 mb-6">
          Click "Open in New Tab" to view this PDF document
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
        
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div className="ml-3 text-left">
              <p className="text-sm text-blue-700 font-medium mb-1">
                Browser Compatibility Note
              </p>
              <p className="text-xs text-blue-600">
                PDFs open in a new tab to avoid browser security restrictions and provide the best viewing experience.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}