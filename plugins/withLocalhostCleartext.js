// @ts-check
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Permit cleartext HTTP to loopback (127.0.0.1 / localhost) only.
 *
 * The offline-map download serves the MapLibre style document from a transient
 * in-app HTTP server bound to 127.0.0.1 (see src/data/offline.ts) — MapLibre's
 * native offline downloader only accepts http(s) style URLs, and inline JSON /
 * file:// are rejected. Android (targetSdk 36) blocks cleartext by default, so
 * we inject a *scoped* network-security-config that allows cleartext to loopback
 * and nothing else (every other host stays https-only). This is narrower and
 * safer than `usesCleartextTraffic=true`, which would permit cleartext app-wide.
 */
const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">127.0.0.1</domain>
    <domain includeSubdomains="false">localhost</domain>
  </domain-config>
</network-security-config>
`;

/** @type {import('@expo/config-plugins').ConfigPlugin} */
module.exports = function withLocalhostCleartext(config) {
  // 1. Write res/xml/network_security_config.xml during prebuild (survives the
  //    managed prebuild that regenerates the android/ project).
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const resXmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      fs.mkdirSync(resXmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(resXmlDir, 'network_security_config.xml'),
        NETWORK_SECURITY_CONFIG,
      );
      return cfg;
    },
  ]);

  // 2. Point <application android:networkSecurityConfig> at it.
  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return cfg;
  });

  return config;
};
