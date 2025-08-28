export * from './hashChain';
export * from './retentionPolicy';
export * from './consentManagement';

// Schedule compliance tasks
import { retentionPolicyService } from './retentionPolicy';

export function initializeComplianceScheduler() {
  // Run retention policies daily at 2 AM
  const runDailyAt2AM = () => {
    const now = new Date();
    const next2AM = new Date(now);
    next2AM.setHours(2, 0, 0, 0);
    
    // If it's past 2 AM today, schedule for tomorrow
    if (now >= next2AM) {
      next2AM.setDate(next2AM.getDate() + 1);
    }
    
    const msUntil2AM = next2AM.getTime() - now.getTime();
    
    setTimeout(async () => {
      console.log('[Compliance] Running retention policies...');
      try {
        await retentionPolicyService.applyRetentionPolicies();
        console.log('[Compliance] Retention policies applied successfully');
      } catch (error) {
        console.error('[Compliance] Error applying retention policies:', error);
      }
      
      // Schedule next run
      runDailyAt2AM();
    }, msUntil2AM);
  };
  
  // Start the scheduler
  runDailyAt2AM();
  console.log('[Compliance] Scheduler initialized - will run daily at 2 AM');
}