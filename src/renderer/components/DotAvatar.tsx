import { useId, useEffect, useRef, type CSSProperties } from "react";
import { Shuffle } from "lucide-react";
import type { Dot, DotAvatarConfig, DotStatus } from "@shared/types";
import { observeMascot } from "../lib/mascotMotion";
import "../profile.css";

export const DEFAULT_AVATAR: DotAvatarConfig = {
  shape: "circle",
  eyes: "dot",
  glasses: "none",
  accessory: "none",
};
export const AVATAR_COLORS = [
  "#78b7a0",
  "#93b5d5",
  "#b7a3d6",
  "#dea88d",
  "#e5c77d",
  "#dba9ba",
  "#849c87",
  "#8b94b8",
];

export function normalizeAvatar(
  avatar?: Partial<DotAvatarConfig>,
): DotAvatarConfig {
  return {
    shape: ["circle", "squircle", "blob"].includes(avatar?.shape || "")
      ? avatar!.shape!
      : "circle",
    eyes: ["dot", "happy", "sleepy"].includes(avatar?.eyes || "")
      ? avatar!.eyes!
      : "dot",
    glasses: ["none", "round", "square"].includes(avatar?.glasses || "")
      ? avatar!.glasses!
      : "none",
    accessory: ["none", "cap", "sprout", "headphones"].includes(
      avatar?.accessory || "",
    )
      ? avatar!.accessory!
      : "none",
  };
}

export function DotAvatar({
  dot,
  size = 48,
  animated = false,
  avatar,
  color,
  name,
  className = "",
}: {
  dot?: Pick<Dot, "name" | "color" | "avatar"> & { paused?: boolean; status?: DotStatus };
  size?: number;
  animated?: boolean;
  avatar?: Partial<DotAvatarConfig>;
  color?: string;
  name?: string;
  className?: string;
}) {
  const config = normalizeAvatar(avatar || dot?.avatar);
  const fill = /^#[0-9a-f]{6}$/i.test(color || dot?.color || "")
    ? (color || dot?.color)!
    : "#78b7a0";
  const gradient = useId().replace(/:/g, "");
  const label = name || dot?.name || "Dot";
  const mascot = useRef<HTMLSpanElement>(null);
  const mood = dot?.paused || dot?.status === "paused" ? "resting"
    : dot?.status === "running" ? "working"
    : dot?.status === "awaiting-approval" ? "curious"
    : dot?.status === "queued" ? "waiting" : "idle";
  const phase = [...label].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 7;
  useEffect(() => {
    if (animated && mascot.current) return observeMascot(mascot.current);
    return undefined;
  }, [animated]);
  return (
    <span
      ref={mascot}
      className={`dot-mascot ${animated ? "is-animated" : ""} ${className}`}
      style={{ width: size, height: size, "--mascot-phase": `${-phase * .7}s` } as CSSProperties}
      data-mood={mood}
      data-eyes={config.eyes}
      role="img"
      aria-label={`${label}'s avatar`}
    >
      <span className="dot-mascot-motion">
        <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
          <defs>
            <linearGradient
              id={gradient}
              x1="28"
              y1="19"
              x2="77"
              y2="85"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor={fill} />
              <stop offset="1" stopColor={fill} />
            </linearGradient>
          </defs>
          <ellipse
            cx="50"
            cy="88"
            rx="24"
            ry="4"
            fill="currentColor"
            opacity=".07"
          />
          <g className="dot-mascot-body">
            {config.shape === "circle" ? (
              <circle cx="50" cy="51" r="34" fill={`url(#${gradient})`} />
            ) : config.shape === "squircle" ? (
              <rect
                x="17"
                y="18"
                width="66"
                height="66"
                rx="24"
                fill={`url(#${gradient})`}
              />
            ) : (
              <path
                d="M49 16C66 12 81 24 84 40C91 55 79 77 63 82C48 91 30 81 21 69C10 56 12 38 23 28C28 20 38 16 49 16Z"
                fill={`url(#${gradient})`}
              />
            )}
            <path
              d="M29 31C33 25 39 22 45 22"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              opacity=".26"
            />
            <ellipse cx="32" cy="62" rx="5" ry="3" fill="white" opacity=".15" />
            <ellipse cx="69" cy="62" rx="5" ry="3" fill="white" opacity=".15" />
            <g stroke="#24332c" strokeWidth="3.3" strokeLinecap="round">
              <g className="dot-mascot-eyes">
              {config.eyes === "dot" ? (
                <>
                  <ellipse
                    cx="39"
                    cy="50"
                    rx="2.9"
                    ry="4.1"
                    fill="#24332c"
                    stroke="none"
                  />
                  <ellipse
                    cx="61"
                    cy="50"
                    rx="2.9"
                    ry="4.1"
                    fill="#24332c"
                    stroke="none"
                  />
                </>
              ) : config.eyes === "happy" ? (
                <>
                  <path d="M35 51Q39 43 43 51" />
                  <path d="M57 51Q61 43 65 51" />
                </>
              ) : (
                <>
                  <path d="M35 50L43 50" />
                  <path d="M57 50L65 50" />
                </>
              )}
              </g>
              <path d="M45 63Q50 67 55 63" strokeWidth="2" />
            </g>
            {config.glasses !== "none" && (
              <g stroke="#2c3b33" strokeWidth="2.3">
                {config.glasses === "round" ? (
                  <>
                    <circle cx="38" cy="51" r="9" />
                    <circle cx="62" cy="51" r="9" />
                  </>
                ) : (
                  <>
                    <rect x="28" y="43" width="20" height="16" rx="4" />
                    <rect x="52" y="43" width="20" height="16" rx="4" />
                  </>
                )}
                <path d="M47 50Q50 48 53 50M21 46L29 48M71 48L79 46" />
              </g>
            )}
            {config.accessory === "cap" && (
              <g>
                <path d="M27 28C30 10 52 9 62 20L64 30Z" fill="#394c42" />
                <path d="M24 30Q48 20 74 27Q81 31 74 34L24 34Z" fill="#465f51" />
                <path d="M49 14L51 25" stroke="#718b7a" strokeWidth="2" />
              </g>
            )}
            {config.accessory === "sprout" && (
              <g>
                <path
                  d="M50 21V11"
                  stroke="#466348"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <path
                  d="M49 14C39 15 36 6 36 4C45 3 51 8 49 14Z"
                  fill="#577954"
                />
                <path
                  d="M51 12C52 5 59 3 66 5C64 13 57 17 51 12Z"
                  fill="#80a46f"
                />
              </g>
            )}
            {config.accessory === "headphones" && (
              <g stroke="#34483c" strokeWidth="4">
                <path d="M18 49V43C18 23 32 15 50 15C68 15 82 25 82 43V49" />
                <rect
                  x="14"
                  y="44"
                  width="9"
                  height="21"
                  rx="4"
                  fill="#415b4b"
                  strokeWidth="2"
                />
                <rect
                  x="77"
                  y="44"
                  width="9"
                  height="21"
                  rx="4"
                  fill="#415b4b"
                  strokeWidth="2"
                />
              </g>
            )}
          </g>
        </svg>
      </span>
      {animated && <span className="mascot-sparkle" aria-hidden="true">✦</span>}
    </span>
  );
}

