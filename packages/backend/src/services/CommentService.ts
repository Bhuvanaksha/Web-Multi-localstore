import { type CommentDocument, CommentModel } from '../models/CommentModel.js';
import { ResourceModel } from '../models/ResourceModel.js';
import { emitToRoom } from '../socket/index.js';
import { NotFoundError } from '../utils/errors.js';
import { sanitizeHtmlContent } from '../utils/sanitize.js';

export interface CommentNode {
  id: string;
  resourceId: string;
  parentId: string | null;
  authorId: string;
  content: string;
  path: string;
  depth: number;
  upvoteCount: number;
  status: 'active' | 'hidden' | 'deleted';
  createdAt?: Date;
  children: CommentNode[];
}

export function toNode(doc: CommentDocument): Omit<CommentNode, 'children'> {
  return {
    id: doc._id.toString(),
    resourceId: doc.resourceId.toString(),
    parentId: doc.parentId ? doc.parentId.toString() : null,
    authorId: doc.authorId.toString(),
    content: doc.status === 'deleted' ? '' : doc.content,
    path: doc.path,
    depth: doc.depth,
    upvoteCount: doc.upvoteCount,
    status: doc.status,
    createdAt: doc.createdAt,
  };
}

export const CommentService = {
  async create(
    data: { resourceId: string; parentId: string | null; content: string },
    authorId: string,
  ) {
    const resource = await ResourceModel.findOne({ _id: data.resourceId, deletedAt: null });
    if (!resource) throw new NotFoundError('Resource not found');

    if (data.parentId) {
      const parent = await CommentModel.findById(data.parentId);
      if (!parent || parent.resourceId.toString() !== data.resourceId) {
        throw new NotFoundError('Parent comment not found in this resource');
      }
    }

    const doc = await CommentModel.create({
      resourceId: data.resourceId,
      parentId: data.parentId,
      authorId,
      content: sanitizeHtmlContent(data.content),
    });

    const node = toNode(doc);
    emitToRoom(`resource:${data.resourceId}`, 'comment:new', node);
    return node;
  },

  /**
   * Fetches all comments for a resource ordered by materialized path and
   * builds a nested tree using a recursive assembly step.
   */
  async getTree(resourceId: string): Promise<CommentNode[]> {
    const docs = await CommentModel.find({ resourceId }).sort({ path: 1 }).lean();

    const byId = new Map<string, CommentNode>();
    for (const doc of docs) {
      byId.set(doc._id.toString(), {
        ...toNode(doc as unknown as CommentDocument),
        children: [],
      });
    }

    const roots: CommentNode[] = [];
    for (const node of byId.values()) {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  },
};
