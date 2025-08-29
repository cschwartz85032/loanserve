/**
 * Shared Template Browser Component
 * Reusable template browsing functionality with folder navigation, search, and template selection
 * Used by both email template selector and settings components
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  Search, 
  Folder, 
  FileText, 
  Home, 
  ChevronRight, 
  Eye, 
  Check 
} from "lucide-react";

export interface Template {
  id: number;
  name: string;
  subject: string;
  content?: string;
  folderId: number | null;
  folderName?: string;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateFolder {
  id: number;
  name: string;
  parentId: number | null;
  templateCount?: number;
}

interface TemplateBrowserProps {
  templates: Template[];
  folders: TemplateFolder[];
  isLoading?: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedFolder: number | null;
  onFolderChange: (folderId: number | null) => void;
  onTemplateSelect?: (template: Template) => void;
  onTemplatePreview?: (template: Template) => void;
  showPreviewButton?: boolean;
  showSelectButton?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function TemplateBrowser({
  templates,
  folders,
  isLoading = false,
  searchQuery,
  onSearchChange,
  selectedFolder,
  onFolderChange,
  onTemplateSelect,
  onTemplatePreview,
  showPreviewButton = false,
  showSelectButton = false,
  emptyMessage = "No templates found",
  className = ""
}: TemplateBrowserProps) {
  const [folderBreadcrumbs, setFolderBreadcrumbs] = useState<{id: number | null, name: string}[]>([
    {id: null, name: 'All Folders'}
  ]);

  const navigateToFolder = (folderId: number | null, folderName: string) => {
    onFolderChange(folderId);
    
    if (folderId === null) {
      setFolderBreadcrumbs([{id: null, name: 'All Folders'}]);
    } else {
      // Find folder path
      const findFolderPath = (targetId: number, currentPath: {id: number | null, name: string}[] = []): {id: number | null, name: string}[] | null => {
        const folder = folders.find((f: TemplateFolder) => f.id === targetId);
        if (!folder) return null;
        
        const newPath = [{id: folder.id, name: folder.name}, ...currentPath];
        
        if (folder.parentId) {
          return findFolderPath(folder.parentId, newPath);
        } else {
          return [{id: null, name: 'All Folders'}, ...newPath];
        }
      };
      
      const path = findFolderPath(folderId);
      if (path) {
        setFolderBreadcrumbs(path);
      }
    }
  };

  const navigateToBreadcrumb = (index: number) => {
    const targetBreadcrumb = folderBreadcrumbs[index];
    const newBreadcrumbs = folderBreadcrumbs.slice(0, index + 1);
    setFolderBreadcrumbs(newBreadcrumbs);
    onFolderChange(targetBreadcrumb.id);
  };

  const filteredFolders = selectedFolder 
    ? folders.filter((folder: TemplateFolder) => folder.parentId === selectedFolder)
    : folders.filter((folder: TemplateFolder) => folder.parentId === null);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
          <div className="space-y-2">
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
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
            {filteredFolders.map((folder: TemplateFolder) => (
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
            {templates.map((template: Template) => (
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
                      {showPreviewButton && onTemplatePreview && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onTemplatePreview(template);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      {showSelectButton && onTemplateSelect && (
                        <Button
                          size="sm"
                          onClick={() => onTemplateSelect(template)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
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
              <p>{emptyMessage}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}