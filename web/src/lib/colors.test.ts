import { describe, expect, it } from 'vitest'

import type { ColorToken } from './colors'
import { colorStyle } from './colors'

const TOKENS: ColorToken[] = ['slate', 'blue', 'teal', 'green', 'amber', 'orange', 'red', 'purple']

describe('colorStyle', () => {
  it.each(TOKENS)('maps %s to a design token', (token) => {
    expect(colorStyle(token).background).toBe(`var(--chip-${token}-bg)`)
  })

  it('gives every known token a distinct background', () => {
    const backgrounds = new Set(TOKENS.map((token) => colorStyle(token).background))
    expect(backgrounds.size).toBe(TOKENS.length)
  })

  it('falls back to a legible token for a colour it does not know', () => {
    expect(colorStyle('chartreuse').background).toBe('var(--chip-unknown-bg)')
  })
})
