import { describe, expect, it } from 'vitest'

import { EMPTY_FILTERS, hasActiveFilters, toAppliedFilters, usdcToMinor } from './filters'

describe('transaction filters', () => {
  it('converts USDC into six-decimal minor units', () => {
    expect(usdcToMinor('1.25')).toBe(1_250_000)
    expect(usdcToMinor('0.000001')).toBe(1)
    expect(usdcToMinor('')).toBeUndefined()
    expect(usdcToMinor('-1')).toBeUndefined()
  })

  it('omits empty fields and creates contract-compatible query values', () => {
    expect(
      toAppliedFilters({
        ...EMPTY_FILTERS,
        search: '  payroll  ',
        statuses: ['pending', 'failed'],
        dateFrom: '2026-01-02',
        dateTo: '2026-01-10',
        amountMin: '1.25',
      }),
    ).toEqual({
      search: 'payroll',
      status: ['pending', 'failed'],
      dateFrom: '2026-01-02T00:00:00Z',
      dateTo: '2026-01-10T23:59:59Z',
      amountMinMinor: 1_250_000,
    })
  })

  it('detects whether an applied filter set is active', () => {
    expect(hasActiveFilters({})).toBe(false)
    expect(hasActiveFilters({ search: 'invoice' })).toBe(true)
  })
})
