/**
 * Invoice amount matching algorithm
 * Uses Dynamic Programming to solve the subset sum problem.
 * Finds the best combination of invoices that sums closest to the target amount.
 */

export interface InvoiceCandidate {
  id: number
  total_amount: number
  invoice_number: string | null
  invoice_date: string | null
  seller_name: string | null
}

export interface MatchingResult {
  totalAmount: number
  invoices: InvoiceCandidate[]
  invoiceCount: number
  difference: number
  isExact: boolean
}

/**
 * Find the best combinations of invoices that sum closest to the target amount.
 * Returns up to `maxResults` solutions, sorted by:
 *   1. Exact match first
 *   2. Closest to target (largest sum <= target)
 *   3. Fewer invoices as tiebreaker
 */
export function findBestCombinations(
  candidates: InvoiceCandidate[],
  targetAmount: number,
  maxResults = 3
): MatchingResult[] {
  // Filter out invoices larger than target and invalid entries
  const valid = candidates.filter(
    (c) => c.total_amount > 0 && c.total_amount <= targetAmount
  )
  if (valid.length === 0) return []

  // Convert to integer cents for DP precision
  const targetCents = Math.round(targetAmount * 100)
  const amounts = valid.map((c) => Math.round(c.total_amount * 100))

  // Limit candidates to avoid explosion (top 30 by amount should cover most cases)
  const limit = 30
  const indexed = amounts
    .map((a, i) => ({ amount: a, index: i }))
    .sort((a, b) => a.amount - b.amount)
    .slice(0, limit)

  // DP: dp[sum] = { indices of invoices used }
  const dp = new Map<number, number[]>()
  dp.set(0, [])

  for (const { amount: currentAmount, index } of indexed) {
    const entries = Array.from(dp.entries()).sort((a, b) => b[0] - a[0])
    for (const [sum, indices] of entries) {
      const newSum = sum + currentAmount
      if (newSum > targetCents) continue
      if (!dp.has(newSum)) {
        dp.set(newSum, [...indices, index])
      }
    }
  }

  // Collect all valid sums, sorted closest to target
  const allSums = Array.from(dp.entries())
    .filter(([sum]) => sum > 0)
    .sort((a, b) => {
      // Prefer exact match, then closest to target, then fewer invoices
      const diffA = targetCents - a[0]
      const diffB = targetCents - b[0]
      if (diffA === 0 && diffB !== 0) return -1
      if (diffB === 0 && diffA !== 0) return 1
      if (diffA !== diffB) return diffA - diffB
      return a[1].length - b[1].length
    })

  const results: MatchingResult[] = []
  const seenAmounts = new Set<number>()

  for (const [sum, indices] of allSums) {
    if (results.length >= maxResults) break
    const totalAmount = sum / 100
    // Deduplicate by total amount
    if (seenAmounts.has(totalAmount)) continue
    seenAmounts.add(totalAmount)

    const combination = indices.map((idx) => valid[idx])
    results.push({
      totalAmount,
      invoices: combination,
      invoiceCount: combination.length,
      difference: targetAmount - totalAmount,
      isExact: Math.abs(targetAmount - totalAmount) < 0.005
    })
  }

  return results
}
