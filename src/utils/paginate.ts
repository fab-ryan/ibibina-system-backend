import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import e from 'express';
import express from 'express';
import { Pagination, paginate, PaginationTypeEnum } from 'nestjs-typeorm-paginate';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

@Injectable({ scope: Scope.REQUEST })
export class PaginationHelper<T extends ObjectLiteral> {
  private limit = 10;
  private page = 1;

  constructor(@Inject(REQUEST) private readonly req: express.Request) {
    try {
      const iurl = new URL(url(req.url));
      this.limit = +(iurl.searchParams.get('limit') ?? 10);
      this.page = +(iurl.searchParams.get('page') ?? 1);
    } catch (error) {
      this.limit = 10;
      this.page = 1;
    }
  }

  setLimit(limit: number) {
    this.limit = limit;
  }

  getLimit() {
    return this.limit;
  }

  setPage(page: number) {
    this.page = page;
  }

  getPage() {
    return this.page;
  }

  run(query: SelectQueryBuilder<T>): Promise<Pagination<T>> {
    return paginate<T>(query, {
      limit: this.limit,
      page: this.page,
      paginationType: PaginationTypeEnum.TAKE_AND_SKIP,
      route: this.req.url,
      cacheQueries: true,
    });
  }
  paginate(query: SelectQueryBuilder<T>, page: number, limit: number): Promise<Pagination<T>> {
    return paginate<T>(query, {
      limit,
      page,
      paginationType: PaginationTypeEnum.TAKE_AND_SKIP,
      route: this.req.url,
      cacheQueries: true,
    });
  }
}
export interface PaginateResult<T> extends Pagination<T> {}
export const url = (link: string): string => {
  const base = process.env.BACKEND_DOMAIN + '/' + process.env.PREFIX;
  if (link.charAt(0) == '/') {
    return base + link;
  }
  return base + '/' + link;
};
