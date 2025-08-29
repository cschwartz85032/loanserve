import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { FileText, Check, ArrowLeft } from 'lucide-react';
import { TemplateBrowser, type Template, type TemplateFolder } from '@/components/shared/TemplateBrowser';

// Type aliases for backward compatibility
type EmailTemplate = Template;
type EmailFolder = TemplateFolder;

interface EmailTemplateSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTemplateSelect: (template: EmailTemplate) => void;
}

export function EmailTemplateSelectorModal({ 
  open, 
  onOpenChange, 
  onTemplateSelect 
}: EmailTemplateSelectorModalProps) {
  const { toast } = useToast();
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

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
  const folders = Array.isArray(foldersResponse) 
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

  // Extract templates from response
  const templates = Array.isArray(templatesResponse) 
    ? templatesResponse 
    : (templatesResponse.data || []);

  const handleTemplateSelect = (template: EmailTemplate) => {
    onTemplateSelect(template);
    onOpenChange(false);
    toast({
      title: 'Template Selected',
      description: `"${template.name}" has been applied to your email`
    });
  };

  const handlePreviewTemplate = async (template: EmailTemplate) => {
    try {
      // Fetch full template details if content is missing
      if (!template.content) {
        const response = await fetch(`/api/email-templates/${template.id}`, {
          credentials: 'include'
        });
        if (response.ok) {
          const templateData = await response.json();
          const fullTemplate = templateData.success ? templateData.data : templateData;
          setSelectedTemplate(fullTemplate);
        } else {
          setSelectedTemplate(template);
        }
      } else {
        setSelectedTemplate(template);
      }
      setPreviewMode(true);
    } catch (error) {
      console.error('Error fetching template:', error);
      setSelectedTemplate(template);
      setPreviewMode(true);
    }
  };

  const handleBackToList = () => {
    setPreviewMode(false);
    setSelectedTemplate(null);
  };

  // If we're in preview mode, show the preview
  if (previewMode && selectedTemplate) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBackToList}
                className="mr-2"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              Preview: {selectedTemplate.name}
            </DialogTitle>
            <DialogDescription>
              Subject: {selectedTemplate.subject}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="border rounded-lg p-4 bg-gray-50">
              <div 
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: selectedTemplate.content || '' }}
              />
            </div>
          </div>

          <div className="flex-shrink-0 flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={handleBackToList}>
              Back to List
            </Button>
            <Button onClick={() => handleTemplateSelect(selectedTemplate)}>
              <Check className="h-4 w-4 mr-2" />
              Use This Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Select Email Template
          </DialogTitle>
          <DialogDescription>
            Choose from your organized email templates and folders
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <TemplateBrowser
            templates={templates}
            folders={folders}
            isLoading={isLoading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedFolder={selectedFolder}
            onFolderChange={setSelectedFolder}
            onTemplateSelect={handleTemplateSelect}
            onTemplatePreview={handlePreviewTemplate}
            showPreviewButton={true}
            showSelectButton={true}
            emptyMessage="No templates found. Create your first email template to get started."
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}