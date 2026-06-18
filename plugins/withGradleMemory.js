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
  '-Xmx3072m -XX:MaxMetaspaceSize=2048m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8';

// TEMP (local low-RAM build): one JVM so the OS doesn't OOM-kill forked workers.
const PROPS = {
  'org.gradle.jvmargs': JVM_ARGS,
  'org.gradle.daemon': 'false',
  'org.gradle.parallel': 'false',
  'org.gradle.workers.max': '1',
  'kotlin.compiler.execution.strategy': 'in-process',
};

/** @type {import('@expo/config-plugins').ConfigPlugin} */
module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(PROPS)) {
      const existing = cfg.modResults.find((p) => p.type === 'property' && p.key === key);
      if (existing) existing.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
};
