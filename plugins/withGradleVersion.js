/**
 * Custom Expo Config Plugin: withGradleVersion
 *
 * Pins the Gradle distribution URL in gradle-wrapper.properties to avoid
 * the build failure caused by expo-modules-autolinking incompatibility with Gradle 8.14.3+.
 *
 * Error fixed:
 * "Field 'version' is required for type with serial name
 *  'expo.modules.plugin.configuration.Publication'"
 */

const { withDangerousMod } = require("expo/config-plugins");
const path = require("path");
const fs = require("fs");

const GRADLE_VERSION = "8.13";
const GRADLE_DIST_URL = `https\\://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip`;

/**
 * Plugin that modifies gradle-wrapper.properties to pin Gradle version.
 */
const withGradleVersion = (config) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const gradleWrapperPath = path.join(
        config.modRequest.platformProjectRoot,
        "gradle",
        "wrapper",
        "gradle-wrapper.properties"
      );

      if (!fs.existsSync(gradleWrapperPath)) {
        console.warn(
          "[withGradleVersion] gradle-wrapper.properties not found at:",
          gradleWrapperPath
        );
        return config;
      }

      let contents = fs.readFileSync(gradleWrapperPath, "utf8");

      // Replace the distributionUrl line with pinned version
      contents = contents.replace(
        /^distributionUrl=.+$/m,
        `distributionUrl=${GRADLE_DIST_URL}`
      );

      fs.writeFileSync(gradleWrapperPath, contents, "utf8");

      console.log(
        `[withGradleVersion] Pinned Gradle to version ${GRADLE_VERSION}`
      );

      return config;
    },
  ]);
};

module.exports = withGradleVersion;
