"use client";

import clsx from "clsx";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";

import { AppIcon } from "@/components/dock-icons";
import { useI18n } from "@/lib/i18n/provider";

export type DockSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type DockSelectProps = {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  menuClassName?: string;
  optionClassName?: string;
  placeholder?: string;
  placement?: "top" | "bottom";
  prefix?: ReactNode;
  triggerClassName?: string;
  value: string;
  options: DockSelectOption[];
  onChange: (value: string) => void;
};

export function DockSelect({
  ariaLabel,
  className,
  disabled,
  menuClassName,
  optionClassName,
  placeholder,
  placement = "bottom",
  prefix,
  triggerClassName,
  value,
  options,
  onChange
}: DockSelectProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function updateMenuPosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      setMenuStyle({
        left: rect.left,
        minWidth: rect.width,
        ...(placement === "top"
          ? { bottom: window.innerHeight - rect.top + 8 }
          : { top: rect.bottom + 8 })
      });
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (
        target &&
        (rootRef.current?.contains(target) || menuRef.current?.contains(target))
      ) {
        return;
      }

      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    updateMenuPosition();

    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, placement]);

  return (
    <div
      className={clsx("dock-select", open && "is-open", className)}
      ref={rootRef}
    >
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={clsx("dock-select-trigger", triggerClassName)}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        {prefix ? <span className="dock-select-prefix">{prefix}</span> : null}
        <span
          className={clsx(
            "dock-select-value",
            !selected && "is-placeholder"
          )}
        >
          {selected?.label || placeholder || t("request.select")}
        </span>
        <AppIcon className="dock-select-caret" name="chevron" />
      </button>

      {mounted && open && menuStyle
        ? createPortal(
            <div
              className={clsx("dock-select-menu", menuClassName)}
              ref={menuRef}
              role="listbox"
              style={menuStyle}
            >
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    aria-selected={isSelected}
                    className={clsx(
                      "dock-select-option",
                      isSelected && "is-selected",
                      option.disabled && "is-disabled",
                      optionClassName
                    )}
                    disabled={option.disabled}
                    key={option.value}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="dock-select-option-copy">
                      <span className="dock-select-option-label">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="dock-select-option-description">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    {isSelected ? (
                      <span aria-hidden="true" className="dock-select-option-check">
                        <svg fill="none" viewBox="0 0 16 16">
                          <path
                            d="m3.5 8.2 2.5 2.5 6-6"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.7"
                          />
                        </svg>
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
