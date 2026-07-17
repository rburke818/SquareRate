// @ts-check

/**
 * Native ECMAScript Next.js config.
 *
 * The project runs as an ES module ("type": "module"), so the config must be a
 * real `.mjs` file — a compiled-to-CommonJS `next.config.ts` leaks `exports`
 * into ESM scope and crashes `next dev`. Keep this minimal: Next.js 15+/16
 * Turbopack infers the workspace root automatically, so we avoid any
 * `__dirname` / `import.meta.url` gymnastics.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {};

export default nextConfig;
