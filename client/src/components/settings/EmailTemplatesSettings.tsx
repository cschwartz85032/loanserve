import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Folder, FileText, Plus, Trash2, Edit, ChevronRight, Mail, Bold, Italic, Underline, List, ListOrdered, Link, Image, Smile, Code } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface EmailTemplateFolder {
  id: number;
  name: string;
  parentId: number | null;
  templates?: EmailTemplate[];
  templateCount?: number;
}

interface EmailTemplate {
  id: number;
  folderId: number | null;
  name: string;
  subject: string;
  body: string;
  isShared: boolean;
}

interface MergeField {
  label: string;
  value: string;
  category: string;
}

const MERGE_FIELDS: MergeField[] = [
  // Borrower Fields
  { label: "Borrower Name", value: "{{borrower_name}}", category: "Borrower" },
  { label: "Borrower Email", value: "{{borrower_email}}", category: "Borrower" },
  { label: "Borrower Phone", value: "{{borrower_phone}}", category: "Borrower" },
  { label: "Borrower Address", value: "{{borrower_address}}", category: "Borrower" },
  
  // Loan Fields
  { label: "Loan Number", value: "{{loan_number}}", category: "Loan" },
  { label: "Loan Amount", value: "{{loan_amount}}", category: "Loan" },
  { label: "Interest Rate", value: "{{interest_rate}}", category: "Loan" },
  { label: "Monthly Payment", value: "{{monthly_payment}}", category: "Loan" },
  { label: "Current Balance", value: "{{current_balance}}", category: "Loan" },
  { label: "Next Due Date", value: "{{next_due_date}}", category: "Loan" },
  { label: "Days Past Due", value: "{{days_past_due}}", category: "Loan" },
  { label: "Past Due Amount", value: "{{past_due_amount}}", category: "Loan" },
  
  // Property Fields
  { label: "Property Address", value: "{{property_address}}", category: "Property" },
  { label: "Property City", value: "{{property_city}}", category: "Property" },
  { label: "Property State", value: "{{property_state}}", category: "Property" },
  { label: "Property Zip", value: "{{property_zip}}", category: "Property" },
  
  // Company Fields
  { label: "Company Name", value: "{{company_name}}", category: "Company" },
  { label: "Company Phone", value: "{{company_phone}}", category: "Company" },
  { label: "Company Email", value: "{{company_email}}", category: "Company" },
  { label: "Company Address", value: "{{company_address}}", category: "Company" },
];

