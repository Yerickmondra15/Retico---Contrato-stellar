export type PendingTransaction = {
  hash: string;
  expiresAt: number;
  firstLedger: number;
} & ({ kind: "create" } | { kind: "refund"; depositId: string });

export function parsePending(raw: string | null): PendingTransaction | undefined {
  if (!raw) return;
  const value = JSON.parse(raw);
  if (!value || typeof value.hash !== "string" || !/^[a-f0-9]{64}$/.test(value.hash) ||
      !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= 0 ||
      !Number.isSafeInteger(value.firstLedger) || value.firstLedger <= 0) {
    throw new Error("ReTico no pudo leer el comprobante de la transacción pendiente.");
  }
  if (value.kind === "create") return value;
  if (value.kind === "refund" && typeof value.depositId === "string" &&
      /^\d{1,20}$/.test(value.depositId) && BigInt(value.depositId) > 0n &&
      BigInt(value.depositId) < 1n << 64n) return value;
  throw new Error("ReTico no pudo leer el comprobante de la transacción pendiente.");
}

export function expiredWithoutInclusion(
  transaction: PendingTransaction,
  range: { oldestLedger: number; latestLedger: number; latestLedgerCloseTime: number },
) {
  // The RPC must retain every ledger that could have accepted this envelope.
  return range.oldestLedger <= transaction.firstLedger &&
    range.latestLedger >= transaction.firstLedger &&
    range.latestLedgerCloseTime > transaction.expiresAt;
}
