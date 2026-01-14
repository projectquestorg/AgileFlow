const js = require('@eslint/js');
const prettierConfig = require('eslint-config-prettier');
const prettierPlugin = require('eslint-plugin-prettier');

module.exports = [
  js.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // Node.js globals
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        exports: 'writable',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
        setImmediate: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
        clearImmediate: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
        // Jest globals
        describe: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        it: 'readonly',
        jest: 'readonly',
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      // Prettier integration
      'prettier/prettier': 'warn',

      // Error prevention
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_|^e$|^err$', varsIgnorePattern: '^_' }],
      'no-console': 'off', // CLI tool needs console
      'no-undef': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-empty': ['warn', { allowEmptyCatch: true }], // CLI tools often have empty catch blocks
      'no-control-regex': 'off', // ANSI escape codes in CLI output

      // Best practices
      eqeqeq: ['warn', 'always', { null: 'ignore' }],
      'no-var': 'warn',
      'prefer-const': 'warn',
      'no-throw-literal': 'error',

      // YAML/JSON parsing consistency - use lib/yaml-utils.js instead of direct js-yaml
      // Tests are excluded via separate config block below
      'no-restricted-syntax': [
        'warn',
        {
          selector: "CallExpression[callee.name='require'][arguments.0.value='js-yaml']",
          message:
            "Use '../lib/yaml-utils' or '../../lib/yaml-utils' instead of direct js-yaml import for consistent YAML parsing",
        },
      ],

      // Code style (beyond Prettier)
      'no-multiple-empty-lines': ['warn', { max: 2, maxEOF: 1 }],
      'no-trailing-spaces': 'warn',
    },
  },
  {
    // Allow direct js-yaml imports in tests (for mocking) and yaml-utils.js itself
    files: ['**/__tests__/**/*.js', '**/lib/yaml-utils.js'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      '*.md',
      'src/core/**', // Markdown command/agent files
    ],
  },
];
