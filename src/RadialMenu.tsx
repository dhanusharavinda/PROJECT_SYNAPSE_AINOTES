import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  MousePointer2,
  Type,
  PenLine,
  Plus,
  Layers,
  Palette,
  Copy,
  Trash2,
  Link2,
  FilePlus2,
  Undo2,
  Redo2,
  Move,
  Maximize2,
  RotateCw,
  Pin,
  Focus,
  Table2,
  Image,
  Code,
  X,
  AlignLeft,
  CheckSquare,
  Circle,
  Square,
  Diamond,
  Triangle,
  Minus,
  Highlighter,
  ArrowUpRight,
  Eraser,
  PaintBucket,
  Workflow,
  Hand,
  Settings2,
  ClipboardPaste,
  CopyPlus,
  Scissors,
  BringToFront,
  SendToBack,
  ZoomIn,
  Scan,
  Sun,
  ALargeSmall,
  SlidersHorizontal,
  Tablet,
} from "lucide-react";
import "./canvas-tools.css";
type Action = ReactElement<any>;
function labelOf(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(labelOf).join(" ").trim();
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement<any>(node) || node.type === "small") return "";
  return Children.toArray((node.props as any).children)
    .map(labelOf)
    .join(" ")
    .trim();
}
function iconFor(label: string) {
  if (/clear.*background/i.test(label)) return Eraser;
  if (/brush settings/i.test(label)) return SlidersHorizontal;
  if (/stylus mode/i.test(label)) return Tablet;
  if (/zoom/i.test(label)) return ZoomIn;
  if (/switch theme/i.test(label)) return Sun;
  if (/switch font/i.test(label)) return ALargeSmall;
  if (/select entire/i.test(label)) return Scan;
  if (/write cursor/i.test(label)) return Type;
  if (/bring.*(front|forward)/i.test(label)) return BringToFront;
  if (/send.*(back|backward)/i.test(label)) return SendToBack;
  if (/duplicate/i.test(label)) return CopyPlus;
  if (/paste/i.test(label)) return ClipboardPaste;
  if (/cut/i.test(label)) return Scissors;
  if (/hand tool/i.test(label)) return Hand;
  if (/delete|remove/i.test(label)) return Trash2;
  if (/copy|duplicate|paste|cut/i.test(label)) return Copy;
  if (/undo/i.test(label)) return Undo2;
  if (/redo/i.test(label)) return Redo2;
  if (/link/i.test(label)) return Link2;
  if (/page/i.test(label)) return FilePlus2;
  if (/resize/i.test(label)) return Maximize2;
  if (/rotate/i.test(label)) return RotateCw;
  if (/\b(pin|uncertain)\b/i.test(label)) return Pin;
  if (/lens|focus/i.test(label)) return Focus;
  if (/\b(table|row|column)\b/i.test(label)) return Table2;
  if (/image|video|extract/i.test(label)) return Image;
  if (/code/i.test(label)) return Code;
  if (/align/i.test(label)) return AlignLeft;
  if (/todo|to-do/i.test(label)) return CheckSquare;
  if (/diagram|flowchart/i.test(label)) return Workflow;
  if (/arrow/i.test(label)) return ArrowUpRight;
  if (/eraser/i.test(label)) return Eraser;
  if (/fill|bucket/i.test(label)) return PaintBucket;
  if (/highlighter/i.test(label)) return Highlighter;
  if (/rectangle/i.test(label)) return Square;
  if (/ellipse/i.test(label)) return Circle;
  if (/diamond/i.test(label)) return Diamond;
  if (/triangle/i.test(label)) return Triangle;
  if (/^line$/i.test(label)) return Minus;
  if (/pen|draw/i.test(label)) return PenLine;
  if (/select|cursor/i.test(label)) return MousePointer2;
  if (/forward|backward|move|drag/i.test(label)) return Move;
  if (/color|background/i.test(label)) return Palette;
  if (/text|write|bold|italic|underline|heading|quote|list/i.test(label))
    return Type;
  return Plus;
}
const categoryIcons: Record<string, typeof Type> = {
  Settings: Settings2,
  Arrows: ArrowUpRight,
  Select: MousePointer2,
  Edit: Copy,
  Write: Type,
  Draw: PenLine,
  Shapes: Square,
  Insert: Plus,
  Connect: Link2,
  Arrange: Layers,
  Study: Focus,
  Format: Type,
  Colors: Palette,
  Table: Table2,
  Object: Layers,
};
function actionsFrom(
  children: ReactNode,
  parent = "",
): { action: Action; group: string; label: string }[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<any>(child)) return [];
    const props = child.props as any;
    const cls = props.className || parent;
    if (child.type !== "button") return actionsFrom(props.children, cls);
    const label =
      props["aria-label"] || labelOf(props.children) || props.title || "Action";
    let group = props["data-menu-group"];
    if (!group) {
      if (/colors/.test(cls)) group = "Colors";
      else if (/\b(table|row|column)\b/i.test(label)) group = "Table";
      else if (
        /media/.test(cls) ||
        /object|resize|forward|backward/i.test(label)
      )
        group = "Object";
      else if (
        /format/.test(cls) ||
        /align|variant|another explanation|list|numbered|bullet|quote|heading|normal text/i.test(
          label,
        )
      )
        group = "Format";
      else if (
        /clipboard/.test(cls) ||
        /copy|cut|paste|undo|redo|delete|remove/i.test(label)
      )
        group = "Edit";
      else if (/link|page/i.test(label)) group = "Connect";
      else group = "Insert";
    }
    return [{ action: child as Action, group, label }];
  });
}
export function CompactToolMenu({
  x,
  y,
  children,
  onClose,
  keyboard,
}: {
  x: number;
  y: number;
  children: ReactNode;
  onClose: () => void;
  keyboard?: boolean;
  persistent?: boolean;
}) {
  const actions = actionsFrom(children);
  const groups = [...new Set(actions.map((a) => a.group))];
  const [group, setGroup] = useState(groups[0]);
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const down = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) close.current();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close.current();
      }
    };
    if (keyboard)
      root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key, true);
    };
  }, []);
  return createPortal(
    <div
      ref={root}
      className="sheet-context compact-tool-menu"
      role="menu"
      aria-label="All tools"
      style={{
        left: Math.max(8, Math.min(x, innerWidth - 312)),
        top: Math.max(8, Math.min(y, innerHeight - 330)),
      }}
    >
      <div
        className="compact-tool-groups"
        role="group"
        aria-label="Tool categories"
      >
        {groups.map((name) => {
          const Icon = categoryIcons[name] || Plus;
          return (
            <button
              key={name}
              title={name}
              aria-label={name}
              aria-pressed={group === name}
              onClick={() => setGroup(name)}
            >
              <Icon size={17} />
            </button>
          );
        })}
      </div>
      <div className="compact-tool-actions" role="group" aria-label={group}>
        {actions
          .filter((a) => a.group === group)
          .map(({ action, label }, index) => {
            const Icon = iconFor(label);
            return cloneElement(action, {
              key: label + index,
              role: "menuitem",
              title: label,
              children: (
                <>
                  <Icon size={17} />
                  <span>{label}</span>
                </>
              ),
            });
          })}
      </div>
    </div>,
    document.body,
  );
}

