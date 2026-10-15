// Pure, browser-safe fee arithmetic shared by the API and roster UI.
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

export function allocateLeagueFeeInstallments(
  totalFee: number,
  eventIds: readonly string[],
  payments: readonly { eventid?: string | null; amount: number | string }[],
) {
  const cents = (amount: number | string) => Number.isFinite(Number(amount)) ? Math.max(0, Math.round(Number(amount) * 100)) : 0;
  const activeIds = new Set(eventIds);
  let unallocatedCents = payments.reduce((sum, payment) =>
    !payment.eventid || !activeIds.has(payment.eventid) ? sum + cents(payment.amount) : sum, 0);
  const totalPaidCents = payments.reduce((sum, payment) => sum + cents(payment.amount), 0);
  const remainingCents = Math.max(0, cents(totalFee) - totalPaidCents);
  return eventIds.map((eventid, index) => {
    const billedCents = cents(calculateLeagueFeeInstallment(totalFee, eventIds.length, index).installment);
    const directPaidCents = payments.reduce((sum, payment) => payment.eventid === eventid ? sum + cents(payment.amount) : sum, 0);
    const allocatedCents = Math.min(unallocatedCents, Math.max(0, billedCents - directPaidCents));
    unallocatedCents -= allocatedCents;
    const paidCents = directPaidCents + allocatedCents;
    return {
      eventid,
      billedCents,
      paidCents,
      directPaidCents,
      outstandingCents: Math.max(0, billedCents - paidCents),
      creditCents: Math.max(0, paidCents - billedCents),
      amountToRecordCents: Math.min(remainingCents, Math.max(0, billedCents - paidCents)),
    };
  });
}
