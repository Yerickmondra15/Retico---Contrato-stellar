import { expiredWithoutInclusion, parsePending, type PendingTransaction } from "./pending";
import { getNetwork, isConnected, requestAccess, signTransaction } from "@stellar/freighter-api";
import {
  Account, Address, BASE_FEE, Contract, Networks, StrKey, TransactionBuilder,
  nativeToScVal, scValToNative, type xdr,
} from "@stellar/stellar-sdk/base";
import { Api, Server } from "@stellar/stellar-sdk/rpc";

export const contractId = import.meta.env.VITE_RETICO_CONTRACT_ID ||
  "CAIHEOOKWC5A6H2EICMTC4S4MHR53H7WF7SFIIUWYNNY2ZCM3QEXDAGP";

const server = new Server("https://soroban-testnet.stellar.org", { timeout: 20_000 });
const publicSource = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const scale = 10_000_000n;
const maxXlmStroops = (1n << 63n) - 1n;

export type Deposit = {
  id: bigint;
  amount: bigint;
  customer: string;
  status: ["Pending" | "Refunded"];
  created_at: bigint;
  refunded_at?: bigint | null;
};

export function parseAmount(value: string): bigint {
  if (!/^\d{1,12}(?:[.,]\d{1,7})?$/.test(value)) {
    throw new Error("Ingresá un monto con hasta siete decimales.");
  }
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  const amount = BigInt(whole) * scale + BigInt(fraction.padEnd(7, "0"));
  if (amount <= 0n || amount > maxXlmStroops) {
    throw new Error("Ingresá un monto positivo dentro del rango de XLM.");
  }
  return amount;
}

export function parseId(value: string): bigint {
  if (!/^\d{1,20}$/.test(value)) throw new Error("Ingresá un ID de depósito válido.");
  const id = BigInt(value);
  if (id < 1n || id >= 1n << 64n) throw new Error("Ingresá un ID de depósito válido.");
  return id;
}

export function amountLabel(amount: bigint): string {
  const fraction = (amount % scale).toString().padStart(7, "0").replace(/0+$/, "");
  return `${amount / scale}${fraction ? "," + fraction : ""} XLM`;
}

function call(account: Account, method: string, args: xdr.ScVal[]) {
  if (!StrKey.isValidContract(contractId)) {
    throw new Error("La dirección del contrato de Testnet es inválida.");
  }
  return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(180)
    .build();
}

async function simulateRead(method: string, args: xdr.ScVal[] = []) {
  const response = await server.simulateTransaction(call(new Account(publicSource, "0"), method, args));
  if (Api.isSimulationError(response)) throw new Error(response.error);
  if (!Api.isSimulationSuccess(response) || !response.result) {
    throw new Error("La red no devolvió un resultado para la consulta.");
  }
  return scValToNative(response.result.retval);
}

export async function readDeposit(id: bigint): Promise<Deposit> {
  return simulateRead("get_deposit", [nativeToScVal(id, { type: "u64" })]);
}

export async function connect() {
  if (!(await isConnected()).isConnected) {
    throw new Error("Instalá o desbloqueá Freighter para conectar tu billetera.");
  }
  await requireTestnet();
  const result = await requestAccess();
  if (result.error || !StrKey.isValidEd25519PublicKey(result.address)) {
    throw new Error("Freighter no autorizó el acceso a la cuenta.");
  }
  return { address: result.address, merchant: await simulateRead("get_merchant") as string };
}

async function requireTestnet() {
  const network = await getNetwork();
  if (network.error || network.networkPassphrase !== Networks.TESTNET) {
    throw new Error("Seleccioná Stellar Testnet en Freighter y volvé a intentarlo.");
  }
}

type Write =
  | { method: "create_deposit"; amount: bigint }
  | { method: "refund_deposit"; id: bigint };

export type WritePhase = "preparing" | "signing" | "sending" | "confirming";

const storageKey = `retico:testnet:${contractId}:pending`;

export function pendingTransaction() {
  return parsePending(localStorage.getItem(storageKey));
}

