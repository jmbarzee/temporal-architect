import type { OptionsBlock, OptionEntry } from '../../types/ast'
import { useToggle } from './useToggle'
import './blocks.css'

// Renders an options block (call/handler/namespace deployment config) as a
// collapsible, neutrally-colored box. Collapsed, it shows a summary of the
// top-level option keys; expanded, it shows the full recursive key/value list.
// Leaf entries render as `key: value`; group entries (e.g. retry_policy,
// priority) render their key and indent their sub-entries one nesting level.
export function OptionsSection({ options }: { options?: OptionsBlock }) {
  const [expanded, toggle] = useToggle(false)
  if (!options || !options.entries || options.entries.length === 0) return null

  const summary = options.entries.map((e) => e.key).join(', ')

  return (
    <div className={`options-block ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="options-block-header" onClick={toggle}>
        <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        <span className="options-block-label">options</span>
        {!expanded && <span className="options-block-summary" title={summary}>{summary}</span>}
      </div>
      {expanded && (
        <div className="options-block-body">
          <OptionEntryList entries={options.entries} />
        </div>
      )}
    </div>
  )
}

function OptionEntryList({ entries }: { entries: OptionEntry[] }) {
  return (
    <div className="option-entry-list">
      {entries.map((entry, i) => (
        <OptionEntryRow key={`${entry.key}:${i}`} entry={entry} />
      ))}
    </div>
  )
}

function OptionEntryRow({ entry }: { entry: OptionEntry }) {
  const hasNested = !!entry.nested && entry.nested.length > 0

  if (hasNested) {
    return (
      <div className="option-entry">
        <span className="option-key">{entry.key}:</span>
        <div className="option-nested">
          <OptionEntryList entries={entry.nested!} />
        </div>
      </div>
    )
  }

  return (
    <div className="option-entry">
      <span className="option-key">{entry.key}:</span>
      <span className="option-value">{entry.value}</span>
    </div>
  )
}
