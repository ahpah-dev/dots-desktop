import { useId, useEffect, useRef, type CSSProperties } from "react";
import { Shuffle } from "lucide-react";
import type { Dot, DotAvatarConfig, DotStatus } from "@shared/types";
import { ACCESSORIES, ACCESSORY_DEFAULT_COLORS, normalizeAvatar, shadeAvatarColor } from "@shared/avatar";
import { observeMascot } from "../lib/mascotMotion";
import type { ActivityKind } from "@shared/activity";
import "../profile.css";

export { DEFAULT_AVATAR, normalizeAvatar } from "@shared/avatar";
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
const ACCESSORY_COLORS = ["#394c42", "#567fba", "#9877bf", "#bc7181", "#d99b65", "#e5c77d", "#72a895", "#dba9ba"];

export function DotAvatar({
  dot,
  size = 48,
  animated = false,
  avatar,
  color,
  name,
  className = "",
  activity,
  backgroundMotion = false,
}: {
  dot?: Pick<Dot, "name" | "color" | "avatar"> & { paused?: boolean; status?: DotStatus };
  size?: number;
  animated?: boolean;
  avatar?: Partial<DotAvatarConfig>;
  color?: string;
  name?: string;
  className?: string;
  activity?: ActivityKind;
  backgroundMotion?: boolean;
}) {
  const config = normalizeAvatar(avatar || dot?.avatar);
  const accessoryFill = config.accessoryColor || ACCESSORY_DEFAULT_COLORS[config.accessory];
  const accessoryDark = shadeAvatarColor(accessoryFill, -.22);
  const accessoryLight = shadeAvatarColor(accessoryFill, .3);
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
      data-activity={activity}
      data-background-motion={backgroundMotion}
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
              <g data-glasses={config.glasses} stroke={config.glassesColor || "#2c3b33"} strokeWidth="2.3">
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
            <g data-accessory={config.accessory}>
            {config.accessory === "cap" && (
              <g>
                <path d="M27 28C30 10 52 9 62 20L64 30Z" fill={config.accessoryColor ? accessoryDark : "#394c42"} />
                <path d="M24 30Q48 20 74 27Q81 31 74 34L24 34Z" fill={accessoryFill} />
                <path d="M49 14L51 25" stroke={config.accessoryColor ? accessoryLight : "#718b7a"} strokeWidth="2" />
              </g>
            )}
            {config.accessory === "sprout" && (
              <g>
                <path
                  d="M50 21V11"
                  stroke={config.accessoryColor ? accessoryDark : "#466348"}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <path
                  d="M49 14C39 15 36 6 36 4C45 3 51 8 49 14Z"
                  fill={accessoryFill}
                />
                <path
                  d="M51 12C52 5 59 3 66 5C64 13 57 17 51 12Z"
                  fill={config.accessoryColor ? accessoryLight : "#80a46f"}
                />
              </g>
            )}
            {config.accessory === "headphones" && (
              <g stroke={config.accessoryColor ? accessoryDark : "#34483c"} strokeWidth="4">
                <path d="M18 49V43C18 23 32 15 50 15C68 15 82 25 82 43V49" />
                <rect
                  x="14"
                  y="44"
                  width="9"
                  height="21"
                  rx="4"
                  fill={accessoryFill}
                  strokeWidth="2"
                />
                <rect
                  x="77"
                  y="44"
                  width="9"
                  height="21"
                  rx="4"
                  fill={accessoryFill}
                  strokeWidth="2"
                />
              </g>
            )}
            {config.accessory === "beanie" && (
              <g>
                <path d="M24 28C25 14 35 8 50 8C65 8 75 14 76 28Z" fill={accessoryFill} />
                <path d="M34 13L32 25M45 10L44 25M56 10L57 25M67 14L69 25" stroke={accessoryLight} strokeWidth="2" strokeLinecap="round" />
                <rect x="22" y="25" width="56" height="11" rx="5" fill={accessoryDark} />
                <circle cx="50" cy="7" r="5" fill={accessoryLight} />
              </g>
            )}
            {config.accessory === "bow" && (
              <g fill={accessoryFill} stroke={accessoryDark} strokeWidth="1.5" strokeLinejoin="round">
                <path d="M62 22C54 11 47 12 47 19C46 29 53 31 62 25Z" />
                <path d="M64 22C71 11 80 13 79 20C78 30 72 31 64 25Z" />
                <path d="M61 25L56 35L63 33L66 35L67 25" />
                <circle cx="63" cy="23" r="4" fill={accessoryLight} />
              </g>
            )}
            {config.accessory === "crown" && (
              <g stroke={accessoryDark} strokeWidth="1.5" strokeLinejoin="round">
                <path d="M27 29L24 11L38 19L50 5L62 19L76 11L73 29Z" fill={accessoryFill} />
                <rect x="27" y="27" width="46" height="7" rx="3" fill={accessoryDark} stroke="none" />
                <path d="M50 17L54 22L50 26L46 22Z" fill={accessoryLight} stroke="none" />
                <circle cx="35" cy="24" r="2" fill={accessoryLight} stroke="none" />
                <circle cx="65" cy="24" r="2" fill={accessoryLight} stroke="none" />
              </g>
            )}
            {config.accessory === "flower" && (
              <g>
                <path d="M67 29C77 34 84 30 84 25C76 23 69 25 67 29Z" fill="#577954" />
                <g fill={accessoryFill} stroke={accessoryDark} strokeWidth="1">
                  <ellipse cx="68" cy="15" rx="5" ry="7" />
                  <ellipse cx="61" cy="22" rx="7" ry="5" />
                  <ellipse cx="75" cy="22" rx="7" ry="5" />
                  <ellipse cx="68" cy="29" rx="5" ry="7" />
                </g>
                <circle cx="68" cy="22" r="4.5" fill="#f3dc96" />
              </g>
            )}
            {config.accessory === "antenna" && (
              <g stroke={accessoryDark} strokeWidth="2.5" strokeLinecap="round">
                <path d="M34 22L29 10M66 22L71 10" />
                <circle cx="28" cy="8" r="5" fill={accessoryFill} />
                <circle cx="72" cy="8" r="5" fill={accessoryFill} />
                <circle cx="27" cy="7" r="1.5" fill={accessoryLight} stroke="none" />
                <circle cx="71" cy="7" r="1.5" fill={accessoryLight} stroke="none" />
              </g>
            )}
            {config.accessory === "party-hat" && (
              <g strokeLinejoin="round">
                <path d="M33 29L50 5L68 29Z" fill={accessoryFill} stroke={accessoryDark} strokeWidth="1.5" />
                <path d="M42 17L58 17M37 24L63 24" stroke={accessoryLight} strokeWidth="3" />
                <rect x="30" y="27" width="40" height="6" rx="3" fill={accessoryDark} />
                <circle cx="50" cy="5" r="3" fill={accessoryLight} />
              </g>
            )}
            {config.accessory === "scarf" && (
              <g>
                <path d="M58 77L62 92L74 89L70 74Z" fill={accessoryDark} />
                <path d="M64 85L72 83M65 89L73 87" stroke={accessoryLight} strokeWidth="2" />
                <path d="M23 71Q50 88 77 71L76 81Q50 95 24 81Z" fill={accessoryFill} />
                <path d="M29 77Q50 88 71 77" stroke={accessoryLight} strokeWidth="2" strokeLinecap="round" />
                <ellipse cx="64" cy="79" rx="7" ry="6" fill={accessoryDark} />
              </g>
            )}
            {config.accessory === "top-hat" && (
              <g>
                <path d="M32 29L30 6Q50 1 70 6L68 29Z" fill={accessoryFill} />
                <path d="M32 21Q50 24 68 21L68 28H32Z" fill={accessoryLight} />
                <ellipse cx="50" cy="29" rx="30" ry="5" fill={accessoryDark} />
                <path d="M35 8Q50 5 65 8" stroke={accessoryLight} strokeWidth="1.5" strokeLinecap="round" />
              </g>
            )}
            </g>
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
    const pick = <T,>(items: readonly T[]) =>
      items[Math.floor(Math.random() * items.length)];
    onChange({
      shape: pick(["circle", "squircle", "blob"]),
      eyes: pick(["dot", "happy", "sleepy"]),
      glasses: pick(["none", "round", "square"]),
      accessory: pick(ACCESSORIES)[0],
      accessoryColor: pick(ACCESSORY_COLORS),
      glassesColor: pick(ACCESSORY_COLORS),
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
        <AvatarColorPicker label="Color" color={color} colors={AVATAR_COLORS} onChange={onColorChange} />
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
        {value.glasses !== "none" && (
          <AvatarColorPicker
            label="Glasses color"
            color={value.glassesColor || "#2c3b33"}
            colors={ACCESSORY_COLORS}
            onChange={(next) => choose("glassesColor", next)}
            onReset={() => choose("glassesColor", undefined)}
            isDefault={!value.glassesColor}
          />
        )}
        <div className="avatar-accessories">
          <span>Accessory</span>
          <div className="avatar-accessory-options" role="group" aria-label="Accessory">
            {ACCESSORIES.map(([id, text]) => (
              <button
                key={id}
                type="button"
                aria-pressed={value.accessory === id}
                className={value.accessory === id ? "is-selected" : ""}
                onClick={() => choose("accessory", id)}
              >
                <span aria-hidden="true"><DotAvatar avatar={{ ...value, glasses: "none", accessory: id }} color={color} size={38} /></span>
                <span>{text}</span>
              </button>
            ))}
          </div>
        </div>
        {value.accessory !== "none" && (
          <AvatarColorPicker
            label="Accessory color"
            color={value.accessoryColor || ACCESSORY_DEFAULT_COLORS[value.accessory]}
            colors={ACCESSORY_COLORS}
            onChange={(next) => choose("accessoryColor", next)}
            onReset={() => choose("accessoryColor", undefined)}
            isDefault={!value.accessoryColor}
          />
        )}
      </div>
    </div>
  );
}

function AvatarColorPicker({ label, color, colors, onChange, onReset, isDefault }: {
  label: string;
  color: string;
  colors: string[];
  onChange: (color: string) => void;
  onReset?: () => void;
  isDefault?: boolean;
}) {
  const bodyColor = label === "Color";
  const custom = !isDefault && !colors.includes(color.toLowerCase());
  return (
    <div className="avatar-option-row avatar-color-row">
      <span>{label}</span>
      <div className="avatar-color-options" role="group" aria-label={label}>
        {colors.map((item) => (
          <button
            type="button"
            key={item}
            aria-label={bodyColor ? `Choose ${item} color` : `Choose ${item} ${label.toLowerCase()}`}
            aria-pressed={!isDefault && color.toLowerCase() === item}
            className={`avatar-color ${!isDefault && color.toLowerCase() === item ? "is-selected" : ""}`}
            style={{ background: item }}
            onClick={() => onChange(item)}
          />
        ))}
        <label className={`avatar-custom-color ${custom ? "is-selected" : ""}`} title={`Choose a custom ${bodyColor ? "avatar color" : label.toLowerCase()}`} style={custom ? { background: color } : undefined}>
          <input
            aria-label={`Custom ${bodyColor ? "avatar color" : label.toLowerCase()}`}
            type="color"
            value={color}
            onChange={(event) => onChange(event.target.value)}
          />
          {!custom && <span>+</span>}
        </label>
        {onReset && <button type="button" className="avatar-color-reset" aria-label={`Reset ${label.toLowerCase()}`} aria-pressed={isDefault} onClick={onReset}>Default</button>}
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
