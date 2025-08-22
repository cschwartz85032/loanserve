import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Mail, Bell } from "lucide-react";
import SecuritySettings from "@/components/settings/SecuritySettings";
import EmailTemplatesSettings from "@/components/settings/EmailTemplatesSettings";
import AutoNoticeSettings from "@/components/settings/AutoNoticeSettings";

export default function Settings() {
  const [activeTab, setActiveTab] = useState("security");

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage system settings and configurations</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="auto-notice" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Auto Notice
          </TabsTrigger>
        </TabsList>

        <TabsContent value="security" className="space-y-4">
          <SecuritySettings />
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <EmailTemplatesSettings />
        </TabsContent>

        <TabsContent value="auto-notice" className="space-y-4">
          <AutoNoticeSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}