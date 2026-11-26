import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUpRight, CircleCheck, Package, Search, Wallet } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { SlideTextButton } from "./components/SlideTextButton";
import { Receipt } from "./components/Receipt";
import { ReticoLoop } from "./components/ReticoLoop";
import type { PendingTransaction } from "./pending";
import {
  clearPending, connect, contractId, describeError, parseAmount, parseId, pendingTransaction,
  readDeposit, reconcile, submit, type Deposit, type WritePhase,
} from "./stellar";

type Phase = "connecting" | "reading" | WritePhase;
const phaseLabels: Record<Phase, string> = {
  connecting: "Conectando Freighter…",
  reading: "Consultando el depósito…",
  preparing: "Preparando la transacción…",
  signing: "Revisá y firmá en Freighter.",
  sending: "Enviando la transacción a Testnet…",
  confirming: "Comprobando el resultado en Testnet…",
};
const writeSteps: { phase: WritePhase; title: string }[] = [
  { phase: "preparing", title: "Preparación" },
  { phase: "signing", title: "Firma" },
  { phase: "sending", title: "Envío" },
  { phase: "confirming", title: "Confirmación" },
];
const steps = [
  ["Dejá un depósito", "El contrato guarda tu XLM de prueba mientras usás el envase."],
  ["Devolvé el envase", "El comercio confirma que recibió el envase reutilizable."],
  ["Recuperá tu XLM", "El contrato devuelve el mismo importe una sola vez."],
];
const explorer = "https://stellar.expert/explorer/testnet";
const contractUrl = `${explorer}/contract/${contractId}`;
const repository = "https://github.com/Yerickmondra15/Retico---Contrato-stellar";

function storedTransaction() {
  try {
    return pendingTransaction();
  } catch {
    // Public lookups remain available. submit requires working storage before broadcast.
    return undefined;
  }
}

