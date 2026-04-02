import { existsSync, writeFileSync, readFileSync } from 'node:fs'
import type { ERModel } from '../../Domain/ERModel'

export class JsonFileRepository {
  private readonly filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  async save(model: ERModel): Promise<void> {
    const json = JSON.stringify(model, null, 2)
    writeFileSync(this.filePath, json, 'utf-8')
  }

  async load(): Promise<ERModel | null> {
    if (!existsSync(this.filePath)) return null
    const text = readFileSync(this.filePath, 'utf-8')
    return JSON.parse(text) as ERModel
  }

  async exists(): Promise<boolean> {
    return existsSync(this.filePath)
  }
}
