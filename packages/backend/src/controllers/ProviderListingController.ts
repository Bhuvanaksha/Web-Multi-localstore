import ExcelJS from 'exceljs';
import type { NextFunction, Request, Response } from 'express';
import { ProviderListingService } from '../services/ProviderListingService.js';
import { ConflictError } from '../utils/errors.js';

function parsePagination(query: Record<string, unknown>) {
  return {
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 20,
  };
}

export const ProviderListingController = {
  /** Public feed of available listings (marketplace browse). */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit } = parsePagination(req.query);
      const result = await ProviderListingService.getFeed({
        page,
        limit,
        category: req.query.category as string | undefined,
        availability: req.query.availability as string | undefined,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /** Listings owned by the authenticated user. */
  async mine(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new ConflictError('Not authenticated');
      const { page, limit } = parsePagination(req.query);
      const result = await ProviderListingService.getMine(req.user.id, { page, limit });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /** Downloads the caller's own listings as an .xlsx workbook. */
  async mineExport(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new ConflictError('Not authenticated');
      const { items } = await ProviderListingService.getMine(req.user.id, {
        page: 1,
        limit: 10000,
      });
      const rows = items.map((l) => ({
        Title: l.title,
        Category: l.category,
        'Price (INR)': `₹ ${l.price}`,
        Unit: l.unit ?? '',
        'Quantity In Stock': l.quantity ?? '',
        Availability: l.availability,
        Description: l.description,
        'Contact Phone': l.contactPhone ?? '',
        'Contact Email': l.contactEmail ?? '',
        'Created At': l.createdAt ? new Date(l.createdAt).toLocaleString() : '',
      }));
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('My Listings');
      const headers = rows.length > 0 ? Object.keys(rows[0]) : ['(empty)'];
      ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(h.length + 2, 14) }));
      ws.addRows(rows);
      const buffer = Buffer.from(await wb.xlsx.writeBuffer());
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="provider-listings-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      );
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new ConflictError('Not authenticated');
      const listing = await ProviderListingService.create(req.body, req.user.id);
      res.status(201).json({ listing });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new ConflictError('Not authenticated');
      const listing = await ProviderListingService.update(req.params.id, req.user.id, req.body);
      res.status(200).json({ listing });
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new ConflictError('Not authenticated');
      const result = await ProviderListingService.remove(req.params.id, req.user.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};
