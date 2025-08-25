terraform {
  required_version = ">= 1.6.0"
  required_providers {
    cloudamqp = { source = "cloudamqp/cloudamqp", version = "~> 1.28" }
  }
}

provider "cloudamqp" {
  # token via CLOUDAMQP_APIKEY env var in CI
}

variable "instance_name" { type = string }
variable "plan" { type = string }            # e.g. "bunny-1"
variable "region" { type = string }          # e.g. "amazon-web-services::us-west-2"

resource "cloudamqp_instance" "rmq" {
  name   = var.instance_name
  plan   = var.plan
  region = var.region
  tags   = ["servicing","loanserve-core"]
}

# Example alarm: queue length
resource "cloudamqp_alarm" "queue_backlog" {
  instance_id = cloudamqp_instance.rmq.id
  type        = "queue-length"
  enabled     = true
  value       = 10000
  queue_regex = ".*"
  time_period = 300
  description = "Alert when any queue length > 10k for 5m"
}

output "rmq_host"    { value = cloudamqp_instance.rmq.url }
output "rmq_console" { value = cloudamqp_instance.rmq.console_url }