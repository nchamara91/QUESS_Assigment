import type {
  ListTransactionsApiArg,
  TransactionKind,
  TransactionStatus,
} from '../../api/generated/transactionsApi'

export type FilterDraft = {
  search: string
  kind: TransactionKind | ''
  statuses: TransactionStatus[]
  dateFrom: string
  dateTo: string
  amountMin: string
  amountMax: string
}

export type AppliedFilters = Pick<
  ListTransactionsApiArg,
  'search' | 'kind' | 'status' | 'dateFrom' | 'dateTo' | 'amountMinMinor' | 'amountMaxMinor'
>

export const EMPTY_FILTERS: FilterDraft = {
  search: '',
  kind: '',
  statuses: [],
  dateFrom: '',
  dateTo: '',
  amountMin: '',
  amountMax: '',
}

/** Convert a human-entered USDC value to integer minor units. */
export function usdcToMinor(value: string): number | undefined {
  if (value.trim() === '') {
    return undefined
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined
  }
  return Math.round(parsed * 1_000_000)
}

/** Convert the draft form into the generated endpoint's query argument shape. */
export function toAppliedFilters(draft: FilterDraft): AppliedFilters {
  const filters: AppliedFilters = {}
  const search = draft.search.trim()
  const amountMinMinor = usdcToMinor(draft.amountMin)
  const amountMaxMinor = usdcToMinor(draft.amountMax)

  if (search) filters.search = search
  if (draft.kind) filters.kind = draft.kind
  if (draft.statuses.length > 0) filters.status = draft.statuses
  if (draft.dateFrom) filters.dateFrom = `${draft.dateFrom}T00:00:00Z`
  if (draft.dateTo) filters.dateTo = `${draft.dateTo}T23:59:59Z`
  if (amountMinMinor !== undefined) filters.amountMinMinor = amountMinMinor
  if (amountMaxMinor !== undefined) filters.amountMaxMinor = amountMaxMinor

  return filters
}

export function hasActiveFilters(filters: AppliedFilters): boolean {
  return Object.keys(filters).length > 0
}
