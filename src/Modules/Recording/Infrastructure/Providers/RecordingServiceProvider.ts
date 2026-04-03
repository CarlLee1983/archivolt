import { ModuleServiceProvider, type IContainer } from '@/Shared/Infrastructure/IServiceProvider'
import { RecordingRepository } from '@/Modules/Recording/Infrastructure/Persistence/RecordingRepository'
import { RecordingService } from '@/Modules/Recording/Application/Services/RecordingService'
import { MysqlProtocolParser } from '@/Modules/Recording/Infrastructure/Proxy/MysqlProtocolParser'
import path from 'node:path'

export class RecordingServiceProvider extends ModuleServiceProvider {
  register(container: IContainer): void {
    container.singleton('recordingRepository', () => {
      const dir = process.env.ARCHIVOLT_RECORDINGS_DIR ?? path.resolve(process.cwd(), 'data/recordings')
      return new RecordingRepository(dir)
    })

    container.singleton('recordingService', (c) => {
      const repo = c.make('recordingRepository') as RecordingRepository
      const parser = new MysqlProtocolParser()
      return new RecordingService(repo, parser)
    })
  }
}
