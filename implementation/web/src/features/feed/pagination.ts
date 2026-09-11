export type PageControl = number | 'ellipsis'

export function visiblePages(current: number, total: number): PageControl[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1)
  }

  const candidates = [...new Set([1, current - 1, current, current + 1, total])]
    .filter((value) => value >= 1 && value <= total)
    .sort((a, b) => a - b)
  const controls: PageControl[] = []

  candidates.forEach((value, index) => {
    const previous = candidates[index - 1]
    if (previous !== undefined && value - previous > 1) {
      controls.push('ellipsis')
    }
    controls.push(value)
  })
  return controls
}
