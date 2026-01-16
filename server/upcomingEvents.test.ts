import { describe, it, expect, beforeAll } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

describe('Upcoming Events', () => {
  let testContext: TrpcContext;
  
  beforeAll(() => {
    testContext = {
      user: null,
      req: {} as any,
      res: {} as any,
    };
  });
  
  it('should fetch upcoming available slots without authentication', async () => {
    const caller = appRouter.createCaller(testContext);
    
    const result = await caller.admin.availability.upcoming({ limit: 6 });
    
    expect(Array.isArray(result)).toBe(true);
    // Result can be empty if no events exist, which is fine
  });
  
  it('should respect the limit parameter', async () => {
    const caller = appRouter.createCaller(testContext);
    
    const result = await caller.admin.availability.upcoming({ limit: 3 });
    
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(3);
  });
  
  it('should only return future events', async () => {
    const caller = appRouter.createCaller(testContext);
    
    const result = await caller.admin.availability.upcoming({ limit: 10 });
    
    const now = new Date();
    result.forEach(event => {
      const eventStart = new Date(event.startTime);
      expect(eventStart.getTime()).toBeGreaterThanOrEqual(now.getTime());
    });
  });
  
  it('should only return unbooked slots', async () => {
    const caller = appRouter.createCaller(testContext);
    
    const result = await caller.admin.availability.upcoming({ limit: 10 });
    
    result.forEach(event => {
      expect(event.isBooked).toBe(false);
    });
  });
  
  it('should return events sorted by start time', async () => {
    const caller = appRouter.createCaller(testContext);
    
    const result = await caller.admin.availability.upcoming({ limit: 10 });
    
    if (result.length > 1) {
      for (let i = 0; i < result.length - 1; i++) {
        const current = new Date(result[i].startTime).getTime();
        const next = new Date(result[i + 1].startTime).getTime();
        expect(current).toBeLessThanOrEqual(next);
      }
    }
  });
});
