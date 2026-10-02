"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const EMOJI_CATEGORIES = {
  "Smileys": "😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🫣🤭🫢🤫🤥😶🫠😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👹👺🤡💩👻💀☠️👽👾🤖🎃😺😸😹😻😼😽🙀😿😾",
  "People": "👋🤚🖐️✋🖖👌🤏✌️🤞🤟🤘🤙👈👉👆👇☝️✍️👏🙌👐🤲🙏💪🦾🦿🫶👐🤝💅👂👃🧠🫀🫁🦷🦴👀👁️👅👄💋👶🧒👦👧🧑👱👨🧔👨‍🦰👨‍🦱👨‍🦳👨‍🦲👩👩‍🦰👩‍🦱👩‍🦳👩‍🦲🧓👴👵🙍🙎🙅🙆💁🙋🧏🙇🤦🤷🧘🚶🏃💃🕺🧍👫👬👭💏💑👪",
  "Animals": "🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐽🐸🐵🙈🙉🙊🐒🐔🐧🐦🐤🐣🐥🦆🦅🦉🦇🐺🐗🐴🦄🐝🪲🐛🦋🐌🐞🐜🪰🪳🕷️🦂🐢🐍🦎🦖🦕🐙🦑🦀🦞🦐🦪🐠🐟🐡🦈🐬🐳🐋🐊🦓🦒🦘🦬🐘🦏🦛🐪🐫🦙🦥🦦🦨🦡🐿️🦔🐾🌵🎄🌲🌳🌴🌱🌿☘️🍀🍁🍂🍃🌷🌹🌺🌸🌼🌻🌞🌝🌚⭐🌟✨⚡🔥🌈☀️☁️❄️☃️",
  "Food": "🍏🍎🍐🍊🍋🍌🍉🍇🍓🫐🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶️🫑🌽🥕🧄🧅🥔🍠🥐🥯🍞🥖🥨🧀🥚🍳🧈🥞🧇🥓🥩🍗🍖🌭🍔🍟🍕🫓🥪🥙🧆🌮🌯🫔🥗🥘🫕🍝🍜🍲🍛🍣🍱🥟🦪🍤🍙🍚🍘🍥🥮🍡🍧🍨🍦🥧🧁🍰🎂🍮🍭🍬🍫🍿🍩🍪🌰🥜🍯🥛🍼☕🍵🧃🥤🧋🍺🍻🍷🥂🍸🍹🍾",
  "Travel": "🚗🚕🚙🚌🚎🏎️🚓🚑🚒🚐🛻🚚🚛🚜🛵🏍️🚲🛴🚨🚔🚍🚘🚖🚡🚠🚟🚃🚋🚞🚝🚄🚅🚈🚂✈️🛫🛬🛩️🚁🚀🛸🚢⛵🚤🛥️🛳️⚓⛽🚧🚦🚥🏁🗺️🧭🏔️⛰️🌋🗻🏕️⛺🏠🏡🏢🏥🏦🏨🏫🏬🏭🏰🗼🗽⛪🕌🛕⛩️🕋⛲🌅🌄🌇🌆🏙️🌃🌌🌉",
  "Activities": "⚽🏀🏈⚾🥎🎾🏐🏉🥏🎱🪀🏓🏸🏒🏑🥍🏏⛳🪁🏹🎣🤿🥊🥋🎽🛹🛷⛸️🥌🎿⛷️🏂🪂🏋️🤼🤸⛹️🤾🚴🚵🏇🧗🧘🧖🏊🤽🚣🧜🧚🧞🧝🦸🦹🧙👸🤴👼🎩🎓🎭🎨🎬🎤🎧🎼🎹🥁🎷🎺🎸🎻🎮🕹️🎲♟️🎯🎳🎪🎫🎟️🏆🥇🥈🥉🏅",
  "Objects": "⌚📱💻⌨️🖥️🖨️🖱️💽💾💿📷📸📹📞☎️📺📻🎙️🧭⏰⏳⌛🔋🔌💡🔦🕯️🧯🛒💰💳💎⚖️🧰🔧🔨⚒️🪛🔩⚙️🧲🔗🪝🧪🧫🧬🔬🔭📚📖📕📗📘📙📓📔📒📃📜📄📰🗞️📑🔖🏷️💼📁📂✉️📧📨📩📤📥📦📫📪📬📭🗳️✏️✒️🖊️🖋️📝📌📍📎🖇️📏📐✂️🗑️🔒🔓🔑🗝️🔨",
  "Symbols": "❤️🩷🧡💛💚🩵💙💜🖤🩶🤍🤎💔❣️💕💞💓💗💖💘💝💟☮️✝️☪️🕉️☸️✡️🔯🕎☯️☢️☣️⚠️🚸⛔🚫💯💢💥💫💦💨🕳️💬💭💤✅❌❗❕❓❔‼️⁉️🔴🟠🟡🟢🔵🟣⚫⚪🟤◼️◻️◾◽▪️▫️🔶🔷🔸🔹🔺🔻🔲🔳♾️➕➖✖️➗✔️☑️➡️⬅️⬆️⬇️↩️↪️🔀🔁🔂▶️⏸️⏯️⏹️⏺️⏭️⏮️🔇🔈🔉🔊🔔🔕♻️⚜️🔱🎵🎶©️®️™️",
} as const;

const CATEGORY_NAMES = Object.keys(EMOJI_CATEGORIES) as Array<keyof typeof EMOJI_CATEGORIES>;

function splitEmojiString(value: string) {
  return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value), item => item.segment);
}

export function EmojiPicker({ open, onSelect, onClose }: {
  open: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState<keyof typeof EMOJI_CATEGORIES>("Smileys");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const onPointer = (event: PointerEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCategory("Smileys");
    }
  }, [open]);

  const visible = useMemo(() => {
    const source = query.trim()
      ? CATEGORY_NAMES.flatMap(name => splitEmojiString(EMOJI_CATEGORIES[name]))
      : splitEmojiString(EMOJI_CATEGORIES[category]);
    return Array.from(new Set(source));
  }, [category, query]);

  if (!open) return null;

  return (
    <div ref={panel} className="emoji-picker-popover" id="functiongram-emoji-picker" role="dialog" aria-label="Emoji picker">
      <div className="emoji-picker-top">
        <input
          className="emoji-picker-search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search emoji"
          aria-label="Search emoji"
        />
      </div>
      <div className="emoji-picker-tabs" role="tablist" aria-label="Emoji categories">
        {CATEGORY_NAMES.map(name => (
          <button
            key={name}
            type="button"
            className={"emoji-picker-tab " + (!query && category === name ? "active" : "")}
            onClick={() => { setQuery(""); setCategory(name); }}
            role="tab"
            aria-selected={!query && category === name}
            title={name}
          >
            {splitEmojiString(EMOJI_CATEGORIES[name])[0]}
          </button>
        ))}
      </div>
      <div className="emoji-picker-grid" role="grid" aria-label={query ? "Emoji search results" : category}>
        {visible.map((emoji, index) => (
          <button
            key={emoji + index}
            type="button"
            className="emoji-picker-item"
            onClick={() => onSelect(emoji)}
            aria-label={"Insert " + emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
      {!visible.length && <p className="emoji-picker-empty">No matching emoji.</p>}
    </div>
  );
}
