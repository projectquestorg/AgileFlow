/**
 * AgileFlow CLI - npm Registry Utilities
 *
 * Utilities for interacting with the npm registry.
 * Set DEBUG_NPM=1 environment variable for verbose error logging.
 */

const https = require('https');

// Debug mode: set DEBUG_NPM=1 to see error details
const DEBUG = process.env.DEBUG_NPM === '1';

/**
 * Log debug messages when DEBUG_NPM=1
 * @param {string} message - Message to log
 * @param {*} data - Optional data to include
 */
function debugLog(message, data = null) {
  if (DEBUG) {
    console.error(`[npm-utils] ${message}`, data ? JSON.stringify(data) : '');
  }
}

/**
 * Get the latest version of a package from npm registry
 *
 * Returns null on any error (network, timeout, invalid response) since
 * version checking should not block the CLI. Set DEBUG_NPM=1 to see errors.
 *
 * @param {string} packageName - Name of the package (e.g., 'agileflow' or '@scope/pkg')
 * @returns {Promise<string|null>} Latest version string or null if unavailable
 */
async function getLatestVersion(packageName) {
  return new Promise(resolve => {
    const options = {
      hostname: 'registry.npmjs.org',
      port: 443,
      path: `/${packageName}/latest`,
      method: 'GET',
      headers: {
        'User-Agent': 'agileflow-cli',
      },
      // Security: Explicitly enable TLS certificate validation
      // Prevents MITM attacks on npm registry requests
      rejectUnauthorized: true,
    };

    debugLog('Fetching version', { package: packageName, path: options.path });

    const req = https.request(options, res => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          debugLog('Non-200 status', { statusCode: res.statusCode });
          return resolve(null);
        }

        try {
          const json = JSON.parse(data);
          const version = json.version || null;
          debugLog('Version found', { version });
          resolve(version);
        } catch (err) {
          debugLog('JSON parse error', { error: err.message });
          resolve(null);
        }
      });
    });

    req.on('error', err => {
      // Enhanced error logging with retry guidance
      const errorInfo = {
        error: err.message,
        code: err.code,
        suggestion: 'Check network connection. If error persists, try: npm cache clean --force',
      };
      if (err.code === 'CERT_HAS_EXPIRED' || err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        errorInfo.suggestion = 'TLS certificate error - check system time or update CA certificates';
      }
      debugLog('Network error', errorInfo);
      resolve(null);
    });

    // 10 second timeout for registry requests
    req.setTimeout(10000, () => {
      debugLog('Request timeout (10s)', { suggestion: 'npm registry may be slow. Retry later.' });
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}

module.exports = {
  getLatestVersion,
};
