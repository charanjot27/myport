import "./wave-loader.css";

/**
 * Wave physics loader: a ball hops along a row of bars and each bar springs up
 * as it lands, then settles. Pure CSS (the same markup is inlined in index.html
 * as the boot screen), so it runs before any script loads.
 */
export function WaveLoader({ label = "Loading", className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`wave-loader ${className}`} role="status" aria-label={label}>
      <div className="wl-row">
        {Array.from({ length: 15 }, (_, k) => (
          <i key={k} style={{ ["--k" as string]: k }} />
        ))}
        <b className="wl-ball">
          <span />
        </b>
      </div>
    </div>
  );
}
