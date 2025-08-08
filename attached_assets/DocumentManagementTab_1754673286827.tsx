import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { 
  FolderOpen, File, Upload, Download, Search, Tag, Plus, 
  ChevronRight, ChevronDown, Grid, List, FileText,
  Eye, Edit, Trash2, AlertCircle, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  Dialog, DialogContent, DialogDescription, DialogFooter, 
  DialogHeader, DialogTitle 
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import EnhancedDocumentUpload from './EnhancedDocumentUpload';
import { DocumentViewer } from './DocumentViewer';
import type { 
  DocumentFolder, DocumentFile, DocumentTag, 
  DocumentVersion, DocumentAccessLog 
} from '@shared/counterparty-schema';

interface FolderNode extends DocumentFolder {
  children?: FolderNode[];
}

interface DocumentManagementTabProps {
  counterpartyId: number;
  counterpartyName: string;
}

export default function DocumentManagementTab({ counterpartyId, counterpartyName }: DocumentManagementTabProps) {
  const queryClient = useQueryClient();

  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [selectedFileTags, setSelectedFileTags] = useState<number[]>([]);
  const [showEnhancedUpload, setShowEnhancedUpload] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [selectedFile, setSelectedFile] = useState<DocumentFile | null>(null);
  const [editingFile, setEditingFile] = useState<DocumentFile | null>(null);

  // Handle file drop
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setDroppedFiles(acceptedFiles);
      setShowEnhancedUpload(true);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    disabled: showEnhancedUpload, // Disable when dialog is open
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'image/*': ['.png', '.jpg', '.jpeg']
    }
  });

  // Fetch folders
  const { data: folders = [] } = useQuery<DocumentFolder[]>({
    queryKey: [`/api/counterparty/documents/folders`, counterpartyId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/counterparty/documents/folders?counterpartyId=${counterpartyId}`);
      return response.json();
    }
  });

  // Fetch files
  const { data: files = [], refetch: refetchFiles } = useQuery<(DocumentFile & { tags: DocumentTag[] })[]>({
    queryKey: ['/api/counterparty/documents/files', counterpartyId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (counterpartyId) params.append('counterpartyId', counterpartyId.toString());
      const response = await apiRequest('GET', `/api/counterparty/documents/files?${params.toString()}`);
      return response.json();
    }
  });

  // Fetch tags
  const { data: allTags = [] } = useQuery<DocumentTag[]>({
    queryKey: ['/api/counterparty/documents/tags']
  });

  // Search files
  const { data: searchResults } = useQuery<(DocumentFile & { tags: DocumentTag[] })[]>({
    queryKey: [`/api/counterparty/documents/search`, searchTerm, counterpartyId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/counterparty/documents/search?q=${searchTerm}&counterpartyId=${counterpartyId}`);
      return response.json();
    },
    enabled: searchTerm.length > 2
  });

  // Initialize folders mutation
  const initFoldersMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/counterparty/${counterpartyId}/documents/init-folders`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/counterparty/documents/folders`] });
      toast({
        title: 'Success',
        description: 'Default folders created successfully'
      });
    }
  });

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (data: Partial<DocumentFolder>) => {
      const response = await apiRequest('POST', '/api/counterparty/documents/folders', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/counterparty/documents/folders`] });
      setShowCreateFolderDialog(false);
      toast({
        title: 'Success',
        description: 'Folder created successfully'
      });
    }
  });

  // Delete file mutation
  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: number) => {
      const response = await apiRequest('DELETE', `/api/counterparty/documents/files/${fileId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/counterparty/documents/files`] });
      toast({
        title: 'Success',
        description: 'File deleted successfully'
      });
    }
  });

  // Delete folder mutation
  const deleteFolderMutation = useMutation({
    mutationFn: async (folderId: number) => {
      const response = await apiRequest('DELETE', `/api/counterparty/documents/folders/${folderId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/counterparty/documents/folders`] });
      toast({
        title: 'Success',
        description: 'Folder deleted successfully'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete folder',
        variant: 'destructive'
      });
    }
  });

  // Create tag mutation
  const createTagMutation = useMutation({
    mutationFn: async (data: { name: string; color: string; description?: string }) => {
      const response = await apiRequest('POST', '/api/counterparty/documents/tags', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/counterparty/documents/tags'] });
      toast({
        title: 'Success',
        description: 'Tag created successfully'
      });
    }
  });

  // Add tag to file mutation
  const addTagToFileMutation = useMutation({
    mutationFn: async ({ fileId, tagId }: { fileId: number; tagId: number }) => {
      const response = await apiRequest('POST', `/api/counterparty/documents/files/${fileId}/tags/${tagId}`);
      return response.json();
    },
    onSuccess: (_, { fileId }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/counterparty/documents/files`] });
      queryClient.invalidateQueries({ queryKey: [`/api/counterparty/documents/files/${fileId}/tags`] });
      toast({
        title: 'Success',
        description: 'Tag added successfully'
      });
    }
  });

  // Remove tag from file mutation
  const removeTagFromFileMutation = useMutation({
    mutationFn: async ({ fileId, tagId }: { fileId: number; tagId: number }) => {
      const response = await apiRequest('DELETE', `/api/counterparty/documents/files/${fileId}/tags/${tagId}`);
      return response.json();
    },
    onSuccess: (_, { fileId }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/counterparty/documents/files`] });
      queryClient.invalidateQueries({ queryKey: [`/api/counterparty/documents/files/${fileId}/tags`] });
      toast({
        title: 'Success',
        description: 'Tag removed successfully'
      });
    }
  });

  // Build folder tree structure
  const buildFolderTree = (folders: DocumentFolder[]): FolderNode[] => {
    const folderMap = new Map<number, FolderNode>();
    const rootFolders: FolderNode[] = [];

    // Ensure folders is an array
    const folderArray = Array.isArray(folders) ? folders : [];

    folderArray.forEach(folder => {
      folderMap.set(folder.id, { ...folder, children: [] });
    });

    folderArray.forEach(folder => {
      const folderNode = folderMap.get(folder.id)!;
      if (folder.parentId && folderMap.has(folder.parentId)) {
        folderMap.get(folder.parentId)!.children!.push(folderNode);
      } else {
        rootFolders.push(folderNode);
      }
    });

    return rootFolders;
  };

  const toggleFolder = (folderId: number) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const deleteFolder = (folderId: number) => {
    if (confirm('Are you sure you want to delete this folder? All files in this folder will be moved to "Other".')) {
      deleteFolderMutation.mutate(folderId);
    }
  };

  const renderFolderTree = (folders: FolderNode[], level = 0) => {
    return folders.map(folder => (
      <div key={folder.id}>
        <div
          className={`group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 ${
            selectedFolder === folder.id ? 'bg-blue-100 dark:bg-blue-900' : ''
          }`}
          style={{ paddingLeft: `${level * 16}px` }}
          onClick={() => setSelectedFolder(folder.id)}
        >
          <div className="flex items-center gap-1">
            {folder.children && folder.children.length > 0 ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolder(folder.id);
                }}
                className="p-0.5"
              >
                {expandedFolders.has(folder.id) ? 
                  <ChevronDown className="h-4 w-4" /> : 
                  <ChevronRight className="h-4 w-4" />
                }
              </button>
            ) : (
              <div className="w-5" /> // Spacer for alignment
            )}
            <FolderOpen 
              className="h-4 w-4" 
              style={{ color: folder.color || '#6b7280' }}
            />
          </div>
          <span className="text-sm font-medium flex-1">{folder.name}</span>
          <Badge variant="secondary" className="text-xs">
            {files ? files.filter(f => f.folderId === folder.id).length : 0}
          </Badge>
          {!folder.isSystem && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteFolder(folder.id);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-red-600"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
        {folder.children && expandedFolders.has(folder.id) && (
          <div>{renderFolderTree(folder.children, level + 1)}</div>
        )}
      </div>
    ));
  };

  const filteredFiles = selectedFolder === null 
    ? files 
    : files.filter(f => f.folderId === selectedFolder);
  const displayFiles = searchTerm.length > 2 ? searchResults || [] : filteredFiles;
  

  const folderTree = buildFolderTree(folders || []);

  // Auto-expand company root folder on initial load
  useEffect(() => {
    if (folders && folders.length > 0 && expandedFolders.size === 0) {
      // Find the company root folder (with pattern XXXXX_CompanyName)
      const rootFolder = folders.find(f => f.name.match(/^\d{5}_/) && !f.parentId);
      if (rootFolder) {
        setExpandedFolders(new Set([rootFolder.id]));
      }
    }
  }, [folders]);

  return (
    <div className="grid grid-cols-4 gap-6">
      {/* Sidebar with folder tree */}
      <div className="col-span-1">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Folders</CardTitle>
          </CardHeader>
          <CardContent>
            {folders.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-4">No folders yet</p>
                <Button 
                  size="sm" 
                  onClick={() => initFoldersMutation.mutate()}
                  disabled={initFoldersMutation.isPending}
                  className="w-full"
                >
                  Initialize Folders
                </Button>
              </div>
            ) : (
              <>
                <Button 
                  size="sm" 
                  className="w-full mb-3"
                  onClick={() => setShowCreateFolderDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Folder
                </Button>
                
                <div 
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 ${
                    selectedFolder === null ? 'bg-blue-100 dark:bg-blue-900' : ''
                  }`}
                  onClick={() => setSelectedFolder(null)}
                >
                  <FolderOpen className="h-4 w-4" />
                  <span className="text-sm font-medium">All Files</span>
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {files.length}
                  </Badge>
                </div>
                
                <Separator className="my-2" />
                
                {renderFolderTree(folderTree)}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main content area */}
      <div className="col-span-3" {...getRootProps()}>
        <input {...getInputProps()} />
        
        {/* Drag overlay */}
        {isDragActive && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center pointer-events-none">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-xl">
              <Upload className="h-16 w-16 text-primary mx-auto mb-4" />
              <p className="text-xl font-semibold">Drop files here to upload</p>
            </div>
          </div>
        )}
        
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Document Library</CardTitle>
                <CardDescription>
                  Manage documents for {counterpartyName}
                </CardDescription>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search documents..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-64"
                  />
                </div>
                
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setViewMode('grid')}
                    className={viewMode === 'grid' ? 'bg-gray-100 dark:bg-gray-700' : ''}
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setViewMode('list')}
                    className={viewMode === 'list' ? 'bg-gray-100 dark:bg-gray-700' : ''}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
                
                <Button variant="outline" onClick={() => setShowTagManager(true)}>
                  <Tag className="h-4 w-4 mr-2" />
                  Tags
                </Button>
                
                <Button onClick={() => setShowEnhancedUpload(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </Button>
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            {displayFiles.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-lg text-gray-600">No documents found</p>
                <p className="text-sm text-gray-500 mt-2">
                  {searchTerm ? 'Try a different search term' : 'Upload documents to get started'}
                </p>
              </div>
            ) : (
              <>
                {viewMode === 'list' ? (
                  <div className="overflow-x-auto">
                    <div className="min-w-[640px]">
                      {displayFiles.map(file => (
                        <div 
                          key={file.id} 
                          className="flex items-center p-3 border-b hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                          onClick={() => {
                            setEditingFile(file);
                            setShowEnhancedUpload(true);
                          }}
                        >
                          {/* File icon */}
                          <FileText className="h-5 w-5 text-blue-500 flex-shrink-0 mr-3" />
                          
                          {/* File info - takes up available space */}
                          <div className="flex-1 min-w-0 mr-4">
                            <p className="font-medium truncate">{file.originalFileName}</p>
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              <span>{file.fileType.toUpperCase()}</span>
                              <span>{(file.fileSize / 1024).toFixed(1)} KB</span>
                              <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          
                          {/* Tags - fixed width */}
                          <div className="w-64 flex-shrink-0 mr-4">
                            <div className="flex items-center gap-1 flex-wrap">
                              {file.tags.map(tag => (
                                <Badge 
                                  key={tag.id} 
                                  variant="outline" 
                                  className="text-xs"
                                  style={{ borderColor: tag.color, color: tag.color }}
                                >
                                  {tag.name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          
                          {/* Actions - fixed width */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Use direct link navigation for more reliable downloads
                                window.open(`/api/counterparty/documents/download/${file.id}`, '_blank');
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Delete this file?')) {
                                  deleteFileMutation.mutate(file.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {displayFiles.map(file => (
                      <Card 
                        key={file.id} 
                        className="hover:shadow-lg transition-shadow cursor-pointer overflow-hidden"
                        onClick={() => {
                          setEditingFile(file);
                          setShowEnhancedUpload(true);
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <FileText className="h-8 w-8 text-blue-500 flex-shrink-0" />
                            <Badge variant="secondary" className="text-xs">{file.fileType}</Badge>
                          </div>
                          <h3 className="font-medium text-sm mb-1 line-clamp-2">
                            {file.originalFileName}
                          </h3>
                          <p className="text-xs text-gray-500 mb-3">
                            {(file.fileSize / 1024).toFixed(1)} KB • {new Date(file.createdAt).toLocaleDateString()}
                          </p>
                          <div className="flex flex-wrap gap-1 mb-3">
                            {file.tags.map(tag => (
                              <Badge 
                                key={tag.id}
                                variant="outline" 
                                className="text-xs"
                                style={{ borderColor: tag.color, color: tag.color }}
                              >
                                {tag.name}
                              </Badge>
                            ))}
                          </div>
                          <div className="flex items-center justify-end gap-1 pt-2 border-t">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Use direct link navigation for more reliable downloads
                                window.open(`/api/counterparty/documents/download/${file.id}`, '_blank');
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Delete this file?')) {
                                  deleteFileMutation.mutate(file.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>



      {/* Create Folder Dialog */}
      <Dialog open={showCreateFolderDialog} onOpenChange={setShowCreateFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Add a new folder to organize documents
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            
            createFolderMutation.mutate({
              name: formData.get('name') as string,
              counterpartyId: counterpartyId,
              parentId: selectedFolder,
              path: `/${formData.get('name') as string}`,
              description: formData.get('description') as string,
              color: formData.get('color') as string,
              createdBy: 'current-user' // Should be from auth
            });
          }}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Folder Name</Label>
                <Input 
                  id="name" 
                  name="name" 
                  required 
                  placeholder="Enter folder name"
                />
              </div>
              
              <div>
                <Label htmlFor="color">Color</Label>
                <Input 
                  id="color" 
                  name="color" 
                  type="color" 
                  defaultValue="#3b82f6"
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Input 
                  id="description" 
                  name="description" 
                  placeholder="Optional description"
                />
              </div>
            </div>
            
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setShowCreateFolderDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createFolderMutation.isPending}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Tag Manager Dialog */}
      <Dialog open={showTagManager} onOpenChange={setShowTagManager}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Tag Manager</DialogTitle>
            <DialogDescription>
              Create and manage document tags
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Create New Tag Form */}
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const name = formData.get('name') as string;
              const color = formData.get('color') as string;
              const description = formData.get('description') as string;

              if (!name || !color) {
                toast({
                  title: 'Error',
                  description: 'Name and color are required',
                  variant: 'destructive'
                });
                return;
              }

              createTagMutation.mutate({ name, color, description });
              (e.target as HTMLFormElement).reset();
            }}>
              <div className="space-y-3 border-b pb-4">
                <h3 className="font-medium">Create New Tag</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      name="name"
                      placeholder="Tag name"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="color">Color</Label>
                    <Input
                      id="color"
                      name="color"
                      type="color"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      name="description"
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <Button type="submit" size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Create Tag
                </Button>
              </div>
            </form>

            {/* Existing Tags */}
            <div className="space-y-3">
              <h3 className="font-medium">Existing Tags</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {allTags.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tags created yet</p>
                ) : (
                  allTags.map(tag => (
                    <div key={tag.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: tag.color }}
                        />
                        <div>
                          <p className="font-medium">{tag.name}</p>
                          {tag.description && (
                            <p className="text-sm text-muted-foreground">{tag.description}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Delete tag "${tag.name}"?`)) {
                            // Note: Delete tag functionality would need to be implemented
                            toast({
                              title: 'Coming soon',
                              description: 'Tag deletion will be implemented soon'
                            });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Enhanced Document Upload Dialog */}
      <EnhancedDocumentUpload
        open={showEnhancedUpload}
        onOpenChange={(open) => {
          setShowEnhancedUpload(open);
          if (!open) {
            setDroppedFiles([]);
            setEditingFile(null);
          }
        }}
        counterpartyId={counterpartyId}
        folders={folders}
        tags={allTags}
        selectedFolder={selectedFolder}
        initialFiles={droppedFiles}
        editingFile={editingFile}
        allFiles={displayFiles}
        onNavigateToFile={(file) => {
          setEditingFile(file);
        }}
        onUploadComplete={() => {
          queryClient.invalidateQueries({ queryKey: [`/api/counterparty/documents/files`] });
          queryClient.invalidateQueries({ queryKey: [`/api/counterparty/documents/folders`] });
          setShowEnhancedUpload(false);
          setDroppedFiles([]);
          setEditingFile(null);
        }}
      />
    </div>
  );
}