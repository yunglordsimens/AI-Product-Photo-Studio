/** «до / после» thumbnails for master prompts: small enough to keep dozens in the browser */
import { MasterPrompt, PromptExample } from '../types';
import { compressDataUrl } from './imageUtils';

const SIDE = 520;

export async function makeExample(before: string | undefined, after: string, source: PromptExample['source']): Promise<PromptExample> {
  const [b, a] = await Promise.all([before ? compressDataUrl(before, SIDE, SIDE, 0.8) : Promise.resolve(undefined), compressDataUrl(after, SIDE, SIDE, 0.8)]);
  return { before: b, after: a, source, updatedAt: Date.now() };
}

/** The prompt a generation used, by its exact name (an edited prompt is «… (изменён)» and gets no example) */
export function promptByName(prompts: MasterPrompt[], name?: string): MasterPrompt | undefined {
  if (!name) return undefined;
  return prompts.find((p) => p.name === name);
}

export function withExample(prompts: MasterPrompt[], id: string, example: PromptExample | undefined): MasterPrompt[] {
  return prompts.map((p) => (p.id === id ? { ...p, example } : p));
}
