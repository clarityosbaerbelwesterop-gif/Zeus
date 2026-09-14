import type { AgentTemplate } from "@zeus/agents";

export function AgentMark({
  agent,
  size = 38,
}: {
  agent: Pick<AgentTemplate, "code" | "accent" | "name">;
  size?: number;
}) {
  const tilt =
    agent.code === "kai" ? -5 : agent.code === "lora" ? 6 : agent.code === "sara" ? -2 : 0;
  return (
    <span
      aria-label={`${agent.name} agent`}
      className="inline-grid shrink-0 place-items-center rounded-[35%]"
      style={{ width: size, height: size, background: `${agent.accent}20` }}
    >
      <svg
        viewBox="0 0 48 48"
        width={Math.round(size * 0.74)}
        height={Math.round(size * 0.74)}
        role="img"
        aria-hidden="true"
        style={{ transform: `rotate(${tilt}deg)` }}
      >
        <path d="M24 4 40 14v20L24 44 8 34V14Z" fill={agent.accent} />
        <circle cx="18" cy="23" r="2.4" fill="#f8f5ef" />
        <circle cx="30" cy="23" r="2.4" fill="#f8f5ef" />
        <path
          d="M18 32c3.6 2.3 8.4 2.3 12 0"
          fill="none"
          stroke="#f8f5ef"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
