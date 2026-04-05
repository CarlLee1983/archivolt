import path from 'node:path'
import { mkdir, copyFile, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

export interface InstallSkillArgs {
  readonly format: 'claude' | 'cursor' | 'codex'
}

export function parseInstallSkillArgs(argv: string[]): InstallSkillArgs {
  if (argv.includes('--cursor')) return { format: 'cursor' }
  if (argv.includes('--codex')) return { format: 'codex' }
  return { format: 'claude' }
}

function resolveSkillsDir(): string {
  const candidates = [
    path.resolve(import.meta.dir, '../..', 'skills'),
    path.resolve(process.cwd(), 'skills'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('skills/ directory not found. Is Archivolt installed correctly?')
}

export async function runInstallSkillCommand(argv: string[]): Promise<void> {
  const { format } = parseInstallSkillArgs(argv)
  const skillsDir = resolveSkillsDir()
  const files = (await readdir(skillsDir)).filter((f) => f.endsWith('.md'))

  if (files.length === 0) {
    console.error('No skill files found in skills/')
    process.exit(1)
  }

  if (format === 'claude') {
    const home = process.env.HOME
    if (!home) throw new Error('HOME environment variable not set')
    const targetDir = path.join(home, '.claude', 'plugins', 'archivolt', 'skills')
    await mkdir(targetDir, { recursive: true })
    for (const file of files) {
      await copyFile(path.join(skillsDir, file), path.join(targetDir, file))
      console.log(`Installed: ${file}`)
    }
    console.log(`\nSkills installed to ${targetDir}`)
    console.log('Restart Claude Code to activate.')
    return
  }

  if (format === 'cursor') {
    const targetDir = path.join(process.cwd(), '.cursor', 'rules')
    await mkdir(targetDir, { recursive: true })
    for (const file of files) {
      const mdcName = file.replace('.md', '.mdc')
      await copyFile(path.join(skillsDir, file), path.join(targetDir, mdcName))
      console.log(`Written: .cursor/rules/${mdcName}`)
    }
    console.log('\nSkills written to .cursor/rules/')
    return
  }

  if (format === 'codex') {
    const parts: string[] = ['# Archivolt Skills\n']
    for (const file of files) {
      const content = await readFile(path.join(skillsDir, file), 'utf-8')
      parts.push(`---\n\n${content}`)
    }
    const outPath = path.join(process.cwd(), 'archivolt-skills-system-prompt.md')
    await writeFile(outPath, parts.join('\n'), 'utf-8')
    console.log('Written: archivolt-skills-system-prompt.md')
    console.log("Prepend this file's content to your Codex or ChatGPT system prompt.")
  }
}
