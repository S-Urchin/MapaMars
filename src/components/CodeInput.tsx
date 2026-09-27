import { useRef, useState } from 'react'
import { formatCode, sanitizeCode } from '../lib/missionCode'

type Props = {
  /** Up to six characters without the dash, e.g. "ABC12". */
  value: string
  onChange: (raw: string) => void
  /** Called once all six characters are filled in. */
  onComplete?: (code: string) => void
  label: string
  autoFocus?: boolean
  invalid?: boolean
  describedBy?: string
}

/**
 * Mission code entry shown as _ _ _ - _ _ _. One real text input sits over the boxes,
 * so typing, backspace, paste and mobile keyboards all behave normally.
 */
export function CodeInput({ value, onChange, onComplete, label, autoFocus, invalid, describedBy }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const chars = value.split('')

  const handleChange = (text: string) => {
    const next = sanitizeCode(text)
    onChange(next)
    if (next.length === 6 && value.length !== 6) onComplete?.(formatCode(next))
  }

  const box = (i: number) => (
    <span key={i} className={`code-box${focused && i === Math.min(value.length, 5) ? ' is-active' : ''}${chars[i] ? ' is-filled' : ''}`}>
      {chars[i] ?? ''}
    </span>
  )

  return (
    <div className={`code-input${invalid ? ' is-invalid' : ''}`} onClick={() => inputRef.current?.focus()}>
      <div className="code-boxes" aria-hidden="true">
        {[0, 1, 2].map(box)}
        <span className="code-dash">-</span>
        {[3, 4, 5].map(box)}
      </div>
      <input
        ref={inputRef}
        className="code-native"
        value={formatCode(value)}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // Put the caret at the end so typing always fills the next box
        onSelect={(e) => { const el = e.currentTarget; const end = el.value.length; if (el.selectionStart !== end) el.setSelectionRange(end, end) }}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoFocus={autoFocus}
        maxLength={7}
        inputMode={value.length < 3 ? 'text' : 'numeric'}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
    </div>
  )
}
