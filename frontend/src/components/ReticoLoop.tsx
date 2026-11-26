import { motion, useReducedMotion } from "motion/react";
import { motionDuration } from "../motionTokens";
import { BadgeCheck, CupSoda, RotateCcw, ShieldCheck } from "lucide-react";

const points = [
  { label: "Envase", Icon: CupSoda },
  { label: "Custodia", Icon: ShieldCheck },
  { label: "Devolución", Icon: RotateCcw },
  { label: "Reembolso", Icon: BadgeCheck },
];

export function ReticoLoop() {
  const reduced = useReducedMotion();
  return (
    <figure className="loop">
      <div className="loop-scene" aria-hidden="true">
        <div className="loop-orbit">
          {!reduced && <motion.div className="loop-runner"
            initial={{ rotate: 0 }} animate={{ rotate: [0, 90, 180, 270, 360] }}
            transition={{ duration: motionDuration.loop, times: [0, .25, .5, .75, 1], ease: "easeInOut" }}>
            <span />
          </motion.div>}
          {points.map(({ label, Icon }, index) => (
            <div className={`loop-point loop-point-${index}`} key={label}>
              <span className="loop-node"><Icon size={21} strokeWidth={1.8} /></span>
              <span className="loop-label">{label}</span>
            </div>
          ))}
          <div className="cup">
            <div className="cup-body">
              <div className="cup-sleeve">
                <img src={`${import.meta.env.BASE_URL}brand/retico-light.svg`} alt="" width="46" height="46" />
              </div>
            </div>
            <div className="cup-lid" />
          </div>
        </div>
      </div>
      <figcaption>The ReTico Loop <span className="sr-only">. Envase, custodia, devolución y reembolso.</span><span aria-hidden="true">↻</span></figcaption>
    </figure>
  );
}
