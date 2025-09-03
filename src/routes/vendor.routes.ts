/**
 * External Vendor Integration Routes
 * Provides API endpoints for UCDP/SSR, Flood, Title, and HOI vendor services
 * Used for testing and admin access to vendor integrations
 */

import { Router } from "express";
import { getSSR, submitAppraisal } from "../vendors/ucdp";
import { getFlood, getFloodInsuranceRequirements } from "../vendors/flood";
import { verifyTitle, verifyHOI, getTitleInsuranceRequirements } from "../vendors/titleHoi";

export const vendorRouter = Router();

// Middleware to extract tenant context (simplified for now)
function requireTenant(req: any, res: any, next: any) {
  // In production, this would come from JWT token or session
  req.tenant = { id: req.user?.tenantId || '00000000-0000-0000-0000-000000000001' };
  next();
}

// Apply tenant middleware to all vendor routes
vendorRouter.use(requireTenant);

/**
 * UCDP/SSR Routes
 */
vendorRouter.get("/vendor/ssr/:appraisalId", async (req: any, res) => {
  try {
    const json = await getSSR(
      req.tenant.id,
      req.query.loan_id || null,
      req.params.appraisalId
    );
    res.json(json);
  } catch (error: any) {
    console.error('SSR lookup error:', error);
    res.status(500).json({ 
      error: 'Failed to get SSR',
      message: error.message 
    });
  }
});

vendorRouter.post("/vendor/ucdp/submit", async (req: any, res) => {
  try {
    const json = await submitAppraisal(
      req.tenant.id,
      req.body.loanId,
      req.body.appraisalData
    );
    res.json(json);
  } catch (error: any) {
    console.error('UCDP submission error:', error);
    res.status(500).json({ 
      error: 'Failed to submit to UCDP',
      message: error.message 
    });
  }
});

/**
 * Flood Determination Routes
 */
vendorRouter.get("/vendor/flood/:addressHash", async (req: any, res) => {
  try {
    const json = await getFlood(
      req.tenant.id,
      req.query.loan_id || null,
      req.params.addressHash
    );
    res.json(json);
  } catch (error: any) {
    console.error('Flood determination error:', error);
    res.status(500).json({ 
      error: 'Failed to get flood determination',
      message: error.message 
    });
  }
});

vendorRouter.post("/vendor/flood/determine", async (req: any, res) => {
  try {
    const { address, loanId } = req.body;
    const json = await getFlood(req.tenant.id, loanId, address);
    res.json(json);
  } catch (error: any) {
    console.error('Flood determination error:', error);
    res.status(500).json({ 
      error: 'Failed to determine flood zone',
      message: error.message 
    });
  }
});

vendorRouter.post("/vendor/flood/requirements", async (req: any, res) => {
  try {
    const { floodZone, loanAmount, loanId } = req.body;
    const json = await getFloodInsuranceRequirements(
      req.tenant.id,
      loanId,
      floodZone,
      loanAmount
    );
    res.json(json);
  } catch (error: any) {
    console.error('Flood requirements error:', error);
    res.status(500).json({ 
      error: 'Failed to get flood insurance requirements',
      message: error.message 
    });
  }
});

/**
 * Title Verification Routes
 */
vendorRouter.get("/vendor/title/:fileNo", async (req: any, res) => {
  try {
    const json = await verifyTitle(
      req.tenant.id,
      req.query.loan_id || null,
      req.params.fileNo
    );
    res.json(json);
  } catch (error: any) {
    console.error('Title verification error:', error);
    res.status(500).json({ 
      error: 'Failed to verify title',
      message: error.message 
    });
  }
});

vendorRouter.post("/vendor/title/requirements", async (req: any, res) => {
  try {
    const { loanAmount, propertyValue, loanId } = req.body;
    const json = await getTitleInsuranceRequirements(
      req.tenant.id,
      loanId,
      loanAmount,
      propertyValue
    );
    res.json(json);
  } catch (error: any) {
    console.error('Title requirements error:', error);
    res.status(500).json({ 
      error: 'Failed to get title insurance requirements',
      message: error.message 
    });
  }
});

/**
 * Homeowner's Insurance (HOI) Routes
 */
vendorRouter.get("/vendor/hoi/:policyNo", async (req: any, res) => {
  try {
    const json = await verifyHOI(
      req.tenant.id,
      req.query.loan_id || null,
      req.params.policyNo
    );
    res.json(json);
  } catch (error: any) {
    console.error('HOI verification error:', error);
    res.status(500).json({ 
      error: 'Failed to verify HOI',
      message: error.message 
    });
  }
});

/**
 * Vendor Status and Health Check
 */
vendorRouter.get("/vendor/status", async (req: any, res) => {
  try {
    const status = {
      ucdp: {
        configured: !!(process.env.UCDP_BASE_URL && process.env.UCDP_API_KEY),
        baseUrl: process.env.UCDP_BASE_URL,
        timeout: process.env.UCDP_TIMEOUT_MS
      },
      flood: {
        configured: !!(process.env.FLOOD_BASE_URL && process.env.FLOOD_API_KEY),
        baseUrl: process.env.FLOOD_BASE_URL,
        timeout: process.env.FLOOD_TIMEOUT_MS
      },
      title: {
        configured: !!(process.env.TITLE_BASE_URL && process.env.TITLE_API_KEY),
        baseUrl: process.env.TITLE_BASE_URL,
        timeout: process.env.TITLE_TIMEOUT_MS
      },
      hoi: {
        configured: !!(process.env.HOI_BASE_URL && process.env.HOI_API_KEY),
        baseUrl: process.env.HOI_BASE_URL,
        timeout: process.env.HOI_TIMEOUT_MS
      },
      cache: {
        ttlMinutes: process.env.VENDOR_CACHE_TTL_MIN,
        maxRetries: process.env.VENDOR_MAX_RETRIES
      }
    };
    
    res.json(status);
  } catch (error: any) {
    console.error('Vendor status error:', error);
    res.status(500).json({ 
      error: 'Failed to get vendor status',
      message: error.message 
    });
  }
});