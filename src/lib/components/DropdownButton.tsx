import { useState, useRef, useEffect } from "preact/hooks";
import styles from "./DropdownButton.module.css";

export function DropdownButton({ label, children, flip = false }: { label: string; children: any, flip?: boolean }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(prev => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {flip && (open ? "▾ " : "◂ ")}
        {label}
        {!flip && (open ? " ▾" : " ▸")}
      </button>

      {open && (
        <div
          role="menu"
          class={`${styles.menu} ${flip ? styles.flip : ""}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
