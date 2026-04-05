import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { parseInstallSkillArgs, copySkillsToDir } from '@/CLI/InstallSkillCommand'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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

describe('copySkillsToDir', () => {
  let tmpSource: string
  let tmpTarget: string

  beforeEach(async () => {
    const base = path.join(os.tmpdir(), `archivolt-test-${Date.now()}`)
    tmpSource = path.join(base, 'skills')
    tmpTarget = path.join(base, 'target')
    await mkdir(path.join(tmpSource, 'playbooks'), { recursive: true })
    await mkdir(tmpTarget, { recursive: true })
    await writeFile(path.join(tmpSource, 'archivolt-schema.md'), '# schema')
    await writeFile(path.join(tmpSource, 'playbooks', 'slim-mvc.md'), '# slim-mvc')
    await writeFile(path.join(tmpSource, 'playbooks', 'commands-laravel.md'), '# laravel')
  })

  it('copies top-level .md files to target (claude format)', async () => {
    await copySkillsToDir(tmpSource, tmpTarget, 'claude')
    expect(existsSync(path.join(tmpTarget, 'archivolt-schema.md'))).toBe(true)
  })

  it('copies playbooks/ subdirectory to target (claude format)', async () => {
    await copySkillsToDir(tmpSource, tmpTarget, 'claude')
    expect(existsSync(path.join(tmpTarget, 'playbooks', 'slim-mvc.md'))).toBe(true)
    expect(existsSync(path.join(tmpTarget, 'playbooks', 'commands-laravel.md'))).toBe(true)
  })

  it('copies playbooks/ to cursor rules subdirectory', async () => {
    await copySkillsToDir(tmpSource, tmpTarget, 'cursor')
    expect(existsSync(path.join(tmpTarget, 'playbooks', 'slim-mvc.mdc'))).toBe(true)
  })

  it('embeds playbook contents in codex combined file', async () => {
    const outDir = path.join(os.tmpdir(), `archivolt-codex-${Date.now()}`)
    await mkdir(outDir, { recursive: true })
    await copySkillsToDir(tmpSource, outDir, 'codex')
    const outFile = path.join(outDir, 'archivolt-skills-system-prompt.md')
    const content = await readFile(outFile, 'utf-8')
    expect(content).toContain('# slim-mvc')
    expect(content).toContain('# laravel')
  })
})
