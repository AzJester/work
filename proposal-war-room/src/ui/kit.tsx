import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ChangeEvent, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import spriteRaw from "../assets/icons-sprite.svg?raw";
import wordmarkLight from "../assets/astrion-wordmark-light.svg";
import wordmarkDark from "../assets/astrion-wordmark-dark.svg";
import { iconSize } from "../lib/icon-groups.ts";
import type { IconSize } from "../lib/icon-groups.ts";
import { statusStyle } from "../lib/status.ts";

/* ---------- Icons: astrion-icons sprite symbols only (provisional set) ---------- */

export type IconName =
  // Icon map of the build specification
  | "opportunity" | "rfp" | "schedule" | "calendar" | "deadline" | "submit" | "milestone" | "color-review" | "gate-review" | "lock"
  | "amendment" | "outline" | "volume" | "section" | "owner" | "team" | "writer" | "page-limit" | "format-check" | "compliance-matrix"
  | "cross-reference" | "agent" | "question" | "issue" | "action-item" | "email" | "download" | "upload" | "search" | "filter" | "sort"
  | "add" | "edit" | "delete" | "check" | "status-complete" | "status-in-progress" | "status-attention" | "status-blocked"
  | "arrow-up" | "arrow-down"
  // Interface glyphs the map does not list, picked from the same set
  | "close" | "chevron-down" | "chevron-right" | "settings" | "home" | "copy" | "refresh" | "print" | "clock" | "user" | "info" | "list-view" | "visible" | "hidden";

const SPRITE = spriteRaw.slice(spriteRaw.indexOf("<svg"));

/** The sprite, inlined once at the root of the app. */
export function IconSprite() {
  return <div hidden data-icon-sprite="astrion-icons" dangerouslySetInnerHTML={{ __html: SPRITE }} />;
}

export function Icon({ name, size = 20, label }: { name: IconName; size?: IconSize; label?: string }) {
  const px = iconSize(name, size);
  return (
    <svg className="icon" width={px} height={px} viewBox="0 0 24 24" data-icon={name} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      <use href={`#ast-${name}`} />
    </svg>
  );
}

/* ---------- Theme and wordmark ---------- */

export type Theme = "dark" | "light";
export const ThemeContext = createContext<Theme>("dark");

/** The supplied outlined web wordmark. Never live text, never recolored. */
export function Wordmark() {
  const theme = useContext(ThemeContext);
  return <img className="wordmark" src={theme === "dark" ? wordmarkLight : wordmarkDark} alt="Astrion" data-wordmark={theme === "dark" ? "light" : "dark"} />;
}

/* ---------- Regions: one Ion element each ---------- */

interface RegionState { ionTaken: boolean }
const RegionContext = createContext<RegionState>({ ionTaken: false });
/** True while the screen-wide alert is showing on a screen where it must be the only Ion element. */
export const ScreenIonContext = createContext<boolean>(false);

/**
 * A screen region. `ion` names the Ion element this region already shows (an alert, a marker or a countdown).
 * A primary button inside a region that has one is drawn as an outline instead of an Ion fill.
 */
export function Region({ name, ion = false, className, children, label }: { name: string; ion?: boolean; className?: string; children: ReactNode; label?: string }) {
  const screenTaken = useContext(ScreenIonContext);
  const value = useMemo(() => ({ ionTaken: ion || screenTaken }), [ion, screenTaken]);
  return (
    <section className={className} data-region={name} aria-label={label}>
      <RegionContext.Provider value={value}>{children}</RegionContext.Provider>
    </section>
  );
}

export function useIonAvailable(): boolean {
  return !useContext(RegionContext).ionTaken;
}

/* ---------- Buttons ---------- */

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: "default" | "primary" | "strong" | "quiet";
  icon?: IconName;
  iconSize?: IconSize;
  /** Icon-only button: the label becomes the accessible name and the tooltip. */
  iconOnly?: boolean;
  on?: boolean;
  children: ReactNode;
};

