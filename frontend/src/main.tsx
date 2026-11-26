import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { motionDuration } from "./motionTokens";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <MotionConfig reducedMotion="user" transition={{ duration: motionDuration.transition }}>
    <App />
  </MotionConfig>,
);
