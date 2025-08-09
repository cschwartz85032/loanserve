import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { DocumentUploader } from "@/components/documents/document-uploader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { FileText, Download, Eye, Trash2, Calendar, User, FileType } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";

export default function Documents() {
  const [showUploader, setShowUploader] = useState(true);
  const { toast } = useToast();

  // Fetch all documents
  const { data: documents, isLoading } = useQuery({
    queryKey: ['/api/documents']
  });

  // Fetch loans for display
  const { data: loans } = useQuery({
    queryKey: ['/api/loans']
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const response = await apiRequest("DELETE", `/api/documents/${documentId}`);
      if (!response.ok) throw new Error("Failed to delete document");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      toast({
        title: "Document deleted",
        description: "The document has been removed successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Delete failed",
        description: "Unable to delete the document.",
        variant: "destructive",
      });
    }
  });

  const getLoanNumber = (loanId: number) => {
    const loan = loans?.find((l: any) => l.id === loanId);
    return loan?.loanNumber || `Loan #${loanId}`;
  };

  const formatFileSize = (bytes: string) => {
    const size = parseInt(bytes);
    if (size === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(size) / Math.log(k));
    return Math.round(size / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'loan_document': 'bg-blue-100 text-blue-800',
      'legal': 'bg-purple-100 text-purple-800',
      'financial': 'bg-green-100 text-green-800',
      'property': 'bg-orange-100 text-orange-800',
      'insurance': 'bg-red-100 text-red-800',
      'tax': 'bg-yellow-100 text-yellow-800',
      'other': 'bg-gray-100 text-gray-800'
    };
    return colors[category] || colors['other'];
  };

  const getFileTypeIcon = (fileType: string) => {
    if (fileType.includes('pdf')) return '📄';
    if (fileType.includes('image')) return '🖼️';
    if (fileType.includes('word') || fileType.includes('doc')) return '📝';
    if (fileType.includes('excel') || fileType.includes('spreadsheet')) return '📊';
    return '📎';
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Document Management</h1>
              <p className="text-sm text-slate-600">Upload and manage loan documents</p>
            </div>
            <Button 
              variant={showUploader ? "outline" : "default"}
              onClick={() => setShowUploader(!showUploader)}
            >
              <FileText className="h-4 w-4 mr-2" />
              {showUploader ? "Hide Uploader" : "Upload Documents"}
            </Button>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* Upload Section */}
          {showUploader && (
            <Card>
              <CardHeader>
                <CardTitle>Upload Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <DocumentUploader 
                  standalone={true}
                  onUploadComplete={() => {
                    setShowUploader(false);
                    toast({
                      title: "Upload complete",
                      description: "All documents have been uploaded successfully.",
                    });
                  }}
                />
              </CardContent>
            </Card>
          )}

          {/* Documents List */}
          <Card>
            <CardHeader>
              <CardTitle>All Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">
                  Loading documents...
                </div>
              ) : documents?.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No documents uploaded yet. Start by uploading some documents above.
                </div>
              ) : (
                <div className="space-y-3">
                  {documents?.map((doc: any) => (
                    <div 
                      key={doc.id} 
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start space-x-4">
                        <div className="text-2xl mt-1">
                          {getFileTypeIcon(doc.fileType)}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <h3 className="font-medium">{doc.fileName}</h3>
                            <Badge className={getCategoryColor(doc.category)}>
                              {doc.category?.replace('_', ' ')}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600">{doc.description}</p>
                          <div className="flex items-center space-x-4 text-xs text-gray-500">
                            <span className="flex items-center">
                              <FileType className="h-3 w-3 mr-1" />
                              {formatFileSize(doc.fileSize)}
                            </span>
                            <span className="flex items-center">
                              <Calendar className="h-3 w-3 mr-1" />
                              {formatDate(doc.uploadedAt || doc.createdAt)}
                            </span>
                            {doc.loanId && (
                              <span className="flex items-center">
                                <User className="h-3 w-3 mr-1" />
                                {getLoanNumber(doc.loanId)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => deleteMutation.mutate(doc.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}