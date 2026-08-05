export function calculateLeagueFeeInstallment(
  totalFee: number,
  eventCount: number,
  eventIndex: number,
  paidAmount = 0,
) {
  const totalFeeCents = Math.max(0, Math.round(Number(totalFee || 0) * 100));
  const paidCents = Math.max(0, Math.round(Number(paidAmount || 0) * 100));
  const remainingCents = Math.max(0, totalFeeCents - paidCents);
  if (!Number.isInteger(eventCount) || eventCount <= 0 || eventIndex < 0 || eventIndex >= eventCount) {
    return { installment: 0, remaining: remainingCents / 100, amount: 0 };
  }

  const baseInstallmentCents = Math.floor(totalFeeCents / eventCount);
  const remainderCents = totalFeeCents % eventCount;
  const installmentCents = baseInstallmentCents + (eventIndex < remainderCents ? 1 : 0);
  return {
    installment: installmentCents / 100,
    remaining: remainingCents / 100,
    amount: Math.min(installmentCents, remainingCents) / 100,
  };
}
