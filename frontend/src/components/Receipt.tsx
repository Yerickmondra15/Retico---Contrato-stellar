import { useState, type ReactNode } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Status } from "./Status";
import { amountLabel, type Deposit } from "../stellar";

const formatter = new Intl.DateTimeFormat("es-CR", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Costa_Rica",
});

function LedgerDate({ seconds }: { seconds: bigint }) {
  const date = new Date(Number(seconds) * 1000);
  return <time dateTime={date.toISOString()}>{formatter.format(date)}</time>;
}

export function Receipt({ deposit, explorerUrl, celebrate, children }: {
  deposit: Deposit; explorerUrl: string; celebrate: boolean; children?: ReactNode;
}) {
  const [copyMessage, setCopyMessage] = useState("");
  const reduced = useReducedMotion();
  const id = deposit.id.toString();
  const refunded = deposit.status[0] === "Refunded";

  async function copyId() {
    try {
      await navigator.clipboard.writeText(id);
      setCopyMessage("ID copiado.");
    } catch {
      setCopyMessage(`Copiá el ID manualmente: ${id}.`);
    }
  }

  return (
    <motion.section className="panel receipt" aria-labelledby="receipt-title"
      initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <div className="receipt-heading">
        <div>
          <p className="receipt-label">Comprobante digital</p>
          <h2 id="receipt-title">Depósito #{id}</h2>
        </div>
        <Status refunded={refunded} />
      </div>
      <p className="receipt-amount">{amountLabel(deposit.amount)}</p>
      {celebrate && refunded && (
        <motion.p className="celebration" initial={reduced ? false : { opacity: 0, scale: .96 }}
          animate={{ opacity: 1, scale: 1 }}>
          <Check size={17} aria-hidden="true" /> Reembolso confirmado en Testnet
        </motion.p>
      )}
      <dl>
        <div className="receipt-address"><dt>Cliente</dt><dd className="address">{deposit.customer}</dd></div>
        <div><dt>Depósito registrado</dt><dd><LedgerDate seconds={deposit.created_at} /></dd></div>
        {deposit.refunded_at != null &&
          <div><dt>Reembolso registrado</dt><dd><LedgerDate seconds={deposit.refunded_at} /></dd></div>}
      </dl>
      <p className="receipt-timezone">Hora de Costa Rica</p>
      <div className="receipt-actions">
        <button type="button" className="text-button" onClick={() => void copyId()}>
          <Copy size={16} aria-hidden="true" /> Copiar ID
        </button>
        <a href={explorerUrl} target="_blank" rel="noreferrer">
          Ver en Stellar Explorer <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </div>
      <div role="status" className="copy-feedback">{copyMessage}</div>
      {children}
    </motion.section>
  );
}
