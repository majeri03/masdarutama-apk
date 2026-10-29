#!/usr/bin/env node
/**
 * bump-version.js
 * Jalankan: node scripts/bump-version.js [patch|minor|major]
 * Secara otomatis update versi di app.json, package.json, update.service.ts, dan SidebarDrawer.tsx
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const appJsonPath = path.join(ROOT, 'app.json');
const packageJsonPath = path.join(ROOT, 'package.json');
const updateServicePath = path.join(ROOT, 'src', 'services', 'update.service.ts');
const sidebarPath = path.join(ROOT, 'src', 'components', 'ui', 'SidebarDrawer.tsx');

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const currentVersion = appJson.expo.version;
const [major, minor, patch] = currentVersion.split('.').map(Number);
const bumpType = process.argv[2] || 'patch';

let newMajor = major, newMinor = minor, newPatch = patch;
if (bumpType === 'major') { newMajor++; newMinor = 0; newPatch = 0; }
else if (bumpType === 'minor') { newMinor++; newPatch = 0; }
else { newPatch++; }

const newVersion = `${newMajor}.${newMinor}.${newPatch}`;
const newVersionCode = (appJson.expo.android.versionCode || 1) + 1;

// Update app.json
appJson.expo.version = newVersion;
appJson.expo.android.versionCode = newVersionCode;
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
console.log(`[app.json] version: ${currentVersion} => ${newVersion}, versionCode: ${newVersionCode}`);

// Update package.json
packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
console.log(`[package.json] version: ${newVersion}`);

// Update update.service.ts
let serviceContent = fs.readFileSync(updateServicePath, 'utf8');
serviceContent = serviceContent
  .replace(/export const CURRENT_VERSION = '[^']+';/, `export const CURRENT_VERSION = '${newVersion}';`)
  .replace(/export const CURRENT_VERSION_CODE = \d+;/, `export const CURRENT_VERSION_CODE = ${newVersionCode};`);
fs.writeFileSync(updateServicePath, serviceContent);
console.log(`[update.service.ts] CURRENT_VERSION: ${newVersion}, CURRENT_VERSION_CODE: ${newVersionCode}`);

// Update SidebarDrawer.tsx version text
let sidebarContent = fs.readFileSync(sidebarPath, 'utf8');
const sidebarBefore = sidebarContent;
sidebarContent = sidebarContent.replace(/Versi \d+\.\d+\.\d+ •/, `Versi ${newVersion} •`);
if (sidebarContent !== sidebarBefore) {
  fs.writeFileSync(sidebarPath, sidebarContent);
  console.log(`[SidebarDrawer.tsx] version text updated`);
}

console.log(`\n✅ Versi berhasil di-bump: ${currentVersion} => ${newVersion} (Build ${newVersionCode})`);
console.log('   Jangan lupa upload APK baru dan update manifest JSON di Google Drive!');
