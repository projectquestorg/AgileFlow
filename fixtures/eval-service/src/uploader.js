/**
 * Uploads files to the CDN with HTTP PUT `${baseUrl}/${path}`.
 * deploy.js takes any object with `upload(path, contents)`, so tests can pass a fake.
 */
export function createHttpUploader({ baseUrl = process.env.DEPLOY_URL, fetchImpl = globalThis.fetch } = {}) {
  if (!baseUrl) throw new Error('DEPLOY_URL is not set');
  return {
    async upload(path, contents) {
      const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/${path}`, { method: 'PUT', body: contents });
      if (!res.ok) throw new Error(`upload of ${path} failed: HTTP ${res.status}`);
    },
  };
}
