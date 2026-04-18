import { useEffect } from 'react';

const SUFFIX = 'Printing Comics';

export function useDocumentTitle(title: string | undefined | null) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} — ${SUFFIX}` : SUFFIX;
    return () => { document.title = prev; };
  }, [title]);
}

export function useMetaDescription(description: string | undefined | null) {
  useEffect(() => {
    let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', 'description');
      document.head.appendChild(tag);
    }
    const prev = tag.content;
    if (description) tag.content = description;
    return () => { tag!.content = prev; };
  }, [description]);
}
