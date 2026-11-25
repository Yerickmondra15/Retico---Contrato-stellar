import { useState, type FormEvent } from "react";
import { ArrowUpRight, Check, Package, Search, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { SlideTextButton } from "./components/SlideTextButton";
import { Status } from "./components/Status";
import {
  amountLabel, connect, contractId, describeError, parseAmount, parseId, readDeposit,
  submit, type Deposit,
} from "./stellar";

type Phase = "connecting" | "reading" | "preparing" | "signing" | "confirming";

const phaseLabels: Record<Phase, string> = {
  connecting: "Conectando Freighter…",
  reading: "Consultando el depósito…",
  preparing: "Preparando la transacción…",
  signing: "Revisá y firmá en Freighter.",
  confirming: "Esperando confirmación en Testnet…",
};

const explorer = "https://stellar.expert/explorer/testnet";

export function App() {
  const [wallet, setWallet] = useState<Awaited<ReturnType<typeof connect>>>();
  const [amount, setAmount] = useState("");
  const [idInput, setIdInput] = useState("");
  const [deposit, setDeposit] = useState<Deposit>();
  const [phase, setPhase] = useState<Phase>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [hash, setHash] = useState<string>();
  const [confirmRefund, setConfirmRefund] = useState(false);
  const busy = phase !== undefined;
  const merchant = wallet !== undefined && wallet.address === wallet.merchant;
  const refunded = deposit?.status[0] === "Refunded";

  async function run(start: Phase, action: () => Promise<void>) {
    if (busy) return;
    setPhase(start);
    setError("");
    setMessage("");
    setHash(undefined);
    try {
      await action();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setPhase(undefined);
    }
  }

  function progress(next: "signing" | "confirming", txHash?: string) {
    setPhase(next);
    setHash(txHash);
  }

  function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("reading", async () => {
      setDeposit(undefined);
      setConfirmRefund(false);
      const found = await readDeposit(parseId(idInput.trim()));
      setDeposit(found);
      setMessage(`Depósito #${found.id} encontrado.`);
    });
  }

  function createDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet) return;
    void run("preparing", async () => {
      const id = await submit(wallet.address, {
        method: "create_deposit", amount: parseAmount(amount.trim()),
      }, progress);
      if (typeof id !== "bigint") throw new Error("Depósito confirmado. Revisá el enlace para obtener el ID.");
      setIdInput(id.toString());
      setAmount("");
      setConfirmRefund(false);
      setDeposit(undefined);
      setMessage(`Depósito #${id} confirmado.`);
      setDeposit(await readDeposit(id));
    });
  }

  function refund() {
    if (!wallet || !merchant || !deposit || !confirmRefund || refunded) return;
    void run("preparing", async () => {
      await submit(wallet.address, { method: "refund_deposit", id: deposit.id }, progress);
      setConfirmRefund(false);
      setDeposit({ ...deposit, status: ["Refunded"] });
      setMessage(`Reembolso del depósito #${deposit.id} confirmado.`);
    });
  }

  return (
    <>
      <a className="skip" href="#contenido">Saltar al contenido</a>
      <header className="topbar">
        <div className="shell topbar-inner">
          <a className="brand" href="./" aria-label="ReTico, inicio">
            <span className="logo-mark" aria-hidden="true"><i /><i /></span>
            ReTico<span className="brand-period" aria-hidden="true">.</span>
          </a>
          <div className="network"><span /> Stellar Testnet</div>
        </div>
      </header>

      <main id="contenido" className="shell" tabIndex={-1}>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow"><Package size={17} aria-hidden="true" /> ENVASES REUTILIZABLES</div>
            <h1 id="hero-title">Devolvé.<br /><em>Reutilizá.</em><br />Repetí.</h1>
            <p>Dejá un depósito en XLM de prueba y recuperalo cuando el comercio reciba de vuelta tu envase.</p>
          </div>
          <motion.div className="hero-art" aria-hidden="true"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
            <div className="orbit orbit-large" /><div className="orbit orbit-small" />
            <div className="spark spark-one">✦</div><div className="spark spark-two">✧</div>
            <div className="cup">
              <div className="cup-body"><div className="cup-sleeve"><span className="logo-mark"><i /><i /></span></div></div>
              <div className="cup-lid" />
            </div>
          </motion.div>
        </section>

        <div className="flow">
          <section className="panel" aria-labelledby="create-title">
            <div className="panel-icon"><Wallet size={21} aria-hidden="true" /></div>
            <h2 id="create-title">{merchant ? "Billetera del comercio" : "Crear un depósito"}</h2>
            {!wallet ? (
              <>
                <p>Conectá Freighter en Testnet para firmar tu depósito.</p>
                <SlideTextButton label="Conectar Freighter" type="button" disabled={busy}
                  onClick={() => void run("connecting", async () => { setWallet(await connect()); setMessage("Billetera conectada."); })} />
              </>
            ) : (
              <>
                <div className="account">
                  <span title={wallet.address}>{wallet.address.slice(0, 8)}…{wallet.address.slice(-6)}</span>
                  <button type="button" className="text-button" disabled={busy}
                    onClick={() => { setWallet(undefined); setConfirmRefund(false); setError(""); setMessage("Billetera desconectada de ReTico."); }}>
                    Desconectar
                  </button>
                </div>
                {merchant ? <p>Buscá el ID del depósito para confirmar la devolución.</p> : (
                  <form onSubmit={createDeposit}>
                    <label htmlFor="amount">Monto del depósito en XLM</label>
                    <div className="amount-input">
                      <input id="amount" inputMode="decimal" placeholder="2,00" required maxLength={20}
                        value={amount} onChange={event => setAmount(event.target.value)} disabled={busy} />
                      <span aria-hidden="true">XLM</span>
                    </div>
                    <SlideTextButton label="Crear depósito" disabled={busy} />
                  </form>
                )}
              </>
            )}
          </section>

          <section className="panel" aria-labelledby="lookup-title">
            <div className="panel-icon"><Search size={21} aria-hidden="true" /></div>
            <h2 id="lookup-title">Consultar un depósito</h2>
            <p>Buscá el estado de un depósito por su número.</p>
            <form onSubmit={lookup}>
              <label htmlFor="deposit-id">ID del depósito</label>
              <div className="lookup-row">
                <input id="deposit-id" inputMode="numeric" placeholder="Ej. 1" required maxLength={20}
                  value={idInput} onChange={event => setIdInput(event.target.value)} disabled={busy} />
                <SlideTextButton className="secondary" label="Consultar" disabled={busy} />
              </div>
            </form>
          </section>
        </div>

        <div className="feedback">
          <div role="status">{phase ? phaseLabels[phase] : message}</div>
          <div role="alert">{error}</div>
          {hash && <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">
            Ver transacción <ArrowUpRight size={16} aria-hidden="true" />
          </a>}
        </div>

        {deposit && (
          <motion.section className="panel receipt" aria-labelledby="receipt-title"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="receipt-heading">
              <h2 id="receipt-title">Depósito #{deposit.id.toString()}</h2>
              <Status refunded={refunded} />
            </div>
            <dl>
              <div><dt>Monto</dt><dd>{amountLabel(deposit.amount)}</dd></div>
              <div><dt>Cliente</dt><dd className="address">{deposit.customer}</dd></div>
            </dl>
            {merchant && !refunded && (
              <div className="refund">
                <label className="checkbox">
                  <input type="checkbox" checked={confirmRefund} disabled={busy}
                    onChange={event => setConfirmRefund(event.target.checked)} />
                  <span>Recibí el envase en el comercio.</span>
                </label>
                <SlideTextButton type="button" label="Confirmar devolución"
                  disabled={busy || !confirmRefund} onClick={refund} />
              </div>
            )}
          </motion.section>
        )}
      </main>

      <footer className="shell footer">
        <span><Check size={16} aria-hidden="true" /> Proyecto educativo · fondos de prueba</span>
        <a href={`${explorer}/contract/${contractId}`} target="_blank" rel="noreferrer">
          Ver contrato <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </footer>
    </>
  );
}
