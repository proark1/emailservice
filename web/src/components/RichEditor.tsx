import { useRef, useCallback, useEffect } from "react";
import DOMPurify from "dompurify";

/**
 * Strip anything that could execute JavaScript before we drop HTML into
 * contentEditable. This guards both live paste and loaded drafts from XSS —
 * if a compromised API key plants a malicious draft, viewing it in the
 * dashboard will not fire its scripts.
 */
function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "formaction"],
  });
}

/**
 * Simple rich text editor using contentEditable.
 * Produces clean HTML output suitable for emails.
 */
export function RichEditor({
  value,
  onChange,
  placeholder = "Write your email...",
  minHeight = "200px",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  // Set initial content once on mount — don't use dangerouslySetInnerHTML
  // which would overwrite user edits on every parent re-render
  useEffect(() => {
    if (editorRef.current && !initializedRef.current) {
      editorRef.current.innerHTML = sanitize(value);
      initializedRef.current = true;
    }
  }, []);

  // Reset content when value is cleared (e.g., form reset)
  useEffect(() => {
    if (editorRef.current && value === "" && initializedRef.current) {
      editorRef.current.innerHTML = "";
    }
  }, [value]);

  const exec = useCallback((cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  const insertLink = () => {
    const url = prompt("Enter URL:");
    if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
      exec("createLink", url);
    }
  };

  const ToolBtn = ({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${active ? "bg-violet-100 text-violet-700" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"}`}
    >
      {children}
    </button>
  );

  return (
    <div className="border border-gray-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-violet-500/30 focus-within:border-violet-500 transition-all">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50/50 flex-wrap">
        <ToolBtn onClick={() => exec("bold")} title="Bold">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>
        </ToolBtn>
        <ToolBtn onClick={() => exec("italic")} title="Italic">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg>
        </ToolBtn>
        <ToolBtn onClick={() => exec("underline")} title="Underline">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>
        </ToolBtn>
        <ToolBtn onClick={() => exec("strikeThrough")} title="Strikethrough">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z"/></svg>
        </ToolBtn>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <ToolBtn onClick={() => exec("formatBlock", "h1")} title="Heading 1">
          <span className="text-[12px] font-bold">H1</span>
        </ToolBtn>
        <ToolBtn onClick={() => exec("formatBlock", "h2")} title="Heading 2">
          <span className="text-[12px] font-bold">H2</span>
        </ToolBtn>
        <ToolBtn onClick={() => exec("formatBlock", "p")} title="Paragraph">
          <span className="text-[12px] font-medium">P</span>
        </ToolBtn>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <ToolBtn onClick={() => exec("insertUnorderedList")} title="Bullet list">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>
        </ToolBtn>
        <ToolBtn onClick={() => exec("insertOrderedList")} title="Numbered list">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/></svg>
        </ToolBtn>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <ToolBtn onClick={insertLink} title="Insert link">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
        </ToolBtn>
        <ToolBtn onClick={() => exec("removeFormat")} title="Clear formatting">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.211-.211.498-.33.796-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.796-.33z" /></svg>
        </ToolBtn>
      </div>

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        data-placeholder={placeholder}
        className="px-3.5 py-3 text-sm text-gray-900 outline-none overflow-y-auto prose prose-sm max-w-none [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-gray-400"
        style={{ minHeight }}
      />
    </div>
  );
}

/**
 * Wraps raw HTML content in an email-safe template with inline styles.
 */
export function wrapEmailHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.6;color:#333;background-color:#f9fafb;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f9fafb;">
<tr><td align="center" style="padding:24px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background-color:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
<tr><td style="padding:32px 32px 24px;">
${bodyHtml}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
