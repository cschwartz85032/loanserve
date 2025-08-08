import React from 'react';
import PDFViewer from './PDFViewer';
import { FileImage, FileText, File } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface DocumentViewerProps {
  file: {
    fileType: string;
    originalFileName: string;
    id: number;
  };
}

export function DocumentViewer({ file }: DocumentViewerProps) {
  const fileUrl = `/api/counterparty/documents/download/${file.id}`;
  const fileType = file.fileType.toLowerCase();
  
  // Handle PDF files
  if (fileType === 'pdf') {
    return <PDFViewer fileUrl={fileUrl} fileName={file.originalFileName} />;
  }
  
  // Handle image files
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(fileType)) {
    return (
      <div className="bg-white dark:bg-gray-900 border rounded-lg shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <FileImage className="h-5 w-5 text-gray-600" />
            <span className="font-medium text-sm truncate">{file.originalFileName}</span>
            <Badge variant="secondary" className="text-xs">
              {fileType.toUpperCase()}
            </Badge>
          </div>
          
          <Button variant="ghost" size="sm" asChild>
            <a href={fileUrl} target="_blank" rel="noopener noreferrer">
              Open in New Tab
            </a>
          </Button>
        </div>
        
        <div className="p-4 overflow-auto">
          <div className="relative group inline-block">
            <img 
              src={fileUrl} 
              alt={file.originalFileName}
              className="h-auto max-h-[600px] rounded-lg shadow-md"
              onError={(e) => {
                console.error('Failed to load image:', file.originalFileName);
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
            <div className="hidden text-center py-12 text-gray-600">
              <FileImage className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <p className="font-medium mb-2">Image Preview Not Available</p>
              <Button asChild>
                <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                  Open Image in New Tab
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Handle other file types
  return (
    <div className="bg-white dark:bg-gray-900 border rounded-lg shadow-sm p-6">
      <div className="text-center">
        <File className="h-16 w-16 mx-auto mb-4 text-gray-400" />
        <h3 className="font-medium text-lg mb-2">{file.originalFileName}</h3>
        <Badge variant="secondary" className="mb-4">
          {fileType.toUpperCase()} File
        </Badge>
        <p className="text-sm text-gray-600 mb-4">
          Preview not available for this file type
        </p>
        <Button asChild>
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            Download File
          </a>
        </Button>
      </div>
    </div>
  );
}