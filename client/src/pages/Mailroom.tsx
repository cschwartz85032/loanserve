import React from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { DocumentUploader } from '@/components/documents/document-uploader';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Upload, Search, Filter, Download, Trash2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';

export default function Mailroom() {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('all');
  const [loanFilter, setLoanFilter] = React.useState('all');

  const { data: documents = [], isLoading: documentsLoading } = useQuery<any[]>({
    queryKey: ['/api/documents'],
  });

  const { data: loans = [] } = useQuery<any[]>({
    queryKey: ['/api/loans'],
  });

  const handleDelete = async (documentId: number) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    
    try {
      await apiRequest(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      toast({
        title: "Success",
        description: "Document deleted successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive",
      });
    }
  };

  const handleDownload = async (documentId: number, fileName: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}/download`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download document",
        variant: "destructive",
      });
    }
  };

  const filteredDocuments = documents.filter((doc: any) => {
    const matchesSearch = doc.fileName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         doc.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || doc.category === categoryFilter;
    const matchesLoan = loanFilter === 'all' || doc.loanId?.toString() === loanFilter;
    
    return matchesSearch && matchesCategory && matchesLoan;
  });

  const categories = [
    'loan_application',
    'property_deed',
    'insurance_policy',
    'tax_return',
    'bank_statement',
    'credit_report',
    'employment_verification',
    'appraisal',
    'title_report',
    'other'
  ];

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="bg-primary-100 p-3 rounded-lg">
              <Mail className="h-6 w-6 text-primary-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Mailroom</h1>
              <p className="text-gray-600 mt-1">Manage and organize all loan documents and correspondence</p>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="p-6 space-y-6">

        {/* Document Management Interface */}
        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload Documents
            </TabsTrigger>
            <TabsTrigger value="manage" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Manage Documents
            </TabsTrigger>
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Search & Filter
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Upload New Documents</CardTitle>
                <CardDescription>
                  Upload loan documents, correspondence, and supporting files to the mailroom
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentUploader standalone={true} onUploadComplete={() => {
                  queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
                }} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manage" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Document Library</CardTitle>
                <CardDescription>
                  View, download, and manage all documents in the system
                </CardDescription>
              </CardHeader>
              <CardContent>
                {documentsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-gray-500">Loading documents...</div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredDocuments.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p className="text-lg font-medium">No documents found</p>
                        <p className="text-sm">Upload your first document to get started</p>
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {filteredDocuments.map((doc: any) => (
                          <div key={doc.id} className="border rounded-lg p-4 hover:bg-gray-50">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <FileText className="h-8 w-8 text-blue-500" />
                                <div>
                                  <h3 className="font-medium text-gray-900">{doc.fileName}</h3>
                                  <div className="flex items-center space-x-2 text-sm text-gray-500">
                                    <span>Uploaded: {format(new Date(doc.createdAt), 'MMM dd, yyyy')}</span>
                                    {doc.category && (
                                      <Badge variant="secondary">
                                        {doc.category.replace('_', ' ')}
                                      </Badge>
                                    )}
                                    {doc.loanId && (
                                      <Badge variant="outline">
                                        Loan #{doc.loanId}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDownload(doc.id, doc.fileName)}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDelete(doc.id)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="search" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Search & Filter Documents</CardTitle>
                <CardDescription>
                  Find specific documents using search and filter options
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Search Documents
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search by filename or description..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Filter by Category
                    </label>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category.replace('_', ' ').toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Filter by Loan
                    </label>
                    <Select value={loanFilter} onValueChange={setLoanFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All loans" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Loans</SelectItem>
                        {loans.map((loan: any) => (
                          <SelectItem key={loan.id} value={loan.id.toString()}>
                            Loan #{loan.id} - {loan.borrowerName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm text-gray-600">
                    Showing {filteredDocuments.length} of {documents.length} documents
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </div>
      </main>
    </div>
  );
}