export function Button({ variant = "default", icon, iconSize: size = 16, iconOnly = false, on = false, children, className, type = "button", ...rest }: ButtonProps) {
  const ionAvailable = useIonAvailable();
  const resolved = variant === "primary" && !ionAvailable ? "strong" : variant;
  const classes = ["btn", resolved === "primary" ? "btn-primary" : resolved === "strong" ? "btn-strong" : resolved === "quiet" ? "btn-quiet" : "", iconOnly ? "btn-icon" : "", on ? "is-on" : "", className ?? ""].filter(Boolean).join(" ");
  const text = typeof children === "string" ? children : undefined;
  return (
    <button type={type} className={classes} aria-label={iconOnly ? text : undefined} title={iconOnly ? text : rest.title} aria-pressed={on || undefined} {...rest}>
      {icon ? <Icon name={icon} size={size} /> : null}
      {iconOnly ? null : <span>{children}</span>}
    </button>
  );
}

/* ---------- Fields ---------- */

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={["field", className ?? ""].join(" ").trim()}>
      <label className="label" htmlFor={id}>{label}</label>
      {children(id)}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

type TextProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & { value: string; onValue: (value: string) => void; mono?: boolean };

/** A text input that commits on every keystroke. */
export function TextInput({ value, onValue, mono, className, ...rest }: TextProps) {
  return <input className={["input", mono ? "mono-input" : "", className ?? ""].join(" ").trim()} value={value} onChange={(event: ChangeEvent<HTMLInputElement>) => onValue(event.target.value)} {...rest} />;
}

type NumberProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> & { value: number | null; onValue: (value: number | null) => void; min?: number; max?: number; step?: number };

/** A number input. An empty box is null, never zero. */
export function NumberInput({ value, onValue, min = 0, max, step = 1, className, ...rest }: NumberProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null || Number.isNaN(value) ? "" : String(value));
  return (
    <input
      className={["input", "mono-input", className ?? ""].join(" ").trim()} type="number" inputMode="decimal" min={min} max={max} step={step} value={shown}
      onChange={event => {
        const text = event.target.value;
        setDraft(text);
        if (text.trim() === "") return onValue(null);
        const number = Number(text);
        if (Number.isFinite(number)) onValue(max !== undefined ? Math.min(max, Math.max(min, number)) : Math.max(min, number));
      }}
      onBlur={() => setDraft(null)}
      {...rest}
    />
  );
}

