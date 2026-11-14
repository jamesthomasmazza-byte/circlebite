// How many real Open Food Facts search calls the server lets through (docs/snack-list-plan.md
// addendum, 2026-11-14; JT, Nov 14: in memory, no migration, reset on restart). Two limits, both
// counting only calls that actually go to Open Food Facts — cache hits and searches of our own
// `products` table count nothing:
//
// - A budget for the whole process: Open Food Facts allows 10 search queries a minute per IP, and the
//   server is one IP, so 8 a minute across every account, under the limit with room for a retry.
//   Over it, "Search more" says it couldn't reach Open Food Facts right now; nothing is queued.
// - A limit per account, keyed by user id: 20 an hour for a regular account, 8 for a judge-link pool
//   account (auth/judgeLinkRules.ts), so forty judges clicking at once can't spend the shared budget.
//
// Timestamps in memory, pruned as they age out. The clock is injectable for tests.

export const PROCESS_BUDGET_PER_MINUTE = 8;
export const SEARCHES_PER_HOUR = { regular: 20, judgeLink: 8 } as const;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export type LimitOutcome = "ok" | "user_limit" | "busy";

export class SearchLimits {
  private processCalls: number[] = [];
  private userCalls = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * Whether this account may make one real search call now, and if so, counts it against both
   * limits. The account's limit is checked first: an account over its own limit is told so, not that
   * the server is busy. A refused call counts nothing.
   */
  take(userId: string, judgeLink: boolean): LimitOutcome {
    const at = this.now();
    const mine = this.prune(this.userCalls.get(userId) ?? [], at - HOUR_MS);
    if (mine.length >= (judgeLink ? SEARCHES_PER_HOUR.judgeLink : SEARCHES_PER_HOUR.regular)) {
      this.store(userId, mine);
      return "user_limit";
    }
    this.processCalls = this.prune(this.processCalls, at - MINUTE_MS);
    if (this.processCalls.length >= PROCESS_BUDGET_PER_MINUTE) {
      this.store(userId, mine);
      return "busy";
    }
    this.processCalls.push(at);
    mine.push(at);
    this.store(userId, mine);
    return "ok";
  }

  private prune(calls: number[], since: number): number[] {
    return calls.filter((t) => t > since);
  }

  private store(userId: string, calls: number[]): void {
    if (calls.length === 0) this.userCalls.delete(userId);
    else this.userCalls.set(userId, calls);
  }
}
