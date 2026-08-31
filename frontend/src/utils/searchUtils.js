/**
 * Strips raw Markdown formatting, LaTeX, zero-width spaces, and extra whitespace.
 */
export function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^\)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^\)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/^[\s*+-]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/\$\$[\s\S]*?\$\$/g, '')
    .replace(/\$([^\$]+)\$/g, '$1')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Injects <mark class="highlight"> tags around matched query phrases in Markdown text
 * while bypassing existing HTML tags and Markdown structure.
 */
export function highlightMarkdownKeywords(markdownText, query) {
  if (!markdownText || !query) return markdownText;
  const cleanQuery = stripMarkdown(query).trim();
  if (!cleanQuery) return markdownText;

  const escapedQuery = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');

  // Split text into lines so we can skip code block fences safely
  const lines = markdownText.split('\n');
  let inCodeBlock = false;

  const highlightedLines = lines.map(line => {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      return line;
    }
    if (inCodeBlock) return line;

    // Apply highlight tag directly (rehypeRaw renders this as actual HTML DOM)
    return line.replace(regex, '<mark class="highlight">$1</mark>');
  });

  return highlightedLines.join('\n');
}