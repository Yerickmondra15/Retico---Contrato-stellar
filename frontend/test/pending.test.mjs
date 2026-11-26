import assert from "node:assert/strict";
import { test } from "node:test";
import { expiredWithoutInclusion, parsePending } from "../src/pending.ts";

const transaction = { hash: "ab".repeat(32), expiresAt: 1_000, firstLedger: 40, kind: "create" };
const ledgers = { oldestLedger: 30, latestLedger: 70, latestLedgerCloseTime: 1_005 };

test("recupera operaciones de creación y reembolso desde metadatos públicos", () => {
  assert.equal(parsePending(null), undefined);
  assert.deepEqual(parsePending(JSON.stringify(transaction)), transaction);
  const refund = { ...transaction, kind: "refund", depositId: "18446744073709551615" };
  assert.deepEqual(parsePending(JSON.stringify(refund)), refund);
});

test("rechaza un registro corrupto o un ID fuera del rango u64", () => {
  for (const invalid of [
    { ...transaction, hash: "ab" },
    { ...transaction, expiresAt: 0 },
    { ...transaction, firstLedger: 0 },
    { ...transaction, kind: "refund", depositId: "18446744073709551616" },
    { ...transaction, kind: "refund", depositId: "0" },
  ]) assert.throws(() => parsePending(JSON.stringify(invalid)));
});

test("una transacción sigue pendiente hasta que el ledger supera su vencimiento", () => {
  assert.equal(expiredWithoutInclusion(transaction, { ...ledgers, latestLedgerCloseTime: 1_000 }), false);
  assert.equal(expiredWithoutInclusion(transaction, ledgers), true);
});

test("una respuesta fuera de la ventana retenida no habilita otro intento", () => {
  assert.equal(expiredWithoutInclusion(transaction, { ...ledgers, oldestLedger: 41 }), false);
  assert.equal(expiredWithoutInclusion(transaction, { ...ledgers, latestLedger: 39 }), false);
});
