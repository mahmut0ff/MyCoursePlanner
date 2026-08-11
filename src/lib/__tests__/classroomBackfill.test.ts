import { describe, it, expect } from 'vitest';
import { planClassroomBackfill } from '../classroomBackfill';
import type { BackfillEvent, BackfillClassroom } from '../classroomBackfill';

const ev = (p: Partial<BackfillEvent> & { id: string }): BackfillEvent =>
  ({ organizationId: 'org-1', ...p });

const cls = (p: Partial<BackfillClassroom> & { id: string; name: string }): BackfillClassroom =>
  ({ organizationId: 'org-1', ...p });

describe('planClassroomBackfill', () => {
  it('заводит по одному кабинету на все написания одного названия', () => {
    const plan = planClassroomBackfill([
      ev({ id: 'e1', branchId: 'br-1', location: 'Каб. 305' }),
      ev({ id: 'e2', branchId: 'br-1', location: 'каб 305' }),
      ev({ id: 'e3', branchId: 'br-1', location: 'Кабинет №305' }),
    ], []);

    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].nameKey).toBe('305');
    expect(plan.create[0].eventIds).toEqual(['e1', 'e2', 'e3']);
  });

  it('каноничным делает самое частое написание', () => {
    const plan = planClassroomBackfill([
      ev({ id: 'e1', location: 'каб 305' }),
      ev({ id: 'e2', location: 'Каб. 305' }),
      ev({ id: 'e3', location: 'Каб. 305' }),
    ], []);

    expect(plan.create[0].name).toBe('Каб. 305');
  });

  it('при равной частоте написаний выбор не зависит от порядка занятий', () => {
    // Оба написания дают один nameKey «305», частота одинаковая — победитель
    // должен определяться самим текстом, иначе повторный прогон миграции
    // переименовывал бы кабинет туда-сюда.
    const a = planClassroomBackfill([
      ev({ id: 'e1', location: 'каб 305' }), ev({ id: 'e2', location: 'Каб. 305' }),
    ], []);
    const b = planClassroomBackfill([
      ev({ id: 'e2', location: 'Каб. 305' }), ev({ id: 'e1', location: 'каб 305' }),
    ], []);

    expect(a.create).toHaveLength(1);
    expect(b.create).toHaveLength(1);
    expect(a.create[0].name).toBe(b.create[0].name);
  });

  it('одноимённые кабинеты в разных филиалах остаются разными', () => {
    const plan = planClassroomBackfill([
      ev({ id: 'e1', branchId: 'br-1', location: 'Каб. 301' }),
      ev({ id: 'e2', branchId: 'br-2', location: 'Каб. 301' }),
    ], []);

    expect(plan.create).toHaveLength(2);
    expect(plan.create.map(c => c.branchId).sort()).toEqual(['br-1', 'br-2']);
  });

  it('разные организации не смешиваются', () => {
    const plan = planClassroomBackfill([
      ev({ id: 'e1', organizationId: 'org-1', location: 'Каб. 301' }),
      ev({ id: 'e2', organizationId: 'org-2', location: 'Каб. 301' }),
    ], []);

    expect(plan.create).toHaveLength(2);
  });

  it('привязывает к уже существующему кабинету, а не создаёт двойника', () => {
    const plan = planClassroomBackfill(
      [ev({ id: 'e1', branchId: 'br-1', location: 'каб 305' })],
      [cls({ id: 'c1', branchId: 'br-1', name: 'Каб. 305' })],
    );

    expect(plan.create).toEqual([]);
    expect(plan.link).toEqual([{ eventId: 'e1', classroomId: 'c1', classroomName: 'Каб. 305' }]);
  });

  it('архивный кабинет не считается существующим', () => {
    const plan = planClassroomBackfill(
      [ev({ id: 'e1', branchId: 'br-1', location: 'Каб. 305' })],
      [cls({ id: 'c1', branchId: 'br-1', name: 'Каб. 305', isActive: false })],
    );

    expect(plan.link).toEqual([]);
    expect(plan.create).toHaveLength(1);
  });

  it('уже привязанные занятия не трогает', () => {
    const plan = planClassroomBackfill([
      ev({ id: 'e1', classroomId: 'c1', location: 'Каб. 305' }),
    ], []);

    expect(plan.create).toEqual([]);
    expect(plan.link).toEqual([]);
    expect(plan.skippedAlreadyLinked).toBe(1);
  });

  it('занятия без кабинета пропускает', () => {
    const plan = planClassroomBackfill([
      ev({ id: 'e1' }), ev({ id: 'e2', location: '' }), ev({ id: 'e3', location: '   ' }),
    ], []);

    expect(plan.create).toEqual([]);
    expect(plan.skippedNoRoom).toBe(3);
  });

  it('занятия без филиала собираются в отдельный кабинет, а не в чужой', () => {
    const plan = planClassroomBackfill([
      ev({ id: 'e1', branchId: null, location: 'Каб. 305' }),
      ev({ id: 'e2', branchId: 'br-1', location: 'Каб. 305' }),
    ], []);

    expect(plan.create).toHaveLength(2);
    expect(plan.create.find(c => c.branchId === null)?.eventIds).toEqual(['e1']);
  });

  it('повторный прогон уже мигрированных данных ничего не меняет', () => {
    const events = [ev({ id: 'e1', branchId: 'br-1', location: 'Каб. 305' })];
    const first = planClassroomBackfill(events, []);
    expect(first.create).toHaveLength(1);

    // После применения плана кабинет существует, а событие привязано.
    const migrated = [ev({ id: 'e1', branchId: 'br-1', location: 'Каб. 305', classroomId: 'c1' })];
    const second = planClassroomBackfill(migrated, [cls({ id: 'c1', branchId: 'br-1', name: 'Каб. 305' })]);

    expect(second.create).toEqual([]);
    expect(second.link).toEqual([]);
  });
});
