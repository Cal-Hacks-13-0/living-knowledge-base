"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null);

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div ref={ref} className="relative inline-block">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

function useDropdownMenu() {
  const ctx = React.useContext(DropdownMenuContext);
  if (!ctx) throw new Error("DropdownMenu.* must be used inside <DropdownMenu>");
  return ctx;
}

type ClickableElement = React.ReactElement<{
  onClick?: (e: React.MouseEvent) => void;
  "aria-expanded"?: boolean;
}>;

export function DropdownMenuTrigger({ children }: { children: ClickableElement }) {
  const { open, setOpen } = useDropdownMenu();
  return React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      children.props.onClick?.(e);
      setOpen(!open);
    },
    "aria-expanded": open,
  });
}

export function DropdownMenuContent({
  children,
  align = "end",
  className,
}: {
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const { open } = useDropdownMenu();
  if (!open) return null;
  return (
    <div
      className={cn(
        "absolute top-full z-20 mt-1 min-w-36 rounded-lg border border-border bg-white py-1 shadow-md",
        align === "end" ? "right-0" : "left-0",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({
  className,
  destructive,
  onSelect,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { destructive?: boolean; onSelect?: () => void }) {
  const { setOpen } = useDropdownMenu();
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface",
        destructive ? "text-red-600" : "text-foreground",
        className
      )}
      onClick={(e) => {
        props.onClick?.(e);
        onSelect?.();
        setOpen(false);
      }}
      {...props}
    />
  );
}
