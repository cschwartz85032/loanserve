import { generateExport } from "../src/exports/engine";
import { describe, it, expect } from "vitest";

describe("Export Engine", () => {
  it("builds Fannie XML", async () => {
    const canonical: any = {
      NoteAmount: 200000,
      InterestRate: 7.125,
      AmortTermMonths: 360,
      FirstPaymentDate: "2025-10-01",
      MaturityDate: "2055-10-01",
      BorrowerFullName: "John Q. Public",
      PropertyStreet: "123 Main St",
      PropertyCity: "Phoenix",
      PropertyState: "AZ",
      PropertyZip: "85032",
      EscrowRequired: true
    };
    
    const evidence: any = {};
    
    const out = await generateExport({
      tenantId: "test-tenant",
      loanId: "L1",
      template: "fannie",
      canonical,
      evidence,
      mapperVersion: "v2025.09.03"
    });
    
    expect(out.mime).toBe("application/xml");
    expect(out.bytes.toString("utf-8")).toContain("<ULDD");
    expect(out.filename).toBe("FANNIE_L1.xml");
    expect(out.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("builds Custom CSV", async () => {
    const canonical: any = {
      LoanNumber: "LN-1",
      NoteAmount: 200000,
      InterestRate: 7.125,
      AmortTermMonths: 360,
      BorrowerFullName: "John"
    };
    
    const out = await generateExport({
      tenantId: "test-tenant",
      loanId: "L1",
      template: "custom",
      canonical,
      evidence: {},
      mapperVersion: "v2025.09.03"
    });
    
    expect(out.mime).toBe("text/csv");
    expect(out.bytes.toString("utf-8").split("\n").length).toBeGreaterThan(1);
    expect(out.filename).toBe("CUSTOM_L1.csv");
  });

  it("validates required fields", async () => {
    const canonical: any = {
      // Missing required fields
      InterestRate: 7.125
    };
    
    await expect(generateExport({
      tenantId: "test-tenant",
      loanId: "L1",
      template: "fannie",
      canonical,
      evidence: {},
      mapperVersion: "v2025.09.03"
    })).rejects.toThrow("Missing required keys");
  });

  it("handles unknown template", async () => {
    const canonical: any = { NoteAmount: 200000 };
    
    await expect(generateExport({
      tenantId: "test-tenant",
      loanId: "L1",
      template: "unknown" as any,
      canonical,
      evidence: {},
      mapperVersion: "v2025.09.03"
    })).rejects.toThrow("Unknown template");
  });
});