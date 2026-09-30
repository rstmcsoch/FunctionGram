import type { ReactNode } from 'react';
import { Fragment } from 'react';

function safeMarkdownLink(raw: string) {
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\')) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch { /* unsafe URL is rendered as text */ }
  return null;
}

function inline(source: string, keyPrefix: string): ReactNode[] {
  const token = /(\*\*[^*\n]+\*\*|~~[^~\n]+~~|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^\s)]+\))/g;
  const nodes: ReactNode[] = [];
  let cursor = 0, match: RegExpExecArray | null, index = 0;
  while ((match = token.exec(source))) {
    if (match.index > cursor) nodes.push(source.slice(cursor, match.index));
    const value = match[0];
    if (value.startsWith('**')) nodes.push(<strong key={`${keyPrefix}-${index++}`}>{value.slice(2, -2)}</strong>);
    else if (value.startsWith('~~')) nodes.push(<del key={`${keyPrefix}-${index++}`}>{value.slice(2, -2)}</del>);
    else if (value.startsWith('*')) nodes.push(<em key={`${keyPrefix}-${index++}`}>{value.slice(1, -1)}</em>);
    else if (value.startsWith('`')) nodes.push(<code key={`${keyPrefix}-${index++}`}>{value.slice(1, -1)}</code>);
    else {
      const parts = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(value)!;
      const href = safeMarkdownLink(parts[2]);
      nodes.push(href ? <a key={`${keyPrefix}-${index++}`} href={href} rel={href.startsWith('https:') ? 'nofollow noreferrer' : undefined}>{parts[1]}</a> : parts[1]);
    }
    cursor = match.index + value.length;
  }
  if (cursor < source.length) nodes.push(source.slice(cursor));
  return nodes.map((node, index) => typeof node === 'string' ? <Fragment key={`${keyPrefix}-text-${index}`}>{node}</Fragment> : node);
}

function blockStart(line: string) {
  return /^\s*(?:#{1,6}\s|```|>|[-*+]\s|\d+\.\s|---+\s*$)/.test(line);
}

/** Render a deliberately small Markdown subset. Raw HTML is never interpreted. */
export function renderCmsMarkdown(markdown: string): ReactNode[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0, block = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^```/.test(line.trim())) {
      const language = line.trim().slice(3).replace(/[^a-z0-9_-]/gi, '').slice(0, 24);
      const content: string[] = []; i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) content.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push(<pre key={`code-${block++}`} data-language={language || undefined}><code>{content.join('\n')}</code></pre>);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = heading[1].length, children = inline(heading[2], `h${block}`), key = `heading-${block++}`;
      if (level === 1) blocks.push(<h2 key={key}>{children}</h2>);
      else if (level === 2) blocks.push(<h2 key={key}>{children}</h2>);
      else if (level === 3) blocks.push(<h3 key={key}>{children}</h3>);
      else if (level === 4) blocks.push(<h4 key={key}>{children}</h4>);
      else blocks.push(<h5 key={key}>{children}</h5>);
      i++; continue;
    }
    if (/^\s*---+\s*$/.test(line)) { blocks.push(<hr key={`hr-${block++}`}/>); i++; continue; }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={`quote-${block++}`}>{inline(quote.join(' '), `q${block}`)}</blockquote>); continue;
    }
    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line), items: string[] = [];
      const pattern = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*+]\s+/;
      while (i < lines.length && pattern.test(lines[i])) items.push(lines[i++].replace(pattern, ''));
      const key = `list-${block++}`;
      blocks.push(ordered ? <ol key={key}>{items.map((item, n) => <li key={n}>{inline(item, `${key}-${n}`)}</li>)}</ol> : <ul key={key}>{items.map((item, n) => <li key={n}>{inline(item, `${key}-${n}`)}</li>)}</ul>);
      continue;
    }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !blockStart(lines[i])) paragraph.push(lines[i++]);
    blocks.push(<p key={`p-${block++}`}>{inline(paragraph.join('\n'), `p${block}`)}</p>);
  }
  return blocks;
}
