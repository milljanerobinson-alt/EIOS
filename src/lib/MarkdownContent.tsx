import React from 'react';

/**
 * Shared markdown renderer — hand-rolled, no external dependencies.
 *
 * Supports:
 *   Headings (# ## ###)
 *   Bullet lists (- *)
 *   Numbered lists (1.)
 *   Checklists (- [ ] / - [x])
 *   Tables (GFM pipe syntax)
 *   Code blocks (``` fenced)
 *   Horizontal rules (---)
 *   Callout panels (> text)
 *   Inline: **bold** *italic* `code` [link](url)
 *   Empty lines as spacers
 */

function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-slate-100 text-slate-800 text-xs px-1 py-0.5 rounded font-mono">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 underline" target="_blank" rel="noreferrer">$1</a>');
}

export function MarkdownContent({ content, className }: { content: string; className?: string }) {
  if (!content?.trim()) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <div key={i} className="relative my-3">
          {lang && (
            <div className="text-[10px] font-mono text-slate-400 bg-slate-100 px-3 py-1 rounded-t-lg border border-b-0 border-slate-200">
              {lang}
            </div>
          )}
          <pre className={`bg-slate-900 text-emerald-300 text-xs font-mono p-4 rounded-lg ${lang ? 'rounded-t-none' : ''} border border-slate-200 overflow-x-auto`}>
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>
      );
      i++;
      continue;
    }

    // Headings
    if (line.startsWith('# '))  { elements.push(<h1 key={i} className="text-lg font-bold text-slate-900 mt-5 mb-2">{line.slice(2)}</h1>); i++; continue; }
    if (line.startsWith('## ')) { elements.push(<h2 key={i} className="text-base font-bold text-slate-800 mt-4 mb-1.5 border-b border-slate-100 pb-1">{line.slice(3)}</h2>); i++; continue; }
    if (line.startsWith('### ')){ elements.push(<h3 key={i} className="text-sm font-bold text-slate-700 mt-3 mb-1">{line.slice(4)}</h3>); i++; continue; }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) { elements.push(<hr key={i} className="border-slate-200 my-4" />); i++; continue; }

    // Blockquote / callout
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <div key={i} className="my-3 border-l-4 border-blue-300 bg-blue-50 px-4 py-3 rounded-r-xl">
          {quoteLines.map((ql, j) => (
            <p key={j} className="text-sm text-blue-800 leading-relaxed" dangerouslySetInnerHTML={{ __html: inlineMarkdown(ql) }} />
          ))}
        </div>
      );
      continue;
    }

    // Checklist (- [ ] or - [x])
    if (line.startsWith('- [ ] ') || line.startsWith('- [x] ') || line.startsWith('- [X] ')) {
      const items: { checked: boolean; text: string }[] = [];
      while (
        i < lines.length &&
        (lines[i].startsWith('- [ ] ') || lines[i].startsWith('- [x] ') || lines[i].startsWith('- [X] '))
      ) {
        const checked = lines[i][3] !== ' ';
        items.push({ checked, text: lines[i].slice(6) });
        i++;
      }
      elements.push(
        <ul key={i} className="my-2 space-y-1.5">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-sm">
              <span className={`w-4 h-4 mt-0.5 flex-shrink-0 rounded border flex items-center justify-center ${item.checked ? 'bg-emerald-500 border-emerald-600' : 'bg-white border-slate-300'}`}>
                {item.checked && (
                  <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="currentColor">
                    <path d="M10.28 1.28L3.989 7.575 1.695 5.28A1 1 0 00.28 6.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 1.28z"/>
                  </svg>
                )}
              </span>
              <span className={item.checked ? 'line-through text-slate-400' : 'text-slate-700'}
                dangerouslySetInnerHTML={{ __html: inlineMarkdown(item.text) }}
              />
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Bullet list
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={i} className="my-2 space-y-1 pl-4">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-1.5 text-sm text-slate-700">
              <span className="w-1 h-1 rounded-full bg-slate-400 mt-2 flex-shrink-0" />
              <span dangerouslySetInnerHTML={{ __html: inlineMarkdown(item) }} />
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      elements.push(
        <ol key={i} className="my-2 space-y-1 pl-4">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-sm text-slate-700">
              <span className="text-[10px] font-bold text-slate-400 mt-0.5 w-4 flex-shrink-0">{j + 1}.</span>
              <span dangerouslySetInnerHTML={{ __html: inlineMarkdown(item) }} />
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Table (GFM: first row pipe, second row |--|)
    if (line.startsWith('|') && lines[i + 1]?.match(/^\|[\s\-:|]+\|/)) {
      const headers = line.split('|').filter(Boolean).map(h => h.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(lines[i].split('|').filter(Boolean).map(c => c.trim()));
        i++;
      }
      elements.push(
        <div key={i} className="my-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                {headers.map((h, j) => (
                  <th key={j} className="px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-200">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 ? 'bg-slate-50/50' : ''}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-slate-700" dangerouslySetInnerHTML={{ __html: inlineMarkdown(cell) }} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Empty line spacer
    if (!line.trim()) {
      elements.push(<div key={i} className="h-2" />);
      i++;
      continue;
    }

    // Paragraph
    elements.push(
      <p key={i} className="text-sm text-slate-700 leading-relaxed my-1"
        dangerouslySetInnerHTML={{ __html: inlineMarkdown(line) }}
      />
    );
    i++;
  }

  return <div className={`prose-sm ${className ?? ''}`}>{elements}</div>;
}
