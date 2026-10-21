import { NextResponse } from "next/server";
import { registry } from "@/lib/metrics";

// Prometheus scrapes this endpoint on a fixed interval (see prometheus.yml).
// Deliberately unauthenticated for scraping simplicity — in a real
// production deployment this would be restricted to internal network
// access only (e.g. Prometheus and the app on the same private network).
export async function GET() {
  const body = await registry.metrics();
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": registry.contentType },
  });
}
