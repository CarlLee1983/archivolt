import { describe, it, expect } from 'vitest'
import { parseInstallSkillArgs } from '@/CLI/InstallSkillCommand'

describe('parseInstallSkillArgs', () => {
  it('defaults to claude format', () => {
    const args = parseInstallSkillArgs(['install-skill'])
    expect(args.format).toBe('claude')
  })

  it('parses --cursor flag', () => {
    const args = parseInstallSkillArgs(['install-skill', '--cursor'])
    expect(args.format).toBe('cursor')
  })

  it('parses --codex flag', () => {
    const args = parseInstallSkillArgs(['install-skill', '--codex'])
    expect(args.format).toBe('codex')
  })

  it('--cursor takes precedence if both flags given', () => {
    const args = parseInstallSkillArgs(['install-skill', '--cursor', '--codex'])
    expect(args.format).toBe('cursor')
  })
})
