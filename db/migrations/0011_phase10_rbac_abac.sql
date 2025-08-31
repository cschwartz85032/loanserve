-- Phase 10: Enhanced RBAC/ABAC Security System
-- Implements Role-Based Access Control and Attribute-Based Access Control

-- Enhanced roles table with hierarchical support
CREATE TABLE IF NOT EXISTS security_roles (
  role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  role_name TEXT NOT NULL,
  role_description TEXT,
  parent_role_id UUID REFERENCES security_roles(role_id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, role_name)
);

-- Enhanced permissions with action granularity
CREATE TABLE IF NOT EXISTS security_permissions (
  permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  resource_type TEXT NOT NULL, -- 'loan', 'document', 'payment', etc.
  action TEXT NOT NULL, -- 'read', 'write', 'delete', 'approve'
  permission_name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, resource_type, action, permission_name)
);

-- Role-Permission mappings
CREATE TABLE IF NOT EXISTS security_role_permissions (
  role_id UUID NOT NULL REFERENCES security_roles(role_id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES security_permissions(permission_id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID NOT NULL, -- user who granted this permission
  PRIMARY KEY (role_id, permission_id)
);

-- User-Role assignments with time boundaries
CREATE TABLE IF NOT EXISTS security_user_roles (
  user_id UUID NOT NULL,
  role_id UUID NOT NULL REFERENCES security_roles(role_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID NOT NULL,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, role_id, tenant_id)
);

-- ABAC attributes for context-aware access control
CREATE TABLE IF NOT EXISTS security_abac_attributes (
  attribute_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  attribute_name TEXT NOT NULL,
  attribute_type TEXT NOT NULL, -- 'location', 'device', 'time', 'clearance'
  attribute_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, attribute_name, attribute_type, attribute_value)
);

-- ABAC policies linking permissions to attributes
CREATE TABLE IF NOT EXISTS security_abac_policies (
  policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  policy_name TEXT NOT NULL,
  permission_id UUID NOT NULL REFERENCES security_permissions(permission_id),
  required_attributes JSONB NOT NULL, -- {"location": ["US", "EU"], "clearance": ["high"]}
  condition_logic TEXT NOT NULL DEFAULT 'AND', -- 'AND', 'OR'
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, policy_name)
);

-- Enable Row Level Security
ALTER TABLE security_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_abac_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_abac_policies ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tenant isolation
CREATE POLICY security_roles_rls ON security_roles
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY security_permissions_rls ON security_permissions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY security_role_permissions_rls ON security_role_permissions
  USING (EXISTS (SELECT 1 FROM security_roles WHERE role_id = security_role_permissions.role_id 
                 AND tenant_id = current_setting('app.tenant_id', true)::uuid));

CREATE POLICY security_user_roles_rls ON security_user_roles
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY security_abac_attributes_rls ON security_abac_attributes
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY security_abac_policies_rls ON security_abac_policies
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Indexes for performance
CREATE INDEX idx_security_roles_tenant ON security_roles(tenant_id);
CREATE INDEX idx_security_permissions_tenant_resource ON security_permissions(tenant_id, resource_type);
CREATE INDEX idx_security_user_roles_user_tenant ON security_user_roles(user_id, tenant_id);
CREATE INDEX idx_security_abac_attributes_tenant_type ON security_abac_attributes(tenant_id, attribute_type);