export function App() {
  const [wallet, setWallet] = useState<Awaited<ReturnType<typeof connect>>>();
  const [amount, setAmount] = useState("");
  const [idInput, setIdInput] = useState("");
  const [deposit, setDeposit] = useState<Deposit>();
  const [phase, setPhase] = useState<Phase>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(storedTransaction);
  const [transactionLink, setTransactionLink] = useState<{ id: bigint; hash: string }>();
  const [celebrate, setCelebrate] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const inProgress = useRef(false);
  const busy = phase !== undefined;
  const writeBlocked = busy || pending !== undefined;
  const merchant = wallet !== undefined && wallet.address === wallet.merchant;
  const refunded = deposit?.status[0] === "Refunded";
  const stage = pending && !busy ? 3 : writeSteps.findIndex(step => step.phase === phase);

  useEffect(() => {
    const sync = () => setPending(storedTransaction());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  async function run(start: Phase, action: () => Promise<void>) {
    if (inProgress.current) return;
    inProgress.current = true;
    setPhase(start);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (cause) {
      setError(describeError(cause));
      setPending(storedTransaction());
    } finally {
      inProgress.current = false;
      setPhase(undefined);
    }
  }

  function progress(next: WritePhase, transaction?: PendingTransaction) {
    setPhase(next);
    if (transaction) setPending(transaction);
  }

  async function checkTransaction(transaction: PendingTransaction, poll = false) {
    setPhase("confirming");
    const result = await reconcile(transaction, poll);
    if (result.status === "pending") {
      setMessage("Confirmación pendiente. Podés consultar de nuevo sin volver a firmar.");
      return;
    }

    await clearPending(transaction);
    setPending(storedTransaction());
    if (result.status === "failed" || result.status === "expired") {
      setError(result.status === "failed" ? "Testnet registró la transacción como fallida." :
        "La transacción venció sin registrarse en el ledger.");
      return;
    }
    if (result.status !== "confirmed") return;

    const { deposit: current } = result;
    setDeposit(current);
    setIdInput(current.id.toString());
    setTransactionLink({ id: current.id, hash: transaction.hash });
    setConfirmRefund(false);
    setCelebrate(transaction.kind === "refund");
    if (transaction.kind === "create") setAmount("");
    setMessage(transaction.kind === "refund" ?
      `Reembolso del depósito #${current.id} confirmado.` : `Depósito #${current.id} confirmado.`);
  }

  function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("reading", async () => {
      setDeposit(undefined);
      setConfirmRefund(false);
      setCelebrate(false);
      const found = await readDeposit(parseId(idInput.trim()));
      setDeposit(found);
      setMessage(`Depósito #${found.id} encontrado.`);
    });
  }

  function createDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet || merchant || writeBlocked) return;
    void run("preparing", async () => {
      const transaction = await submit(wallet.address, {
        method: "create_deposit", amount: parseAmount(amount.trim()),
      }, progress);
      await checkTransaction(transaction, true);
    });
  }

  function refund() {
    if (!wallet || !merchant || !deposit || !confirmRefund || refunded || writeBlocked) return;
    void run("preparing", async () => {
      setConfirmRefund(false);
      const transaction = await submit(wallet.address, {
        method: "refund_deposit", id: deposit.id,
      }, progress);
      await checkTransaction(transaction, true);
    });
  }

  return (
    <>
      <a className="skip" href="#contenido">Saltar al contenido</a>
      <header className="topbar">
        <div className="shell topbar-inner">
          <a className="brand" href="./" aria-label="ReTico, inicio">
            <img src={`${import.meta.env.BASE_URL}brand/retico-dark.svg`} alt="" width="43" height="43" />
            ReTico<span className="brand-period" aria-hidden="true">.</span>
          </a>
          <div className="network"><span aria-hidden="true" /> Stellar Testnet</div>
        </div>
      </header>

      <main id="contenido" className="shell" tabIndex={-1}>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow"><Package size={17} aria-hidden="true" /> Lo bueno vuelve</div>
            <h1 id="hero-title">Devolvé.<br /><em>Reutilizá.</em><br />Repetí.</h1>
            <p>Usá un envase reutilizable y recuperá tu depósito en XLM de prueba cuando lo devolvás.</p>
            <a className="hero-link" href="#depositos">Ir a los depósitos <ArrowDown size={18} aria-hidden="true" /></a>
          </div>
          <ReticoLoop />
        </section>

        <section className="how" aria-labelledby="how-title">
          <h2 id="how-title">Cómo funciona</h2>
          <ol>
            {steps.map(([title, text], index) => (
              <li key={title}>
                <span className="step-number" aria-hidden="true">{index + 1}</span>
                <div><h3>{title}</h3><p>{text}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section id="depositos" className="workspace" aria-labelledby="workspace-title">
          <div className="workspace-title"><h2 id="workspace-title">Depósitos</h2><span>Solo fondos de prueba</span></div>
          <div className="flow">
            <section className="panel" aria-labelledby="create-title">
              <div className="panel-icon"><Wallet size={21} aria-hidden="true" /></div>
              <h3 id="create-title">{merchant ? "Confirmar una devolución" : "Crear un depósito"}</h3>
              {!wallet ? (
                <>
                  <p>Conectá Freighter en Testnet para firmar un depósito o acceder como comercio.</p>
                  <SlideTextButton label="Conectar Freighter" type="button" disabled={busy}
                    onClick={() => void run("connecting", async () => {
                      const account = await connect();
                      setWallet(account);
                      setMessage(account.address === account.merchant ? "Billetera de comercio conectada." : "Billetera de cliente conectada.");
                    })} />
                </>
              ) : (
                <>
                  <div className="account">
                    <strong className="role">{merchant ? "Comercio" : "Cliente"}</strong>
                    <span title={wallet.address}>{wallet.address.slice(0, 8)}…{wallet.address.slice(-6)}</span>
                    <button type="button" className="text-button" disabled={busy}
                      onClick={() => {
                        setWallet(undefined); setConfirmRefund(false); setError(""); setMessage("Billetera desconectada de ReTico.");
                      }}>
                      Desconectar
                    </button>
                  </div>
                  {merchant ? <p>Buscá el ID del depósito y confirmá que recibiste el envase.</p> : (
                    <form onSubmit={createDeposit}>
                      <label htmlFor="amount">Monto del depósito en XLM</label>
                      <div className="amount-input">
                        <input id="amount" inputMode="decimal" placeholder="2,00" required maxLength={20}
                          value={amount} onChange={event => setAmount(event.target.value)} disabled={writeBlocked} />
                        <span aria-hidden="true">XLM</span>
                      </div>
                      <SlideTextButton label="Crear depósito" disabled={writeBlocked} />
                    </form>
                  )}
                </>
              )}
            </section>

            <section className="panel" aria-labelledby="lookup-title">
              <div className="panel-icon blue"><Search size={21} aria-hidden="true" /></div>
              <h3 id="lookup-title">Consultar un depósito</h3>
              <p>Ingresá el ID para ver su comprobante y estado en Testnet.</p>
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

          {stage >= 0 && (
            <ol className="transaction-steps" aria-label="Progreso de la transacción">
              {writeSteps.map(({ phase: step, title }, index) => (
                <li key={step} aria-current={stage === index ? "step" : undefined}
                  className={index < stage ? "done" : undefined}>
                  <span aria-hidden="true">{index < stage ? <CircleCheck size={16} /> : index + 1}</span>{title}
                </li>
              ))}
            </ol>
          )}
          <div className="feedback">
            <div role="status">{phase ? phaseLabels[phase] : message}</div>
            <div role="alert">{error}</div>
          </div>

          {pending && (
            <section className="pending-card" aria-labelledby="pending-title">
              <h3 id="pending-title">Transacción por verificar</h3>
              <p>Revisá el resultado antes de iniciar otra operación.</p>
              <div className="receipt-actions">
                <SlideTextButton label="Revisar confirmación" type="button" className="secondary" disabled={busy}
                  onClick={() => void run("confirming", () => checkTransaction(pending))} />
                <a href={`${explorer}/tx/${pending.hash}`} target="_blank" rel="noreferrer">
                  Ver transacción <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              </div>
            </section>
          )}

          <AnimatePresence mode="wait">
            {deposit && (
              <Receipt key={deposit.id.toString()} deposit={deposit} celebrate={celebrate}
                explorerUrl={transactionLink?.id === deposit.id ? `${explorer}/tx/${transactionLink.hash}` : contractUrl}>
                {merchant && !refunded && (
                  <div className="refund">
                    <label className="checkbox">
                      <input type="checkbox" checked={confirmRefund} disabled={writeBlocked}
                        onChange={event => setConfirmRefund(event.target.checked)} />
                      <span>Recibí el envase en el comercio.</span>
                    </label>
                    <SlideTextButton type="button" label="Confirmar devolución"
                      disabled={writeBlocked || !confirmRefund} onClick={refund} />
                  </div>
                )}
              </Receipt>
            )}
          </AnimatePresence>
        </section>
      </main>

      <footer className="shell footer">
        <p>ReTico · Proyecto educativo<br /><strong>Desarrollo por Yerick Mondragón Sancho</strong></p>
        <div>
          <a href={repository} target="_blank" rel="noreferrer">Repositorio <ArrowUpRight size={16} aria-hidden="true" /></a>
          <a href={contractUrl} target="_blank" rel="noreferrer">Contrato <ArrowUpRight size={16} aria-hidden="true" /></a>
        </div>
      </footer>
    </>
  );
}
