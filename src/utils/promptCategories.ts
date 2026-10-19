import { MasterPrompt } from '../types';

/** Shelves for master prompts, in display order. */
export const PROMPT_CATEGORIES = ['Исходник', 'Каталог', 'Сцена', 'Кампейн', 'Oryza', 'Мои'] as const;

/** Old prompts have no category yet: derive it from their tags. */
const TAG_TO_CATEGORY: Record<string, string> = {
  исходник: 'Исходник',
  каталог: 'Каталог',
  маркетплейс: 'Каталог',
  сцена: 'Сцена',
  лайфстайл: 'Сцена',
  косметика: 'Сцена',
  эко: 'Сцена',
  кампейн: 'Кампейн',
  oryza: 'Oryza',
};

export function promptCategory(mp: MasterPrompt): string {
  if (mp.category) return mp.category;
  for (const tag of mp.tags || []) {
    const hit = TAG_TO_CATEGORY[tag.toLowerCase()];
    if (hit) return hit;
  }
  return 'Мои';
}

/** A prompt saved "only for this project" is hidden in other projects. */
export function isPromptVisible(mp: MasterPrompt, projectId?: string): boolean {
  return !mp.projectId || mp.projectId === projectId;
}

/** Visible prompts grouped by shelf, in shelf order; this project's own prompts come first as their own shelf. */
export function groupPrompts(prompts: MasterPrompt[], projectId?: string): { title: string; items: MasterPrompt[] }[] {
  const visible = prompts.filter((p) => isPromptVisible(p, projectId));
  const own = visible.filter((p) => p.projectId && p.projectId === projectId);
  const shared = visible.filter((p) => !p.projectId);
  const known = new Set<string>(PROMPT_CATEGORIES);
  const extra = [...new Set(shared.map(promptCategory).filter((c) => !known.has(c)))];
  const groups = [...PROMPT_CATEGORIES, ...extra].map((title) => ({
    title,
    items: shared.filter((p) => promptCategory(p) === title),
  }));
  return [{ title: 'Этот проект', items: own }, ...groups].filter((g) => g.items.length > 0);
}
