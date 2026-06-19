# Use TypeScript and Browser-Native UI

Reader uses TypeScript with browser-native ES modules and DOM UI for the Chrome extension implementation. The original Vite and React plan was replaced during implementation because the local esbuild binary used by Vite hung in this environment; the browser-native structure keeps the extension small, verifiable, and independent of a bundler while preserving typed extension messages and MiniMax payloads.
