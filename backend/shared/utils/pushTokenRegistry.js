const PUSH_PLATFORM_PRIORITY = {
  mobile: 2,
  web: 1,
};

export const normalizePushToken = (value) => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  return normalized && normalized !== 'null' && normalized !== 'undefined' ? normalized : '';
};

export const normalizePushPlatform = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'mobile' ? 'mobile' : 'web';
};

export const normalizePushDeviceId = (value) => {
  const normalized = String(value || '').trim();
  return normalized && normalized !== 'null' && normalized !== 'undefined' ? normalized : '';
};

const normalizeMetaString = (value) => {
  const normalized = String(value || '').trim();
  return normalized && normalized !== 'null' && normalized !== 'undefined' ? normalized : '';
};

const normalizeDate = (value) => {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const compareTokenEntries = (left = {}, right = {}) => {
  const leftPriority = PUSH_PLATFORM_PRIORITY[left.platform] || 0;
  const rightPriority = PUSH_PLATFORM_PRIORITY[right.platform] || 0;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  const leftSeenAt = normalizeDate(left.lastSeenAt).getTime();
  const rightSeenAt = normalizeDate(right.lastSeenAt).getTime();
  return leftSeenAt - rightSeenAt;
};

export const maskPushToken = (token = '') => {
  const normalized = normalizePushToken(token);
  if (!normalized) return '';
  if (normalized.length <= 12) return normalized;
  return `${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
};

export const buildPushTokenEntry = ({ token, platform, ...meta } = {}) => {
  const normalizedToken = normalizePushToken(token);
  if (!normalizedToken) return null;

  return {
    token: normalizedToken,
    platform: normalizePushPlatform(platform),
    deviceId: normalizePushDeviceId(meta.deviceId),
    deviceType: normalizeMetaString(meta.deviceType),
    appContext: normalizeMetaString(meta.appContext),
    userAgent: normalizeMetaString(meta.userAgent),
    source: normalizeMetaString(meta.source),
    isWebView: Boolean(meta.isWebView),
    lastSeenAt: normalizeDate(meta.lastSeenAt || new Date()),
  };
};

export const getStoredPushTokenEntries = (recipient = {}) => {
  const entries = [];
  const pushTokens = Array.isArray(recipient?.pushTokens) ? recipient.pushTokens : [];

  for (const item of pushTokens) {
    const entry = buildPushTokenEntry(item);
    if (entry) entries.push(entry);
  }

  const legacyWebToken = normalizePushToken(recipient?.fcmTokenWeb);
  if (legacyWebToken && !entries.some((item) => item.token === legacyWebToken)) {
    entries.push({
      token: legacyWebToken,
      platform: 'web',
      deviceId: '',
      deviceType: '',
      appContext: '',
      userAgent: '',
      source: 'legacy_field',
      isWebView: false,
      lastSeenAt: new Date(0),
    });
  }

  const legacyMobileToken = normalizePushToken(recipient?.fcmTokenMobile);
  if (legacyMobileToken && !entries.some((item) => item.token === legacyMobileToken)) {
    entries.push({
      token: legacyMobileToken,
      platform: 'mobile',
      deviceId: '',
      deviceType: '',
      appContext: '',
      userAgent: '',
      source: 'legacy_field',
      isWebView: false,
      lastSeenAt: new Date(0),
    });
  }

  return entries;
};

export const upsertPushTokenOnEntity = (entity, payload = {}) => {
  if (!entity || typeof entity !== 'object') {
    return { changed: false, entry: null };
  }

  const entry = buildPushTokenEntry(payload);
  if (!entry) {
    return { changed: false, entry: null };
  }

  const existingEntries = Array.isArray(entity.pushTokens) ? entity.pushTokens : [];
  const nextEntries = existingEntries
    .map((item) => buildPushTokenEntry(item))
    .filter(Boolean)
    .filter((item) => item.token !== entry.token)
    .filter((item) => !(entry.deviceId && item.deviceId === entry.deviceId && item.platform === entry.platform));

  nextEntries.push(entry);
  entity.pushTokens = nextEntries;

  if (entry.platform === 'web') {
    entity.fcmTokenWeb = entry.token;
  } else {
    entity.fcmTokenMobile = entry.token;
  }

  return { changed: true, entry };
};

export const removePushTokenFromEntity = (entity, options = {}) => {
  if (!entity || typeof entity !== 'object') {
    return { changed: false, removedCount: 0 };
  }

  const normalizedToken = normalizePushToken(options.token);
  const normalizedPlatform = options.platform ? normalizePushPlatform(options.platform) : '';
  const normalizedDeviceId = normalizePushDeviceId(options.deviceId);

  const existingEntries = Array.isArray(entity.pushTokens) ? entity.pushTokens : [];
  const nextEntries = existingEntries
    .map((item) => buildPushTokenEntry(item))
    .filter(Boolean)
    .filter((item) => {
      if (normalizedToken && item.token === normalizedToken) return false;
      if (normalizedPlatform && normalizedDeviceId && item.platform === normalizedPlatform && item.deviceId === normalizedDeviceId) return false;
      if (normalizedPlatform && !normalizedDeviceId && !normalizedToken && item.platform === normalizedPlatform && options.removeAllForPlatform === true) return false;
      return true;
    });

  const removedCount = existingEntries.length - nextEntries.length;
  entity.pushTokens = nextEntries;

  if (normalizedPlatform === 'web' || (!normalizedPlatform && normalizedToken && normalizePushToken(entity.fcmTokenWeb) === normalizedToken)) {
    const nextWebEntry = nextEntries.filter((item) => item.platform === 'web').sort(compareTokenEntries).pop();
    entity.fcmTokenWeb = nextWebEntry?.token || '';
  }
  if (normalizedPlatform === 'mobile' || (!normalizedPlatform && normalizedToken && normalizePushToken(entity.fcmTokenMobile) === normalizedToken)) {
    const nextMobileEntry = nextEntries.filter((item) => item.platform === 'mobile').sort(compareTokenEntries).pop();
    entity.fcmTokenMobile = nextMobileEntry?.token || '';
  }

  return { changed: removedCount > 0, removedCount };
};

export const collectRecipientPushTargets = (recipients = []) => {
  const selectedTargets = [];
  const tokenSet = new Set();
  const summary = {
    totalRecipients: Array.isArray(recipients) ? recipients.length : 0,
    selectedCount: 0,
    suppressedCount: 0,
    suppressedSameDeviceCount: 0,
    suppressedDuplicateTokenCount: 0,
    selectedWebCount: 0,
    selectedMobileCount: 0,
  };

  for (const recipient of recipients || []) {
    const recipientId = String(recipient?._id || recipient?.id || '').trim();
    const entries = getStoredPushTokenEntries(recipient);
    const selectedByDevice = new Map();

    for (const entry of entries) {
      const deviceKey = entry.deviceId ? `device:${entry.deviceId}` : `token:${entry.token}`;
      const current = selectedByDevice.get(deviceKey);
      if (!current) {
        selectedByDevice.set(deviceKey, entry);
        continue;
      }

      const preferred = compareTokenEntries(current, entry) >= 0 ? current : entry;
      summary.suppressedSameDeviceCount += 1;
      selectedByDevice.set(deviceKey, preferred);
    }

    for (const entry of selectedByDevice.values()) {
      if (tokenSet.has(entry.token)) {
        summary.suppressedDuplicateTokenCount += 1;
        continue;
      }

      tokenSet.add(entry.token);
      selectedTargets.push({
        ...entry,
        recipientId,
      });
      if (entry.platform === 'web') summary.selectedWebCount += 1;
      if (entry.platform === 'mobile') summary.selectedMobileCount += 1;
    }
  }

  summary.selectedCount = selectedTargets.length;
  summary.suppressedCount = summary.suppressedSameDeviceCount + summary.suppressedDuplicateTokenCount;

  return {
    targets: selectedTargets,
    summary,
  };
};

export const cleanupInvalidPushTokensAcrossModels = async (models = [], invalidTokens = []) => {
  const tokenSet = Array.from(new Set((invalidTokens || []).map(normalizePushToken).filter(Boolean)));
  if (tokenSet.length === 0) {
    return { removedCount: 0 };
  }

  await Promise.all(
    (models || []).flatMap((Model) => ([
      Model.updateMany(
        { 'pushTokens.token': { $in: tokenSet } },
        { $pull: { pushTokens: { token: { $in: tokenSet } } } }
      ),
      Model.updateMany(
        { fcmTokenWeb: { $in: tokenSet } },
        { $set: { fcmTokenWeb: '' } }
      ),
      Model.updateMany(
        { fcmTokenMobile: { $in: tokenSet } },
        { $set: { fcmTokenMobile: '' } }
      ),
    ]))
  );

  return { removedCount: tokenSet.length };
};