export function AvatarEditor({
  value,
  color,
  onChange,
  onColorChange,
  compact = false,
}: {
  value: DotAvatarConfig;
  color: string;
  onChange: (avatar: DotAvatarConfig) => void;
  onColorChange: (color: string) => void;
  compact?: boolean;
}) {
  const choose = <K extends keyof DotAvatarConfig>(
    key: K,
    next: DotAvatarConfig[K],
  ) => onChange({ ...value, [key]: next });
  const randomize = () => {
    const pick = <T,>(items: T[]) =>
      items[Math.floor(Math.random() * items.length)];
    onChange({
      shape: pick(["circle", "squircle", "blob"]),
      eyes: pick(["dot", "happy", "sleepy"]),
      glasses: pick(["none", "round", "square"]),
      accessory: pick(["none", "cap", "sprout", "headphones"]),
    });
    onColorChange(pick(AVATAR_COLORS));
  };
  return (
    <div className={`avatar-editor ${compact ? "is-compact" : ""}`}>
      <div className="avatar-editor-preview">
        <DotAvatar
          avatar={value}
          color={color}
          size={compact ? 114 : 154}
          animated
        />
        <button type="button" className="btn-ghost" onClick={randomize}>
          <Shuffle size={13} /> Surprise me
        </button>
      </div>
      <div className="avatar-editor-controls">
        <div className="avatar-option-row">
          <span>Color</span>
          <div className="avatar-color-options">
            {AVATAR_COLORS.map((item) => (
              <button
                type="button"
                key={item}
                aria-label={`Choose ${item} color`}
                aria-pressed={color.toLowerCase() === item}
                className={`avatar-color ${color.toLowerCase() === item ? "is-selected" : ""}`}
                style={{ background: item }}
                onClick={() => onColorChange(item)}
              />
            ))}
            <label
              className="avatar-custom-color"
              title="Choose a custom color"
            >
              <input
                aria-label="Custom avatar color"
                type="color"
                value={color}
                onChange={(event) => onColorChange(event.target.value)}
              />
              <span>+</span>
            </label>
          </div>
        </div>
        <AvatarOptions
          label="Shape"
          items={[
            ["circle", "Round"],
            ["squircle", "Soft square"],
            ["blob", "Pebble"],
          ]}
          selected={value.shape}
          onSelect={(next) => choose("shape", next)}
        />
        <AvatarOptions
          label="Eyes"
          items={[
            ["dot", "Curious"],
            ["happy", "Happy"],
            ["sleepy", "Calm"],
          ]}
          selected={value.eyes}
          onSelect={(next) => choose("eyes", next)}
        />
        <AvatarOptions
          label="Glasses"
          items={[
            ["none", "None"],
            ["round", "Round"],
            ["square", "Square"],
          ]}
          selected={value.glasses}
          onSelect={(next) => choose("glasses", next)}
        />
        <AvatarOptions
          label="Accessory"
          items={[
            ["none", "None"],
            ["cap", "Cap"],
            ["sprout", "Sprout"],
            ["headphones", "Headphones"],
          ]}
          selected={value.accessory}
          onSelect={(next) => choose("accessory", next)}
        />
      </div>
    </div>
  );
}

function AvatarOptions<T extends string>({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string;
  items: [T, string][];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="avatar-option-row">
      <span>{label}</span>
      <div className="profile-choice-group" role="group" aria-label={label}>
        {items.map(([id, text]) => (
          <button
            type="button"
            key={id}
            aria-pressed={selected === id}
            className={selected === id ? "is-selected" : ""}
            onClick={() => onSelect(id)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
