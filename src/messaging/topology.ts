// Re-export everything AND provide an 'mq' bag so old imports work.
import * as Topology from '../queues/topology';
export * from '../queues/topology';
export const mq = Topology;