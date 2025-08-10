import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, Loader2, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

// Configure PDF.js worker - use CDN version that works with modules
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PDFViewerProps {
  fileUrl: string;
  fileName: string;
}

export default function PDFViewer({ fileUrl, fileName }: PDFViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(0.8);
  const [rotation, setRotation] = useState(0);
  const [allPages, setAllPages] = useState<any[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load PDF document
  useEffect(() => {
    const loadPDF = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        console.log('Loading PDF from:', fileUrl);
        const loadingTask = pdfjsLib.getDocument(fileUrl);
        
        loadingTask.promise.then(
          async (pdfDoc) => {
            console.log('PDF loaded successfully, pages:', pdfDoc.numPages);
            setPdf(pdfDoc);
            setNumPages(pdfDoc.numPages);
            
            // Load all pages for continuous mode
            const pages = [];
            for (let i = 1; i <= pdfDoc.numPages; i++) {
              const page = await pdfDoc.getPage(i);
              pages.push(page);
            }
            setAllPages(pages);
            
            setIsLoading(false);
          },
          (reason) => {
            console.error('Error loading PDF:', reason);
            setError('Failed to load PDF document');
            setIsLoading(false);
          }
        );
      } catch (err) {
        console.error('Error in loadPDF:', err);
        setError('Failed to initialize PDF viewer');
        setIsLoading(false);
      }
    };

    loadPDF();
  }, [fileUrl]);

  // Render all PDF pages in continuous mode
  useEffect(() => {
    if (!pdf || allPages.length === 0) return;
    
    const renderAllPages = async () => {
      try {
        for (let i = 0; i < allPages.length; i++) {
          const page = allPages[i];
          const canvas = document.getElementById(`pdf-canvas-${i}`) as HTMLCanvasElement;
          if (!canvas) continue;
          
          const context = canvas.getContext('2d');
          if (!context) continue;
          
          const viewport = page.getViewport({ scale, rotation });
          
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          };
          
          await page.render(renderContext).promise;
        }
        console.log(`Rendered all ${numPages} pages in continuous mode`);
      } catch (err) {
        console.error('Error rendering pages:', err);
      }
    };

    renderAllPages();
  }, [pdf, scale, rotation, allPages, numPages]);

  const zoomIn = () => {
    if (scale < 3) setScale(scale + 0.25);
  };

  const zoomOut = () => {
    if (scale > 0.5) setScale(scale - 0.25);
  };

  const rotate = () => {
    setRotation((rotation + 90) % 360);
  };

  const resetView = () => {
    setScale(0.8);
    setRotation(0);
  };

  const handleDownload = () => {
    window.open(fileUrl, '_blank');
  };

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-900 border rounded-lg shadow-sm p-6">
        <div className="text-center text-red-600">
          <FileText className="h-12 w-12 mx-auto mb-3" />
          <p className="font-medium">{error}</p>
          <Button onClick={handleDownload} className="mt-4">
            Download PDF Instead
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 border rounded-lg shadow-sm overflow-hidden">
      {/* PDF Viewer Header */}
      <div className="flex items-center justify-between p-3 border-b bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-medium text-sm truncate" title={fileName}>{fileName}</span>
        </div>

        {/* PDF Controls */}
        <div className="flex items-center gap-1">
          {pdf && (
            <>
              <Button variant="ghost" size="sm" onClick={zoomOut} disabled={scale <= 0.5}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-xs px-2">{Math.round(scale * 100)}%</span>
              <Button variant="ghost" size="sm" onClick={zoomIn} disabled={scale >= 3}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={rotate}>
                <RotateCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={resetView}>
                Reset
              </Button>
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            </>
          )}
          <Button variant="ghost" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Content */}
      <div>
        {isLoading ? (
          <div className="flex items-center justify-center h-[600px]">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
              <p className="text-sm text-gray-600">Loading PDF document...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Canvas for PDF rendering - Always continuous mode */}
            <div className="relative">
              <div ref={containerRef} className="overflow-auto max-h-[600px] bg-gray-100 dark:bg-gray-800" style={{ overflowX: 'auto' }}>
                <div className="p-4 space-y-4">
                  {allPages.map((_, index) => (
                    <div key={index} className="flex justify-center">
                      <canvas 
                        id={`pdf-canvas-${index}`}
                        className="shadow-lg border border-gray-300 dark:border-gray-600 bg-white"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}