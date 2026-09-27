/** Per-user settings, stored server-side so they follow the user across devices. */
const DEFAULTS = { density: 'comfortable', locale: 'en-US' };
const settings = new Map();

export function getSettings(userId) {
  return { ...DEFAULTS, ...settings.get(userId) };
}

export function updateSettings(userId, patch) {
  const allowed = Object.fromEntries(Object.entries(patch).filter(([key]) => key in DEFAULTS));
  settings.set(userId, { ...settings.get(userId), ...allowed });
  return getSettings(userId);
}
