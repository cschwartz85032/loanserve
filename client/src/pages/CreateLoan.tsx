import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Download,
  Eye,
  PlayCircle
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type ImportType = "mismo" | "csv" | "json" | "pdf" | "api";
type ImportStatus = "received" | "validating" | "errors" | "accepted" | "ingested" | "failed";

interface ImportRecord {
  id: string;
  status: ImportStatus;
  error_count: number;
  created_at: string;
  errors?: Array<{
    code: string;
    severity: "fatal" | "error" | "warning" | "info";
    pointer?: string;
    message: string;
    raw_fragment?: any;
  }>;
  mapping_preview?: {
    canonical: Array<{
      key: string;
      value: string;
      normalized_value: string;
      evidence: {
        source_pointer: string;
        evidence_hash: string;
      };
      confidence: number;
      autofilled_from: "document" | "vendor" | "user" | "payload";
    }>;
  };
}

export default function CreateLoan() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importType, setImportType] = useState<ImportType>("csv");
  const [programHint, setProgramHint] = useState("");
  const [investorTemplate, setInvestorTemplate] = useState("");
  const [currentImportId, setCurrentImportId] = useState<string | null>(null);
  
  const queryClient = useQueryClient();

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (data: { file: File; type: ImportType; program_hint?: string; investor_template?: string }) => {
      const formData = new FormData();
      formData.append("file", data.file);
      formData.append("type", data.type);
      if (data.program_hint) formData.append("program_hint", data.program_hint);
      if (data.investor_template) formData.append("investor_template", data.investor_template);

      const response = await fetch("/api/imports", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const result = await response.json();
      return result;
    },
    onSuccess: (data) => {
      setCurrentImportId(data.id);
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/imports", data.id] });
    },
  });

  // Import status query
  const { data: importData, isLoading: isImportLoading, error: importError } = useQuery({
    queryKey: ["/api/imports", currentImportId],
    enabled: !!currentImportId,
    refetchInterval: (data) => {
      // Auto-refresh if status is processing
      if (data?.status && ["received", "validating"].includes(data.status)) {
        return 2000; // Poll every 2 seconds
      }
      return false; // Stop polling
    },
  });

  // Ingest mutation
  const ingestMutation = useMutation({
    mutationFn: async (importId: string) => {
      return apiRequest(`/api/imports/${importId}/ingest`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/imports", currentImportId] });
    },
  });

  // CSV template download query
  const { data: csvTemplate } = useQuery({
    queryKey: ["/api/imports/specs/csv"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setSelectedFile(file);
      
      // Auto-detect import type based on file extension
      const extension = file.name.toLowerCase().split('.').pop();
      switch (extension) {
        case 'xml':
          setImportType("mismo");
          break;
        case 'csv':
          setImportType("csv");
          break;
        case 'json':
          setImportType("json");
          break;
        case 'pdf':
          setImportType("pdf");
          break;
        default:
          setImportType("csv");
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/json': ['.json'],
      'text/xml': ['.xml'],
      'application/xml': ['.xml'],
      'application/pdf': ['.pdf'],
    },
    maxSize: 200 * 1024 * 1024, // 200MB
    multiple: false,
  });

  const handleUpload = () => {
    if (!selectedFile) return;

    uploadMutation.mutate({
      file: selectedFile,
      type: importType,
      program_hint: programHint || undefined,
      investor_template: investorTemplate || undefined,
    });
  };

  const handleIngest = () => {
    if (!currentImportId) return;
    ingestMutation.mutate(currentImportId);
  };

  const getStatusColor = (status: ImportStatus) => {
    switch (status) {
      case "received":
      case "validating":
        return "bg-blue-500";
      case "accepted":
        return "bg-green-500";
      case "errors":
        return "bg-yellow-500";
      case "failed":
        return "bg-red-500";
      case "ingested":
        return "bg-green-600";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusIcon = (status: ImportStatus) => {
    switch (status) {
      case "received":
      case "validating":
        return <Clock className="w-4 h-4" />;
      case "accepted":
      case "ingested":
        return <CheckCircle2 className="w-4 h-4" />;
      case "errors":
      case "failed":
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const downloadCsvTemplate = () => {
    const csvContent = [
      "LoanNumber,InvestorLoanId,LenderLoanId,BorrowerFirstName,BorrowerLastName",
      "PropertyStreet,PropertyCity,PropertyState,PropertyZip",
      "OriginalLoanAmount,InterestRate,RateType,PaymentType,AmortTermMonths",
      "FirstPaymentDate,MaturityDate,PnIAmount",
      "EscrowRequired,TaxEscrowMonthly,InsuranceEscrowMonthly",
      "HOICarrier,HOIPolicyNumber,HOIPhone,HOIEmail,HOIEffectiveDate,HOIExpirationDate",
      "FloodZone,FloodInsRequired,TitleCompanyName,TitleFileNumber",
      "AppraisedValue,AppraisalDate,OccupancyType,LoanPurpose,LTV,CLTV"
    ].join(",") + "\n";

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'loan_import_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl" data-testid="page-create-loan">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Import Loans</h1>
        <p className="text-gray-600">
          Upload loan data via MISMO 3.4 XML, CSV, JSON, or PDF formats. Files are validated and mapped to canonical format with full audit trails.
        </p>
      </div>

      <Tabs defaultValue="upload" className="space-y-6">
        <TabsList data-testid="tabs-main">
          <TabsTrigger value="upload" data-testid="tab-upload">Upload & Import</TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">Templates & Specs</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          {!currentImportId ? (
            // Upload Section
            <Card data-testid="card-upload">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Upload Loan Data
                </CardTitle>
                <CardDescription>
                  Upload MISMO 3.4 XML, CSV, JSON, or PDF files (max 200MB)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* File Upload Area */}
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                  data-testid="dropzone-upload"
                >
                  <input {...getInputProps()} />
                  <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  {selectedFile ? (
                    <div>
                      <p className="text-lg font-medium text-gray-900" data-testid="text-selected-file">
                        {selectedFile.name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-lg font-medium text-gray-900">
                        {isDragActive ? "Drop the file here" : "Drop file here or click to browse"}
                      </p>
                      <p className="text-sm text-gray-500">
                        Supports MISMO XML, CSV, JSON, and PDF files
                      </p>
                    </div>
                  )}
                </div>

                {selectedFile && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Import Type */}
                    <div className="space-y-2">
                      <Label htmlFor="import-type">Import Type</Label>
                      <Select value={importType} onValueChange={(value) => setImportType(value as ImportType)}>
                        <SelectTrigger data-testid="select-import-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mismo">MISMO 3.4 XML</SelectItem>
                          <SelectItem value="csv">CSV Bulk Import</SelectItem>
                          <SelectItem value="json">JSON Format</SelectItem>
                          <SelectItem value="pdf">PDF Documents</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Program Hint */}
                    <div className="space-y-2">
                      <Label htmlFor="program-hint">Program Hint (Optional)</Label>
                      <Input
                        id="program-hint"
                        placeholder="e.g., FNMA, FRE, Portfolio"
                        value={programHint}
                        onChange={(e) => setProgramHint(e.target.value)}
                        data-testid="input-program-hint"
                      />
                    </div>

                    {/* Investor Template */}
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="investor-template">Investor Template (Optional)</Label>
                      <Input
                        id="investor-template"
                        placeholder="Investor-specific template identifier"
                        value={investorTemplate}
                        onChange={(e) => setInvestorTemplate(e.target.value)}
                        data-testid="input-investor-template"
                      />
                    </div>
                  </div>
                )}

                {selectedFile && (
                  <div className="flex justify-end">
                    <Button
                      onClick={handleUpload}
                      disabled={uploadMutation.isPending}
                      data-testid="button-upload"
                    >
                      {uploadMutation.isPending ? "Uploading..." : "Start Import"}
                    </Button>
                  </div>
                )}

                {uploadMutation.error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Upload Error</AlertTitle>
                    <AlertDescription>
                      {uploadMutation.error.message}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          ) : (
            // Import Status Section
            <div className="space-y-6">
              <Card data-testid="card-import-status">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Import Status
                  </CardTitle>
                  <CardDescription>
                    Import ID: {currentImportId}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isImportLoading ? (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 animate-spin" />
                      <span>Loading import status...</span>
                    </div>
                  ) : importData ? (
                    <div className="space-y-4">
                      {/* Status Badge */}
                      <div className="flex items-center gap-2">
                        <Badge className={`${getStatusColor(importData.status)} text-white`}>
                          {getStatusIcon(importData.status)}
                          <span className="ml-1 capitalize">{importData.status}</span>
                        </Badge>
                        {importData.error_count > 0 && (
                          <Badge variant="destructive">
                            {importData.error_count} errors
                          </Badge>
                        )}
                      </div>

                      {/* Progress Bar */}
                      {["received", "validating"].includes(importData.status) && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Processing...</span>
                            <span>Please wait</span>
                          </div>
                          <Progress value={importData.status === "received" ? 25 : 75} className="w-full" />
                        </div>
                      )}

                      {/* Errors Section */}
                      {importData.errors && importData.errors.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-medium text-red-700">Validation Errors</h4>
                          <ScrollArea className="h-48 border rounded p-2">
                            {importData.errors.map((error, index) => (
                              <Alert key={index} variant={error.severity === "fatal" ? "destructive" : "default"} className="mb-2">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle className="flex items-center gap-2">
                                  <Badge variant="outline">{error.severity}</Badge>
                                  {error.code}
                                </AlertTitle>
                                <AlertDescription>
                                  {error.pointer && <div className="text-xs text-gray-500 mb-1">Location: {error.pointer}</div>}
                                  {error.message}
                                </AlertDescription>
                              </Alert>
                            ))}
                          </ScrollArea>
                        </div>
                      )}

                      {/* Mapping Preview */}
                      {importData.mapping_preview && (
                        <div className="space-y-2">
                          <h4 className="font-medium text-green-700">Mapped Fields Preview</h4>
                          <ScrollArea className="h-64 border rounded">
                            <div className="p-4 space-y-2">
                              {importData.mapping_preview.canonical.slice(0, 20).map((field, index) => (
                                <div key={index} className="flex justify-between items-center py-2 border-b last:border-b-0">
                                  <div className="flex-1">
                                    <div className="font-medium text-sm">{field.key}</div>
                                    <div className="text-xs text-gray-500">{field.evidence.source_pointer}</div>
                                  </div>
                                  <div className="flex-1 px-4">
                                    <div className="text-sm">{field.normalized_value || field.value}</div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">
                                      {Math.round(field.confidence * 100)}%
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs">
                                      {field.autofilled_from}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                              {importData.mapping_preview.canonical.length > 20 && (
                                <div className="text-center text-sm text-gray-500 py-2">
                                  ... and {importData.mapping_preview.canonical.length - 20} more fields
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        {["accepted", "mapped"].includes(importData.status) && (
                          <Button
                            onClick={handleIngest}
                            disabled={ingestMutation.isPending}
                            data-testid="button-ingest"
                          >
                            <PlayCircle className="w-4 h-4 mr-2" />
                            {ingestMutation.isPending ? "Creating Loan..." : "Create Loan Candidate"}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          onClick={() => {
                            setCurrentImportId(null);
                            setSelectedFile(null);
                          }}
                          data-testid="button-new-import"
                        >
                          Start New Import
                        </Button>
                      </div>

                      {ingestMutation.error && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Ingestion Error</AlertTitle>
                          <AlertDescription>
                            {ingestMutation.error.message}
                          </AlertDescription>
                        </Alert>
                      )}

                      {ingestMutation.isSuccess && (
                        <Alert>
                          <CheckCircle2 className="h-4 w-4" />
                          <AlertTitle>Success!</AlertTitle>
                          <AlertDescription>
                            Loan candidate created successfully. The loan is now available for review and processing.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  ) : importError ? (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>
                        Failed to load import status: {importError.message}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* CSV Template */}
            <Card data-testid="card-csv-template">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  CSV Template
                </CardTitle>
                <CardDescription>
                  Download the standard CSV template for bulk loan imports
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    <p className="mb-2">Required fields include:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>LoanNumber, BorrowerFirstName, BorrowerLastName</li>
                      <li>PropertyStreet, PropertyCity, PropertyState, PropertyZip</li>
                      <li>OriginalLoanAmount, InterestRate, RateType</li>
                      <li>AmortTermMonths, FirstPaymentDate, MaturityDate</li>
                    </ul>
                  </div>
                  <Button onClick={downloadCsvTemplate} className="w-full" data-testid="button-download-csv">
                    <Download className="w-4 h-4 mr-2" />
                    Download CSV Template
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* MISMO Specification */}
            <Card data-testid="card-mismo-spec">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  MISMO 3.4 XML
                </CardTitle>
                <CardDescription>
                  Mortgage Industry Standards Maintenance Organization format
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    <p className="mb-2">Supported MISMO 3.4 variants:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>UCD (Uniform Closing Dataset)</li>
                      <li>ULDD (Uniform Loan Delivery Dataset)</li>
                      <li>Full MISMO 3.4 specification</li>
                    </ul>
                  </div>
                  <div className="p-3 bg-gray-50 rounded text-xs font-mono">
                    Sample structure:<br />
                    &lt;MORTGAGE&gt;<br />
                    &nbsp;&nbsp;&lt;LOAN_DETAIL&gt;<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;&lt;NoteRatePercent&gt;7.125&lt;/NoteRatePercent&gt;<br />
                    &nbsp;&nbsp;&lt;/LOAN_DETAIL&gt;<br />
                    &lt;/MORTGAGE&gt;
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* JSON Format */}
            <Card data-testid="card-json-format" className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  JSON Format Specification
                </CardTitle>
                <CardDescription>
                  Structured JSON format for programmatic imports
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Required Structure:</h4>
                    <div className="p-3 bg-gray-50 rounded text-xs font-mono overflow-x-auto">
{`{
  "loanNumber": "string",
  "borrowers": [
    {
      "firstName": "string",
      "lastName": "string",
      "email": "email@domain.com"
    }
  ],
  "collateral": {
    "address": {
      "street": "string",
      "city": "string", 
      "state": "XX",
      "zip": "12345"
    }
  },
  "loanTerms": {
    "originalAmount": 450000,
    "interestRate": 7.125,
    "rateType": "Fixed",
    "amortTermMonths": 360,
    "firstPaymentDate": "2024-02-01",
    "maturityDate": "2054-01-01"
  }
}`}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Validation Rules:</h4>
                    <ul className="list-disc list-inside space-y-1 text-xs text-gray-600">
                      <li>Dates: YYYY-MM-DD format</li>
                      <li>Currency: decimal (2 places)</li>
                      <li>Percentages: decimal (e.g., 7.125)</li>
                      <li>State: 2-letter USPS codes</li>
                      <li>ZIP: 5-digit or ZIP+4 format</li>
                      <li>Booleans: true|false</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}