export default function EmailTemplatesSettings() {
  const { toast } = useToast();
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedFolderForTemplate, setSelectedFolderForTemplate] = useState<number | null>(null);
  
  // Template form state
  const [templateForm, setTemplateForm] = useState({
    name: "",
    subject: "",
    body: "",
    isShared: false,
    folderId: null as number | null
  });

  // Fetch folders with template count
  const { data: folders = [], isLoading: foldersLoading } = useQuery<EmailTemplateFolder[]>({
    queryKey: ["/api/email-template-folders"],
  });

  // Fetch templates for selected folder
  const { data: templates = [], isLoading: templatesLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email-templates", selectedFolder],
    enabled: selectedFolder !== null,
  });

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("/api/email-template-folders", {
        method: "POST",
        body: JSON.stringify({ name, parentId: null })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-template-folders"] });
      toast({
        title: "Folder created",
        description: "The folder has been created successfully.",
      });
      setShowCreateFolder(false);
      setNewFolderName("");
    },
    onError: (error) => {
      toast({
        title: "Failed to create folder",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Delete folder mutation
  const deleteFolderMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/email-template-folders/${id}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-template-folders"] });
      toast({
        title: "Folder deleted",
        description: "The folder has been deleted successfully.",
      });
      setSelectedFolder(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to delete folder",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (data: typeof templateForm) => {
      return apiRequest("/api/email-templates", {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-template-folders"] });
      toast({
        title: "Template created",
        description: "The email template has been created successfully.",
      });
      setShowCreateTemplate(false);
      setTemplateForm({
        name: "",
        subject: "",
        body: "",
        isShared: false,
        folderId: null
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to create template",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/email-templates/${id}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-template-folders"] });
      toast({
        title: "Template deleted",
        description: "The email template has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete template",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolderMutation.mutate(newFolderName.trim());
    }
  };

  const handleCreateTemplate = () => {
    if (templateForm.name.trim() && templateForm.subject.trim()) {
      createTemplateMutation.mutate({
        ...templateForm,
        folderId: selectedFolderForTemplate
      });
    }
  };

  const insertMergeField = (field: string) => {
    setTemplateForm(prev => ({
      ...prev,
      body: prev.body + " " + field
    }));
  };

  const insertMergeFieldInSubject = (field: string) => {
    setTemplateForm(prev => ({
      ...prev,
      subject: prev.subject + " " + field
    }));
  };

  if (foldersLoading) {
    return <div>Loading email templates...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Email Template Folders</CardTitle>
              <CardDescription>
                Organize your email templates in folders for easy management
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowCreateFolder(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Folder
              </Button>
              <Button onClick={() => setShowCreateTemplate(true)}>
                <Mail className="h-4 w-4 mr-2" />
                Email Template
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Folders List */}
          <div className="border rounded-lg">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Email Templates</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {folders.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center p-8 text-muted-foreground">
                      No folders yet. Create your first folder to organize email templates.
                    </td>
                  </tr>
                ) : (
                  folders.map((folder) => (
                    <tr key={folder.id} className="border-b hover:bg-gray-50 cursor-pointer">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Folder className="h-4 w-4 text-blue-500" />
                          <span className="font-medium">{folder.name}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="text-muted-foreground">
                          {folder.templateCount || 0}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFolder(folder.id);
                            }}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              // TODO: Edit folder
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Are you sure you want to delete this folder?")) {
                                deleteFolderMutation.mutate(folder.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Templates List (when folder selected) */}
          {selectedFolder && (
            <div className="mt-6">
              <h3 className="font-semibold mb-3">
                Templates in {folders.find(f => f.id === selectedFolder)?.name}
              </h3>
              <div className="border rounded-lg">
                {templatesLoading ? (
                  <div className="p-4">Loading templates...</div>
                ) : templates.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No templates in this folder yet.
                  </div>
                ) : (
                  <div className="space-y-2 p-2">
                    {templates.map((template) => (
                      <div key={template.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-gray-400" />
                          <div>
                            <div className="font-medium">{template.name}</div>
                            <div className="text-sm text-muted-foreground">{template.subject}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {template.isShared && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">Shared</span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteTemplateMutation.mutate(template.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Folder Dialog */}
      <Dialog open={showCreateFolder} onOpenChange={setShowCreateFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Folder className="h-5 w-5" />
              Create Folder
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="folder-name">Folder name</Label>
              <Input
                id="folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Enter folder name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateFolder(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Email Template Dialog */}
      <Dialog open={showCreateTemplate} onOpenChange={setShowCreateTemplate}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Create Email Template
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="template-name">Template name</Label>
              <Input
                id="template-name"
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                placeholder="Enter template name"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="template-subject">Template subject</Label>
                <Select onValueChange={(value) => insertMergeFieldInSubject(value)}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Merge Fields" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(
                      MERGE_FIELDS.reduce((acc, field) => {
                        if (!acc[field.category]) acc[field.category] = [];
                        acc[field.category].push(field);
                        return acc;
                      }, {} as Record<string, MergeField[]>)
                    ).map(([category, fields]) => (
                      <div key={category}>
                        <div className="px-2 py-1 text-sm font-semibold text-muted-foreground">
                          {category}
                        </div>
                        {fields.map((field) => (
                          <SelectItem key={field.value} value={field.value}>
                            {field.label}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                id="template-subject"
                value={templateForm.subject}
                onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                placeholder="Enter email subject"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="template-body">Template body</Label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 border rounded-md p-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <Bold className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <Italic className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <Underline className="h-4 w-4" />
                    </Button>
                    <div className="w-px h-4 bg-gray-300 mx-1" />
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <List className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <ListOrdered className="h-4 w-4" />
                    </Button>
                    <div className="w-px h-4 bg-gray-300 mx-1" />
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <Link className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <Image className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <Smile className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <Code className="h-4 w-4" />
                    </Button>
                  </div>
                  <Select onValueChange={(value) => insertMergeField(value)}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Merge Fields" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(
                        MERGE_FIELDS.reduce((acc, field) => {
                          if (!acc[field.category]) acc[field.category] = [];
                          acc[field.category].push(field);
                          return acc;
                        }, {} as Record<string, MergeField[]>)
                      ).map(([category, fields]) => (
                        <div key={category}>
                          <div className="px-2 py-1 text-sm font-semibold text-muted-foreground">
                            {category}
                          </div>
                          {fields.map((field) => (
                            <SelectItem key={field.value} value={field.value}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Textarea
                id="template-body"
                value={templateForm.body}
                onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
                placeholder="Enter email body content"
                className="min-h-[200px]"
              />
              <p className="text-sm text-muted-foreground mt-1">
                The sender's signature from My Settings will automatically be added.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="share-template"
                checked={templateForm.isShared}
                onCheckedChange={(checked) => 
                  setTemplateForm({ ...templateForm, isShared: checked as boolean })
                }
              />
              <Label htmlFor="share-template">Share this template with everyone</Label>
            </div>

            <div>
              <Label>Folders:</Label>
              <div className="flex items-center gap-2 mt-2">
                {folders.length > 0 && (
                  <Select
                    value={selectedFolderForTemplate?.toString() || ""}
                    onValueChange={(value) => setSelectedFolderForTemplate(parseInt(value))}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select a folder" />
                    </SelectTrigger>
                    <SelectContent>
                      {folders.map((folder) => (
                        <SelectItem key={folder.id} value={folder.id.toString()}>
                          <div className="flex items-center gap-2">
                            <Folder className="h-4 w-4" />
                            {folder.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowCreateTemplate(false);
                    setShowCreateFolder(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateTemplate(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateTemplate} 
              disabled={!templateForm.name.trim() || !templateForm.subject.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}