import type { PipelineStage } from 'mongoose';
import { ResourceModel } from '../models/ResourceModel.js';
import { logger } from '../utils/logger.js';

export interface SearchFilters {
  category?: string;
  tags?: string[];
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  engine: 'atlas' | 'regex';
}

const SEARCH_PATHS = ['title', 'content', 'excerpt', 'tags', 'category'];

function buildRegexStage(
  query: string,
  filters: SearchFilters,
  page: number,
  limit: number,
): PipelineStage[] {
  const match: Record<string, unknown> = {
    status: 'published',
    deletedAt: null,
  };
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const or: Record<string, unknown>[] = SEARCH_PATHS.map((path) => ({
    [path]: { $regex: escaped, $options: 'i' },
  }));
  match.$or = or;
  if (filters.category) match.category = filters.category;
  if (filters.tags?.length) match.tags = { $in: filters.tags };

  return [
    { $match: match } as PipelineStage,
    { $sort: { publishedAt: -1, _id: -1 } } as PipelineStage,
    { $skip: (page - 1) * limit } as PipelineStage,
    { $limit: limit } as PipelineStage,
  ];
}

export const SearchService = {
  /**
   * Full-text search. Attempts a MongoDB Atlas `$search` aggregation first;
   * if the deployment has no Atlas Search index/plan, transparently falls
   * back to a $regex search so the API keeps working.
   */
  async search(
    query: string,
    filters: SearchFilters = {},
    page = 1,
    limit = 10,
  ): Promise<SearchResult<unknown>> {
    const q = query.trim();
    if (!q) {
      return { items: [], total: 0, page, limit, totalPages: 0, engine: 'regex' };
    }

    try {
      return await this.searchWithAtlas(q, filters, page, limit);
    } catch (err) {
      logger.warn('Atlas Search unavailable, falling back to $regex', {
        error: (err as Error).message,
      });
      return this.searchWithRegex(q, filters, page, limit);
    }
  },

  async searchWithAtlas(
    query: string,
    filters: SearchFilters,
    page: number,
    limit: number,
  ): Promise<SearchResult<unknown>> {
    const compound: Record<string, unknown> = {
      must: [
        {
          text: {
            query,
            path: SEARCH_PATHS,
            fuzzy: { maxEdits: 1 },
          },
        },
      ],
    };
    const filter: Record<string, unknown> = { status: 'published' };
    if (filters.category) filter.category = filters.category;
    if (filters.tags?.length) filter.tags = filters.tags;
    if (Object.keys(filter).length > 0) compound.filter = [filter];

    const [result] = await ResourceModel.aggregate<{
      metadata: { total: number }[];
      data: unknown[];
    }>([
      { $search: { index: 'default', compound } },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [{ $sort: { publishedAt: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }],
        },
      },
    ]);

    const total = result?.metadata[0]?.total ?? 0;
    return {
      items: result?.data ?? [],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      engine: 'atlas',
    };
  },

  async searchWithRegex(
    query: string,
    filters: SearchFilters,
    page: number,
    limit: number,
  ): Promise<SearchResult<unknown>> {
    const pipeline = buildRegexStage(query, filters, page, limit);

    const [items, total] = await Promise.all([
      ResourceModel.aggregate(pipeline),
      ResourceModel.countDocuments({
        $or: SEARCH_PATHS.map((path) => ({ [path]: { $regex: query, $options: 'i' } })),
        status: 'published',
        deletedAt: null,
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.tags?.length ? { tags: { $in: filters.tags } } : {}),
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      engine: 'regex',
    };
  },
};
