import { describe, expect, it } from 'vitest'

import { formatUsdc } from './money'

describe('formatUsdc', () => {
  it('renders minor units as USDC with six decimals available', () => {
    expect(formatUsdc(1_250_000)).toBe('1.25 USDC')
    expect(formatUsdc(1)).toMatch(/0\.000001 USDC/)
    expect(formatUsdc(0)).toBe('0.00 USDC')
  })
})
