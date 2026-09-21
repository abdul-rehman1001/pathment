"use client";

import { createElement, useEffect, useState, type ReactNode } from "react";
import { stripHtml } from "@/lib/utils/html";
import { renderRichContent } from "@/lib/utils/richText";

const ALLOWED = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);
const OMIT = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "form",
]);

/** Render editor content as React elements; never copy event handlers or styles. */
export function RichTextReader({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  const [parsed, setParsed] = useState<{
    source: string;
    nodes: ReactNode;
  } | null>(null);
  useEffect(() => {
    const document = new DOMParser().parseFromString(
      renderRichContent(content),
      "text/html",
    );
    const visit = (node: Node, key: string): ReactNode => {
      if (node.nodeType === 3) return node.textContent;
      if (node.nodeType !== 1) return null;
      const element = node as Element;
      const tag = element.tagName.toLowerCase();
      if (OMIT.has(tag)) return null;
      const children = Array.from(node.childNodes).map((child, i) =>
        visit(child, `${key}-${i}`),
      );
      if (!ALLOWED.has(tag)) return children;
      const props: Record<string, unknown> = { key };
      if (tag === "a") {
        const href = element.getAttribute("href") || "";
        if (/^https?:\/\//i.test(href)) {
          props.href = href;
          props.target = "_blank";
          props.rel = "noopener noreferrer";
        }
      }
      return createElement(
        tag,
        props,
        ...(["br", "hr"].includes(tag) ? [] : children),
      );
    };
    setParsed({
      source: content,
      nodes: Array.from(document.body.childNodes).map((node, i) =>
        visit(node, String(i)),
      ),
    });
  }, [content]);
  return (
    <div className={`rich-content leading-relaxed break-words ${className}`}>
      {parsed?.source === content ? parsed.nodes : stripHtml(content)}
    </div>
  );
}
