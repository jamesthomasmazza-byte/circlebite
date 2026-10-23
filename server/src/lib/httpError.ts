export class HttpError extends Error {
  status: number;
  code: string;
  /** Extra fields for the client, merged into the error body beside `error` (app.ts) — never a
   *  message or anything internal, only what the client needs to act (e.g. which listed allergen a
   *  typed name is). */
  detail?: Record<string, unknown>;

  constructor(status: number, code: string, detail?: Record<string, unknown>) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}
