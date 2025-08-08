import React from 'react';
import PDFViewer from './pdf-viewer';
import { FileImage, FileText, File, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface DocumentViewerProps {
  file: {
    mimeType?: string;
    fileType?: string;
    fileName?: string;
    originalFileName?: string;
    id: number;
  };
}

export function DocumentViewer({ file }: DocumentViewerProps) {
  const fileUrl = `/api/documents/${file.id}/file`;
  const fileName = file.fileName || file.originalFileName || 'Unknown';
  const mimeType = file.mimeType || file.fileType || '';
  const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
  
  // Handle PDF files
  if (mimeType.includes('pdf') || fileExtension === 'pdf') {
    return <PDFViewer fileUrl={fileUrl} fileName={fileName} />;
  }
  
  // Handle image files
  if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(fileExtension)) {
    return (
      <div className="bg-white dark:bg-gray-900 border rounded-lg shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <FileImage className="h-5 w-5 text-gray-600" />
            <span className="font-medium text-sm truncate">{fileName}</span>
            <Badge variant="secondary" className="text-xs">
              {fileExtension.toUpperCase()}
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
              alt={fileName}
              className="h-auto max-h-[600px] rounded-lg shadow-md"
              onError={(e) => {
                console.error('Failed to load image:', fileName);
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
  
  // Handle text files and documents
  if (mimeType.includes('text') || ['txt', 'doc', 'docx', 'xls', 'xlsx'].includes(fileExtension)) {
    return (
      <div className="bg-white dark:bg-gray-900 border rounded-lg shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-600" />
            <span className="font-medium text-sm truncate">{fileName}</span>
            <Badge variant="secondary" className="text-xs">
              {fileExtension.toUpperCase()}
            </Badge>
          </div>
          
          <Button variant="ghost" size="sm" asChild>
            <a href={fileUrl} target="_blank" rel="noopener noreferrer">
              Open in New Tab
            </a>
          </Button>
        </div>
        
        <div className="p-8 text-center">
          <FileText className="h-16 w-16 mx-auto mb-4 text-blue-500" />
          <h3 className="font-medium text-lg mb-2">Document Ready to View</h3>
          <p className="text-sm text-gray-600 mb-6">
            Click "Open in New Tab" to view this {fileExtension.toUpperCase()} document
          </p>
          
          <div className="space-y-3">
            <Button asChild className="w-full">
              <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                Open Document in New Tab
              </a>
            </Button>
            
            <Button variant="outline" asChild className="w-full">
              <a href={fileUrl} download={fileName}>
                <Download className="h-4 w-4 mr-2" />
                Download Document
              </a>
            </Button>
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
        <h3 className="font-medium text-lg mb-2">{fileName}</h3>
        <Badge variant="secondary" className="mb-4">
          {fileExtension.toUpperCase()} File
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