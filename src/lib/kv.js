/*
 * Shared Redis client for operational metadata and lightweight app features.
 * It accepts both legacy Vercel KV and current Upstash environment variables.
 *
 * With no Redis configured outside production (a fresh local checkout), it
 * falls back to a small in-memory stand-in so sign-in and the rest of the app
 * work without an external service. Nothing is persisted across restarts.
 */
import { Redis } from "@upstash/redis";

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const useMemoryFallback =
  !(url && token) && process.env.NODE_ENV !== "production";

export const kv = useMemoryFallback ? getMemoryKv() : new Redis({ url, token });

// Kept on globalThis so dev hot reloads do not wipe it.
function getMemoryKv() {
  if (!globalThis.__sjMemoryKv) {
    globalThis.__sjMemoryKv = createMemoryKv();
  }
  return globalThis.__sjMemoryKv;
}

function createMemoryKv() {
  const store = new Map();
  const expiries = new Map();

  const live = (key) => {
    const expiresAt = expiries.get(key);
    if (expiresAt !== undefined && expiresAt <= Date.now()) {
      store.delete(key);
      expiries.delete(key);
    }
    return store.has(key);
  };
  const hash = (key) => (live(key) ? store.get(key) : {});

  return {
    async get(key) {
      return live(key) ? store.get(key) : null;
    },
    async set(key, value, options = {}) {
      if (options.nx && live(key)) return null;
      store.set(key, value);
      if (options.ex) expiries.set(key, Date.now() + options.ex * 1000);
      else expiries.delete(key);
      return "OK";
    },
    async del(...keys) {
      let removed = 0;
      for (const key of keys) {
        if (live(key)) removed += 1;
        store.delete(key);
        expiries.delete(key);
      }
      return removed;
    },
    async exists(key) {
      return live(key) ? 1 : 0;
    },
    async incr(key) {
      const next = (live(key) ? Number(store.get(key)) : 0) + 1;
      store.set(key, next);
      return next;
    },
    async expire(key, seconds) {
      if (!live(key)) return 0;
      expiries.set(key, Date.now() + seconds * 1000);
      return 1;
    },
    async hset(key, fields) {
      store.set(key, { ...hash(key), ...fields });
      return Object.keys(fields).length;
    },
    async hget(key, field) {
      return hash(key)[field] ?? null;
    },
    async hmget(key, ...fields) {
      const record = hash(key);
      return Object.fromEntries(fields.map((f) => [f, record[f] ?? null]));
    },
    async hgetall(key) {
      return live(key) ? { ...store.get(key) } : null;
    },
    async hdel(key, ...fields) {
      const record = { ...hash(key) };
      let removed = 0;
      for (const field of fields) {
        if (field in record) removed += 1;
        delete record[field];
      }
      store.set(key, record);
      return removed;
    },
    async hincrby(key, field, amount) {
      const record = { ...hash(key) };
      record[field] = (Number(record[field]) || 0) + amount;
      store.set(key, record);
      return record[field];
    },
    async scan() {
      return ["0", []];
    },
  };
}
