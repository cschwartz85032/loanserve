import { loadConfig } from "../bootstrap/config";
import { RabbitService } from "./rabbit";
export const cfg = loadConfig();

// DISABLED: RabbitService temporarily disabled during RabbitMQ migration
// This service creates 2 persistent connections that consume CloudAMQP connection limit
// export const rabbit = new RabbitService(cfg);

// Placeholder that throws error if used during migration
export const rabbit = {
  connect: () => { throw new Error('RabbitService disabled during migration - use unified client'); },
  shutdown: () => Promise.resolve(),
  publish: () => { throw new Error('RabbitService disabled during migration - use unified client'); },
  consume: () => { throw new Error('RabbitService disabled during migration - use unified client'); }
};