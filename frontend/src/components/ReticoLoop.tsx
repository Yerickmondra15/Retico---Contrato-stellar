import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { motionDuration } from "../motionTokens";
import { BadgeCheck, CupSoda, RotateCcw, ShieldCheck } from "lucide-react";

const points = [
  { label: "Envase", title: "Empezá con un envase.", description: "Usá un recipiente reutilizable y dejá un depósito en XLM de prueba.", Icon: CupSoda },
  { label: "Custodia", title: "Tu depósito queda en custodia.", description: "El contrato guarda los XLM hasta que el comercio confirme la devolución.", Icon: ShieldCheck },
  { label: "Devolución", title: "Dale otra vuelta.", description: "Devolvé el envase al comercio para que pueda reutilizarse.", Icon: RotateCcw },
  { label: "Reembolso", title: "Lo bueno vuelve.", description: "El comercio firma y el contrato devuelve el importe al cliente una sola vez.", Icon: BadgeCheck },
];

export function ReticoLoop() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const last = index === points.length - 1;
  const running = playing && !reduced && !last;
  const { title, description, Icon } = points[index];

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setIndex(current => Math.min(current + 1, points.length - 1)), motionDuration.loopStep * 1000);
    return () => window.clearTimeout(timer);
  }, [running, index]);

  function next() {
    setPlaying(false);
    setIndex(current => (current + 1) % points.length);
  }

  function toggle() {
    if (last) {
      setIndex(0);
      setPlaying(true);
    } else {
      setPlaying(current => !current);
    }
  }

  const duration = reduced ? 0 : motionDuration.transition;
  return (
    <figure className="loop">
      <div className="loop-scene" aria-hidden="true">
        <div className="loop-orbit">
          {!reduced && <motion.div className="loop-runner" initial={false}
            animate={{ rotate: index * 90 }} transition={{ duration: .55, ease: "easeInOut" }}>
            <span />
          </motion.div>}
          {points.map(({ label, Icon: PointIcon }, pointIndex) => (
            <div className={`loop-point loop-point-${pointIndex}${pointIndex === index ? " loop-point-active" : ""}`} key={label}>
              <span className="loop-node"><PointIcon size={21} strokeWidth={1.8} /></span>
              <span className="loop-label">{label}</span>
            </div>
          ))}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div className="loop-art-frame" key={index}
              initial={{ opacity: 0, scale: .86, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: .92, y: -10 }} transition={{ duration }}>
              {index === 0 ? <div className="cup">
                <div className="cup-body"><div className="cup-sleeve">
                  <img src={`${import.meta.env.BASE_URL}brand/retico-light.svg`} alt="" width="46" height="46" />
                </div></div>
                <div className="cup-lid" />
              </div> : <div className="loop-art-symbol"><Icon size={64} strokeWidth={1.5} /></div>}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <figcaption className="loop-caption">
        <div className="loop-caption-top">
          <span className="loop-kicker">The ReTico Loop · {String(index + 1).padStart(2, "0")} / 04</span>
          <div className="loop-controls">
            {!reduced && <button type="button" onClick={toggle}>{last ? "Repetir" : running ? "Pausar" : "Continuar"}</button>}
            <button type="button" onClick={next}>Siguiente</button>
          </div>
        </div>
        <div className="loop-text-window" aria-hidden="true">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={index} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              exit={{ y: -16, opacity: 0 }} transition={{ duration }}>
              <strong className="loop-stage-title">{title}</strong>
              <p className="loop-stage-description">{description}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <ol className="sr-only">
          {points.map(point => <li key={point.label}>{point.title} {point.description}</li>)}
        </ol>
      </figcaption>
    </figure>
  );
}
