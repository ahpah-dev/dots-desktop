import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import "../profile.css";

export function PanelHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="profile-panel-header">
      <div>
        {eyebrow && <span className="profile-eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="profile-actions">{actions}</div>}
    </div>
  );
}

export function PanelSection({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`profile-section ${className}`}>
      <div className="profile-section-heading">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  let inputId = `${id}-input`;
  let count = 0;
  const decorate = (nodes: ReactNode): ReactNode =>
    Children.map(nodes, (child) => {
      if (
        !isValidElement<{
          id?: string;
          children?: ReactNode;
          "aria-describedby"?: string;
        }>(child) ||
        typeof child.type !== "string"
      )
        return child;
      if (["input", "select", "textarea"].includes(child.type)) {
        const controlId =
          child.props.id || `${id}-input${count ? `-${count}` : ""}`;
        if (!count++) inputId = controlId;
        return cloneElement(child, {
          id: controlId,
          "aria-describedby":
            [child.props["aria-describedby"], hint ? `${id}-hint` : ""]
              .filter(Boolean)
              .join(" ") || undefined,
        });
      }
      return child.props.children
        ? cloneElement(child, { children: decorate(child.props.children) })
        : child;
    });
  const controls = decorate(children);
  return (
    <div className={`profile-field ${className}`}>
      <label htmlFor={inputId}>{label}</label>
      {controls}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}

export function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="profile-setting-row">
      <div>
        <strong>{title}</strong>
        {description && <p>{description}</p>}
      </div>
      <div className="profile-setting-control">{children}</div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`profile-toggle ${checked ? "is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export function ModalShell({
  title,
  subtitle,
  children,
  footer,
  onClose,
  width = 720,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  width?: number;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const autofocus =
        panel.current?.querySelector<HTMLElement>("[data-autofocus]");
      (autofocus || panel.current)?.focus();
    });
    const handleKey = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== panel.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current?.();
      }
      if (event.key !== "Tab" || !panel.current) return;
      const elements = Array.from(
        panel.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (!elements.length) {
        event.preventDefault();
        panel.current.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === panel.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === panel.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`modal-box profile-modal ${className}`}
        style={{ maxWidth: width }}
      >
        <header className="profile-modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {onClose && (
            <button
              type="button"
              className="btn-ghost profile-icon-button"
              aria-label="Close dialog"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          )}
        </header>
        <div className="profile-modal-content">{children}</div>
        {footer && <footer className="profile-modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
