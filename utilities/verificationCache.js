let NodeCache;

try {
  NodeCache = require("node-cache");
} catch (error) {
  class SimpleNodeCache {
    constructor(options = {}) {
      const { stdTTL = 0, checkperiod = 0 } = options || {};
      this.defaultTtl = Number.isFinite(stdTTL) && stdTTL > 0 ? stdTTL : 0;
      this.checkPeriodMs = Number.isFinite(checkperiod) && checkperiod > 0 ? checkperiod * 1000 : 0;
      this.store = new Map();

      if (this.checkPeriodMs > 0) {
        this.cleanupInterval = setInterval(() => this.cleanup(), this.checkPeriodMs);
        if (typeof this.cleanupInterval.unref === "function") {
          this.cleanupInterval.unref();
        }
      }
    }

    set(key, value, ttl) {
      if (typeof key !== "string" && typeof key !== "number") {
        return false;
      }

      const ttlSeconds = this.resolveTtl(ttl);
      const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0;

      this.store.set(String(key), { value, expiresAt });
      return true;
    }

    get(key) {
      const entry = this.store.get(String(key));
      if (!entry) {
        return undefined;
      }

      if (entry.expiresAt && entry.expiresAt <= Date.now()) {
        this.store.delete(String(key));
        return undefined;
      }

      return entry.value;
    }

    del(keys) {
      if (Array.isArray(keys)) {
        let removed = 0;
        keys.forEach((item) => {
          if (this.store.delete(String(item))) {
            removed += 1;
          }
        });
        return removed;
      }

      return this.store.delete(String(keys)) ? 1 : 0;
    }

    resolveTtl(ttl) {
      if (Number.isFinite(ttl) && ttl > 0) {
        return ttl;
      }
      return this.defaultTtl;
    }

    cleanup() {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (entry.expiresAt && entry.expiresAt <= now) {
          this.store.delete(key);
        }
      }
    }
  }

  NodeCache = SimpleNodeCache;
}

const FIVE_MINUTES_IN_SECONDS = 5 * 60;

const verificationCache = new NodeCache({
  stdTTL: FIVE_MINUTES_IN_SECONDS,
  checkperiod: 60,
});

module.exports = verificationCache;
