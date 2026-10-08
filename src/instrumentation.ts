export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (typeof window !== "undefined") return;
  const { startProbeWorker } = await import("@/lib/probe");
  const { startAlertWorker } = await import("@/lib/alerts");
  startProbeWorker();
  startAlertWorker();
}
