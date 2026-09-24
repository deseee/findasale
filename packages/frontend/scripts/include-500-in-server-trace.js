// Postbuild: make the prerendered custom 500 page readable inside every
// Vercel serverless function.
//
// Why this exists (2026-09-24): Vercel runtime logs showed
//   "Failed to load static file for page: /500 ENOENT: no such file or
//    directory, open '/var/task/packages/frontend/.next/server/pages/500.html'"
// on every server error (e.g. /organizers/[id] getStaticProps throwing on a
// backend 429). pages/500.tsx is fully static, so `next build` prerenders it
// to .next/server/pages/500.html and maps "/500" -> "pages/500.html" in
// server/pages-manifest.json. When a page throws at runtime, Next's server
// (next-server.js handleCatchallRenderRequest -> renderError ->
// renderErrorToResponse) looks "/500" up in that manifest and reads the .html
// file from disk (server/require.js requirePage). Vercel's Next builder
// (@vercel/next) does not ship prerendered .html files inside functions, and
// it only patches the lambda manifest's "/404" entry away from the .html file,
// not "/500", so the read fails and Next falls back to its built-in error page.
//
// Fix: @vercel/next builds every function's shared base layer from
// .next/next-server.js.nft.json / .next/next-minimal-server.js.nft.json
// (paths relative to .next/), and reads them after the whole build command,
// including this postbuild step, has finished. Appending
// "server/pages/500.html" to those traces puts the file at the exact path the
// runtime reads. This must run AFTER `next build`: Next collects its own
// build traces (and outputFileTracingIncludes) before static generation
// writes 500.html, so a next.config.js outputFileTracingIncludes entry cannot
// reliably pick the file up.
//
// Safe no-op when a file is missing (e.g. local `next dev`, or a future Next
// version that changes these outputs). Never fails the build.
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', '.next');
const ENTRY = 'server/pages/500.html';

function main() {
  const htmlPath = path.join(distDir, ENTRY);
  if (!fs.existsSync(htmlPath)) {
    console.log('[include-500-in-server-trace] ' + ENTRY + ' not found, nothing to do');
    return;
  }
  for (const name of ['next-server.js.nft.json', 'next-minimal-server.js.nft.json']) {
    const tracePath = path.join(distDir, name);
    if (!fs.existsSync(tracePath)) {
      console.log('[include-500-in-server-trace] ' + name + ' not found, skipped');
      continue;
    }
    const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
    if (!Array.isArray(trace.files)) {
      console.log('[include-500-in-server-trace] ' + name + ' has no files array, skipped');
      continue;
    }
    if (trace.files.includes(ENTRY)) {
      console.log('[include-500-in-server-trace] ' + name + ' already lists ' + ENTRY);
      continue;
    }
    trace.files.push(ENTRY);
    fs.writeFileSync(tracePath, JSON.stringify(trace));
    console.log('[include-500-in-server-trace] added ' + ENTRY + ' to ' + name);
  }
}

try {
  main();
} catch (err) {
  console.warn('[include-500-in-server-trace] skipped after error: ' + (err && err.message ? err.message : err));
}
