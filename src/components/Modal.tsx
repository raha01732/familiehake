// src/components/Modal.tsx
"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
export function Modal({
  open,
  onClose,
  children,
  title
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Erst nach dem Mount rendern (document.body existiert serverseitig nicht) -
  // ausserdem: per Portal direkt an document.body haengen, statt an der
  // Aufrufstelle im DOM zu bleiben. Ein Vorfahre mit backdrop-filter/filter/
  // transform (z.B. die .card-Klasse nutzt backdrop-filter) erzeugt sonst
  // einen eigenen Containing Block fuer position:fixed, wodurch das Modal
  // relativ zu dieser Karte statt zum Viewport positioniert wuerde.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative card w-[min(100%-2rem,960px)] max-w-none p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="text-sm font-semibold text-zinc-100">{title ?? "Bearbeiten"}</div>
          <button
            onClick={onClose}
            className="text-xs rounded-lg border border-zinc-700 text-zinc-300 px-2 py-1 hover:bg-zinc-800/60"
          >
            Schließen
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
