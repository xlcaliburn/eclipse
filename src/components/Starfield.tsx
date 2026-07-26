interface StarfieldProps {
  act?: 1 | 2; // iteration 10.2 — nebula tint shifts per act: teal (1), red-shifted (2)
}

// Fixed, code-authored background behind every screen: 3 tiled radial-
// gradient star layers (far/mid/near) with slow drift + a subtle twinkle,
// plus one soft nebula blob tinted by the current act. Pure CSS — no
// canvas, no image assets. `prefers-reduced-motion` freezes all of it via
// the stylesheet (see styles.css's reduced-motion block).
export function Starfield({ act = 1 }: StarfieldProps) {
  return (
    <div className={`starfield starfield--act${act}`} aria-hidden="true">
      <div className="starfield__layer starfield__layer--far" />
      <div className="starfield__layer starfield__layer--mid" />
      <div className="starfield__layer starfield__layer--near" />
      <div className="starfield__nebula" />
    </div>
  );
}
