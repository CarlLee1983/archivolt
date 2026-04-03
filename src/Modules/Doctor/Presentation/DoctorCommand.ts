import { DoctorService } from '@/Modules/Doctor/Application/DoctorService'
import { DoctorReporter } from '@/Modules/Doctor/Infrastructure/DoctorReporter'
import { InteractivePrompter, NoopPrompter } from '@/Modules/Doctor/Infrastructure/InteractivePrompter'
import { BunVersionCheck } from '@/Modules/Doctor/Infrastructure/Checks/Environment/BunVersionCheck'
import { DbcliAvailableCheck } from '@/Modules/Doctor/Infrastructure/Checks/Environment/DbcliAvailableCheck'
import { PortAvailableCheck } from '@/Modules/Doctor/Infrastructure/Checks/Environment/PortAvailableCheck'
import { DependenciesCheck } from '@/Modules/Doctor/Infrastructure/Checks/Environment/DependenciesCheck'
import { WebDependenciesCheck } from '@/Modules/Doctor/Infrastructure/Checks/Environment/WebDependenciesCheck'
import { RecordingsDirCheck } from '@/Modules/Doctor/Infrastructure/Checks/Environment/RecordingsDirCheck'
import { ArchivoltJsonCheck } from '@/Modules/Doctor/Infrastructure/Checks/Data/ArchivoltJsonCheck'
import { SchemaStructureCheck } from '@/Modules/Doctor/Infrastructure/Checks/Data/SchemaStructureCheck'
import { VirtualFkIntegrityCheck } from '@/Modules/Doctor/Infrastructure/Checks/Data/VirtualFkIntegrityCheck'
import { TableGroupIntegrityCheck } from '@/Modules/Doctor/Infrastructure/Checks/Data/TableGroupIntegrityCheck'
import { RecordingIntegrityCheck } from '@/Modules/Doctor/Infrastructure/Checks/Data/RecordingIntegrityCheck'
import path from 'node:path'

export interface DoctorArgs {
  readonly noFix: boolean
}

export function parseDoctorArgs(argv: string[]): DoctorArgs {
  return {
    noFix: argv.includes('--no-fix'),
  }
}

export function createChecks(projectRoot: string) {
  const archivoltPath = path.resolve(projectRoot, 'archivolt.json')
  const recordingsDir = process.env.ARCHIVOLT_RECORDINGS_DIR ?? path.resolve(projectRoot, 'data/recordings')
  const port = Number.parseInt(process.env.PORT ?? '3100', 10)

  return [
    new BunVersionCheck(),
    new DbcliAvailableCheck(),
    new PortAvailableCheck(port),
    new DependenciesCheck(projectRoot),
    new WebDependenciesCheck(projectRoot),
    new RecordingsDirCheck(recordingsDir),
    new ArchivoltJsonCheck(archivoltPath),
    new SchemaStructureCheck(archivoltPath),
    new VirtualFkIntegrityCheck(archivoltPath),
    new TableGroupIntegrityCheck(archivoltPath),
    new RecordingIntegrityCheck(recordingsDir),
  ]
}

export async function runDoctorCommand(argv: string[]): Promise<void> {
  const args = parseDoctorArgs(argv)
  const projectRoot = process.cwd()
  const checks = createChecks(projectRoot)
  const prompter = args.noFix ? new NoopPrompter() : new InteractivePrompter()
  const service = new DoctorService(checks, prompter)
  const reporter = new DoctorReporter()

  const results = await service.runAll()
  reporter.report(results)

  if (!args.noFix) {
    await service.interactiveFix(results)
  }
}
