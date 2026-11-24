// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Scrubber } from './Scrubber'

afterEach(cleanup)

function Host({ length = 3 }: { length?: number }) {
  const [position, setPosition] = React.useState(length)
  return <Scrubber position={position} length={length} onPosition={setPosition} />
}

describe('Scrubber', () => {
  it('steps back and forward between none and all, and says where it is', () => {
    render(<Host />)
    expect(screen.getByText('3 / 3')).toBeTruthy()
    expect((screen.getByLabelText('Step forward') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Step back'))
    expect(screen.getByText('2 / 3')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Step'), { target: { value: '0' } })
    expect(screen.getByText('0 / 3')).toBeTruthy()
    expect((screen.getByLabelText('Step back') as HTMLButtonElement).disabled).toBe(true)
  })

  it('plays from the start when it is at the end', () => {
    render(<Host />)
    fireEvent.click(screen.getByLabelText('Play'))
    expect(screen.getByText('0 / 3')).toBeTruthy()
    expect(screen.getByLabelText('Pause')).toBeTruthy()
  })
})
