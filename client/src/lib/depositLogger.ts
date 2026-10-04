export type DepositLogLevel = "debug" | "info" | "success" | "warn" | "error";

export interface DepositLogEntry {
  id: string;
  timestamp: string;
  level: DepositLogLevel;
  context: string;
  message: string;
  reference?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}

type DepositLogOptions = Omit<Partial<DepositLogEntry>, "id" | "timestamp" | "level" | "context" | "message">;
type Listener = (entries: DepositLogEntry[]) => void;

/**
 * Volatile, bounded diagnostics for the deposit flow. Entries deliberately stay
 * in memory only and callers must pass masked/sanitized details (never tokens,
 * full phone numbers, or provider payloads).
 */
class DepositLogger {
  private entries: DepositLogEntry[] = [];
  private listeners = new Set<Listener>();
  private readonly maxEntries = 300;

  log(level: DepositLogLevel, context: string, message: string, options: DepositLogOptions = {}) {
    const entry: DepositLogEntry = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      ...(options.reference ? { reference: options.reference } : {}),
      ...(options.durationMs !== undefined ? { durationMs: options.durationMs } : {}),
      ...(options.details ? { details: options.details } : {}),
    };

    this.entries = [...this.entries, entry].slice(-this.maxEntries);
    const prefix = `[Deposit/${context}] [${level.toUpperCase()}]`;
    const output = level === "error" ? console.error : level === "warn" ? console.warn : level === "debug" ? console.debug : console.info;
    output(prefix, message, {
      timestamp: entry.timestamp,
      ...(entry.reference ? { reference: entry.reference } : {}),
      ...(entry.durationMs !== undefined ? { durationMs: entry.durationMs } : {}),
      ...(entry.details ? { details: entry.details } : {}),
    });
    this.notify();
    return entry;
  }

  debug = (context: string, message: string, options?: DepositLogOptions) => this.log("debug", context, message, options);
  info = (context: string, message: string, options?: DepositLogOptions) => this.log("info", context, message, options);
  success = (context: string, message: string, options?: DepositLogOptions) => this.log("success", context, message, options);
  warn = (context: string, message: string, options?: DepositLogOptions) => this.log("warn", context, message, options);
  error = (context: string, message: string, options?: DepositLogOptions) => this.log("error", context, message, options);

  getEntries() {
    return [...this.entries];
  }

  clear() {
    this.entries = [];
    this.notify();
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  toSupportText() {
    return this.entries.map(entry => {
      const ref = entry.reference ? ` ref=${entry.reference}` : "";
      const duration = entry.durationMs === undefined ? "" : ` ${entry.durationMs}ms`;
      const details = entry.details ? `\n  ${JSON.stringify(entry.details)}` : "";
      return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.context}]${ref}${duration} ${entry.message}${details}`;
    }).join("\n");
  }

  private notify() {
    const entries = this.getEntries();
    this.listeners.forEach(listener => listener(entries));
  }
}

export const depositLogger = new DepositLogger();
