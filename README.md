# ReTico

Depósitos reembolsables para envases reutilizables en Stellar Testnet. El cliente firma el depósito de XLM, ReTico mantiene los fondos en custodia y el comercio autorizado devuelve el importe íntegro al confirmar que recibió el envase. Cada depósito se reembolsa una sola vez.

En Costa Rica se estimaron 229 612 toneladas de residuos plásticos domésticos en 2022, de las cuales se reciclaron unas 28 000. La reforma de la Ley 8839 incluye los sistemas de depósito y reembolso entre los instrumentos de gestión de residuos. [Huella Plástica en Costa Rica, PNUD](https://pnud-conocimiento.cr/repositorio/huella_plastica_cr/) · [Reforma de la Ley 8839, Procuraduría General de la República](https://www.pgrweb.go.cr/DOCS/NORMAS/1/VIGENTE/L/2020-2029/2020-2024/2021/17513/14841C.HTML)

## Por qué Stellar

Soroban permite aplicar en una sola transacción las reglas del depósito, la autorización de la cuenta que firma y la transferencia de XLM mediante el Stellar Asset Contract. El ledger ofrece un estado consultable por ID y un registro público de los movimientos. Esto permite usar Freighter y un RPC de Testnet desde el navegador. La verificación física del envase sigue a cargo del comercio. [Contratos y activos en Stellar](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/assets)

## Contrato

Cada despliegue configura un comercio y un Stellar Asset Contract (SAC). La instancia guarda esa configuración y el próximo ID. Cada depósito se guarda individualmente en almacenamiento persistente con su cliente, importe, estado y marcas de tiempo del ledger. El contrato usa Rust edición 2021 y `soroban-sdk` 28.0.0.

| Función | Comportamiento |
| --- | --- |
| `create_deposit(customer, amount)` | Exige la autorización del cliente, transfiere un importe positivo al contrato y devuelve un ID secuencial. |
| `refund_deposit(deposit_id)` | Exige la autorización del comercio, cambia el estado de `Pending` a `Refunded` y transfiere el importe exacto al cliente original. |
| `get_deposit(deposit_id)` | Consulta pública por ID. |
| `get_merchant()` | Consulta pública del comercio autorizado. |

Las escrituras y las transferencias se ejecutan atómicamente. Los eventos `deposit_created` y `deposit_refunded` indican cliente e ID en los topics e importe en los datos. Los errores del contrato son `InvalidAmount` (1), `DepositNotFound` (2), `AlreadyRefunded` (3) e `IdOverflow` (4). Soroban comprueba las autorizaciones.

## Pruebas y compilación

Desde la raíz del repositorio, con Rust 1.100.0 y Stellar CLI 30.0.1:

```bash
rustup toolchain install 1.100.0 --profile minimal --component rustfmt --target wasm32v1-none
rustup override set 1.100.0
cargo fmt --all -- --check
CARGO_PROFILE_DEV_DEBUG=0 cargo test --workspace --locked
stellar contract build --locked
```

La suite ejecuta 13 pruebas con un Stellar Asset Contract en el entorno local de Soroban. Comprueba custodia y balances, autorizaciones ausentes o de la cuenta equivocada, reembolso íntegro y único, montos inválidos, IDs, eventos, TTL y atomicidad ante transferencias fallidas. Los tests usan autorizaciones simuladas para los casos que las requieren. La demostración en Testnet firma transacciones reales con dos identidades independientes.

El Wasm se genera en `target/wasm32v1-none/release/retico.wasm`. GitHub Actions ejecuta formato, pruebas y compilación sin claves ni despliegues automáticos. [GitHub Actions](https://github.com/Yerickmondra15/Retico---Contrato-stellar/actions)

## Demostración en Testnet

Usá dos identidades nuevas y reservadas para Testnet. Si el fondeo integrado falla, abrí `https://friendbot.stellar.org/?addr=DIRECCION_PUBLICA` con la dirección que devuelve `stellar keys address`.

```bash
stellar keys generate merchant --network testnet --fund
stellar keys generate customer --network testnet --fund
TOKEN=$(stellar contract id asset --asset native --network testnet)
CONTRACT=$(stellar contract deploy --wasm target/wasm32v1-none/release/retico.wasm \
  --source-account merchant --network testnet -- --merchant merchant --token "$TOKEN")

ID=$(stellar contract invoke --id "$CONTRACT" --source-account customer --network testnet \
  -- create_deposit --customer customer --amount 20000000)
stellar contract invoke --id "$CONTRACT" --source-account customer --network testnet --send=no \
  -- get_deposit --deposit-id "$ID"
stellar contract invoke --id "$TOKEN" --source-account merchant --network testnet --send=no \
  -- balance --id "$CONTRACT"

stellar contract invoke --id "$CONTRACT" --source-account merchant --network testnet \
  -- refund_deposit --deposit-id "$ID"
stellar contract invoke --id "$CONTRACT" --source-account customer --network testnet --send=no \
  -- get_deposit --deposit-id "$ID"
stellar contract invoke --id "$TOKEN" --source-account merchant --network testnet --send=no \
  -- balance --id "$CONTRACT"

stellar contract invoke --id "$CONTRACT" --source-account merchant --network testnet \
  -- refund_deposit --deposit-id "$ID"
```

El importe de ejemplo es 2 XLM, expresado en 20 000 000 stroops. En un despliegue nuevo se obtiene el ID 1. El estado pasa de `Pending` a `Refunded` y la custodia vuelve a cero. La última invocación se rechaza con el código 3. Las comisiones de red se pagan aparte del depósito.

### Demostración ejecutada

El depósito #1 pasó de `Pending` a `Refunded` en Testnet. El saldo del contrato se verificó en 0 → 20 000 000 → 0 stroops. La simulación del segundo reembolso devolvió `Error(Contract, #3)`. Los dos eventos de ReTico y las transferencias del SAC quedaron registrados en las transacciones.

| Evidencia | Testnet |
| --- | --- |
| Contrato | [CAIHEOOK…XDAGP](https://stellar.expert/explorer/testnet/contract/CAIHEOOKWC5A6H2EICMTC4S4MHR53H7WF7SFIIUWYNNY2ZCM3QEXDAGP) |
| Despliegue | [fede5c49…](https://stellar.expert/explorer/testnet/tx/fede5c4943ea82be2a0ecad57e8e13c07f314702d7dbdd1cf93bb89570637583) |
| Depósito de 2 XLM | [c26e2098…](https://stellar.expert/explorer/testnet/tx/c26e2098fd18f3bcd869ebd951409f542566d28b1772c7ee27b2118faf11acf5) |
| Reembolso | [c423b080…](https://stellar.expert/explorer/testnet/tx/c423b080dd00d6764768ae3294c78654877c655c3898c1e6d98a29549126bc84) |

GitHub Actions confirmó formato, las 13 pruebas y el build Wasm en `main`. [Ejecución del contrato](https://github.com/Yerickmondra15/Retico---Contrato-stellar/actions/runs/45719005629)

## Interfaz web

Desde la raíz, con Node.js 24.22.3:

```bash
cd frontend
npm ci
npm test
npm run build
npm run dev
```

Abrí la URL que imprime Vite. La consulta por ID funciona sin billetera y el depósito #1 permite comprobar el despliegue de ejemplo. Para firmar, instalá Freighter, seleccioná Testnet y conectá tu cuenta de prueba. Para ensayar el flujo completo con tus propias cuentas, desplegá el contrato como se indica arriba y definí `VITE_RETICO_CONTRACT_ID` en `frontend/.env.local` con la dirección de ese despliegue. Reiniciá Vite después del cambio.

La segunda iteración incorpora un logo propio en SVG con variantes de encabezado, uso sobre fondo oscuro y favicon. The ReTico Loop recorre en una sola vuelta las etapas de envase, custodia, devolución y reembolso. La ilustración y las etiquetas quedan disponibles con movimiento reducido. La interfaz usa React, TypeScript, Motion y adaptaciones de Kokonut UI con licencia MIT. Los tokens CSS y de Motion controlan contraste, tipografía, espaciado, radios, sombras y duraciones.

El rol de la billetera se determina con la dirección de comercio registrada en el contrato. El comprobante muestra el ID copiable, el importe, el estado, las fechas del ledger en hora de Costa Rica y un enlace al explorador. Durante la sesión se enlaza la transacción asociada si está disponible. Las consultas por ID enlazan el contrato cuando el hash no está disponible.

### Confirmaciones pendientes

La interfaz distingue preparación, firma, envío y confirmación. Antes de enviar guarda en este navegador el hash público, el vencimiento, el primer ledger posible y el tipo de operación. Podés recargar y usar **Revisar confirmación** para consultar el mismo hash. El bloqueo de firmas se coordina entre pestañas del mismo origen. Los envíos requieren almacenamiento local y un navegador con Web Locks (localhost o HTTPS). Ningún dato de firma se guarda en ese registro.

El reembolso se presenta como confirmado después de verificar su transacción y volver a leer el depósito del contrato. Si el RPC pierde temporalmente conectividad, se conserva la comprobación por hash. Si dejó de retener la ventana completa del envío, se necesita revisar el explorador para investigar el resultado de forma manual. En esa situación la interfaz conserva el bloqueo porque desconoce si la operación original se aplicó.

### Verificación de la interfaz

Las pruebas de Node cubren la recuperación de metadatos, su validación y los límites de la ventana de confirmación. GitHub Actions ejecuta las pruebas de frontend y el build junto con los 13 tests de Soroban y el build Wasm.

Las comprobaciones en Chromium cubrieron navegación por teclado, validación, consulta real de Testnet, el error por depósito inexistente, respuesta sin extensión, comprobante, copia del ID, movimiento reducido y reflujo a 320 px. Se revisó el árbol de accesibilidad de Chromium. Queda pendiente una prueba con un lector de pantalla instalado. axe no detectó infracciones con las reglas WCAG 2.2 AA ejecutadas. La cobertura automatizada es parcial. El entorno de navegador usó el RPC público mediante un puente de pruebas para confiar en la CA del proxy de ejecución.

La segunda iteración creó y reembolsó el depósito #5 en Testnet. La prueba retrasó temporalmente la respuesta de confirmación, recargó la página y recuperó el resultado por el mismo hash. Se verificó que el navegador enviara el depósito una sola vez y que el comprobante del reembolso se actualizara con la lectura del contrato. Las transacciones fueron reales. El fixture de Freighter firmó con Stellar CLI. La prueba con la extensión instalada queda pendiente. [Depósito #5](https://stellar.expert/explorer/testnet/tx/a198cf0cbafec0c42aced723e9c728dc09e3f58ab848e531f0d35a31bfe8f22c) · [Reembolso #5](https://stellar.expert/explorer/testnet/tx/b07747f983e748884c4118ab998fafb4a367185e9ec710a8d8e36c27a2f85caf)

## Límites operativos

- El comercio verifica la devolución física y conserva la responsabilidad de firmar el reembolso. Si pierde el acceso a su cuenta, el contrato carece de un mecanismo alternativo de reembolso.
- Los depósitos carecen de vencimiento de negocio. Soroban puede archivar sus datos persistentes y la instancia. El contrato extiende el TTL de la instancia y de cada depósito escrito al máximo permitido cuando su TTL cae por debajo de la mitad. Las consultas se pueden simular sin escribir. Para entradas archivadas, usá un RPC y herramientas que soporten la restauración, y revisá los costos. [Archivado en Stellar](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival)
- El token se fija al desplegar. La demo usa el SAC nativo de XLM y depende de que el token respete la semántica de transferencia. La red de pruebas puede reiniciarse y invalidar las cuentas y el despliegue publicado.
- Proyecto educativo para Stellar Testnet, sin auditoría externa.

## Entrega en main

El repositorio reúne contrato, pruebas, flujo de GitHub Actions e interfaz en `main`. El commit `5335ea7` es la referencia estable anterior al rediseño. Para presentar el proyecto, enlazá esa rama, la ejecución de Actions y las transacciones de la demostración. Si la red de pruebas se reinicia, repetí el despliegue, actualizá la dirección pública del frontend y registrá las nuevas transacciones.
