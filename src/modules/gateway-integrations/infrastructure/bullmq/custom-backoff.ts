import { BackoffOptions } from 'bullmq';

/**
 * Custom backoff strategy for Webhooks.
 * Delays:
 * Attempt 1 -> Attempt 2: 1 minute (60,000 ms)
 * Attempt 2 -> Attempt 3: 5 minutes (300,000 ms)
 * Attempt 3 -> Attempt 4: 15 minutes (900,000 ms)
 * Attempt 4 -> Attempt 5: 1 hour (3,600,000 ms)
 */
export const webhookBackoffStrategy = (
  attemptsMade: number,
  type: string,
  err: Error,
  job: any,
): number => {
  switch (attemptsMade) {
    case 1:
      return 60 * 1000; // 1m
    case 2:
      return 5 * 60 * 1000; // 5m
    case 3:
      return 15 * 60 * 1000; // 15m
    case 4:
      return 60 * 60 * 1000; // 1h
    default:
      return 60 * 1000; // Fallback to 1m
  }
};
