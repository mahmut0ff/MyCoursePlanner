/**
 * Быстрые наборы и сериализация прав.
 *
 * Наборы живут теперь на двух экранах: в тонкой настройке сотрудника они правят
 * плоское множество `resource:action`, а в редакторе роли — массив прав, который
 * уходит на сервер. Оба пути обязаны давать один результат, иначе один и тот же
 * набор соберёт разные роли — а заметить это можно только сравнив экраны.
 */
import { describe, it, expect } from 'vitest';
import {
  ACCESS_PRESETS, presetActive, togglePreset,
  expandPermissions, permissionsFromSet,
  RESOURCE_ACTIONS, ALL_RESOURCES,
  TEACHER_DEFAULT, MANAGER_DEFAULT,
} from '../rbac';

describe('permissionsFromSet', () => {
  it('обратна expandPermissions', () => {
    const set = expandPermissions(TEACHER_DEFAULT);
    expect(expandPermissions(permissionsFromSet(set))).toEqual(set);
  });

  it('не выдумывает действий сверх каталога', () => {
    const set = new Set(['results:write', 'results:read', 'нет-такого:read']);
    expect(permissionsFromSet(set)).toEqual([{ resource: 'results', actions: ['read'] }]);
  });
});

describe('быстрые наборы', () => {
  it('ссылаются только на существующие права', () => {
    for (const preset of ACCESS_PRESETS) {
      for (const key of preset.keys) {
        const [resource, action] = key.split(':');
        expect(ALL_RESOURCES, `набор «${preset.label}» → ресурс «${resource}»`).toContain(resource);
        expect(RESOURCE_ACTIONS[resource], `набор «${preset.label}» → «${key}»`).toContain(action as any);
      }
    }
  });

  it('включаются и выключаются одинаково через множество и через массив прав', () => {
    for (const preset of ACCESS_PRESETS) {
      const base = expandPermissions(MANAGER_DEFAULT.filter(p => p.resource !== 'roster_management'));

      const on = togglePreset(base, preset);
      expect(presetActive(on, preset)).toBe(true);
      // Путь редактора роли: множество → массив → множество.
      expect(expandPermissions(permissionsFromSet(on))).toEqual(on);

      const off = togglePreset(on, preset);
      expect(presetActive(off, preset)).toBe(false);
    }
  });
});

describe('рейтинг студентов — отдельное право', () => {
  it('read-only и входит в наборы преподавателя и менеджера', () => {
    expect(RESOURCE_ACTIONS.student_rating).toEqual(['read']);
    for (const [name, preset] of [['преподаватель', TEACHER_DEFAULT], ['менеджер', MANAGER_DEFAULT]] as const) {
      const perm = preset.find(p => p.resource === 'student_rating');
      expect(perm?.actions, `${name} не видит рейтинг`).toEqual(['read']);
    }
  });

  it('не подменяется «Аналитикой»', () => {
    expect(RESOURCE_ACTIONS.analytics).toBeDefined();
    expect(ALL_RESOURCES).toContain('student_rating');
  });
});
