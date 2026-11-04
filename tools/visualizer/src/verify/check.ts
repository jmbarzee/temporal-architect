// A minimal check runner for the verification bundle. Pure: it records, and
// main.ts prints the report; verify/run.mjs owns the exit code.

export interface Failure {
  check: string
  message: string
}

const failures: Failure[] = []
let checks = 0

/** Runs one named check; a thrown error is its failure. */
export function check(name: string, fn: () => void): void {
  checks++
  try {
    fn()
  } catch (err) {
    failures.push({ check: name, message: err instanceof Error ? err.message : String(err) })
  }
}

export function equal<T>(actual: T, expected: T, what = 'value'): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${what}: got ${a}, want ${e}`)
}

export function report(): { checks: number; failures: Failure[] } {
  return { checks, failures }
}
