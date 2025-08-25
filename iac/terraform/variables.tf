variable "environment" {
  type        = string
  description = "Environment name (dev, staging, prod)"
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod"
  }
}

variable "cloudamqp_region" {
  type        = string
  default     = "amazon-web-services::us-west-2"
  description = "CloudAMQP instance region"
}

variable "cloudamqp_plan" {
  type        = string
  default     = "bunny-1"
  description = "CloudAMQP instance plan"
}