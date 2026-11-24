// The link that opens the visualizer on a step: query parameters on the page's
// own address, so any other parameter (`ast`) rides along unread. The rules are
// spec/VIEW_FRAMEWORK.md § Steps.

export type ViewName = 'tree' | 'graph' | 'sequence'
const VIEW_NAMES: readonly string[] = ['tree', 'graph', 'sequence']

export interface Link {
  /** The step's key. */
  step?: string
  view?: ViewName
}

/** What the query string a page was opened with names. */
export function parseLink(search: string): Link {
  const params = new URLSearchParams(search)
  const view = params.get('view')
  return {
    ...(params.has('step') && { step: params.get('step')! }),
    ...(view !== null && VIEW_NAMES.includes(view) && { view: view as ViewName }),
  }
}

/** The query string `search` becomes when it names `link`; `execution` and every other parameter stay. */
export function linkOf(search: string, { step, view }: Link): string {
  const params = new URLSearchParams(search)
  for (const [name, value] of [['step', step], ['view', view]] as const) {
    if (value === undefined) params.delete(name)
    else params.set(name, value)
  }
  return `?${params}`
}
