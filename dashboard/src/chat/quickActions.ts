/** Common corporate Quick Actions — one-tap prompt rewrites. */

export interface QuickAction {
  key: string;
  label: string;
  icon: string;
  group: "summarize" | "extract" | "rewrite" | "translate" | "draft";
  /**
   * If `wrap` is true, the action wraps the existing user input. Otherwise
   * the action replaces the input (or appends if the input is empty).
   */
  apply: (existing: string) => string;
}

const wrap = (label: string, instructions: string): QuickAction["apply"] =>
  (existing) =>
    existing.trim()
      ? `${instructions}\n\n---\n${existing.trim()}`
      : `${instructions}\n\n[paste the text here, or attach a file]`;

export const QUICK_ACTIONS: QuickAction[] = [
  {
    key: "summarize",
    label: "Summarize",
    icon: "📝",
    group: "summarize",
    apply: wrap("Summarize", "Summarize this in 3–5 bullet points. Keep it concise and concrete."),
  },
  {
    key: "action_items",
    label: "Action items",
    icon: "✅",
    group: "extract",
    apply: wrap(
      "Action items",
      "Extract a clear list of action items from the text below. For each, include: who is responsible, what to do, and the deadline if mentioned. Use the format `- [ ] OWNER: action (due DATE)`.",
    ),
  },
  {
    key: "key_decisions",
    label: "Key decisions",
    icon: "⚖️",
    group: "extract",
    apply: wrap(
      "Key decisions",
      "List the key decisions made in the text below. Format as `- Decision: …\\n  Rationale: …`.",
    ),
  },
  {
    key: "translate_es",
    label: "Translate to Spanish",
    icon: "🇪🇸",
    group: "translate",
    apply: wrap("Translate to Spanish", "Translate the text below into natural, professional Spanish."),
  },
  {
    key: "translate_fr",
    label: "Translate to French",
    icon: "🇫🇷",
    group: "translate",
    apply: wrap("Translate to French", "Translate the text below into natural, professional French."),
  },
  {
    key: "make_formal",
    label: "Make formal",
    icon: "🎩",
    group: "rewrite",
    apply: wrap(
      "Make formal",
      "Rewrite the text below in a polished, professional, business-formal tone. Keep the meaning identical.",
    ),
  },
  {
    key: "make_casual",
    label: "Make friendly",
    icon: "🙂",
    group: "rewrite",
    apply: wrap(
      "Make friendly",
      "Rewrite the text below in a warm, friendly, conversational tone, while staying professional.",
    ),
  },
  {
    key: "shorten",
    label: "Make shorter",
    icon: "✂️",
    group: "rewrite",
    apply: wrap(
      "Make shorter",
      "Rewrite the text below to be roughly half the length. Preserve all key facts.",
    ),
  },
  {
    key: "explain",
    label: "Explain simply",
    icon: "💡",
    group: "rewrite",
    apply: wrap(
      "Explain simply",
      "Explain the text below in plain English a non-expert can understand. Define any jargon.",
    ),
  },
  {
    key: "draft_reply",
    label: "Draft a reply",
    icon: "✉️",
    group: "draft",
    apply: wrap(
      "Draft a reply",
      "Draft a professional reply to the message below. Keep it polite, concise, and ready to send.",
    ),
  },
  {
    key: "draft_followup",
    label: "Follow-up email",
    icon: "📨",
    group: "draft",
    apply: wrap(
      "Follow-up email",
      "Draft a follow-up email referencing the conversation below. Polite, professional, ends with a clear next step.",
    ),
  },
];

export const QUICK_GROUPS: { key: QuickAction["group"]; label: string }[] = [
  { key: "summarize", label: "Summarize" },
  { key: "extract", label: "Extract" },
  { key: "rewrite", label: "Rewrite" },
  { key: "translate", label: "Translate" },
  { key: "draft", label: "Draft" },
];
