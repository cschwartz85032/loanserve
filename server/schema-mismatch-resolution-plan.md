# Database Schema Mismatch Resolution Plan

## Executive Summary
Identified recurring database schema mismatches between application code and database schema definitions. These mismatches cause runtime errors and TypeScript compilation issues.

## Identified Schema Mismatches

### 1. Missing Field: `paymentDueDay`
**Issue**: Code references `loan.paymentDueDay` but field doesn't exist in schema
**Affected Files**:
- `server/routes/crm.ts` (line 809)
- `server/services/servicing-cycle-service.ts` (line 554)

**Current State**: 
- Database has `next_payment_date` (date type)
- Schema has `nextPaymentDate` 
- Code expects `paymentDueDay` (integer for day of month)

**Resolution**: 
- Option A: Add `paymentDueDay` integer field to loans table
- Option B: Calculate from `nextPaymentDate` when needed
- **Recommended**: Option A - Add field for performance and clarity

### 2. TypeScript Type Mismatches
**Issue**: Multiple TypeScript errors in route files due to implicit 'any' types
**Affected Files**:
- `server/routes/crm.ts` (14 diagnostics)
- `server/routes/queue-monitor-routes.ts` (22 diagnostics)
- `server/utils/messaging-helpers.ts` (6 diagnostics)

**Resolution**: Add proper Request/Response type imports

### 3. Schema File Inconsistencies
**Issue**: `shared/schema.ts` has 12 diagnostics indicating type definition issues
**Root Cause**: Missing or incorrect field definitions

## Implementation Plan

### Phase 1: Schema Updates (Priority 1)
1. **Add missing fields to loans table**:
   ```typescript
   // Add to loans table in shared/schema.ts
   paymentDueDay: integer("payment_due_day"), // Day of month (1-31)
   ```

2. **Update insert/select schemas**:
   ```typescript
   export const insertLoanSchema = createInsertSchema(loans);
   export type InsertLoan = z.infer<typeof insertLoanSchema>;
   export type Loan = typeof loans.$inferSelect;
   ```

### Phase 2: Database Migration (Priority 1)
1. **Generate migration**:
   ```bash
   npm run db:push
   ```
   If warnings appear, use:
   ```bash
   npm run db:push --force
   ```

2. **Verify migration**:
   ```sql
   -- Check the field was added
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'loans' 
   AND column_name = 'payment_due_day';
   ```

### Phase 3: Code Updates (Priority 2)
1. **Update loan creation logic** to set `paymentDueDay`:
   ```typescript
   // When creating/updating loans
   paymentDueDay: new Date(firstPaymentDate).getDate()
   ```

2. **Fix TypeScript issues**:
   ```typescript
   import { Request, Response } from 'express';
   
   router.get('/endpoint', asyncHandler(async (req: Request, res: Response) => {
     // ... route logic
   }));
   ```

### Phase 4: Data Backfill (Priority 2)
1. **Update existing loans with calculated paymentDueDay**:
   ```sql
   UPDATE loans 
   SET payment_due_day = EXTRACT(DAY FROM next_payment_date)
   WHERE payment_due_day IS NULL 
   AND next_payment_date IS NOT NULL;
   ```

### Phase 5: Validation & Testing (Priority 1)
1. **Add validation rules**:
   ```typescript
   paymentDueDay: z.number().int().min(1).max(31).optional()
   ```

2. **Test affected features**:
   - CRM loan display
   - Payment scheduling
   - Late fee assessment
   - Payment due date calculations

## Prevention Measures

### 1. Schema Documentation
- Maintain schema changelog
- Document all field additions/removals
- Keep schema.ts as single source of truth

### 2. Pre-deployment Checks
```bash
# Add to CI/CD pipeline
npm run db:check  # Verify schema matches database
npm run type-check # Check TypeScript types
```

### 3. Development Practices
- Always update schema.ts before adding database fields
- Run `npm run db:push` after schema changes
- Test migrations in development before production

### 4. Monitoring
- Log schema-related errors separately
- Set up alerts for database constraint violations
- Monitor TypeScript compilation in CI/CD

## Risk Assessment

### Low Risk Items:
- Adding nullable fields (paymentDueDay)
- TypeScript type corrections

### Medium Risk Items:
- Data backfill operations
- Schema validation changes

### High Risk Items:
- None identified (no breaking changes required)

## Timeline
- **Immediate** (Today): Fix TypeScript issues, add missing fields to schema
- **Day 1**: Run migrations, backfill data
- **Day 2**: Test all affected features
- **Day 3**: Deploy to production with monitoring

## Rollback Plan
If issues occur:
1. Revert schema.ts changes
2. Run `npm run db:push --force` to sync
3. Deploy previous version
4. Investigate and fix issues offline

## Success Metrics
- Zero schema-related runtime errors
- All TypeScript diagnostics resolved
- Payment processing functions correctly
- CRM displays accurate payment due dates