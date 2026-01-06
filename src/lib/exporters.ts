import type { ExtractedContent } from './store';

export function toPlainText(content: ExtractedContent): string {
  return content.blocks.map(b => b.text).join('\n\n');
}

export function toMarkdown(content: ExtractedContent): string {
  return content.blocks.map(b => {
    if (b.kind === 'h') {
      const level = Math.min(6, Math.max(1, b.level ?? 2));
      return `${'#'.repeat(level)} ${b.text}`;
    }
    return b.text;
  }).join('\n\n');
}

export function download(filename: string, data: string, type = 'text/plain') {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

