import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { FileText, Check, ArrowLeft } from 'lucide-react';
import { TemplateBrowser, type Template, type TemplateFolder } from '@/components/shared/TemplateBrowser';

interface EmailTemplateSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTemplateSelect: (template: Template) => void;
}

export function EmailTemplateSelectorModal({ 
  open, 
  onOpenChange, 
  onTemplateSelect 
}: EmailTemplateSelectorModalProps) {
  const { toast } = useToast();
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch folders
  const { data: foldersResponse = {} } = useQuery({
    queryKey: ['/api/email-template-folders'],
    queryFn: async () => {
      const response = await fetch('/api/email-template-folders', {
        credentials: 'include'
      });
      if (!response.ok) return {};
      return response.json();
    },
    enabled: open
  });

  // Extract folders from response
  const folders: TemplateFolder[] = Array.isArray(foldersResponse) 
    ? foldersResponse 
    : (foldersResponse.data || []);

  // Fetch templates
  const { data: templatesResponse = {}, isLoading } = useQuery({
    queryKey: ['/api/email-templates', { folderId: selectedFolder, search: searchQuery }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedFolder) params.append('folderId', selectedFolder.toString());
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      
      const response = await fetch(`/api/email-templates?${params}`, {
        credentials: 'include'
      });
      if (!response.ok) return {};
      return response.json();
    },
    enabled: open
  });

  // Extract templates from response and transform to Template interface
  const rawTemplates = Array.isArray(templatesResponse) 
    ? templatesResponse 
    : (templatesResponse.data || []);
    
  // Transform email templates to match Template interface
  const templates: Template[] = rawTemplates.map((t: any) => ({
    id: t.id,
    name: t.name,
    subject: t.subject || '',
    content: t.body || '',
    folderId: t.folderId,
    folderName: t.folderName,
    isShared: t.isShared || false,
    createdAt: t.createdAt || '',
    updatedAt: t.updatedAt || ''
  }));

  const handleTemplateSelect = (template: Template) => {
    onTemplateSelect(template);
    onOpenChange(false);
    toast({
      title: 'Template Selected',
      description: `"${template.name}" has been applied to your email`
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full h-[80vh] p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-lg">Select Email Template</DialogTitle>
          <DialogDescription>
            Choose an email template to use for your message
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 px-6 pb-6 overflow-auto">
          <TemplateBrowser
            templates={templates}
            folders={folders}
            isLoading={isLoading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedFolder={selectedFolder}
            onFolderChange={setSelectedFolder}
            onTemplateSelect={handleTemplateSelect}
            showSelectButton={true}
            emptyMessage="No email templates found. Create some templates in Settings to get started."
            className="h-full"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}