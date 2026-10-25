import { describe, expect, it } from 'vitest';
import type { PrivacyCategory, PrivacyTypeDefinition } from './contracts';
import { privacyCategories, privacyKnowledgeBase, privacyTypes } from './privacyKnowledgeBase';
import { createTaxonomyRegistry } from './taxonomyRegistry';
import { detectorCapabilities } from './detection/detectUniversalPrivacy';

describe('versioned privacy knowledge base', () => {
  it('covers the starting information families without claiming they are all detectable', () => {
    expect(privacyCategories.length).toBeGreaterThanOrEqual(30);
    expect(privacyTypes.length).toBeGreaterThanOrEqual(30);
    expect(privacyKnowledgeBase.type('face_image')).toMatchObject({
      implementationStatus: 'not_implemented', validationStatus: 'unverified',
    });
    for (const id of ['bank_account_number', 'student_id', 'payment_amount', 'order_number',
      'email', 'home_address', 'phone', 'password', 'api_key'])
      expect(privacyKnowledgeBase.type(id)).toMatchObject({
        implementationStatus: 'implemented', validationStatus: 'verified',
      });
  });

  it('backs every VERIFIED type with a registered verified detector', () => {
    const covered = new Set(detectorCapabilities().filter(capability => capability.verified)
      .flatMap(capability => capability.supportedTypeIds));
    for (const type of privacyTypes.filter(item => item.validationStatus === 'verified'))
      expect(covered.has(type.id), type.id).toBe(true);
  });

  it('supports hierarchy, multiple parents, multiple category membership, and aliases', () => {
    expect(privacyKnowledgeBase.ancestors('internet_identities').map(category => category.id))
      .toEqual(expect.arrayContaining(['digital', 'personal_identity', 'personal']));
    expect(privacyKnowledgeBase.typesIn('personal', true).map(type => type.id))
      .toContain('email');
    expect(privacyKnowledgeBase.typesIn('digital', true).map(type => type.id))
      .toContain('email');
    expect(privacyKnowledgeBase.searchTypes('e-mail').map(type => type.id)).toContain('email');
    expect(privacyKnowledgeBase.searchTypes('')).toEqual([]);
  });

  it('rejects broken hierarchy, duplicates, invalid references, and unearned verification', () => {
    const root: PrivacyCategory = { id: 'root', name: 'Root', description: '', parentIds: [] };
    const child: PrivacyCategory = { id: 'child', name: 'Child', description: '', parentIds: ['root'] };
    expect(() => createTaxonomyRegistry([root, root], [])).toThrow('duplicate');
    expect(() => createTaxonomyRegistry([{ ...child, parentIds: ['missing'] }], [])).toThrow('Missing parent');
    expect(() => createTaxonomyRegistry([{ ...root, parentIds: ['child'] }, child], [])).toThrow('cycle');
    const known = privacyTypes[0]!;
    expect(() => createTaxonomyRegistry([root], [{ ...known, categoryIds: ['missing'] }])).toThrow('Unknown category');
    const unearned: PrivacyTypeDefinition = { ...known, categoryIds: ['root'],
      implementationStatus: 'not_implemented', validationStatus: 'verified' };
    expect(() => createTaxonomyRegistry([root], [unearned])).toThrow('no detector');
  });
});
