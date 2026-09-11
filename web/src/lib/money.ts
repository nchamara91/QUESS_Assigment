/** USDC has six decimals; amounts arrive as integer minor units. */
const USDC_DECIMALS = 6

export function formatUsdc(amountMinor: number): string {
  const value = amountMinor / 10 ** USDC_DECIMALS
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: USDC_DECIMALS,
  })} USDC`
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  return date.toLocaleString()
}
