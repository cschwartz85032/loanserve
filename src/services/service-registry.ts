/**
 * Service Registry - Phase 3: Microservice Discovery and Health Management
 * Manages service instances, health checks, and load balancing for decomposed services
 */

import type { Connection } from 'amqplib';
import { createEnvelope } from '../messaging/envelope-helpers';
import { Exchanges } from '../queues/topology';
import { ulid } from 'ulid';

export interface ServiceInstance {
  serviceId: string;
  serviceName: string;
  version: string;
  host: string;
  port: number;
  healthEndpoint: string;
  status: 'healthy' | 'unhealthy' | 'starting' | 'stopping';
  lastHealthCheck: string;
  registeredAt: string;
  metadata: {
    capabilities: string[];
    environment: string;
    instanceId: string;
    processId: string;
  };
}

export interface ServiceDefinition {
  name: string;
  version: string;
  port: number;
  healthEndpoint: string;
  capabilities: string[];
  dependencies: string[];
  queueBindings: {
    consumes: string[];
    publishes: string[];
  };
}

export class ServiceRegistry {
  private services: Map<string, ServiceInstance> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private connection: Connection | null = null;

  /**
   * Initialize service registry
   */
  async initialize(connection: Connection): Promise<void> {
    this.connection = connection;
    console.log('[Service Registry] Initializing microservice registry...');
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    console.log('[Service Registry] ✅ Service registry initialized');
  }

  /**
   * Register a microservice instance
   */
  async registerService(definition: ServiceDefinition): Promise<ServiceInstance> {
    const serviceId = ulid();
    const instance: ServiceInstance = {
      serviceId,
      serviceName: definition.name,
      version: definition.version,
      host: 'localhost', // In production, this would be the actual host
      port: definition.port,
      healthEndpoint: definition.healthEndpoint,
      status: 'starting',
      lastHealthCheck: new Date().toISOString(),
      registeredAt: new Date().toISOString(),
      metadata: {
        capabilities: definition.capabilities,
        environment: process.env.NODE_ENV || 'development',
        instanceId: serviceId,
        processId: process.pid.toString()
      }
    };

    this.services.set(serviceId, instance);
    
    console.log(`[Service Registry] Registered service: ${definition.name}@${definition.version}`, {
      serviceId,
      port: definition.port,
      capabilities: definition.capabilities
    });

    // Publish service registration event
    if (this.connection) {
      const registrationEvent = createEnvelope({
        tenantId: 'system',
        correlationId: ulid(),
        payload: {
          eventType: 'service.registered',
          service_id: serviceId,
          service_name: definition.name,
          version: definition.version,
          host: instance.host,
          port: instance.port,
          capabilities: definition.capabilities,
          registered_at: instance.registeredAt
        }
      });

      const channel = await this.connection.createConfirmChannel();
      await channel.publish(Exchanges.Events, 'service.registered', Buffer.from(JSON.stringify(registrationEvent)));
      await channel.close();
    }

    return instance;
  }

  /**
   * Deregister a service instance
   */
  async deregisterService(serviceId: string): Promise<void> {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    service.status = 'stopping';
    this.services.delete(serviceId);

    console.log(`[Service Registry] Deregistered service: ${service.serviceName}`, {
      serviceId,
      serviceName: service.serviceName
    });

    // Publish service deregistration event
    if (this.connection) {
      const deregistrationEvent = createEnvelope({
        tenantId: 'system',
        correlationId: ulid(),
        payload: {
          eventType: 'service.deregistered',
          service_id: serviceId,
          service_name: service.serviceName,
          deregistered_at: new Date().toISOString()
        }
      });

      const channel = await this.connection.createConfirmChannel();
      await channel.publish(Exchanges.Events, 'service.deregistered', Buffer.from(JSON.stringify(deregistrationEvent)));
      await channel.close();
    }
  }

  /**
   * Get all healthy instances of a service
   */
  getHealthyInstances(serviceName: string): ServiceInstance[] {
    return Array.from(this.services.values())
      .filter(service => 
        service.serviceName === serviceName && 
        service.status === 'healthy'
      );
  }

  /**
   * Get service instance by capability
   */
  getServicesByCapability(capability: string): ServiceInstance[] {
    return Array.from(this.services.values())
      .filter(service => 
        service.metadata.capabilities.includes(capability) &&
        service.status === 'healthy'
      );
  }

  /**
   * Get all registered services
   */
  getAllServices(): ServiceInstance[] {
    return Array.from(this.services.values());
  }

  /**
   * Update service health status
   */
  updateServiceHealth(serviceId: string, status: 'healthy' | 'unhealthy'): void {
    const service = this.services.get(serviceId);
    if (service) {
      service.status = status;
      service.lastHealthCheck = new Date().toISOString();
    }
  }

  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Check service health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 30000);
  }

  /**
   * Perform health checks on all registered services
   */
  private async performHealthChecks(): Promise<void> {
    const services = Array.from(this.services.values());
    
    for (const service of services) {
      try {
        // In a real implementation, this would make HTTP calls to health endpoints
        // For now, we'll simulate health checks
        const isHealthy = Math.random() > 0.1; // 90% success rate simulation
        
        this.updateServiceHealth(service.serviceId, isHealthy ? 'healthy' : 'unhealthy');
        
        if (!isHealthy) {
          console.warn(`[Service Registry] Health check failed for ${service.serviceName}:${service.serviceId}`);
        }
        
      } catch (error) {
        console.error(`[Service Registry] Health check error for ${service.serviceName}:`, error);
        this.updateServiceHealth(service.serviceId, 'unhealthy');
      }
    }
  }

  /**
   * Get service registry statistics
   */
  getStats(): {
    totalServices: number;
    healthyServices: number;
    unhealthyServices: number;
    servicesByName: { [key: string]: number };
  } {
    const services = Array.from(this.services.values());
    const servicesByName: { [key: string]: number } = {};

    services.forEach(service => {
      servicesByName[service.serviceName] = (servicesByName[service.serviceName] || 0) + 1;
    });

    return {
      totalServices: services.length,
      healthyServices: services.filter(s => s.status === 'healthy').length,
      unhealthyServices: services.filter(s => s.status === 'unhealthy').length,
      servicesByName
    };
  }

  /**
   * Stop monitoring and cleanup
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    this.services.clear();
    console.log('[Service Registry] Service registry stopped');
  }
}

// Global service registry instance
export const globalServiceRegistry = new ServiceRegistry();