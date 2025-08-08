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

      {/* PDF Content - Chrome-safe approach */}
      <div className="p-8 text-center">
        <FileText className="h-20 w-20 mx-auto mb-6 text-blue-500" />
        <h3 className="font-semibold text-xl mb-3 text-gray-900">PDF Document Ready</h3>
        <p className="text-gray-600 mb-6 max-w-md mx-auto">
          Due to browser security settings, PDFs open in a new tab for the best viewing experience.
        </p>
        
        <div className="space-y-4 max-w-sm mx-auto">
          <Button asChild className="w-full h-12 text-base">
            <a href={fileUrl} target="_blank" rel="noopener noreferrer">
              <FileText className="h-5 w-5 mr-3" />
              View PDF Document
            </a>
          </Button>
          
          <Button variant="outline" asChild className="w-full h-12 text-base">
            <a href={fileUrl} download={fileName}>
              <Download className="h-5 w-5 mr-3" />
              Download PDF
            </a>
          </Button>
        </div>
        
        <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-lg max-w-md mx-auto">
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
  );
}