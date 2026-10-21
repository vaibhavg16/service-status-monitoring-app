import client from "prom-client";

// One shared registry for the whole app (Next.js dev mode can re-import
// this module, so guard against double-registering metrics).
const globalForMetrics = globalThis as unknown as {
  __metricsRegistry?: client.Registry;
  __probeResultCounter?: client.Counter<string>;
  __probeDurationHistogram?: client.Histogram<string>;
  __httpRequestCounter?: client.Counter<string>;
};

export const registry =
  globalForMetrics.__metricsRegistry ??
  (globalForMetrics.__metricsRegistry = new client.Registry());

// Default Node.js process metrics (memory, CPU, event loop lag, etc.)
if (!globalForMetrics.__httpRequestCounter) {
  client.collectDefaultMetrics({ register: registry });
}

export const probeResultCounter =
  globalForMetrics.__probeResultCounter ??
  (globalForMetrics.__probeResultCounter = new client.Counter({
    name: "isitdown_probe_result_total",
    help: "Total number of service probe results, by service and status",
    labelNames: ["service", "status"] as const,
    registers: [registry],
  }));

export const probeDurationHistogram =
  globalForMetrics.__probeDurationHistogram ??
  (globalForMetrics.__probeDurationHistogram = new client.Histogram({
    name: "isitdown_probe_duration_ms",
    help: "Duration of each service probe check, in milliseconds",
    labelNames: ["service"] as const,
    buckets: [50, 100, 250, 500, 1000, 2000, 3000, 5000, 10000],
    registers: [registry],
  }));

export const httpRequestCounter =
  globalForMetrics.__httpRequestCounter ??
  (globalForMetrics.__httpRequestCounter = new client.Counter({
    name: "isitdown_http_requests_total",
    help: "Total HTTP requests handled, by route and status code",
    labelNames: ["route", "status"] as const,
    registers: [registry],
  }));

/** Call this once per probe result inside the existing probe worker loop. */
export function recordProbeResult(
  service: string,
  status: "up" | "degraded" | "down",
  durationMs: number,
): void {
  probeResultCounter.labels(service, status).inc();
  probeDurationHistogram.labels(service).observe(durationMs);
}
