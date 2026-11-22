import { Fragment, type ReactNode } from "react";

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const TRAIL = /[.,;:!?)\]}]+$/;

/**
 * Plain-text rendering with safe auto-linking. Text is only ever emitted as React text
 * nodes (escaped by React); only absolute http(s) URLs become anchors.
 */
export function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    let url = m[0];
    const trail = TRAIL.exec(url)?.[0] ?? "";
    url = url.slice(0, url.length - trail.length);
    if (start > last) out.push(<Fragment key={key++}>{text.slice(last, start)}</Fragment>);
    let safe = false;
    try {
      const u = new URL(url);
      safe = u.protocol === "http:" || u.protocol === "https:";
    } catch {
      safe = false;
    }
    out.push(
      safe ? (
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="break-all text-accent-text underline underline-offset-2 hover:opacity-80"
        >
          {url}
        </a>
      ) : (
        <Fragment key={key++}>{url}</Fragment>
      ),
    );
    if (trail) out.push(<Fragment key={key++}>{trail}</Fragment>);
    last = start + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return out;
}

export function RichText({ text, className }: { text: string; className?: string }) {
  return <p className={`whitespace-pre-wrap break-words ${className ?? ""}`}>{linkify(text)}</p>;
}
