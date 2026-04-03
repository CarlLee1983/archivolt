export type MarkerAction = 'navigate' | 'submit' | 'click' | 'request'

export interface OperationMarker {
  readonly id: string
  readonly sessionId: string
  readonly timestamp: number
  readonly url: string
  readonly action: MarkerAction
  readonly target?: string
  readonly label?: string
}

let _counter = 0

export function createMarker(params: {
  sessionId: string
  url: string
  action: MarkerAction
  target?: string
  label?: string
}): OperationMarker {
  return {
    id: `mk_${Date.now()}_${_counter++}`,
    timestamp: Date.now(),
    ...params,
  }
}
