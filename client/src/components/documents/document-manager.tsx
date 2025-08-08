import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Filter
} from "lucide-react";
import { DocumentUploadModal } from "./document-upload-modal";
import { DocumentPreviewModal } from "./document-preview-modal";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function DocumentManager() {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  
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
    <div className="space-y-6">
      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Upload Area */}
            <div className="col-span-1">
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-primary-400 transition-colors">
                <Upload className="mx-auto h-12 w-12 text-slate-400 mb-4" />
                <div>
                  <p className="text-sm font-medium text-slate-900 mb-1">Upload Documents</p>
                  <p className="text-xs text-slate-600 mb-4">PDF, DOC, JPG up to 10MB</p>
                </div>
                <Button onClick={() => setShowUploadModal(true)}>
                  Choose Files
                </Button>
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
                              <p className="text-sm font-medium text-slate-900 hover:text-primary-600">{document.title}</p>
                              <p className="text-xs text-slate-500 hover:text-slate-700">{document.originalFileName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant="outline">
                            {document.documentType.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
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

      {/* Upload Modal */}
      <DocumentUploadModal
        open={showUploadModal}
        onOpenChange={setShowUploadModal}
      />

      {/* Preview Modal */}
      <DocumentPreviewModal
        open={showPreviewModal}
        onOpenChange={setShowPreviewModal}
        document={selectedDocument}
      />
    </div>
  );
}
