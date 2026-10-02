/**
 * The customer-facing wording for print files — mirrors
 * server/src/lib/print-files.ts (keep the two in step).
 */
export type PrintFileKind = 'cover' | 'interior' | 'artwork';

export const PRINT_FILE_LABELS: Record<PrintFileKind, string> = {
  cover: 'Cover PDF',
  interior: 'Interior PDF',
  artwork: 'Print-ready PDF',
};

/** Configurator option keys that are one of the print-file slots. */
export const PRINT_FILE_KIND_BY_OPTION_KEY: Record<string, PrintFileKind> = {
  cover_pdf: 'cover',
  interior_pdf: 'interior',
  upload: 'artwork',
};

export function printFileInstructions(kind: PrintFileKind, expectedPages: number | null): string[] {
  switch (kind) {
    case 'cover':
      return [
        'One PDF with exactly 4 pages, in this order: 1 front cover · 2 inside front cover · 3 inside back cover · 4 back cover.',
        'No interior pages in this file. If nothing prints on a page (an inside cover, say), leave it blank — it still counts as a page.',
        'Trim size of the book plus 0.125″ bleed on every side, CMYK, fonts embedded or outlined.',
      ];
    case 'interior':
      return [
        `One PDF with ${expectedPages ? `all ${expectedPages}` : 'every'} interior page${expectedPages === 1 ? '' : 's'} in reading order — every page between the inside front cover and the inside back cover.`,
        'Do not include the front cover, inside covers or back cover. They go in the Cover PDF.',
        'Single pages, not spreads. Trim size plus 0.125″ bleed, CMYK, fonts embedded or outlined.',
      ];
    case 'artwork':
      return [
        'One print-ready PDF at the ordered size, with 0.125″ bleed on every side.',
        'CMYK, 300 DPI, flattened, fonts embedded or outlined.',
      ];
  }
}

/** A one-line summary of what the slot must hold, for the label row. */
export function printFileSummary(kind: PrintFileKind, expectedPages: number | null): string {
  if (kind === 'cover') return '4 pages: front cover, inside front, inside back, back cover';
  if (kind === 'interior') return expectedPages ? `${expectedPages} pages, interior only` : 'all interior pages, no covers';
  return 'one PDF, print-ready';
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Upload one file with progress; resolves with the parsed JSON body or rejects with the server's message. */
export function uploadWithProgress<T>(url: string, form: FormData, onProgress: (pct: number) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let body: any = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new Error(body?.error ?? body?.message ?? (xhr.status === 413 ? 'That file is too large to upload.' : xhr.statusText || 'Upload failed')));
    };
    xhr.onerror = () => reject(new Error('Network error — check your connection and try again.'));
    xhr.send(form);
  });
}
