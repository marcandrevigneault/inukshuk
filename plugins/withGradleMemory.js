// @ts-check
const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Raise the Gradle daemon's heap + metaspace for local/EAS production builds.
 *
 * The Expo SDK 56 template ships `org.gradle.jvmargs=-Xmx2048m
 * -XX:MaxMetaspaceSize=512m`. That 512m metaspace OOMs during
 * `:expo-updates:kspReleaseKotlin` (KSP + Kotlin compile load a lot of class
 * metadata), failing the bundleRelease task. `expo-build-properties` does not
 * expose jvmargs, so we patch the generated `android/gradle.properties` directly
 * during prebuild — this survives the managed prebuild that regenerates android/.
 */
const JVM_ARGS =
  '-Xmx4096m -XX:MaxMetaspaceSize=2048m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8';

const KEY = 'org.gradle.jvmargs';

/** @type {import('@expo/config-plugins').ConfigPlugin} */
module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    const existing = cfg.modResults.find((p) => p.type === 'property' && p.key === KEY);
    if (existing) {
      existing.value = JVM_ARGS;
    } else {
      cfg.modResults.push({ type: 'property', key: KEY, value: JVM_ARGS });
    }
    return cfg;
  });
};
