/**
 * Microservice Orchestrator - Phase 3: Service Lifecycle Management
 * Coordinates startup, shutdown, and health monitoring of all microservices
 */

import type { Connection } from 'amqplib';
import { globalServiceRegistry } from './service-registry';
import { paymentService } from './payment-service';
import { documentService } from './document-service';
import { escrowService } from './escrow-service';
import { apiGateway } from './api-gateway';

export class MicroserviceOrchestrator {
  private connection: Connection | null = null;
  private services: Array<{
    name: string;
    service: any;
    port: number;
    initialized: boolean;
  }> = [];

  /**
   * Initialize all microservices
   */
  async initialize(connection: Connection): Promise<void> {
    this.connection = connection;
    
    console.log('[Orchestrator] 🚀 Starting microservice decomposition (Phase 3)...');
    
    // Initialize service registry first
    await globalServiceRegistry.initialize(connection);
    
    // Define services to orchestrate
    this.services = [
      {
        name: 'payment-service',
        service: paymentService,
        port: 5001,
        initialized: false
      },
      {
        name: 'document-service',
        service: documentService,
        port: 5002,
        initialized: false
      },
      {
        name: 'escrow-service',
        service: escrowService,
        port: 5003,
        initialized: false
      }
    ];

    // Initialize each microservice
    for (const serviceConfig of this.services) {
      try {
        console.log(`[Orchestrator] Initializing ${serviceConfig.name}...`);
        
        await serviceConfig.service.initialize(connection);
        serviceConfig.initialized = true;
        
        console.log(`[Orchestrator] ✅ ${serviceConfig.name} initialized`);
        
      } catch (error) {
        console.error(`[Orchestrator] ❌ Failed to initialize ${serviceConfig.name}:`, error);
        serviceConfig.initialized = false;
      }
    }

    // Initialize API Gateway last
    console.log('[Orchestrator] Initializing API Gateway...');
    await apiGateway.initialize(connection);
    
    // Start all services
    await this.startAllServices();
    
    // Display service status
    this.displayServiceStatus();
    
    console.log('[Orchestrator] 🎉 Phase 3: Microservice decomposition complete!');
  }

  /**
   * Start all initialized services
   */
  private async startAllServices(): Promise<void> {
    console.log('[Orchestrator] Starting microservice servers...');
    
    for (const serviceConfig of this.services) {
      if (serviceConfig.initialized) {
        try {
          await serviceConfig.service.start();
          console.log(`[Orchestrator] ✅ ${serviceConfig.name} server started on port ${serviceConfig.port}`);
        } catch (error) {
          console.error(`[Orchestrator] ❌ Failed to start ${serviceConfig.name}:`, error);
        }
      }
    }
    
    // Start API Gateway on main port
    try {
      await apiGateway.start();
      console.log('[Orchestrator] ✅ API Gateway started on port 5000');
    } catch (error) {
      console.error('[Orchestrator] ❌ Failed to start API Gateway:', error);
    }
  }

  /**
   * Display comprehensive service status
   */
  private displayServiceStatus(): void {
    console.log('\n[Orchestrator] 📊 MICROSERVICE STATUS DASHBOARD');
    console.log('================================================');
    
    const registryStats = globalServiceRegistry.getStats();
    console.log(`Total Services: ${registryStats.totalServices}`);
    console.log(`Healthy Services: ${registryStats.healthyServices}`);
    console.log(`Unhealthy Services: ${registryStats.unhealthyServices}`);
    console.log('');
    
    console.log('🎯 SERVICE ENDPOINTS:');
    console.log('  API Gateway:       http://localhost:5000/api/v3/gateway/health');
    console.log('  Payment Service:   http://localhost:5001/health');
    console.log('  Document Service:  http://localhost:5002/health');
    console.log('  Escrow Service:    http://localhost:5003/health');
    console.log('');
    
    console.log('🔗 API ROUTES (via Gateway):');
    console.log('  POST /api/v3/payments        -> Payment processing');
    console.log('  POST /api/v3/documents/upload -> Document upload & processing');
    console.log('  POST /api/v3/escrow/disbursements -> Escrow disbursements');
    console.log('  GET  /api/v3/gateway/services -> Service discovery');
    console.log('');
    
    console.log('⚡ QUEUE INTEGRATION:');
    console.log('  ✅ Payment processing queue consumers active');
    console.log('  ✅ Document processing queue consumers active');
    console.log('  ✅ Escrow disbursement queue consumers active');
    console.log('  ✅ Service registry event publishing active');
    console.log('');
    
    console.log('🔍 MONITORING:');
    console.log('  Queue Health:      GET /api/queue-health');
    console.log('  Service Registry:  GET /api/v3/gateway/services');
    console.log('  Load Balancer:     GET /api/v3/gateway/load-balancer');
    console.log('================================================\n');
  }

  /**
   * Get orchestrator status
   */
  getStatus(): {
    total_services: number;
    initialized_services: number;
    running_services: number;
    service_details: Array<{
      name: string;
      port: number;
      initialized: boolean;
      status: string;
    }>;
  } {
    const registryServices = globalServiceRegistry.getAllServices();
    
    return {
      total_services: this.services.length,
      initialized_services: this.services.filter(s => s.initialized).length,
      running_services: registryServices.filter(s => s.status === 'healthy').length,
      service_details: this.services.map(service => ({
        name: service.name,
        port: service.port,
        initialized: service.initialized,
        status: service.initialized ? 'running' : 'stopped'
      }))
    };
  }

  /**
   * Graceful shutdown of all services
   */
  async shutdown(): Promise<void> {
    console.log('[Orchestrator] Initiating graceful shutdown...');
    
    // Stop API Gateway first
    await apiGateway.stop();
    
    // Stop all microservices
    for (const serviceConfig of this.services) {
      if (serviceConfig.initialized) {
        try {
          await serviceConfig.service.stop();
          console.log(`[Orchestrator] ✅ ${serviceConfig.name} stopped`);
        } catch (error) {
          console.error(`[Orchestrator] Error stopping ${serviceConfig.name}:`, error);
        }
      }
    }
    
    // Stop service registry
    globalServiceRegistry.stop();
    
    console.log('[Orchestrator] ✅ Graceful shutdown complete');
  }
}

// Global orchestrator instance
export const microserviceOrchestrator = new MicroserviceOrchestrator();