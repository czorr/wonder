import { Shell } from "@/app/shell/Shell";
import { SpikeView } from "@/app/spike/SpikeView";

export function App() {
  const isSpike =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("spike");
  return isSpike ? <SpikeView /> : <Shell />;
}
