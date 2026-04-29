'use client';

import * as React from 'react';
import { Upload, Trash2, Building2 } from 'lucide-react';
import { Button } from '@buranchi/ui';
import { createClient } from '@/lib/supabase/browser';
import { updateOrgLogoAction } from '@/app/(app)/settings/organization/actions';

const ACCEPTED = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 3600;

export function OrgLogoUpload({
  organizationId,
  initialPath,
  initialSignedUrl,
}: {
  organizationId: string;
  initialPath: string | null;
  initialSignedUrl: string | null;
}) {
  const [path, setPath] = React.useState<string | null>(initialPath);
  const [signedUrl, setSignedUrl] = React.useState<string | null>(initialSignedUrl);
  const [pending, setPending] = React.useState<'upload' | 'remove' | null>(null);
  const [error, setError] = React.useState<string | undefined>();
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(undefined);

    if (file.size > MAX_SIZE_BYTES) {
      setError('Logo must be 2MB or smaller.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Only PNG, JPEG, GIF, WebP, or SVG allowed.');
      return;
    }

    setPending('upload');
    try {
      const supabase = createClient();
      const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'png';
      const newPath = `${organizationId}/logo-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('org-logos')
        .upload(newPath, file, { upsert: true, cacheControl: '3600' });
      if (uploadErr) throw uploadErr;

      const { data: signed, error: signedErr } = await supabase.storage
        .from('org-logos')
        .createSignedUrl(newPath, SIGNED_URL_TTL_SECONDS);
      if (signedErr) throw signedErr;

      await updateOrgLogoAction(newPath);
      setPath(newPath);
      setSignedUrl(signed?.signedUrl ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setPending(null);
    }
  }

  async function onRemove() {
    setError(undefined);
    setPending('remove');
    try {
      await updateOrgLogoAction(null);
      setPath(null);
      setSignedUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed.');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-5">
      <div className="h-16 w-16 rounded-tile border border-border bg-canvas overflow-hidden flex items-center justify-center text-muted">
        {signedUrl ? (
          <img src={signedUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <Building2 className="h-7 w-7" />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            disabled={pending !== null}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            <span>{pending === 'upload' ? 'Uploading…' : 'Upload logo'}</span>
          </Button>
          {path ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending !== null}
              onClick={onRemove}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{pending === 'remove' ? 'Removing…' : 'Remove'}</span>
            </Button>
          ) : null}
        </div>
        <p className="text-[11px] text-muted">PNG, JPEG, GIF, WebP, or SVG — up to 2MB</p>
        {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}
