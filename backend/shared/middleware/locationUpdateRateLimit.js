const userLocationUpdateWindow = new Map();

let lastCleanupAt = 0;

const getRateLimitSettings = () => ({
  minIntervalMs: Number.parseInt(process.env.USER_LOCATION_MIN_INTERVAL_MS || '', 10) || 4000,
  cleanupIntervalMs: Number.parseInt(process.env.USER_LOCATION_CLEANUP_INTERVAL_MS || '', 10) || 60000,
  entryTtlMs: Number.parseInt(process.env.USER_LOCATION_ENTRY_TTL_MS || '', 10) || 10 * 60 * 1000,
  maxTrackedKeys: Number.parseInt(process.env.USER_LOCATION_MAX_TRACKED_KEYS || '', 10) || 20000
});

const pruneRateLimitCache = (now, settings) => {
  for (const [key, value] of userLocationUpdateWindow.entries()) {
    if (!value || now - value.lastSeenAt > settings.entryTtlMs) {
      userLocationUpdateWindow.delete(key);
    }
  }

  if (userLocationUpdateWindow.size <= settings.maxTrackedKeys) return;

  const entriesByAge = Array.from(userLocationUpdateWindow.entries())
    .sort((a, b) => a[1].lastSeenAt - b[1].lastSeenAt);
  const excess = userLocationUpdateWindow.size - settings.maxTrackedKeys;

  for (let i = 0; i < excess; i += 1) {
    const key = entriesByAge[i]?.[0];
    if (!key) break;
    userLocationUpdateWindow.delete(key);
  }
};

export const locationUpdateRateLimit = (req, res, next) => {
  const settings = getRateLimitSettings();
  const now = Date.now();
  const strictMode = String(process.env.USER_LOCATION_RATE_LIMIT_STRICT || 'false').toLowerCase() === 'true';
  if (now - lastCleanupAt >= settings.cleanupIntervalMs) {
    pruneRateLimitCache(now, settings);
    lastCleanupAt = now;
  }

  const userId = req.user?._id?.toString();
  const key = userId || req.ip || 'unknown';
  const previous = userLocationUpdateWindow.get(key);

  if (previous) {
    const elapsed = now - previous.lastRequestAt;
    if (elapsed < settings.minIntervalMs) {
      const retryAfterMs = settings.minIntervalMs - elapsed;
      const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

      userLocationUpdateWindow.set(key, {
        lastRequestAt: previous.lastRequestAt,
        lastSeenAt: now
      });

      res.set('Retry-After', String(retryAfterSeconds));

      if (strictMode) {
        return res.status(429).json({
          success: false,
          message: `Location updates are limited to one request every ${Math.ceil(settings.minIntervalMs / 1000)} seconds.`,
          retryAfterMs
        });
      }

      // Non-strict mode avoids noisy client errors while still enforcing write frequency.
      return res.status(200).json({
        success: true,
        message: 'Location update throttled',
        data: {
          throttled: true,
          retryAfterMs,
          retryAfterSeconds
        }
      });
    }
  }

  userLocationUpdateWindow.set(key, {
    lastRequestAt: now,
    lastSeenAt: now
  });

  return next();
};

export default locationUpdateRateLimit;
