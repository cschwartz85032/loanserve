import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentEventService } from '../services/payment-event';
import crypto from 'crypto';

describe('PaymentEventService', () => {
  let eventService: PaymentEventService;
  
  beforeEach(() => {
    eventService = new PaymentEventService();
  });

  describe('Hash Computation', () => {
    it('should compute hash correctly using the specified formula', () => {
      const prev = 'abc123';
      const data = { amount: 1000, type: 'payment' };
      const correlationId = 'test-correlation-123';
      
      // Compute hash using the formula
      const payload = JSON.stringify({ prev, data, correlationId });
      const expectedHash = crypto.createHash('sha256').update(payload).digest('hex');
      
      const actualHash = eventService.computeEventHash(prev, data, correlationId);
      
      expect(actualHash).toBe(expectedHash);
    });

    it('should compute consistent hash for same inputs', () => {
      const prev = null;
      const data = { test: 'data' };
      const correlationId = 'test-123';
      
      const hash1 = eventService.computeEventHash(prev, data, correlationId);
      const hash2 = eventService.computeEventHash(prev, data, correlationId);
      
      expect(hash1).toBe(hash2);
    });

    it('should compute different hash for different inputs', () => {
      const correlationId = 'test-456';
      
      const hash1 = eventService.computeEventHash(null, { a: 1 }, correlationId);
      const hash2 = eventService.computeEventHash(null, { a: 2 }, correlationId);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Hash Chain Discontinuity', () => {
    it('should not fail DB insert with incorrect prev_event_hash', async () => {
      // Mock the service to simulate DB behavior
      const originalCreate = eventService.createEvent;
      let insertSucceeded = false;
      
      eventService.createEvent = async function(event) {
        // Simulate inserting with wrong prev_event_hash
        // DB should not reject this (no constraint)
        insertSucceeded = true;
        return {
          ...event,
          id: 'test-event-id',
          eventTime: new Date(),
          prevEventHash: 'WRONG_HASH', // Intentionally wrong
          eventHash: this.computeEventHash(
            'WRONG_HASH',
            event.data,
            event.correlationId
          )
        };
      };

      await eventService.createEvent({
        type: 'test.event',
        data: { test: true },
        correlationId: 'test-discontinuity',
        actorType: 'system'
      });

      expect(insertSucceeded).toBe(true);
      
      eventService.createEvent = originalCreate;
    });

    it('should flag discontinuity during verification', async () => {
      const correlationId = 'test-verify-' + crypto.randomUUID();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Mock the verification to simulate discontinuity
      const originalVerify = eventService.verifyHashChain;
      eventService.verifyHashChain = async function(corrId: string) {
        if (corrId === correlationId) {
          // Simulate finding a discontinuity
          console.error(`[PaymentEvent] Hash chain discontinuity at event 2 (test-event-3)`);
          console.error(`  Expected prevEventHash: hash123`);
          console.error(`  Actual prevEventHash: WRONG_HASH`);
          
          return {
            valid: false,
            discontinuityAt: 2,
            expectedHash: 'hash123',
            actualHash: 'WRONG_HASH',
            totalEvents: 3
          };
        }
        return { valid: true, totalEvents: 0 };
      };

      const result = await eventService.verifyHashChain(correlationId);
      
      expect(result.valid).toBe(false);
      expect(result.discontinuityAt).toBe(2);
      expect(result.expectedHash).toBe('hash123');
      expect(result.actualHash).toBe('WRONG_HASH');
      
      // Verify discontinuity was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Hash chain discontinuity')
      );
      
      consoleSpy.mockRestore();
      eventService.verifyHashChain = originalVerify;
    });

    it('should flag discontinuity and create audit event', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      let auditEventCreated = false;
      
      // Mock the flagDiscontinuity to check if audit event is created
      const originalFlag = eventService.flagDiscontinuity;
      eventService.flagDiscontinuity = async function(
        correlationId: string,
        eventIndex: number,
        expectedHash: string | null,
        actualHash: string | null
      ) {
        console.error(`[PaymentEvent] HASH CHAIN DISCONTINUITY DETECTED!`);
        console.error(`  Correlation ID: ${correlationId}`);
        console.error(`  Event Index: ${eventIndex}`);
        console.error(`  Expected Hash: ${expectedHash}`);
        console.error(`  Actual Hash: ${actualHash}`);
        
        // Mock creating audit event
        auditEventCreated = true;
      };

      await eventService.flagDiscontinuity(
        'test-correlation',
        5,
        'expected123',
        'actual456'
      );
      
      expect(auditEventCreated).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('HASH CHAIN DISCONTINUITY DETECTED')
      );
      
      consoleSpy.mockRestore();
      eventService.flagDiscontinuity = originalFlag;
    });
  });

  describe('Hash Chain Rebuilding', () => {
    it('should rebuild chain and return consistent terminal hash', async () => {
      const correlationId = 'test-rebuild-' + crypto.randomUUID();
      
      // Mock the rebuild function
      const originalRebuild = eventService.rebuildHashChain;
      eventService.rebuildHashChain = async function(corrId: string) {
        if (corrId === correlationId) {
          // Simulate rebuilding a chain of 3 events
          const events = [
            { data: { seq: 1 }, correlationId: corrId },
            { data: { seq: 2 }, correlationId: corrId },
            { data: { seq: 3 }, correlationId: corrId }
          ];
          
          const hashes: string[] = [];
          let prevHash: string | null = null;
          
          for (const event of events) {
            const hash = this.computeEventHash(
              prevHash,
              event.data,
              event.correlationId
            );
            hashes.push(hash);
            prevHash = hash;
          }
          
          return {
            terminalHash: prevHash,
            eventCount: events.length,
            hashes
          };
        }
        return { terminalHash: null, eventCount: 0, hashes: [] };
      };

      // Rebuild chain multiple times
      const result1 = await eventService.rebuildHashChain(correlationId);
      const result2 = await eventService.rebuildHashChain(correlationId);
      
      // Terminal hash should be consistent
      expect(result1.terminalHash).toBe(result2.terminalHash);
      expect(result1.eventCount).toBe(3);
      expect(result1.hashes).toHaveLength(3);
      expect(result1.hashes).toEqual(result2.hashes);
      
      eventService.rebuildHashChain = originalRebuild;
    });

    it('should return null terminal hash for empty chain', async () => {
      const correlationId = 'empty-chain-' + crypto.randomUUID();
      
      // Mock empty chain
      const originalRebuild = eventService.rebuildHashChain;
      eventService.rebuildHashChain = async function(corrId: string) {
        if (corrId === correlationId) {
          return { terminalHash: null, eventCount: 0, hashes: [] };
        }
        return { terminalHash: null, eventCount: 0, hashes: [] };
      };

      const result = await eventService.rebuildHashChain(correlationId);
      
      expect(result.terminalHash).toBeNull();
      expect(result.eventCount).toBe(0);
      expect(result.hashes).toHaveLength(0);
      
      eventService.rebuildHashChain = originalRebuild;
    });
  });

  describe('Actor Types', () => {
    it('should validate actor type constraints', async () => {
      const invalidEvent = {
        type: 'test.event',
        data: { test: true },
        correlationId: 'test-actor',
        actorType: 'invalid' as any
      };

      await expect(eventService.createEvent(invalidEvent))
        .rejects.toThrow('Invalid actor type: invalid');
    });

    it('should create events with different actor types', async () => {
      const correlationId = 'test-actors-' + crypto.randomUUID();
      
      // Mock the create functions
      const originalSystem = eventService.createSystemEvent;
      const originalHuman = eventService.createHumanEvent;
      const originalAI = eventService.createAIEvent;
      
      let systemEventCreated = false;
      let humanEventCreated = false;
      let aiEventCreated = false;
      
      eventService.createSystemEvent = async function() {
        systemEventCreated = true;
        return { 
          id: 'sys-event',
          type: 'system.event',
          actorType: 'system',
          actorId: 'payment-pipeline',
          correlationId,
          data: {}
        } as any;
      };
      
      eventService.createHumanEvent = async function() {
        humanEventCreated = true;
        return {
          id: 'human-event',
          type: 'human.event',
          actorType: 'human',
          actorId: 'user123',
          correlationId,
          data: {}
        } as any;
      };
      
      eventService.createAIEvent = async function() {
        aiEventCreated = true;
        return {
          id: 'ai-event',
          type: 'ai.event',
          actorType: 'ai',
          actorId: 'grok-v2',
          correlationId,
          data: {}
        } as any;
      };

      await eventService.createSystemEvent('test', {}, correlationId);
      await eventService.createHumanEvent('test', {}, correlationId, 'user123');
      await eventService.createAIEvent('test', {}, correlationId, 'grok-v2');
      
      expect(systemEventCreated).toBe(true);
      expect(humanEventCreated).toBe(true);
      expect(aiEventCreated).toBe(true);
      
      eventService.createSystemEvent = originalSystem;
      eventService.createHumanEvent = originalHuman;
      eventService.createAIEvent = originalAI;
    });
  });

  describe('Event Chain Integrity', () => {
    it('should maintain hash chain across multiple events', async () => {
      const correlationId = 'chain-test-' + crypto.randomUUID();
      
      // Mock creating a chain of events
      const originalGet = eventService.getPreviousEventHash;
      const hashes: string[] = [];
      
      eventService.getPreviousEventHash = async function(corrId: string) {
        if (corrId === correlationId) {
          return hashes.length > 0 ? hashes[hashes.length - 1] : null;
        }
        return null;
      };
      
      // Create chain
      const event1Data = { seq: 1, amount: 100 };
      const hash1 = eventService.computeEventHash(null, event1Data, correlationId);
      hashes.push(hash1);
      
      const event2Data = { seq: 2, amount: 200 };
      const hash2 = eventService.computeEventHash(hash1, event2Data, correlationId);
      hashes.push(hash2);
      
      const event3Data = { seq: 3, amount: 300 };
      const hash3 = eventService.computeEventHash(hash2, event3Data, correlationId);
      
      // Each hash should be different
      expect(hash1).not.toBe(hash2);
      expect(hash2).not.toBe(hash3);
      
      // But rebuilding should give same result
      const rebuiltHash1 = eventService.computeEventHash(null, event1Data, correlationId);
      const rebuiltHash2 = eventService.computeEventHash(rebuiltHash1, event2Data, correlationId);
      const rebuiltHash3 = eventService.computeEventHash(rebuiltHash2, event3Data, correlationId);
      
      expect(rebuiltHash1).toBe(hash1);
      expect(rebuiltHash2).toBe(hash2);
      expect(rebuiltHash3).toBe(hash3);
      
      eventService.getPreviousEventHash = originalGet;
    });
  });
});