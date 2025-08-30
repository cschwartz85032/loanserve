import client from 'prom-client';

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const mqPublishTotal = new client.Counter({ 
  name: 'mq_publish_total', 
  help: 'Messages published', 
  labelNames: ['exchange','routing_key'] 
});

export const mqConsumeTotal = new client.Counter({ 
  name: 'mq_consume_total', 
  help: 'Messages consumed', 
  labelNames: ['queue'] 
});

register.registerMetric(mqPublishTotal);
register.registerMetric(mqConsumeTotal);