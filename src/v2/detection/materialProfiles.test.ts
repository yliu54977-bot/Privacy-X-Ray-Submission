import { expect, it } from 'vitest';
import { identifyMaterials } from './materialProfiles';
it.each([
  ['Passport number: P1234567', 'identity'], ['Student ID: S12345', 'education'],
  ['Bank statement', 'finance'], ['Invoice and tracking', 'purchases'], ['Boarding pass PNR', 'travel'],
  ['Medical diagnosis', 'medical'], ['Employee payroll', 'work'], ['Contract policy number', 'legal'],
  ['WhatsApp username', 'communication'], ['API Key and password', 'technical'], ['Confidential budget', 'business'],
])('offers a limited material guide for %s', (text, id) => expect(identifyMaterials(text).map(p => p.id)).toContain(id));
it('does not assert an arbitrary photo or prose document type', () => expect(identifyMaterials('A sunny day at the park')).toEqual([]));
