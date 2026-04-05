// test/setup.ts
// Polyfill vi.mocked for bun test environment
// bun's vitest compatibility layer does not expose vi.mocked, so we add it here.
import { vi } from 'vitest'

if (typeof vi.mocked === 'undefined') {
  // @ts-expect-error — patching partial bun vitest shim
  vi.mocked = <T>(fn: T): T => fn
}
