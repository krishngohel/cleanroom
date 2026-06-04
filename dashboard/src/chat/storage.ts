import type { Message } from "../types";

export interface Conversation {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  projectId?: string | null;
}

const KEY = "cleanroom_conversations_v1";

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Conversation[];
  } catch {
    return [];
  }
}

export function saveConversations(list: Conversation[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore quota errors */
  }
}

export function summarizeTitle(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= 48) return t || "New chat";
  return t.slice(0, 48) + "…";
}

export function newId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
