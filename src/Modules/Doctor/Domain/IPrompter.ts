export interface IPrompter {
  confirm(message: string): Promise<boolean>
}
