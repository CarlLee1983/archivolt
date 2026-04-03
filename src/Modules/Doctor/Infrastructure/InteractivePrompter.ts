export interface IPrompter {
  confirm(message: string): Promise<boolean>
}

export class InteractivePrompter implements IPrompter {
  async confirm(message: string): Promise<boolean> {
    process.stdout.write(`${message} (y/n) `)
    for await (const line of console) {
      const answer = line.trim().toLowerCase()
      if (answer === 'y' || answer === 'yes') return true
      if (answer === 'n' || answer === 'no') return false
      process.stdout.write('請輸入 y 或 n: ')
    }
    return false
  }
}

export class NoopPrompter implements IPrompter {
  async confirm(_message: string): Promise<boolean> {
    return false
  }
}
