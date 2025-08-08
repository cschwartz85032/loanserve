import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  Search, 
  FileText, 
  Shield, 
  Building, 
  DollarSign,
  Eye,
  Download,
  Trash2,
  Filter,
  CloudUpload,
  File
} from "lucide-react";
import { DocumentPreviewModal } from "./document-preview-modal";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function DocumentManager() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: documents, isLoading } = useQuery({
    queryKey: ["/api/documents", { documentType: typeFilter === "all" ? undefined : typeFilter }],
  });

  const documentCategories = [
    {
      type: "loan_application",
      label: "Loan Applications",
      icon: FileText,
      color: "text-primary-600",
      count: 1247
    },
    {
      type: "insurance_policy",
      label: "Insurance Policies",
      icon: Shield,
      color: "text-green-600",
      count: 2891
    },
    {
      type: "property_deed",
      label: "Property Deeds",
      icon: Building,
      color: "text-yellow-600",
      count: 2847
    },
    {
      type: "tax_return",
      label: "Tax Returns",
      icon: DollarSign,
      color: "text-purple-600",
      count: 1892
    }
  ];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "N/A";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleDownload = (doc: any) => {
    // In production, this would download from object storage
    const link = document.createElement('a');
    link.href = doc.filePath || '#';
    link.download = doc.fileName || doc.originalFileName || 'document';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle drag events
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      setUploadingFiles(files);
      
      // Upload each file
      for (const file of files) {
        await uploadFile(file);
      }
      
      setUploadingFiles([]);
    }
  }, []);

  const uploadFile = async (file: File) => {
    try {
      // Show uploading state
      toast({
        title: "Uploading",
        description: `Uploading ${file.name}...`,
      });

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.split('.')[0]);
      formData.append('description', 'Uploaded via drag and drop');
      
      // Upload file to server
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Upload failed');
      }

      const document = await res.json();

      toast({
        title: "Upload Complete",
        description: `${file.name} has been added to the document library`,
      });

      // Refresh document list
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: `Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    }
  };



  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const res = await apiRequest("DELETE", `/api/documents/${documentId}`);
      if (!res.ok) throw new Error('Failed to delete document');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({
        title: "Success",
        description: "Document deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive",
      });
    }
  });

  return (
    <div 
      className={cn(
        "space-y-6 min-h-[600px] relative",
        dragActive && "bg-primary-50 border-2 border-dashed border-primary-400 rounded-lg"
      )}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      {/* Drag and Drop Overlay */}
      {dragActive && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary-50/90 rounded-lg">
          <div className="text-center">
            <CloudUpload className="w-16 h-16 text-primary-600 mx-auto mb-4" />
            <p className="text-xl font-semibold text-primary-900">Drop files to upload</p>
            <p className="text-sm text-primary-700 mt-2">Files will be automatically added to the document library</p>
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {uploadingFiles.length > 0 && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="space-y-2">
              {uploadingFiles.map((file, index) => (
                <div key={index} className="flex items-center gap-3">
                  <File className="w-4 h-4 text-slate-500" />
                  <span className="text-sm flex-1">{file.name}</span>
                  <Badge variant="secondary">Uploading...</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document Categories */}
      <Card>
        <CardHeader>
          <CardTitle>Document Library</CardTitle>
          <p className="text-sm text-slate-600">Drag and drop files anywhere to upload</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Drag and Drop Instructions */}
            <div className="col-span-1">
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center bg-slate-50">
                <CloudUpload className="mx-auto h-12 w-12 text-slate-400 mb-4" />
                <div>
                  <p className="text-sm font-medium text-slate-900 mb-1">Drag & Drop Files</p>
                  <p className="text-xs text-slate-600">Drop files anywhere on this page</p>
                  <p className="text-xs text-slate-600 mt-1">PDF, DOC, JPG up to 10MB</p>
                </div>
              </div>
            </div>

            {/* Document Categories */}
            <div className="col-span-2">
              <h4 className="text-sm font-medium text-slate-900 mb-3">Document Categories</h4>
              <div className="grid grid-cols-2 gap-3">
                {documentCategories.map((category) => (
                  <div key={category.type} className="p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <div className="flex items-center space-x-3">
                      <category.icon className={`w-5 h-5 ${category.color}`} />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{category.label}</p>
                        <p className="text-xs text-slate-500">{category.count.toLocaleString()} documents</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Document Library</CardTitle>
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                <Input
                  placeholder="Search documents..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="loan_application">Loan Applications</SelectItem>
                  <SelectItem value="insurance_policy">Insurance Policies</SelectItem>
                  <SelectItem value="property_deed">Property Deeds</SelectItem>
                  <SelectItem value="tax_return">Tax Returns</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <div className="animate-pulse space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-slate-200 rounded"></div>
                ))}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-y border-slate-200">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Document
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Size
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Upload Date
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {documents && documents.length > 0 ? (
                    documents.map((document: any) => (
                      <tr key={document.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div 
                            className="flex items-center space-x-3 cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => {
                              setSelectedDocument(document);
                              setShowPreviewModal(true);
                            }}
                          >
                            <FileText className="w-5 h-5 text-slate-400" />
                            <div>
                              <p className="text-sm font-medium text-slate-900 hover:text-primary-600">{document.title || document.fileName}</p>
                              <p className="text-xs text-slate-500 hover:text-slate-700">{document.fileName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant="outline">
                            {(document.category || document.documentType || 'other').replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {formatFileSize(document.fileSize)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {formatDate(document.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center space-x-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                setSelectedDocument(document);
                                setShowPreviewModal(true);
                              }}
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              View
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleDownload(document)}
                            >
                              <Download className="w-4 h-4 mr-1" />
                              Download
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                        No documents found. Upload your first document to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Modal */}
      <DocumentPreviewModal
        open={showPreviewModal}
        onOpenChange={setShowPreviewModal}
        document={selectedDocument}
      />
    </div>
  );
}