export async function clearPending(transaction: PendingTransaction) {
  await navigator.locks.request(storageKey, () => {
    if (pendingTransaction()?.hash === transaction.hash) localStorage.removeItem(storageKey);
  });
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function submit(
  address: string,
  action: Write,
  onProgress: (phase: WritePhase, transaction?: PendingTransaction) => void,
) {
  if (!navigator.locks) throw new Error("Abrí ReTico en localhost o HTTPS con un navegador actualizado.");
  return navigator.locks.request(storageKey, { ifAvailable: true }, async lock => {
    if (!lock) throw new Error("Hay una operación en curso en otra pestaña de ReTico.");
    if (pendingTransaction()) throw new Error("Revisá la transacción anterior antes de firmar otra.");

    await requireTestnet();
    const account = await server.getAccount(address);
    const args = action.method === "create_deposit"
      ? [new Address(address).toScVal(), nativeToScVal(action.amount, { type: "i128" })]
      : [nativeToScVal(action.id, { type: "u64" })];
    const transaction = await server.prepareTransaction(call(account, action.method, args));
    onProgress("signing");
    const signed = await signTransaction(transaction.toXDR(), {
      address,
      networkPassphrase: Networks.TESTNET,
    });
    if (signed.error || !signed.signedTxXdr) {
      throw new Error("La firma no se completó en Freighter.");
    }
    const envelope = TransactionBuilder.fromXDR(signed.signedTxXdr, Networks.TESTNET);
    const hash = hex(transaction.hash());
    if (signed.signerAddress !== address || hash !== hex(envelope.hash())) {
      throw new Error("La firma no corresponde a la cuenta y transacción solicitadas.");
    }

    const network = await server.getHealth();
    const pending: PendingTransaction = {
      hash,
      expiresAt: Number(transaction.timeBounds?.maxTime),
      firstLedger: network.latestLedger + 1,
      ...(action.method === "create_deposit" ? { kind: "create" } :
        { kind: "refund", depositId: action.id.toString() }),
    };
    // Persist only public metadata before any attempt to broadcast the envelope.
    const serialized = JSON.stringify(pending);
    parsePending(serialized);
    localStorage.setItem(storageKey, serialized);
    onProgress("sending", pending);

    // A network failure can occur after the node received the request.
    // Resolve all send outcomes by hash instead of broadcasting again.
    try {
      await server.sendTransaction(envelope);
    } catch {
      return pending;
    }
    return pending;
  });
}

export async function reconcile(transaction: PendingTransaction, poll = false) {
  const response = poll
    ? await server.pollTransaction(transaction.hash, { attempts: 6 })
    : await server.getTransaction(transaction.hash);
  if (response.status === Api.GetTransactionStatus.NOT_FOUND) {
    return { status: expiredWithoutInclusion(transaction, response) ? "expired" : "pending" } as const;
  }
  if (response.status === Api.GetTransactionStatus.FAILED) return { status: "failed" } as const;

  const id = transaction.kind === "refund" ? BigInt(transaction.depositId) :
    response.returnValue && scValToNative(response.returnValue);
  if (typeof id !== "bigint") {
    throw new Error("La transacción se confirmó. Consultá el explorador para ver el ID del depósito.");
  }
  const deposit = await readDeposit(id);
  if (transaction.kind === "refund" && deposit.status[0] !== "Refunded") {
    throw new Error("El reembolso se confirmó. El depósito todavía se está actualizando en el RPC.");
  }
  return { status: "confirmed", deposit } as const;
}

export function describeError(error: unknown) {
  if (!(error instanceof Error)) return "Ocurrió un error inesperado.";
  if (error.message.includes("Contract, #2")) return "No se encontró ese depósito.";
  if (error.message.includes("Contract, #3")) return "Este depósito ya fue reembolsado.";
  if (error.message.includes("Contract, #1")) return "El contrato requiere un monto mayor que cero.";
  if (error.message.includes("Contract, #4")) return "El contrato alcanzó su límite de depósitos.";
  if (/Error\(|fetch|network|transaction simulation|Bad response|timeout/i.test(error.message)) {
    return "No se pudo completar la operación en Testnet. Revisá la conexión y el saldo de prueba.";
  }
  return error.message;
}
