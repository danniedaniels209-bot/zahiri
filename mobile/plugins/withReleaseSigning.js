/**
 * Wires the release keystore into the generated Gradle project.
 *
 * The keystore and its password live in `credentials/` (git-ignored) rather than
 * inside `android/`, because `expo prebuild` deletes and recreates that
 * directory. This plugin copies the keystore in and rewrites build.gradle on
 * every prebuild, so a release APK is always signed with the same key.
 *
 * If `credentials/keystore.json` is missing the plugin does nothing, and Gradle
 * falls back to the debug key — fine for a local test build, not for release.
 */
const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const CREDENTIALS = 'credentials/keystore.json';

function readCredentials(projectRoot) {
  const file = path.join(projectRoot, CREDENTIALS);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Copy the keystore into android/app so Gradle can find it by name. */
function withKeystoreFile(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const creds = readCredentials(projectRoot);
      if (!creds) {
        console.warn(
          '[withReleaseSigning] credentials/keystore.json not found — the release build will use the debug key.',
        );
        return cfg;
      }

      const source = path.join(projectRoot, creds.keystorePath);
      if (!fs.existsSync(source)) {
        console.warn(`[withReleaseSigning] keystore missing at ${creds.keystorePath}`);
        return cfg;
      }

      const dest = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        path.basename(creds.keystorePath),
      );
      fs.copyFileSync(source, dest);
      return cfg;
    },
  ]);
}

function withSigningConfig(config) {
  return withAppBuildGradle(config, (cfg) => {
    const creds = readCredentials(cfg.modRequest.projectRoot);
    if (!creds) return cfg;

    const keystoreName = path.basename(creds.keystorePath);
    let gradle = cfg.modResults.contents;

    if (gradle.includes('zahiriRelease')) return cfg; // already applied

    // Add a release signing config beside the generated debug one.
    gradle = gradle.replace(
      /signingConfigs\s*\{/,
      `signingConfigs {
        zahiriRelease {
            storeFile file('${keystoreName}')
            storePassword '${creds.keystorePassword}'
            keyAlias '${creds.keyAlias}'
            keyPassword '${creds.keyPassword}'
            // Both signature schemes: v1 for older devices, v2 for API 24+.
            v1SigningEnabled true
            v2SigningEnabled true
        }`,
    );

    // Point the release build type at it, replacing the debug default Expo sets.
    gradle = gradle.replace(
      /(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/s,
      '$1signingConfig signingConfigs.zahiriRelease',
    );

    cfg.modResults.contents = gradle;
    return cfg;
  });
}

module.exports = function withReleaseSigning(config) {
  return withSigningConfig(withKeystoreFile(config));
};
