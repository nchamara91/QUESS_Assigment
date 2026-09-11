import { describe, expect, it } from 'vitest'

import { visiblePages } from './pagination'

describe('visiblePages', () => {
  it('shows every page for a short result set', () => {
    expect(visiblePages(2, 4)).toEqual([1, 2, 3, 4])
  })

  it('adds ellipses around the current page for long result sets', () => {
    expect(visiblePages(5, 12)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 12])
  })

  it('keeps the first and last pages visible near the edges', () => {
    expect(visiblePages(2, 12)).toEqual([1, 2, 3, 'ellipsis', 12])
    expect(visiblePages(11, 12)).toEqual([1, 'ellipsis', 10, 11, 12])
  })
})