export default function RadialMenu({
  x,
  y,
  children,
  onClose,
  keyboard = false,
  label = "Page actions",
  persistent = true,
}: {
  x: number;
  y: number;
  children: ReactNode;
  onClose: () => void;
  keyboard?: boolean;
  label?: string;
  persistent?: boolean;
}) {
  const seen = new Set<string>();
  const actions = actionsFrom(children).filter((a) => {
    if (seen.has(a.label)) return false;
    seen.add(a.label);
    return true;
  });
  const groups = [...new Set(actions.map((a) => a.group))];
  const [active, setActive] = useState<string>();
  const [caption, setCaption] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement;
    if (keyboard)
      root.current
        ?.querySelector<HTMLButtonElement>(".wheel-category")
        ?.focus({ preventScroll: true });
    const down = (event: Event) => {
      if (
        !root.current?.contains(event.target as Node) ||
        event.target === root.current
      )
        closeRef.current();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        if (opener.current?.isConnected)
          opener.current.focus({ preventScroll: true });
      }
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, []);
  const sub = actions.filter((a) => a.group === active);
  const radius = 150;
  const cx = Math.max(radius, Math.min(x, innerWidth - radius)),
    cy = Math.max(radius, Math.min(y, innerHeight - radius));
  return createPortal(
    <div
      ref={root}
      className={`synapse-wheel sheet-context context-menu${persistent ? " is-stylus" : ""}${active ? " is-expanded" : ""}`}
      role="menu"
      aria-label={label}
      style={{ left: cx, top: cy }}
      onKeyDown={(e) => {
        if (
          [
            "ArrowRight",
            "ArrowDown",
            "ArrowLeft",
            "ArrowUp",
            "Home",
            "End",
          ].includes(e.key)
        ) {
          e.preventDefault();
          e.stopPropagation();
          const buttons = [
            ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          ];
          const at = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (at +
                    (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : -1) +
                    buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.preventDefault()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="wheel-core">
        <button aria-label="Close actions" title="Close" onClick={onClose}>
          <X size={17} />
        </button>
        <span>{caption || active || "Actions"}</span>
      </div>
      <div className="wheel-groups">
        {groups.map((group, index) => {
          const Icon = categoryIcons[group] || Circle;
          const angle = (index / groups.length) * Math.PI * 2 - Math.PI / 2;
          const ring = groups.length > 9 ? 76 : 68;
          return (
            <button
              key={group}
              className={`wheel-category${active === group ? " active" : ""}`}
              role="menuitem"
              aria-label={group}
              aria-haspopup="menu"
              aria-expanded={active === group}
              style={
                {
                  "--x": `${Math.cos(angle) * ring}px`,
                  "--y": `${Math.sin(angle) * ring}px`,
                } as CSSProperties
              }
              onPointerEnter={() => {
                if (
                  innerWidth > 600 &&
                  !window.matchMedia?.("(pointer:coarse)").matches
                ) {
                  setActive(group);
                  setCaption("");
                }
              }}
              onFocus={() => {
                setActive(group);
                setCaption("");
              }}
              onClick={() => {
                setActive(group);
                setCaption("");
              }}
            >
              <Icon size={19} />
              <span>{group}</span>
            </button>
          );
        })}
      </div>
      <div
        className="wheel-actions"
        role="group"
        aria-label={active || "Choose a category"}
      >
        {sub.map(({ action, label }, index) => {
          const Icon = iconFor(label);
          const authoredIcon = Children.toArray(action.props.children).find(
            (child) =>
              isValidElement(child) &&
              (child.type === "svg" ||
                typeof child.type === "function" ||
                typeof child.type === "object"),
          );
          const angle = (index / sub.length) * Math.PI * 2 - Math.PI / 2;
          return cloneElement(action, {
            key: action.key || `${label}-${index}`,
            className: `wheel-action ${action.props.className || ""}`,
            title: label,
            "aria-label": label,
            style: {
              ...action.props.style,
              "--x": `${Math.cos(angle) * 124}px`,
              "--y": `${Math.sin(angle) * 124}px`,
            },
            onPointerEnter: () => setCaption(label),
            onFocus: () => setCaption(label),
            onMouseDown: (e: any) => {
              e.preventDefault();
              action.props.onMouseDown?.(e);
            },
            children: (
              <>
                {authoredIcon ||
                  (action.props["data-pastel"] ||
                  action.props["data-background"] ? (
                    <span
                      className="wheel-swatch"
                      data-pastel={action.props["data-pastel"]}
                      data-background={action.props["data-background"]}
                    >
                      Aa
                    </span>
                  ) : (
                    <Icon size={17} />
                  ))}
                <span>{action.props["data-menu-caption"] || label}</span>
              </>
            ),
          });
        })}
      </div>
    </div>,
    document.body,
  );
}
