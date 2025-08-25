import pino from "pino";
import { AsyncLocalStorage } from "node:async_hooks";

export const correlationStore = new AsyncLocalStorage<{ correlationId: string }>();

export function getLogger(level: string, pretty: boolean) {
  return pino({
    level,
    transport: pretty ? { target: "pino-pretty", options: { colorize: true } } : undefined,
    base: undefined, // do not inject pid and hostname automatically
    timestamp: pino.stdTimeFunctions.isoTime
  });
}

export function withCorrelation<T>(cid: string, fn: () => Promise<T>) {
  return correlationStore.run({ correlationId: cid }, fn);
}

export function currentCorrelationId(): string | undefined {
  return correlationStore.getStore()?.correlationId;
}