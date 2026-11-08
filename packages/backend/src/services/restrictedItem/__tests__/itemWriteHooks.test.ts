/**
 * Item / Organizer write hooks (2026-11-06): protected columns can never be mass-assigned through Prisma, every create
 * is classified in the same insert, and updates that touch a classifier input are flagged for reclassification.
 */
import { prepareItemWrite, prepareOrganizerWrite, ITEM_PROTECTED_FIELDS, ORGANIZER_PROTECTED_FIELDS } from '../itemWriteHooks';

describe('prepareItemWrite', () => {
  it('create: classifies from the incoming data and ignores any client-supplied class', () => {
    const { args } = prepareItemWrite('create', {
      data: { title: 'Bowie Knife', restrictedClass: 'NONE', restrictedClassOverride: 'NONE', price: 20 },
    });
    expect(args.data.restrictedClass).toBe('KNIFE');
    expect(args.data.restrictedClassAuto).toBe('KNIFE');
    expect(args.data.restrictedClassSource).toBe('CREATE');
    expect(args.data.restrictedClassifiedAt).toBeInstanceOf(Date);
    expect(args.data).not.toHaveProperty('restrictedClassOverride');
    expect(args.data.price).toBe(20);
  });

  it('createMany: classifies every row', () => {
    const { args } = prepareItemWrite('createMany', { data: [{ title: 'Lamp' }, { title: 'Pearl Necklace' }] });
    expect(args.data.map((d: any) => d.restrictedClass)).toEqual(['NONE', 'JEWELRY']);
  });

  it('create reads tags and brand, including Prisma { set } shapes', () => {
    const { args } = prepareItemWrite('create', { data: { title: 'Folding Tool', tags: { set: ['switchblade'] } } });
    expect(args.data.restrictedClass).toBe('KNIFE');
    const b = prepareItemWrite('create', { data: { title: 'Folding Tool', brand: 'Benchmade' } });
    expect(b.args.data.restrictedClass).toBe('KNIFE');
  });

  it('update / updateMany: strips every protected column (NO-MASS-ASSIGNMENT)', () => {
    const data: Record<string, unknown> = { price: 5 };
    for (const f of ITEM_PROTECTED_FIELDS) data[f] = 'NONE';
    for (const op of ['update', 'updateMany']) {
      const { args, reclassifyAfter } = prepareItemWrite(op, { where: { id: 'x' }, data });
      for (const f of ITEM_PROTECTED_FIELDS) expect(args.data).not.toHaveProperty(f);
      expect(args.data.price).toBe(5);
      expect(reclassifyAfter).toBe(false);
    }
  });

  it('update touching a classifier input is flagged for reclassification', () => {
    for (const field of ['title', 'description', 'category', 'ebayCategoryName', 'tags', 'brand']) {
      expect(prepareItemWrite('update', { where: { id: 'x' }, data: { [field]: 'x' } }).reclassifyAfter).toBe(true);
    }
    expect(prepareItemWrite('updateMany', { where: {}, data: { status: 'SOLD' } }).reclassifyAfter).toBe(false);
  });

  it('upsert: classifies the create branch, strips the update branch', () => {
    const { args, reclassifyAfter } = prepareItemWrite('upsert', {
      where: { id: 'x' },
      create: { title: 'Rifle Scope' },
      update: { title: 'Rifle Scope', restrictedClass: 'NONE' },
    });
    expect(args.create.restrictedClass).toBe('FIREARM_RELATED');
    expect(args.update).not.toHaveProperty('restrictedClass');
    expect(reclassifyAfter).toBe(true);
  });

  it('reads pass through untouched', () => {
    const a = { where: { id: 'x' } };
    expect(prepareItemWrite('findMany', a).args).toBe(a);
  });

  it('does not mutate the caller\'s object', () => {
    const data = { title: 'Lamp', restrictedClass: 'KNIFE' };
    prepareItemWrite('update', { where: { id: 'x' }, data });
    expect(data.restrictedClass).toBe('KNIFE');
  });
});

describe('prepareOrganizerWrite', () => {
  it('strips the card suspension columns from every write shape', () => {
    const data: Record<string, unknown> = { businessName: 'X' };
    for (const f of ORGANIZER_PROTECTED_FIELDS) data[f] = null;
    for (const op of ['create', 'update', 'updateMany']) {
      const out = prepareOrganizerWrite(op, { where: { id: 'o' }, data });
      for (const f of ORGANIZER_PROTECTED_FIELDS) expect(out.data).not.toHaveProperty(f);
      expect(out.data.businessName).toBe('X');
    }
    const up = prepareOrganizerWrite('upsert', { where: { id: 'o' }, create: { ...data }, update: { ...data } });
    for (const f of ORGANIZER_PROTECTED_FIELDS) {
      expect(up.create).not.toHaveProperty(f);
      expect(up.update).not.toHaveProperty(f);
    }
  });
});
