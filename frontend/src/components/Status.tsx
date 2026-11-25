import { Check, Clock3 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

// Transición de icono adaptada de Save Status de Kokonut UI. Ver KOKONUT-LICENSE.
// https://github.com/kokonut-labs/kokonutui/blob/main/components/kokonutui/save-status.tsx
export function Status({ refunded }: { refunded: boolean }) {
  return (
    <span className={`status ${refunded ? "status-refunded" : ""}`}>
      <span className="status-icon" aria-hidden="true">
        <AnimatePresence initial={false} mode="wait">
          <motion.span key={String(refunded)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {refunded ? <Check size={16} /> : <Clock3 size={16} />}
          </motion.span>
        </AnimatePresence>
      </span>
      {refunded ? "Reembolsado" : "Pendiente"}
    </span>
  );
}
