import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { isIn } from 'class-validator';
export interface AssociativeArray {
  [key: string]: string | boolean | number;
}

export const filterQueryBuilderFromRequest = <T extends ObjectLiteral>(
  q: SelectQueryBuilder<T>,
  filters?: AssociativeArray,
) => {
  if (filters) {
    const keys = Object.keys(filters);

    const alias = q.alias;

    for (const key of keys) {
      const value = filters[key];

      if (isIn(key, ['limit', 'offset', 'page'])) continue;

      if (key === 'from') {
        q.andWhere(`${alias}.createdAt >= '${value}'`);
        continue;
      }
      if (key === 'to') {
        q.andWhere(`${alias}.createdAt <= '${value}'`);
        continue;
      }
    }
  }
};
