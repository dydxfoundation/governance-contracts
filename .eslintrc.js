module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
    'import',
    'no-only-tests',
  ],
  extends: [
    'eslint:recommended',
    'airbnb-typescript/base',
    'plugin:@typescript-eslint/eslint-recommended',
  ],
  env: {
    node: true,
    es6: true,
  },
  parserOptions: {
    project: './tsconfig.eslint.json',
    ecmaVersion: 2018,
    sourceType: 'module',
    tsconfigRootDir: __dirname,
  },
  ignorePatterns: [
    'coverage/**/*.js',
    'dist/**/*.js',
    'dist/**/*.d.ts',
    'types/**/*.ts',
    'wip/**',
  ],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    // Copied from eslint-config-airbnb-base and modified to handle TypeScript bugs:
    // https://github.com/typescript-eslint/typescript-eslint/issues/1824
    '@typescript-eslint/indent': ['warn', 2, {
      SwitchCase: 1,
      VariableDeclarator: 1,
      outerIIFEBody: 1,
      FunctionDeclaration: {
        parameters: 1,
        body: 1,
      },
      FunctionExpression: {
        parameters: 1,
        body: 1,
      },
      CallExpression: {
        arguments: 1,
      },
      ArrayExpression: 1,
      ObjectExpression: 1,
      ImportDeclaration: 1,
      flatTernaryExpressions: false,
      ignoreComments: false,
      // Ignore TypeScript edge cases that are handled incorrectly.
      // Figured these out using https://astexplorer.net/ with the suggestions described here:
      // https://stackoverflow.com/questions/59851672/eslint-indent-and-ignorenodes-trouble-getting-ast-selectors-to-work-correctl
      ignoredNodes: [
        // Handle multi-line types within an interface declaration.
        'TSInterfaceDeclaration TSPropertySignature TSTypeAnnotation',
        // Handle multi-line types in function return type annotations.
        'FunctionDeclaration > TSTypeAnnotation *',
        // Handle multi-line types within a parameter to a generic type.
        'TSTypeParameterInstantiation',
      ],
    }],
    '@typescript-eslint/lines-between-class-members': ['warn',
      'always',
      { exceptAfterSingleLine: true },
    ],
    '@typescript-eslint/naming-convention': ['warn',
      {
        selector: 'variableLike',
        custom: {
          regex: '^([Aa]ny|[Nn]umber|[Ss]tring|[Bb]oolean|[Uu]ndefined)$',
          match: false,
        },
        format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
        leadingUnderscore: 'allow',
        trailingUnderscore: 'allow',
      },
      {
        selector: 'typeLike',
        custom: {
          regex: '^([Aa]ny|[Nn]umber|[Ss]tring|[Bb]oolean|[Uu]ndefined)$',
          match: false,
        },
        format: ['PascalCase'],
      },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-floating-promises': 'warn',
    '@typescript-eslint/no-shadow': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-use-before-define': 'off',
    '@typescript-eslint/no-var-requires': 'warn',
    '@typescript-eslint/require-await': 'warn',
    '@typescript-eslint/strict-boolean-expressions': 'off',
    'arrow-body-style': 'off',
    'class-methods-use-this': 'off',
    'consistent-return': 'off', // Annoying when return type is Promise<void>. Not as helpful for TypeScript anyway.
    'function-paren-newline': 'off', // Broken in TypeScript: https://github.com/typescript-eslint/typescript-eslint/issues/942
    'global-require': 'warn',
    'import/extensions': ['warn', {
      json: 'always',
    }],
    'import/no-extraneous-dependencies': 'off',
    'import/order': ['warn',
      {
        groups: [
          'builtin',
          'external',
          ['parent', 'sibling', 'internal', 'unknown'],
          'index',
        ],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'import/prefer-default-export': 'off',
    'max-classes-per-file': 'off',
    'no-await-in-loop': 'off',
    'no-continue': 'off',
    'no-else-return': 'off',
    'no-lonely-if': 'off',
    'no-multi-spaces': ['warn', { ignoreEOLComments: true }],
    'no-only-tests/no-only-tests': 'warn',
    'no-plusplus': 'off',
    // Copied from eslint-config-airbnb-base and modified to allow ForOfStatement.
    'no-restricted-syntax': [
      'warn',
      {
        selector: 'ForInStatement',
        message: 'for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.',
      },
      {
        selector: 'LabeledStatement',
        message: 'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
      },
      {
        selector: 'WithStatement',
        message: '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
      },
    ],
    'no-shadow': 'off', // Disable in favor of @typescript-eslint/no-shadow.
    'no-underscore-dangle': 'off',
    'no-use-before-define': 'off',
    'operator-linebreak': ['warn',
      'after',
      {
        overrides: {
          '?': 'before',
          ':': 'before',
          '=': 'none',
        },
      },
    ],
    'padded-blocks': 'off',
    'prefer-destructuring': 'off',
    'spaced-comment': ['warn', 'always', { exceptions: ['/'] }],
  },
};
