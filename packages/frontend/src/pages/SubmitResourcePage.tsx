import DOMPurify from 'dompurify';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { TiptapEditor } from '../features/TiptapEditor';
import { useSubmitResource } from '../hooks/useSubmitResource';
import { api, getErrorMessage } from '../lib/api';
import { canPublish } from '../lib/roles';
import { AccessDenied } from '../shared/ui/AccessDenied';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';
import { Input } from '../shared/ui/Input';
import { toastError, toastSuccess } from '../shared/ui/Toast';
import { useAuthStore } from '../stores/useAuthStore';
import { useComposerStore } from '../stores/useComposerStore';

const STEPS = ['Metadata', 'Content', 'Preview'];

export function SubmitResourcePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [uploading, setUploading] = useState(false);

  const { title, content, category, tags, featuredImage, setField, reset } = useComposerStore();
  const submit = useSubmitResource();

  if (!user) return <Navigate to="/login" replace />;
  if (!canPublish(user.role)) {
    return (
      <AccessDenied
        title="Not available for your account"
        message="Community posts are for member accounts. Customer accounts shop the marketplace and provider accounts sell through Provider Studio."
        to="/marketplace"
        action="Browse the marketplace"
      />
    );
  }

  const metadataValid = title.trim().length >= 5 && category.trim().length > 0;

  const handleImageUpload = async (file: File) => {
    try {
      setUploading(true);
      const res = await api.get('/uploads/presign', {
        params: { filename: file.name, contentType: file.type },
      });
      const { url, key } = res.data;
      await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      // Store a reference; the actual public URL depends on S3 bucket policy.
      setField('featuredImage', `s3://${key}`);
      toastSuccess('Image uploaded');
    } catch (err) {
      toastError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const resource = await submit.mutateAsync({
        title: title.trim(),
        content,
        excerpt: content.replace(/<[^>]*>/g, '').slice(0, 300),
        category: category.trim(),
        tags: tags.map((t) => t.trim()).filter(Boolean),
        metadata: featuredImage ? { featuredImage } : undefined,
      });
      toastSuccess('Draft created');
      reset();
      navigate(`/resources/${resource.slug ?? resource.id}`);
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  };

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <h1 className="mt-0">Submit a resource</h1>

      <div className="flex mb-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`btn btn-sm ${i === step ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => i < step && setStep(i)}
            disabled={i > step}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {step === 0 && (
        <Card padded>
          <Input
            label="Title"
            value={title}
            onChange={(e) => setField('title', e.target.value)}
            placeholder="A clear, descriptive title (min 5 chars)"
          />
          <div className="field">
            <label htmlFor="category">Category</label>
            <div className="input-wrap">
              <input
                id="category"
                value={category}
                onChange={(e) => setField('category', e.target.value)}
                placeholder="e.g. Engineering"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="tags">Tags (comma separated)</label>
            <div className="input-wrap">
              <input
                id="tags"
                value={tags.join(', ')}
                onChange={(e) =>
                  setField(
                    'tags',
                    e.target.value.split(',').map((t) => t.trim()),
                  )
                }
                placeholder="mern, architecture, mongodb"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="image">Featured image</label>
            <input
              id="image"
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
            />
            {uploading && <span className="muted">Uploading…</span>}
            {featuredImage && <span className="chip">{featuredImage}</span>}
          </div>
          <Button onClick={() => setStep(1)} disabled={!metadataValid}>
            Continue to content
          </Button>
        </Card>
      )}

      {step === 1 && (
        <Card padded>
          <label
            htmlFor="tiptap-content"
            className="mb-1"
            style={{ fontWeight: 600, display: 'block' }}
          >
            Content
          </label>
          <TiptapEditor
            id="tiptap-content"
            value={content}
            onChange={(html) => setField('content', html)}
          />
          <div className="flex" style={{ marginTop: '1rem' }}>
            <Button variant="ghost" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button
              onClick={() => setStep(2)}
              disabled={content.replace(/<[^>]*>/g, '').trim().length < 10}
            >
              Preview
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card padded>
          <h2 className="mt-0">{title}</h2>
          <div
            className="article-body"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: editor content is sanitized here by DOMPurify and again server-side on save
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
          />
          <div className="flex" style={{ marginTop: '1rem' }}>
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={handleSubmit} loading={submit.isPending}>
              Save draft
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
