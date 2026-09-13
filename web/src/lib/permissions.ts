import { moduleLabels } from '../routes';
import type { Definition, User } from './types';

/** Yetkiler 'task.create' gibi anahtarlardan modül modül gruplanır. */
export const byModule = (definitions: Definition[]) =>
  definitions.reduce<Record<string, Definition[]>>((groups, definition) => {
    const module = definition.key.split('.')[0];
    (groups[module] ||= []).push(definition);
    return groups;
  }, {});

/** Rozette kısa ad durur ('Task'), tam ad ipucuna kalır ('Task modülü'). */
export const moduleName = (module: string) => (moduleLabels[module] ?? module).replace(' modülü', '');

export type ModuleSummary = {module: string; granted: number; total: number; labels: string[]};

/**
 * Yetki tablosundaki modül özeti. Anahtar sayısı her yeni modülle büyüdüğü için
 * satırda anahtar başına etiket basılmaz; hiç yetki verilmemiş modül de gösterilmez.
 */
export function moduleSummary(person: User, definitions: Definition[]): ModuleSummary[] {
  return Object.entries(byModule(definitions))
    .map(([module, items]) => {
      const granted = items.filter(definition => person.permissions?.[definition.key]);
      return {module, granted: granted.length, total: items.length, labels: granted.map(definition => definition.label)};
    })
    .filter(entry => entry.granted > 0);
}
