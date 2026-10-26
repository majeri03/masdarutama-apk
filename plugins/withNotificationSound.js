const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin to copy custom notification sound to Android res/raw directory
 */
const withNotificationSound = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const soundSource = path.join(projectRoot, 'assets', 'Masdar_Utama.mp3');
      
      const rawResDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'raw'
      );

      if (fs.existsSync(soundSource)) {
        if (!fs.existsSync(rawResDir)) {
          fs.mkdirSync(rawResDir, { recursive: true });
        }
        // Android resource names must be lowercase with underscores
        const destFile = path.join(rawResDir, 'masdar_utama.mp3');
        fs.copyFileSync(soundSource, destFile);
        console.log(`[ConfigPlugin] Copied notification sound to ${destFile}`);
      } else {
        console.warn(`[ConfigPlugin] Sound source not found: ${soundSource}`);
      }

      return config;
    },
  ]);
};

module.exports = withNotificationSound;
