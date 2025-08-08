import { Sidebar } from "@/components/layout/sidebar";
import { DocumentManager } from "@/components/documents/document-manager";

export default function Documents() {
  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Document Management</h1>
              <p className="text-sm text-slate-600">Upload, organize, and manage loan documents</p>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6">
          <DocumentManager />
        </div>
      </main>
    </div>
  );
}
