/**
 * Каталоги прав клиента и сервера обязаны совпадать.
 *
 * Рассинхрон ломается молча и несимметрично: ресурс только на клиенте — галочка
 * рисуется, но sanitizePermissions вырезает грант при сохранении, и он исчезает
 * после перезагрузки; ресурс только на сервере — выдать его через /team нельзя
 * вообще. Ролевые пресеты продублированы в обоих файлах, и если они разъедутся,
 * UI покажет страницу, на которую API ответит 403.
 *
 * Админов расхождение не задевает (can() пропускает их до проверки грантов),
 * поэтому вручную оно и не замечается — только этим тестом.
 */
import { describe, it, expect } from 'vitest';
import {
  ALL_RESOURCES as CLIENT_RESOURCES,
  RESOURCE_ACTIONS as CLIENT_ACTIONS,
  TEACHER_DEFAULT as CLIENT_TEACHER,
  MANAGER_DEFAULT as CLIENT_MANAGER,
  STUDENT_DEFAULT as CLIENT_STUDENT,
} from '../rbac';
import {
  RESOURCE_ACTIONS as SERVER_ACTIONS,
  TEACHER_DEFAULT as SERVER_TEACHER,
  MANAGER_DEFAULT as SERVER_MANAGER,
  STUDENT_DEFAULT as SERVER_STUDENT,
} from '../../../netlify/functions/utils/rbac';

const keyOf = (perms: Array<{ resource: string; actions: string[] }>) =>
  perms
    .map(p => `${p.resource}:${[...p.actions].sort().join(',')}`)
    .sort();

describe('каталог ресурсов', () => {
  it('набор ресурсов одинаков', () => {
    expect(Object.keys(CLIENT_ACTIONS).sort()).toEqual(Object.keys(SERVER_ACTIONS).sort());
  });

  it('у каждого ресурса одинаковый набор действий', () => {
    for (const id of Object.keys(SERVER_ACTIONS).sort()) {
      expect([...(CLIENT_ACTIONS as any)[id]].sort(), `действия ресурса «${id}»`)
        .toEqual([...SERVER_ACTIONS[id]].sort());
    }
  });

  it('ALL_RESOURCES выведен из того же каталога', () => {
    expect([...CLIENT_RESOURCES].sort()).toEqual(Object.keys(SERVER_ACTIONS).sort());
  });
});

describe('ролевые пресеты', () => {
  it('преподаватель совпадает', () => {
    expect(keyOf(CLIENT_TEACHER as any)).toEqual(keyOf(SERVER_TEACHER as any));
  });

  it('менеджер совпадает', () => {
    expect(keyOf(CLIENT_MANAGER as any)).toEqual(keyOf(SERVER_MANAGER as any));
  });

  it('студент совпадает', () => {
    expect(keyOf(CLIENT_STUDENT as any)).toEqual(keyOf(SERVER_STUDENT as any));
  });

  it('пресеты не выдают прав на ресурсы, которых нет в каталоге', () => {
    for (const [name, preset] of [
      ['преподаватель', SERVER_TEACHER], ['менеджер', SERVER_MANAGER], ['студент', SERVER_STUDENT],
    ] as const) {
      for (const p of preset as any[]) {
        expect(SERVER_ACTIONS[p.resource], `${name} → неизвестный ресурс «${p.resource}»`).toBeDefined();
      }
    }
  });
});

describe('кабинеты и экзаменационные комнаты — разные ресурсы', () => {
  it('оба ресурса существуют и не подменяют друг друга', () => {
    expect(SERVER_ACTIONS.classrooms).toBeDefined();
    expect(SERVER_ACTIONS.rooms).toBeDefined();
    expect(SERVER_ACTIONS.classrooms).not.toBe(SERVER_ACTIONS.rooms);
  });

  it('преподаватель НЕ получает право править справочник кабинетов', () => {
    // rooms (экзаменационные) у него rwd — если бы модуль переиспользовал этот id,
    // каждый преподаватель молча получил бы удаление аудиторий.
    const classrooms = (SERVER_TEACHER as any[]).find(p => p.resource === 'classrooms');
    expect(classrooms?.actions).toEqual(['read']);
  });

  it('менеджер распоряжается кабинетами полностью', () => {
    const classrooms = (SERVER_MANAGER as any[]).find(p => p.resource === 'classrooms');
    expect([...(classrooms?.actions || [])].sort()).toEqual(['delete', 'read', 'write']);
  });
});
