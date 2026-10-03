import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p',
  'h2',
  'h3',
  'pre',
  'code',
  'ul',
  'ol',
  'li',
  'blockquote',
  'strong',
  'em',
  'br',
  'a',
];

/**
 * Sanitizes user-generated HTML. Whitelist-only: all `on*` attributes and
 * `javascript:` URLs are stripped by sanitize-html's defaults.
 */
export function sanitizeHtmlContent(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow' }),
    },
  });
}
