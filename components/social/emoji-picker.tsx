"use client";
import { useLabels } from "./labels";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Smile, X } from "lucide-react";
import { EMOJI_CATEGORIES, insertEmoji, searchEmoji, type EmojiCategory } from "@/lib/emoji";
import type { LabelKey } from "@/lib/admin/labels";

const CATEGORY_LABEL: Record<EmojiCategory["id"], LabelKey> = {
  smileys: "emoji.category.smileys",
  people: "emoji.category.people",
  animals: "emoji.category.animals_nature",
  food: "emoji.category.food",
  travel: "emoji.category.travel_places",
  activities: "emoji.category.activities",
  objects: "emoji.category.objects",
  symbols: "emoji.category.symbols",
};

/**
 * Lightweight, fully local emoji picker for the Messages composer.
 *
 * Every emoji is bundled Unicode data (see lib/emoji.ts): opening the picker,
 * switching category and inserting an emoji cost no network request and no
 * backend work, which keeps the interaction instant on mobile. The picker is
 * a labelled dialog that closes on Escape or an outside click, and it floats
 * above the composer so it is never clipped by it or by the viewport.
 */
export function EmojiPicker({ value, cursor, onInsert, onClose }: {
  value: string;
  cursor: number;
  onInsert: (next: { value: string; cursor: number }) => void;
  onClose: () => void;
}) {
  const t = useLabels();
  const [category, setCategory] = useState<EmojiCategory["id"]>(EMOJI_CATEGORIES[0].id);
  const [term, setTerm] = useState("");
  const panel = useRef<HTMLDivElement>(null);

  const emoji = useMemo(() => searchEmoji(term), [term]);
  const activeCategory = useMemo(
    () => EMOJI_CATEGORIES.find(item => item.id === category) || EMOJI_CATEGORIES[0],
    [category],
  );
  const searching = term.trim().length > 0;

  // Escape closes the picker from anywhere inside it, and an outside pointer
  // press closes it too. Focus returns to the message field, which the caller
  // restores when it unmounts the picker.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (target && !panel.current?.contains(target)) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [onClose]);

  const choose = (picked: string) => onInsert(insertEmoji(value, picked, cursor));

  return (
    <div className="emoji-picker" ref={panel} role="dialog" aria-label={t("emoji.picker")}>
      <header>
        <strong>{t("emoji.title")}</strong>
        <button type="button" className="emoji-close" aria-label={t("emoji.close")} title={t("emoji.close")} onClick={onClose}><X size={16} aria-hidden="true" /></button>
      </header>
      <label className="emoji-search">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          value={term}
          aria-label={t("emoji.search")}
          placeholder={t("emoji.search")}
          onChange={event => setTerm(event.target.value)}
        />
      </label>
      {!searching && (
        <div className="emoji-categories" role="tablist" aria-label={t("emoji.categories")}>
          {EMOJI_CATEGORIES.map(item => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={category === item.id}
              className={"emoji-category " + (category === item.id ? "is-active " : "")}
              onClick={() => { setCategory(item.id); setTerm(""); }}
            >
              {t(CATEGORY_LABEL[item.id])}
            </button>
          ))}
        </div>
      )}
      <div className="emoji-scroll">
        {emoji.length ? (
          searching ? (
            <div className="emoji-grid" role="list" aria-label={t("emoji.results")}>
              {emoji.map(item => <EmojiOption key={item} emoji={item} onPick={choose} />)}
            </div>
          ) : (
            <section key={activeCategory.id} data-emoji-category={activeCategory.id} aria-label={t(CATEGORY_LABEL[activeCategory.id])}>
              <h3>{t(CATEGORY_LABEL[activeCategory.id])}</h3>
              <div className="emoji-grid">
                {activeCategory.emoji.map(item => <EmojiOption key={item} emoji={item} onPick={choose} />)}
              </div>
            </section>
          )
        ) : (
          <p className="emoji-empty">{t("emoji.no_results")}</p>
        )}
      </div>
    </div>
  );
}

function EmojiOption({ emoji, onPick }: { emoji: string; onPick: (emoji: string) => void }) {
  const t = useLabels();
  return (
    <button type="button" className="emoji-option" aria-label={t("emoji.insert") + " " + emoji} title={emoji} onClick={() => onPick(emoji)}>{emoji}</button>
  );
}

/**
 * The composer's emoji trigger. It lives inside the message form, so it must
 * be `type="button"`: it only ever opens or closes the picker and can never
 * submit the message.
 */
export function EmojiTrigger({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      className={"icon-button emoji-trigger " + (open ? "is-active " : "")}
      aria-label={label}
      aria-expanded={open}
      aria-haspopup="dialog"
      title={label}
      onClick={onToggle}
    >
      <Smile size={22} aria-hidden="true" />
    </button>
  );
}
