/**
 * Hot "current status" cache.
 *
 * Production shape: Redis (DynamoDB/Redis on the Elastic Beanstalk tier) holding the
 * latest derived status per service so a traffic spike never hits Postgres for the
 * board read. Locally, REDIS_URL is usually absent, so we fall back to a bounded
 * in-process LRU with identical semantics. Reads never throw.
 */

type Entry = { value: string; expires: number };

const memory = new Map<string, Entry>();
const MAX_KEYS = 500;

let redisClient: import("redis").RedisClientType | null = null;
let redisTried = false;
let redisHealthy = false;

async function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (redisTried) return redisHealthy ? redisClient : null;
  redisTried = true;
  try {
    const { createClient } = await import("redis");
    const client = createClient({ url: process.env.REDIS_URL });
    client.on("error", () => {
      redisHealthy = false;
    });
    await client.connect();
    redisHealthy = true;
    redisClient = client as never;
  } catch {
    redisHealthy = false;
    redisClient = null;
  }
  return redisHealthy ? redisClient : null;
}

function touchMemory(key: string): string | null {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expires && hit.expires < Date.now()) {
    memory.delete(key);
    return null;
  }
  // LRU shuffle
  memory.delete(key);
  memory.set(key, hit);
  return hit.value;
}

function putMemory(key: string, value: string, ttlMs: number) {
  if (memory.size >= MAX_KEYS) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, { value, expires: ttlMs > 0 ? Date.now() + ttlMs : 0 });
}

export const cache = {
  backend: (): "redis" | "memory" =>
    process.env.REDIS_URL && redisHealthy ? "redis" : "memory",
  async get<T>(key: string): Promise<T | null> {
    try {
      const r = await getRedis();
      if (r) {
        const raw = (await r.get(key)) as string | null;
        return raw ? (JSON.parse(raw) as T) : null;
      }
      const raw = touchMemory(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      const raw = touchMemory(key);
      return raw ? (JSON.parse(raw) as T) : null;
    }
  },
  async set(key: string, value: unknown, ttlMs = 15000): Promise<void> {
    const raw = JSON.stringify(value);
    putMemory(key, raw, ttlMs);
    try {
      const r = await getRedis();
      if (r) await r.set(key, raw, { PX: Math.max(1000, ttlMs) });
    } catch {
      /* fail-soft: memory copy already holds it */
    }
  },
  async del(prefix: string): Promise<void> {
    for (const k of [...memory.keys()]) if (k.startsWith(prefix)) memory.delete(k);
    try {
      const r = await getRedis();
      if (r) {
        const keys = await r.keys(`${prefix}*`);
        if (keys.length) await r.del(keys);
      }
    } catch {
      /* ignore */
    }
  },
};

export const STATUS_CACHE_KEY = "status:current:v1";
