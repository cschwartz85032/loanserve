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

      {/* PDF Content */}
      <div className="p-4 overflow-auto">
        <div className="relative w-full h-[600px] border rounded">
          <iframe
            src={fileUrl}
            className="w-full h-full border-0 rounded"
            title={fileName}
            onError={(e) => {
              console.error('Failed to load PDF:', fileName);
              // Show fallback message
              e.currentTarget.style.display = 'none';
              const fallbackDiv = e.currentTarget.nextElementSibling as HTMLElement;
              if (fallbackDiv) fallbackDiv.style.display = 'block';
            }}
          />
          <div className="hidden absolute inset-0 flex items-center justify-center bg-gray-50 rounded">
            <div className="text-center">
              <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <h3 className="font-medium text-lg mb-2">PDF Preview Not Available</h3>
              <p className="text-sm text-gray-600 mb-4">
                Unable to display PDF in this browser. Please use the button below.
              </p>
              <Button asChild>
                <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                  Open PDF in New Tab
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}