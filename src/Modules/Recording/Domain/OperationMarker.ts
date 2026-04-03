export type MarkerAction = 'navigate' | 'submit' | 'click' | 'request'

export interface MarkerRequestDetail {
  readonly method: string
  readonly url: string
  readonly headers?: Record<string, string>
  readonly body?: string
  readonly queryParams?: Record<string, string>
}

export interface OperationMarker {
  readonly id: string
  readonly sessionId: string
  readonly timestamp: number
  readonly url: string
  readonly action: MarkerAction
  readonly target?: string
  readonly label?: string
  readonly request?: MarkerRequestDetail
}

let _counter = 0

export function createMarker(params: {
  sessionId: string
  url: string
  action: MarkerAction
  target?: string
  label?: string
  request?: MarkerRequestDetail
}): OperationMarker {
  return {
    id: `mk_${Date.now()}_${_counter++}`,
    timestamp: Date.now(),
    ...params,
  }
}
