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

async function copyDirRecursive(
  src: string,
  dest: string,
  transform?: (filename: string) => string
): Promise<void> {
  await mkdir(dest, { recursive: true })
  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destName = transform ? transform(entry.name) : entry.name
    const destPath = path.join(dest, destName)
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath, transform)
    } else {
      await copyFile(srcPath, destPath)
    }
  }
}

export async function copySkillsToDir(
  sourceSkillsDir: string,
  targetDir: string,
  format: 'claude' | 'cursor' | 'codex'
): Promise<void> {
  const files = (await readdir(sourceSkillsDir)).filter((f) => f.endsWith('.md'))

  if (format === 'claude') {
    for (const file of files) {
      await copyFile(path.join(sourceSkillsDir, file), path.join(targetDir, file))
      console.log(`Installed: ${file}`)
    }
    const playbooksDir = path.join(sourceSkillsDir, 'playbooks')
    if (existsSync(playbooksDir)) {
      await copyDirRecursive(playbooksDir, path.join(targetDir, 'playbooks'))
      console.log('Installed: playbooks/')
    }
    return
  }

  if (format === 'cursor') {
    for (const file of files) {
      const mdcName = file.replace('.md', '.mdc')
      await copyFile(path.join(sourceSkillsDir, file), path.join(targetDir, mdcName))
      console.log(`Written: ${mdcName}`)
    }
    const playbooksDir = path.join(sourceSkillsDir, 'playbooks')
    if (existsSync(playbooksDir)) {
      await copyDirRecursive(
        playbooksDir,
        path.join(targetDir, 'playbooks'),
        (name) => name.replace('.md', '.mdc')
      )
      console.log('Written: playbooks/')
    }
    return
  }

  if (format === 'codex') {
    const parts: string[] = ['# Archivolt Skills\n']
    for (const file of files) {
      const content = await readFile(path.join(sourceSkillsDir, file), 'utf-8')
      parts.push(`---\n\n${content}`)
    }
    const playbooksDir = path.join(sourceSkillsDir, 'playbooks')
    if (existsSync(playbooksDir)) {
      const playbookFiles = (await readdir(playbooksDir)).filter((f) => f.endsWith('.md'))
      for (const file of playbookFiles) {
        const content = await readFile(path.join(playbooksDir, file), 'utf-8')
        parts.push(`---\n\n${content}`)
      }
    }
    const outPath = path.join(targetDir, 'archivolt-skills-system-prompt.md')
    await writeFile(outPath, parts.join('\n'), 'utf-8')
    console.log('Written: archivolt-skills-system-prompt.md')
    console.log("Prepend this file's content to your Codex or ChatGPT system prompt.")
  }
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
    await copySkillsToDir(skillsDir, targetDir, format)
    console.log(`\nSkills installed to ${targetDir}`)
    console.log('Restart Claude Code to activate.')
    return
  }

  if (format === 'cursor') {
    const targetDir = path.join(process.cwd(), '.cursor', 'rules')
    await mkdir(targetDir, { recursive: true })
    await copySkillsToDir(skillsDir, targetDir, format)
    console.log('\nSkills written to .cursor/rules/')
    return
  }

  if (format === 'codex') {
    await copySkillsToDir(skillsDir, process.cwd(), format)
    console.log("Prepend this file's content to your Codex or ChatGPT system prompt.")
  }
}
