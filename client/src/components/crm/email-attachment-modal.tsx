import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Upload, File, X, Paperclip, FolderOpen, Plus } from 'lucide-react';

interface AttachmentFile {
  id: string;
  file: File;
  name: string;
  size: number;
  path: string;
}

interface EmailAttachmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attachments: AttachmentFile[];
  onAttachmentsChange: (attachments: AttachmentFile[]) => void;
}

export function EmailAttachmentModal({ 
  open, 
  onOpenChange, 
  attachments, 
  onAttachmentsChange 
}: EmailAttachmentModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const newAttachments: AttachmentFile[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Check file size (max 25MB per file)
      if (file.size > 25 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: `${file.name} exceeds 25MB limit`,
          variant: 'destructive'
        });
        continue;
      }

      // Check if file already exists
      const existingFile = attachments.find(att => 
        att.name === file.name && att.size === file.size
      );
      
      if (existingFile) {
        toast({
          title: 'Duplicate file',
          description: `${file.name} is already attached`,
          variant: 'destructive'
        });
        continue;
      }

      newAttachments.push({
        id: `${Date.now()}-${i}`,
        file,
        name: file.name,
        size: file.size,
        path: file.webkitRelativePath || file.name
      });
    }

    if (newAttachments.length > 0) {
      onAttachmentsChange([...attachments, ...newAttachments]);
      toast({
        title: 'Files attached',
        description: `${newAttachments.length} file(s) added successfully`
      });
    }
  };

  const handleRemoveAttachment = (id: string) => {
    onAttachmentsChange(attachments.filter(att => att.id !== id));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleBrowseFiles = () => {
    fileInputRef.current?.click();
  };

  const handleBrowseFolder = () => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('webkitdirectory', '');
      fileInputRef.current.click();
      fileInputRef.current.removeAttribute('webkitdirectory');
    }
  };

  const totalSize = attachments.reduce((total, att) => total + att.size, 0);
  const maxTotalSize = 50 * 1024 * 1024; // 50MB total limit

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-5 w-5" />
            Email Attachments
          </DialogTitle>
          <DialogDescription>
            Add multiple files from different locations. Maximum 25MB per file, 50MB total.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Upload Area */}
          <Card
            className={`border-2 border-dashed transition-colors ${
              isDragging 
                ? 'border-primary bg-primary/5' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <CardContent className="p-6 text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-lg font-medium mb-2">
                Drag and drop files here
              </p>
              <p className="text-sm text-gray-500 mb-4">
                or select files and folders from your computer
              </p>
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  onClick={handleBrowseFiles}
                  className="flex items-center gap-2"
                >
                  <File className="h-4 w-4" />
                  Select Files
                </Button>
                <Button
                  variant="outline"
                  onClick={handleBrowseFolder}
                  className="flex items-center gap-2"
                >
                  <FolderOpen className="h-4 w-4" />
                  Select Folder
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt,.csv,.zip,.rar"
              />
              <p className="text-xs text-gray-400 mt-4">
                Supported: PDF, DOC, DOCX, XLS, XLSX, Images, TXT, CSV, ZIP, RAR
              </p>
            </CardContent>
          </Card>

          {/* Attachments List */}
          {attachments.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">
                  Attached Files ({attachments.length})
                </h3>
                <div className="text-sm text-gray-500">
                  {formatFileSize(totalSize)} / {formatFileSize(maxTotalSize)}
                  {totalSize > maxTotalSize && (
                    <Badge variant="destructive" className="ml-2">
                      Size Limit Exceeded
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-gray-50"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <File className="h-4 w-4 text-gray-500 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          {attachment.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(attachment.size)}
                          {attachment.path !== attachment.name && (
                            <span className="ml-2">• {attachment.path}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveAttachment(attachment.id)}
                      className="flex-shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-gray-500">
            {attachments.length === 0 ? 'No files attached' : `${attachments.length} file(s) attached`}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => onOpenChange(false)}
              disabled={totalSize > maxTotalSize}
            >
              <Paperclip className="h-4 w-4 mr-2" />
              Use Attachments
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}