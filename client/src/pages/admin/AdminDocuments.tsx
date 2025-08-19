import React from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { DocumentUploader } from '@/components/documents/document-uploader';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Upload, Search, Filter, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';

function AdminDocuments() {
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

  const documentCategories = [
    'all',
    'loan_application',
    'loan_agreement',
    'promissory_note',
    'deed_of_trust',
    'mortgage',
    'insurance_policy',
    'tax_document',
    'escrow_statement',
    'title_report',
    'appraisal',
    'financial_statement',
    'correspondence',
    'other'
  ];

  const getCategoryBadgeColor = (category: string) => {
    const colors: Record<string, string> = {
      'loan_application': 'bg-blue-100 text-blue-800',
      'loan_agreement': 'bg-green-100 text-green-800',
      'promissory_note': 'bg-purple-100 text-purple-800',
      'deed_of_trust': 'bg-yellow-100 text-yellow-800',
      'mortgage': 'bg-pink-100 text-pink-800',
      'insurance_policy': 'bg-indigo-100 text-indigo-800',
      'tax_document': 'bg-red-100 text-red-800',
      'other': 'bg-gray-100 text-gray-800',
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Documents</CardDescription>
              <CardTitle className="text-2xl">{documents.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Loans with Docs</CardDescription>
              <CardTitle className="text-2xl">
                {new Set(documents.map((d: any) => d.loanId)).size}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>This Month</CardDescription>
              <CardTitle className="text-2xl">
                {documents.filter((d: any) => {
                  const uploadDate = new Date(d.uploadedAt);
                  const now = new Date();
                  return uploadDate.getMonth() === now.getMonth() && 
                         uploadDate.getFullYear() === now.getFullYear();
                }).length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Storage Used</CardDescription>
              <CardTitle className="text-2xl">
                {(documents.reduce((acc: number, d: any) => acc + (d.fileSize || 0), 0) / 1024 / 1024).toFixed(1)} MB
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs defaultValue="browse" className="space-y-4">
          <TabsList>
            <TabsTrigger value="browse">
              <Search className="h-4 w-4 mr-2" />
              Browse Documents
            </TabsTrigger>
            <TabsTrigger value="upload">
              <Upload className="h-4 w-4 mr-2" />
              Upload Documents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filter Documents</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search documents..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full"
                  />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {documentCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>
                        {cat === 'all' ? 'All Categories' : cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={loanFilter} onValueChange={setLoanFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Loan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Loans</SelectItem>
                    {loans.map((loan: any) => (
                      <SelectItem key={loan.id} value={loan.id.toString()}>
                        {loan.loanNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Documents List */}
            <Card>
              <CardHeader>
                <CardTitle>Documents ({filteredDocuments.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {filteredDocuments.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No documents found</p>
                  ) : (
                    filteredDocuments.map((doc: any) => {
                      const loan = loans.find((l: any) => l.id === doc.loanId);
                      return (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-4">
                            <FileText className="h-8 w-8 text-gray-400" />
                            <div>
                              <p className="font-medium">{doc.fileName}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge className={getCategoryBadgeColor(doc.category)}>
                                  {doc.category?.replace(/_/g, ' ')}
                                </Badge>
                                {loan && (
                                  <span className="text-sm text-gray-500">
                                    Loan: {loan.loanNumber}
                                  </span>
                                )}
                                <span className="text-sm text-gray-500">
                                  {format(new Date(doc.uploadedAt), 'MMM dd, yyyy')}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownload(doc.id, doc.fileName)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(doc.id)}
                              className="text-red-500 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="upload">
            <Card>
              <CardHeader>
                <CardTitle>Upload New Documents</CardTitle>
                <CardDescription>
                  Upload documents and assign them to specific loans
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentUploader />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

export default AdminDocuments;