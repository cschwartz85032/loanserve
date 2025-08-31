-- Phase 10: Extensions and Base Security Infrastructure
-- Creates necessary PostgreSQL extensions for cryptography and security

-- Enable cryptographic functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Row Level Security will be used for multi-tenant isolation
-- Note: RLS is enabled by default in modern PostgreSQL versions