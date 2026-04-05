import { build } from 'bun'

await build({
  entrypoints: [
    './src/background.ts',
    './src/content-main.ts',
    './src/content.ts',
    './src/popup.ts',
  ],
  outdir: './dist',
  target: 'browser',
  format: 'esm',
  minify: false,
  sourcemap: 'external',
})

console.log('Extension built to dist/')
