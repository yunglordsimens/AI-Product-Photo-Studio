/** What a reference photo is good for. Marked on the board, sent to the model with the photo. */
export const REFERENCE_ROLES: { id: string; label: string; prompt: string }[] = [
  { id: 'bg', label: 'фон', prompt: 'фон и поверхность' },
  { id: 'bgcolor', label: 'цвет фона', prompt: 'цвет фона' },
  { id: 'light', label: 'свет', prompt: 'схему света и тени' },
  { id: 'lightcolor', label: 'цвет света', prompt: 'цвет и температуру света' },
  { id: 'angle', label: 'ракурс', prompt: 'ракурс и высоту камеры' },
  { id: 'composition', label: 'композиция', prompt: 'композицию и кадрирование' },
  { id: 'material', label: 'материал', prompt: 'материалы и фактуры окружения' },
  { id: 'mood', label: 'настроение', prompt: 'общее настроение и цветокоррекцию' },
];

export function rolesPrompt(ids: string[] | undefined): string {
  return (ids || [])
    .map((id) => REFERENCE_ROLES.find((r) => r.id === id)?.prompt)
    .filter(Boolean)
    .join(', ');
}
