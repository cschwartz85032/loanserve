output "cloudamqp_url" {
  value       = cloudamqp_instance.rmq.url
  sensitive   = true
  description = "CloudAMQP connection URL"
}

output "cloudamqp_console_url" {
  value       = cloudamqp_instance.rmq.console_url
  description = "CloudAMQP management console URL"
}

output "cloudamqp_instance_id" {
  value       = cloudamqp_instance.rmq.id
  description = "CloudAMQP instance ID"
}