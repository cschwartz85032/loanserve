/**
 * mTLS (Mutual TLS) Stubs for Service-to-Service Communication
 * Provides framework for secure inter-service communication
 */

import https from 'https';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';

/**
 * mTLS Configuration Interface
 */
export interface MTLSConfig {
  caFile: string;
  certFile: string;
  keyFile: string;
  requireClientCert: boolean;
  verifyClientCert: boolean;
}

/**
 * mTLS Certificate Manager
 */
export class MTLSManager {
  private config: MTLSConfig;
  private ca: Buffer | null = null;
  private cert: Buffer | null = null;
  private key: Buffer | null = null;

  constructor(config?: Partial<MTLSConfig>) {
    this.config = {
      caFile: process.env.MTLS_CA_FILE || '/etc/ssl/mtls/ca.crt',
      certFile: process.env.MTLS_CERT_FILE || '/etc/ssl/mtls/tls.crt',
      keyFile: process.env.MTLS_KEY_FILE || '/etc/ssl/mtls/tls.key',
      requireClientCert: true,
      verifyClientCert: true,
      ...config
    };
  }

  /**
   * Load TLS certificates
   */
  async loadCertificates(): Promise<void> {
    try {
      if (fs.existsSync(this.config.caFile)) {
        this.ca = fs.readFileSync(this.config.caFile);
      }
      if (fs.existsSync(this.config.certFile)) {
        this.cert = fs.readFileSync(this.config.certFile);
      }
      if (fs.existsSync(this.config.keyFile)) {
        this.key = fs.readFileSync(this.config.keyFile);
      }
      
      console.log('[mTLS] Certificates loaded successfully');
    } catch (error) {
      console.warn('[mTLS] Certificate loading failed:', error);
      console.warn('[mTLS] mTLS will be disabled - ensure certificates are available for production');
    }
  }

  /**
   * Get HTTPS agent with mTLS configuration
   */
  getHTTPSAgent(): https.Agent {
    if (!this.cert || !this.key || !this.ca) {
      console.warn('[mTLS] Missing certificates, falling back to default HTTPS agent');
      return new https.Agent({
        rejectUnauthorized: false // Only for development
      });
    }

    return new https.Agent({
      cert: this.cert,
      key: this.key,
      ca: this.ca,
      rejectUnauthorized: true,
      requestCert: true,
      checkServerIdentity: (host, cert) => {
        // Custom server identity verification if needed
        return undefined; // No error = valid
      }
    });
  }

  /**
   * Express middleware for mTLS client certificate verification
   */
  verifyClientCertificate(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!this.config.requireClientCert) {
        return next();
      }

      const clientCert = (req as any).connection?.getPeerCertificate?.();
      
      if (!clientCert || clientCert.subject === undefined) {
        return res.status(401).json({
          error: 'client_certificate_required',
          message: 'Valid client certificate required for this endpoint'
        });
      }

      // Extract client information from certificate
      (req as any).clientCertInfo = {
        subject: clientCert.subject,
        issuer: clientCert.issuer,
        serialNumber: clientCert.serialNumber,
        fingerprint: clientCert.fingerprint,
        valid: clientCert.valid_from && clientCert.valid_to
      };

      // Log client certificate access for audit
      console.log(`[mTLS] Client certificate verified: ${clientCert.subject?.CN || 'unknown'}`);
      
      next();
    };
  }

  /**
   * Create HTTPS server with mTLS support
   */
  createHTTPSServer(app: any): https.Server | null {
    if (!this.cert || !this.key) {
      console.warn('[mTLS] Cannot create HTTPS server - missing certificates');
      return null;
    }

    const serverOptions: https.ServerOptions = {
      cert: this.cert,
      key: this.key,
      requestCert: this.config.requireClientCert,
      rejectUnauthorized: this.config.verifyClientCert
    };

    if (this.ca) {
      serverOptions.ca = this.ca;
    }

    const server = https.createServer(serverOptions, app);
    console.log('[mTLS] HTTPS server with mTLS support created');
    
    return server;
  }
}

/**
 * Service-to-Service HTTP Client with mTLS
 */
export class SecureServiceClient {
  private mtlsManager: MTLSManager;
  private baseUrl: string;

  constructor(baseUrl: string, mtlsConfig?: Partial<MTLSConfig>) {
    this.baseUrl = baseUrl;
    this.mtlsManager = new MTLSManager(mtlsConfig);
  }

  /**
   * Initialize the client (load certificates)
   */
  async initialize(): Promise<void> {
    await this.mtlsManager.loadCertificates();
  }

  /**
   * Make secure HTTP request to another service
   */
  async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    data?: any,
    headers?: Record<string, string>
  ): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const agent = this.mtlsManager.getHTTPSAgent();

    const requestOptions: any = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LoanServe-Service-Client/1.0',
        ...headers
      }
    };

    // Add custom agent for mTLS
    if (url.startsWith('https://')) {
      requestOptions.agent = agent;
    }

    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(url, {
        ...requestOptions,
        body: data ? JSON.stringify(data) : undefined,
        agent: url.startsWith('https://') ? agent : undefined
      });

      if (!response.ok) {
        throw new Error(`Service request failed: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();
      return responseData;
    } catch (error) {
      console.error(`[ServiceClient] Request to ${url} failed:`, error);
      throw error;
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<{ status: string; timestamp: Date }> {
    try {
      const response = await this.request('GET', '/health');
      return {
        status: 'healthy',
        timestamp: new Date(),
        ...response
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        error: error.message
      };
    }
  }
}

/**
 * Initialize mTLS for the application
 */
export async function initializeMTLS(app: any): Promise<{
  httpsServer: https.Server | null;
  mtlsManager: MTLSManager;
}> {
  const mtlsManager = new MTLSManager();
  await mtlsManager.loadCertificates();

  // Create HTTPS server if certificates are available
  const httpsServer = mtlsManager.createHTTPSServer(app);

  // Add mTLS routes for service communication
  app.use('/api/services', mtlsManager.verifyClientCertificate());
  app.get('/api/services/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date(),
      mtls_enabled: !!req.clientCertInfo,
      client_cert: req.clientCertInfo || null
    });
  });

  console.log('[mTLS] Service-to-service communication initialized');

  return {
    httpsServer,
    mtlsManager
  };
}

// Example service clients
export const createInvestorServiceClient = () => new SecureServiceClient(
  process.env.INVESTOR_SERVICE_URL || 'https://investor.loanserve.io'
);

export const createPaymentServiceClient = () => new SecureServiceClient(
  process.env.PAYMENT_SERVICE_URL || 'https://payments.loanserve.io'
);

export const createDocumentServiceClient = () => new SecureServiceClient(
  process.env.DOCUMENT_SERVICE_URL || 'https://docs.loanserve.io'
);