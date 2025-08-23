import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Mail, Bell } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import SecuritySettings from "@/components/settings/SecuritySettings";
import MfaSettings from "@/components/settings/MfaSettings";
import EmailTemplatesSettings from "@/components/settings/EmailTemplatesSettings";
import AutoNoticeSettings from "@/components/settings/AutoNoticeSettings";

export default function Settings() {
  const [activeTab, setActiveTab] = useState("security");

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <div className="space-y-6">
            <div className="mb-6">
              <h1 className="text-3xl font-bold">Settings</h1>
              <p className="text-muted-foreground">Manage system settings and configurations</p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="mfa" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            MFA
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="auto-notice" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notices
          </TabsTrigger>
        </TabsList>

        <TabsContent value="security" className="space-y-4">
          <SecuritySettings />
        </TabsContent>

        <TabsContent value="mfa" className="space-y-4">
          <MfaSettings />
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <EmailTemplatesSettings />
        </TabsContent>

            <TabsContent value="auto-notice" className="space-y-4">
              <AutoNoticeSettings />
            </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
}