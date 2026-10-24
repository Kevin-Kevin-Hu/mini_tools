// ESLint 平面配置（ESLint 9 flat config）。
// 只检查 src/ 与 tests/，避免误伤 vite.config.js / 构建产物。
// 规则取向：抓"真问题"（未定义变量、未用变量、缺失 key、危险写法、hooks 规则），
// 不重复 Prettier 的格式职责；React 17+ 自动 JSX runtime，故关闭 react-in-jsx-scope 与 prop-types。
import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  {
    files: ['src/**/*.{js,jsx}', 'tests/**/*.{js,jsx}'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}', 'tests/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // 让核心 no-unused-vars 识别 JSX 中使用的组件/React（否则 <Hub/>、<App/> 会被误报未使用）
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'react/no-unknown-property': ['error', { ignore: ['class'] }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-console': 'warn',
      'no-duplicate-imports': 'error',
      'prefer-const': 'warn',
    },
  },
  // ---------- 原生微信小程序 ----------
  // miniprogram/ 不走 Vite：宿主全局（wx / Page / Component / App…）由微信运行时注入，
  // 模块用 CommonJS（require / module.exports）。不做这套配置的话，
  // `eslint .` 会对整个小程序目录报 100+ 条 no-undef 误报。
  {
    files: ['miniprogram/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        wx: 'readonly',
        App: 'readonly',
        getApp: 'readonly',
        Page: 'readonly',
        Component: 'readonly',
        Behavior: 'readonly',
        getCurrentPages: 'readonly',
        ...globals.browser,
        ...globals.commonjs,
      },
    },
    rules: {
      // 小程序里 console 是主要调试手段，放开
      'no-console': 'off',
      // catch (_e) 是"故意吞掉"的写法，别当成未使用变量报错
      'no-unused-vars': ['error', { caughtErrorsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: [
      'node_modules/**',
      'static/**',
      'dist/**',
      'build/**',
      'web/**',
      '*.genie',
      // 第三方 SDK 构建产物，不参与本仓库 lint
      'miniprogram/node_modules/**',
      'miniprogram/vendor/**',
    ],
  },
]