export function TextArea({ value, onValue, className, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & { value: string; onValue: (value: string) => void }) {
  return <textarea className={["textarea", className ?? ""].join(" ").trim()} value={value} onChange={event => onValue(event.target.value)} {...rest} />;
}

export interface Option { value: string; label: string }

export function Select({ value, onValue, options, mono, className, ...rest }: Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> & { value: string; onValue: (value: string) => void; options: readonly Option[]; mono?: boolean }) {
  return (
    <span className="select-wrap">
      <select className={["select", mono ? "mono-input" : "", className ?? ""].join(" ").trim()} value={value} onChange={event => onValue(event.target.value)} {...rest}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <Icon name="chevron-down" size={16} />
    </span>
  );
}

export function DateInput({ value, onValue, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> & { value: string; onValue: (value: string) => void }) {
  return (
    <span className="date-wrap">
      <input className={["input", "mono-input", className ?? ""].join(" ").trim()} type="date" value={value} onChange={event => onValue(event.target.value)} {...rest} />
      <Icon name="calendar" size={16} />
    </span>
  );
}

export function TimeInput({ value, onValue, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> & { value: string; onValue: (value: string) => void }) {
  return (
    <span className="date-wrap">
      <input className={["input", "mono-input", className ?? ""].join(" ").trim()} type="time" value={value} onChange={event => onValue(event.target.value)} {...rest} />
      <Icon name="clock" size={16} />
    </span>
  );
}

export function Checkbox({ checked, onValue, children, disabled, label }: { checked: boolean; onValue: (checked: boolean) => void; children?: ReactNode; disabled?: boolean; label?: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={event => onValue(event.target.checked)} />
      <span className="box" aria-hidden="true"><Icon name="check" size={16} /></span>
      {children ? <span>{children}</span> : null}
    </label>
  );
}

/* ---------- Status: a word, an icon where the set has one, never a color ---------- */

export function StatusWord({ value, detail, size = 20 }: { value: string; detail?: string; size?: IconSize }) {
  const style = statusStyle(value);
  return (
    <span className={["status", style.strong ? "is-strong" : ""].join(" ").trim()} data-status={style.tone} data-status-word={value}>
      {style.icon ? <Icon name={style.icon as IconName} size={size} /> : null}
      <span className="status-word">{value}</span>
      {detail ? <span className="status-detail">{detail}</span> : null}
    </span>
  );
}

/* ---------- Dialog ---------- */

export function Dialog({ title, icon, onClose, children, footer, wide = false, name }: { title: string; icon?: IconName; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; name: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  const titleId = useId();
  return (
    <dialog ref={ref} className={["dialog", wide ? "is-wide" : ""].join(" ").trim()} aria-labelledby={titleId} data-dialog={name}
      onCancel={event => { event.preventDefault(); onClose(); }}>
      <Region name={`dialog-${name}`} className="dialog-form">
        <header className="dialog-head">
          <h2 className="panel-title" id={titleId} style={{ display: "flex", alignItems: "center", gap: 8 }}>{icon ? <Icon name={icon} /> : null}<span>{title}</span></h2>
          <Button variant="quiet" icon="close" iconOnly onClick={onClose}>Close</Button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer ? <footer className="dialog-foot">{footer}</footer> : null}
      </Region>
    </dialog>
  );
}

/* ---------- Tabs ---------- */

export function Tabs<T extends string>({ value, onValue, tabs, label }: { value: T; onValue: (value: T) => void; tabs: readonly { value: T; label: string; icon?: IconName }[]; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map(tab => (
        <button key={tab.value} type="button" role="tab" className="tab" aria-selected={tab.value === value} onClick={() => onValue(tab.value)}>
          {tab.icon ? <Icon name={tab.icon} size={16} /> : null}<span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Empty state: a title, one sentence, one primary action ---------- */

export function EmptyState({ title, body, action, name }: { title: string; body: string; action?: ReactNode; name: string }) {
  return (
    <Region name={`empty-${name}`} className="empty">
      <h3 className="panel-title">{title}</h3>
      <p className="muted">{body}</p>
      {action}
    </Region>
  );
}

/* ---------- Toasts ---------- */

interface Toast { id: number; title: string; body?: string }
const ToastContext = createContext<(title: string, body?: string) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const push = useCallback((title: string, body?: string) => {
    const id = next.current++;
    setToasts(list => [...list.slice(-2), { id, title, body }]);
    window.setTimeout(() => setToasts(list => list.filter(toast => toast.id !== id)), 6000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(toast => (
          <div className="toast" key={toast.id} data-region={`toast-${toast.id}`}>
            <span className="toast-title">{toast.title}</span>
            {toast.body ? <span className="caption">{toast.body}</span> : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------- Countdown: Archivo 800 number over a mono label ---------- */

export function CountdownBlock({ value, caption, signal = false, small = false, name }: { value: string; caption: string; signal?: boolean; small?: boolean; name: string }) {
  // The countdown is its region's Ion element, so only a screen-wide alert takes the color away from it.
  const screenTaken = useContext(ScreenIonContext);
  return (
    <div className="countdown" data-countdown={name}>
      <span className={["count-number", small ? "small" : "", signal && !screenTaken ? "is-signal" : ""].join(" ").trim()}>{value}</span>
      <span className="mono muted">{caption}</span>
    </div>
  );
}

/** Downloads text or bytes as a file. */
export function downloadFile(name: string, content: string | Uint8Array, type: string): void {
  const blob = new Blob([content as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
