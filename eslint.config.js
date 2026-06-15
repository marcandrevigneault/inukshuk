// Flat ESLint config (ESLint 9+). Extends Expo's recommended rules and turns
// off any rules that would fight Prettier.
const expoConfig = require('eslint-config-expo/flat');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = [
  ...expoConfig,
  eslintConfigPrettier,
  {
    ignores: [
      'dist/*',
      'node_modules/*',
      '.expo/*',
      'assets/pdfjs/*',
      'coverage/*',
      'android/*',
      'ios/*',
    ],
  },
];
