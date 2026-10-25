import type { PrivacyCategory, PrivacyTypeDefinition } from './contracts';

export interface PrivacyTaxonomyRegistry {
  readonly categories: readonly PrivacyCategory[];
  readonly types: readonly PrivacyTypeDefinition[];
  category(id: string): PrivacyCategory | undefined;
  type(id: string): PrivacyTypeDefinition | undefined;
  ancestors(categoryId: string): readonly PrivacyCategory[];
  typesIn(categoryId: string, includeChildren?: boolean): readonly PrivacyTypeDefinition[];
  searchTypes(query: string): readonly PrivacyTypeDefinition[];
}

/** Reject invalid knowledge-base data at startup instead of giving misleading coverage claims. */
export function createTaxonomyRegistry(
  categories: readonly PrivacyCategory[],
  types: readonly PrivacyTypeDefinition[],
): PrivacyTaxonomyRegistry {
  const categoryMap = new Map<string, PrivacyCategory>();
  const typeMap = new Map<string, PrivacyTypeDefinition>();
  const validId = /^[a-z][a-z0-9_]*$/;
  for (const category of categories) {
    if (!validId.test(category.id) || categoryMap.has(category.id))
      throw new Error(`Invalid or duplicate category ID: ${category.id}`);
    categoryMap.set(category.id, category);
  }
  for (const category of categories)
    for (const parentId of category.parentIds)
      if (!categoryMap.has(parentId))
        throw new Error(`Missing parent category: ${parentId}`);

  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id: string): void {
    if (visiting.has(id)) throw new Error(`Category cycle at: ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const parentId of categoryMap.get(id)!.parentIds) visit(parentId);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of categoryMap.keys()) visit(id);

  for (const type of types) {
    if (!validId.test(type.id) || typeMap.has(type.id))
      throw new Error(`Invalid or duplicate type ID: ${type.id}`);
    if (!type.categoryIds.length || type.categoryIds.some(id => !categoryMap.has(id)))
      throw new Error(`Unknown category for type: ${type.id}`);
    if (type.validationStatus === 'verified' && type.implementationStatus !== 'implemented')
      throw new Error(`Verified type has no detector: ${type.id}`);
    typeMap.set(type.id, type);
  }
  for (const type of types)
    for (const relatedId of type.relatedTypeIds)
      if (!typeMap.has(relatedId))
        throw new Error(`Unknown related type: ${relatedId}`);

  function ancestorIds(id: string): Set<string> {
    const result = new Set<string>();
    function collect(current: string): void {
      for (const parent of categoryMap.get(current)?.parentIds ?? []) {
        if (result.has(parent)) continue;
        result.add(parent);
        collect(parent);
      }
    }
    collect(id);
    return result;
  }

  return {
    categories: [...categories],
    types: [...types],
    category: id => categoryMap.get(id),
    type: id => typeMap.get(id),
    ancestors: id => categoryMap.has(id) ? [...ancestorIds(id)].map(parent => categoryMap.get(parent)!) : [],
    typesIn: (id, includeChildren = false) => categoryMap.has(id)
      ? types.filter(type => type.categoryIds.some(categoryId => categoryId === id ||
          (includeChildren && ancestorIds(categoryId).has(id))))
      : [],
    searchTypes: query => {
      const needle = query.trim().toLocaleLowerCase();
      if (!needle) return [];
      return types.filter(type => [type.id, type.name, ...type.aliases,
        ...Object.values(type.localizedNames ?? {})].some(value => value.toLocaleLowerCase().includes(needle)));
    },
  };
}
