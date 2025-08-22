import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, FileText, Save, Trash2 } from "lucide-react";

interface NoticeTemplate {
  id: number;
  category: string;
  subcategory?: string;
  name: string;
  description?: string;
  filename?: string;
  fileUrl?: string;
  isActive: boolean;
}

interface NoticeSettings {
  [category: string]: {
    [key: string]: any;
  };
}

const NOTICE_CATEGORIES = [
  { value: "late", label: "Late" },
  { value: "insurance", label: "Insurance" },
  { value: "nsf", label: "NSF" },
  { value: "payoff", label: "Payoff" },
  { value: "hud", label: "HUD" },
  { value: "arm", label: "ARM" },
  { value: "other", label: "Other" }
];

export default function AutoNoticeSettings() {
  const { toast } = useToast();
  const [activeCategory, setActiveCategory] = useState("late");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Fetch templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery<NoticeTemplate[]>({
    queryKey: ["/api/notice-templates"],
  });

  // Fetch settings
  const { data: settings = {}, isLoading: settingsLoading } = useQuery<NoticeSettings>({
    queryKey: ["/api/notice-settings"],
  });

  // Local state for settings
  const [lateSettings, setLateSettings] = useState({
    send1stNotice: true,
    days1stNotice: 10,
    after1stNotice: "next_due_date",
    send2ndNotice: true,
    days2ndNotice: 30,
    after2ndNotice: "next_due_date",
    send3rdNotice: true,
    days3rdNotice: 60,
    after3rdNotice: "next_due_date",
    send4thNotice: true,
    days4thNotice: 90,
    after4thNotice: "next_due_date"
  });

  const [nsfSettings, setNsfSettings] = useState({
    deleteOutstandingChecks: false,
    createReversals: true,
    nsfChargeAmount: 50.00
  });

  const [payoffSettings, setPayoffSettings] = useState({
    demandFee: 35.00,
    reconveyanceFee: 50.00,
    recordingFee: 15.00,
    noticeExpiresAfterDays: 20
  });

  useEffect(() => {
    if (settings.late) {
      setLateSettings({ ...lateSettings, ...settings.late });
    }
    if (settings.nsf) {
      setNsfSettings({ ...nsfSettings, ...settings.nsf });
    }
    if (settings.payoff) {
      setPayoffSettings({ ...payoffSettings, ...settings.payoff });
    }
  }, [settings]);

  // Upload template mutation
  const uploadTemplateMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/notice-templates/upload", {
        method: "POST",
        credentials: "include",
        body: formData
      });
      if (!response.ok) throw new Error("Failed to upload template");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notice-templates"] });
      toast({
        title: "Template uploaded",
        description: "The template has been uploaded successfully.",
      });
      setSelectedFile(null);
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/notice-templates/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to delete template");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notice-templates"] });
      toast({
        title: "Template deleted",
        description: "The template has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async ({ category, settingKey, settingValue }: any) => {
      const response = await fetch("/api/notice-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ category, settingKey, settingValue })
      });
      if (!response.ok) throw new Error("Failed to update settings");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notice-settings"] });
      toast({
        title: "Settings saved",
        description: "Notice settings have been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = (category: string, subcategory?: string) => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload.",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("template", selectedFile);
    formData.append("category", category);
    if (subcategory) formData.append("subcategory", subcategory);
    formData.append("name", selectedFile.name);
    
    uploadTemplateMutation.mutate(formData);
  };

  const handleDownload = (template: NoticeTemplate) => {
    if (template.fileUrl) {
      window.open(template.fileUrl, "_blank");
    }
  };

  const handleSaveLateSettings = () => {
    updateSettingsMutation.mutate({
      category: "late",
      settingKey: "settings",
      settingValue: lateSettings
    });
  };

  const handleSaveNsfSettings = () => {
    updateSettingsMutation.mutate({
      category: "nsf",
      settingKey: "settings",
      settingValue: nsfSettings
    });
  };

  const handleSavePayoffSettings = () => {
    updateSettingsMutation.mutate({
      category: "payoff",
      settingKey: "settings",
      settingValue: payoffSettings
    });
  };

  const getCategoryTemplates = (category: string) => {
    return templates.filter(t => t.category === category);
  };

  if (templatesLoading || settingsLoading) {
    return <div>Loading templates settings...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Loan Servicing - Notices</CardTitle>
          <CardDescription>
            Configure Word templates for borrower notices and their settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeCategory} onValueChange={setActiveCategory}>
            <TabsList className="grid w-full grid-cols-7">
              {NOTICE_CATEGORIES.map(cat => (
                <TabsTrigger key={cat.value} value={cat.value}>
                  {cat.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Late Notices Tab */}
            <TabsContent value="late" className="space-y-4">
              <div className="space-y-4">
                <h3 className="font-semibold">Late Notices Settings</h3>
                <p className="text-sm text-muted-foreground">
                  Use the options below to determine which notices are used and the time interval between notices.
                </p>
                
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(num => (
                    <div key={num} className="flex items-center gap-4">
                      <Checkbox
                        checked={lateSettings[`send${num}${num === 1 ? 'st' : num === 2 ? 'nd' : num === 3 ? 'rd' : 'th'}Notice`]}
                        onCheckedChange={(checked) => 
                          setLateSettings({
                            ...lateSettings,
                            [`send${num}${num === 1 ? 'st' : num === 2 ? 'nd' : num === 3 ? 'rd' : 'th'}Notice`]: checked
                          })
                        }
                      />
                      <Label className="w-32">Send {num}{num === 1 ? 'st' : num === 2 ? 'nd' : num === 3 ? 'rd' : 'th'} notice</Label>
                      <Input
                        type="number"
                        className="w-20"
                        value={lateSettings[`days${num}${num === 1 ? 'st' : num === 2 ? 'nd' : num === 3 ? 'rd' : 'th'}Notice`]}
                        onChange={(e) =>
                          setLateSettings({
                            ...lateSettings,
                            [`days${num}${num === 1 ? 'st' : num === 2 ? 'nd' : num === 3 ? 'rd' : 'th'}Notice`]: parseInt(e.target.value)
                          })
                        }
                      />
                      <span>days after</span>
                      <Select
                        value={lateSettings[`after${num}${num === 1 ? 'st' : num === 2 ? 'nd' : num === 3 ? 'rd' : 'th'}Notice`]}
                        onValueChange={(value) =>
                          setLateSettings({
                            ...lateSettings,
                            [`after${num}${num === 1 ? 'st' : num === 2 ? 'nd' : num === 3 ? 'rd' : 'th'}Notice`]: value
                          })
                        }
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="next_due_date">next due date</SelectItem>
                          <SelectItem value="last_payment">last payment</SelectItem>
                          <SelectItem value="delinquency">delinquency</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                <div className="mt-6">
                  <h4 className="font-medium mb-3">Microsoft Word Template</h4>
                  <div className="flex items-center gap-3">
                    <Input
                      type="text"
                      placeholder="Borrower Late Notices (4).DOT"
                      className="flex-1"
                      value={getCategoryTemplates("late")[0]?.filename || ""}
                      readOnly
                    />
                    <input
                      type="file"
                      accept=".doc,.docx,.dot"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="late-template-upload"
                    />
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById("late-template-upload")?.click()}
                    >
                      Browse
                    </Button>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpload("late")}
                      disabled={!selectedFile}
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      Upload
                    </Button>
                    {getCategoryTemplates("late")[0] && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(getCategoryTemplates("late")[0])}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    )}
                  </div>
                </div>

                <Button onClick={handleSaveLateSettings} className="mt-4">
                  <Save className="h-4 w-4 mr-2" />
                  Save Late Notice Settings
                </Button>
              </div>
            </TabsContent>

            {/* NSF Tab */}
            <TabsContent value="nsf" className="space-y-4">
              <div className="space-y-4">
                <h3 className="font-semibold">NSF (Non Sufficient Funds) Notice</h3>
                <p className="text-sm text-muted-foreground">
                  Use the options below to edit the notice options.
                </p>

                <div className="space-y-4">
                  <h4 className="font-medium">When Applying an NSF Payment</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={nsfSettings.deleteOutstandingChecks}
                        onCheckedChange={(checked) =>
                          setNsfSettings({ ...nsfSettings, deleteOutstandingChecks: checked as boolean })
                        }
                      />
                      <Label>Delete all outstanding (unprinted) distribution checks</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={nsfSettings.createReversals}
                        onCheckedChange={(checked) =>
                          setNsfSettings({ ...nsfSettings, createReversals: checked as boolean })
                        }
                      />
                      <Label>Create reversals</Label>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Label>NSF charge amount</Label>
                    <span>$</span>
                    <Input
                      type="number"
                      step="0.01"
                      className="w-32"
                      value={nsfSettings.nsfChargeAmount}
                      onChange={(e) =>
                        setNsfSettings({ ...nsfSettings, nsfChargeAmount: parseFloat(e.target.value) })
                      }
                    />
                  </div>
                </div>

                <div className="mt-6">
                  <h4 className="font-medium mb-3">Microsoft Word Template</h4>
                  <div className="flex items-center gap-3">
                    <Input
                      type="text"
                      placeholder="NSF Payment Notice.DOT"
                      className="flex-1"
                      value={getCategoryTemplates("nsf")[0]?.filename || ""}
                      readOnly
                    />
                    <input
                      type="file"
                      accept=".doc,.docx,.dot"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="nsf-template-upload"
                    />
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById("nsf-template-upload")?.click()}
                    >
                      Browse
                    </Button>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpload("nsf")}
                      disabled={!selectedFile}
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      Upload
                    </Button>
                    {getCategoryTemplates("nsf")[0] && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(getCategoryTemplates("nsf")[0])}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    )}
                  </div>
                </div>

                <Button onClick={handleSaveNsfSettings} className="mt-4">
                  <Save className="h-4 w-4 mr-2" />
                  Save NSF Settings
                </Button>
              </div>
            </TabsContent>

            {/* Payoff Tab */}
            <TabsContent value="payoff" className="space-y-4">
              <div className="space-y-4">
                <h3 className="font-semibold">Demand for Payoff Notice</h3>
                <p className="text-sm text-muted-foreground">
                  Use the options below to edit the notice options.
                </p>

                <div className="space-y-4">
                  <h4 className="font-medium">Other Fees - Default Value</h4>
                  <div className="grid grid-cols-2 gap-4 max-w-md">
                    <div className="flex items-center gap-2">
                      <Label className="w-32">Demand Fee</Label>
                      <span>$</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={payoffSettings.demandFee}
                        onChange={(e) =>
                          setPayoffSettings({ ...payoffSettings, demandFee: parseFloat(e.target.value) })
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="w-32">Reconveyance Fee</Label>
                      <span>$</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={payoffSettings.reconveyanceFee}
                        onChange={(e) =>
                          setPayoffSettings({ ...payoffSettings, reconveyanceFee: parseFloat(e.target.value) })
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="w-32">Recording Fee</Label>
                      <span>$</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={payoffSettings.recordingFee}
                        onChange={(e) =>
                          setPayoffSettings({ ...payoffSettings, recordingFee: parseFloat(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Label>Notice expires after</Label>
                  <Input
                    type="number"
                    className="w-20"
                    value={payoffSettings.noticeExpiresAfterDays}
                    onChange={(e) =>
                      setPayoffSettings({ ...payoffSettings, noticeExpiresAfterDays: parseInt(e.target.value) })
                    }
                  />
                  <span>days.</span>
                </div>

                <div className="mt-6">
                  <h4 className="font-medium mb-3">Microsoft Word Template</h4>
                  <div className="flex items-center gap-3">
                    <Input
                      type="text"
                      placeholder="Demand for Payoff.DOT"
                      className="flex-1"
                      value={getCategoryTemplates("payoff")[0]?.filename || ""}
                      readOnly
                    />
                    <input
                      type="file"
                      accept=".doc,.docx,.dot"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="payoff-template-upload"
                    />
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById("payoff-template-upload")?.click()}
                    >
                      Browse
                    </Button>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpload("payoff")}
                      disabled={!selectedFile}
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      Upload
                    </Button>
                    {getCategoryTemplates("payoff")[0] && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(getCategoryTemplates("payoff")[0])}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    )}
                  </div>
                </div>

                <Button onClick={handleSavePayoffSettings} className="mt-4">
                  <Save className="h-4 w-4 mr-2" />
                  Save Payoff Settings
                </Button>
              </div>
            </TabsContent>

            {/* Other Tabs - Similar structure */}
            {["insurance", "hud", "arm", "other"].map(category => (
              <TabsContent key={category} value={category} className="space-y-4">
                <div className="space-y-4">
                  <h3 className="font-semibold">{category.toUpperCase()} Notices</h3>
                  <p className="text-sm text-muted-foreground">
                    Use the options below to assign a Microsoft Word template to {category} notices.
                  </p>

                  <div className="mt-6">
                    <h4 className="font-medium mb-3">Microsoft Word Templates</h4>
                    
                    {/* List templates for this category */}
                    {getCategoryTemplates(category).length > 0 ? (
                      <div className="space-y-2">
                        {getCategoryTemplates(category).map(template => (
                          <div key={template.id} className="flex items-center gap-3 p-2 border rounded">
                            <FileText className="h-4 w-4" />
                            <span className="flex-1">{template.filename}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownload(template)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteTemplateMutation.mutate(template.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No templates uploaded yet.</p>
                    )}

                    <div className="flex items-center gap-3 mt-4">
                      <Input
                        type="text"
                        placeholder="Select a file to upload"
                        className="flex-1"
                        value={selectedFile?.name || ""}
                        readOnly
                      />
                      <input
                        type="file"
                        accept=".doc,.docx,.dot"
                        onChange={handleFileSelect}
                        className="hidden"
                        id={`${category}-template-upload`}
                      />
                      <Button
                        variant="outline"
                        onClick={() => document.getElementById(`${category}-template-upload`)?.click()}
                      >
                        Browse
                      </Button>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUpload(category)}
                        disabled={!selectedFile}
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        Upload
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}