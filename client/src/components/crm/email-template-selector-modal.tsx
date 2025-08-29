import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { FileText, Check, ArrowLeft, Search } from 'lucide-react';
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

  // Extract folders from response - handle both direct array and success/data structure
  const folders = Array.isArray(foldersResponse) 
    ? foldersResponse 
    : (foldersResponse.data || []);

  // Fetch templates
  const { data: templatesResponse = {} } = useQuery({
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

  // Extract templates from response - handle both direct array and success/data structure
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
    } catch (error) {
      console.error('Error fetching template details:', error);
      setSelectedTemplate(template);
    }
    setPreviewMode(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (previewMode && selectedTemplate) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewMode(false)}
                className="p-1"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Template Preview: {selectedTemplate.name}
                </DialogTitle>
                <DialogDescription>
                  Preview template content before applying to your email
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4">
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Subject:</label>
                <div className="mt-1 p-3 bg-gray-50 border rounded-lg">
                  {selectedTemplate.subject}
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700">Content:</label>
                <div className="mt-1 p-3 bg-gray-50 border rounded-lg min-h-[200px] whitespace-pre-wrap">
                  {selectedTemplate.content}
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>Created: {formatDate(selectedTemplate.createdAt)}</span>
                <span>Updated: {formatDate(selectedTemplate.updatedAt)}</span>
                {selectedTemplate.isShared && (
                  <Badge variant="secondary">Shared</Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 flex justify-between items-center pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={() => setPreviewMode(false)}
            >
              Back to Templates
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

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-1 text-sm text-gray-600 bg-gray-50 p-2 rounded-lg">
            {folderBreadcrumbs.map((breadcrumb, index) => (
              <div key={index} className="flex items-center gap-1">
                {index > 0 && <ChevronRight className="h-3 w-3" />}
                <button
                  onClick={() => navigateToBreadcrumb(index)}
                  className="hover:text-blue-600 underline-offset-4 hover:underline flex items-center gap-1"
                >
                  {index === 0 ? (
                    <>
                      <Home className="h-4 w-4" />
                      All Folders
                    </>
                  ) : (
                    breadcrumb.name
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Folders */}
          {!searchQuery && filteredFolders.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium text-gray-700 flex items-center gap-2">
                <Folder className="h-4 w-4" />
                Folders
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {filteredFolders.map((folder: EmailFolder) => (
                  <Card
                    key={folder.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => navigateToFolder(folder.id, folder.name)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Folder className="h-4 w-4 text-blue-500" />
                          <span className="font-medium">{folder.name}</span>
                        </div>
                        <Badge variant="outline">
                          {folder.templateCount || 0}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {templates.length > 0 && <Separator />}
            </div>
          )}

          {/* Templates */}
          {templates.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium text-gray-700 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Templates ({templates.length})
              </h3>
              <div className="space-y-2">
                {templates.map((template: EmailTemplate) => (
                  <Card
                    key={template.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium truncate">{template.name}</h4>
                            {template.isShared && (
                              <Badge variant="secondary" className="text-xs">
                                Shared
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 truncate mb-2">
                            Subject: {template.subject}
                          </p>
                          <p className="text-xs text-gray-500">
                            Updated {formatDate(template.updatedAt)}
                            {template.folderName && ` • ${template.folderName}`}
                          </p>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePreviewTemplate(template);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleTemplateSelect(template)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Empty States */}
          {templates.length === 0 && (!filteredFolders.length || searchQuery) && (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? (
                <div>
                  <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                  <p>No templates found matching "{searchQuery}"</p>
                </div>
              ) : (
                <div>
                  <Folder className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                  <p>No templates in this folder</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}