"use client";

import { useState, useTransition } from "react";
import { createNotionPage, type CreatePageResult } from "../actions";

export default function CreatePageForm() {
  const [text, setText] = useState("");
  const [parentUrl, setParentUrl] = useState("");
  const [result, setResult] = useState<CreatePageResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const res = await createNotionPage(text, parentUrl);
      setResult(res);
    });
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Create a Notion Page</h2>
      <p style={styles.sub}>
        Share a Notion page with your integration, paste its URL below, and
        we&apos;ll create a child page with your text.
      </p>

      <form onSubmit={handleSubmit} style={styles.form}>
        <label style={styles.label}>
          Page title / text
          <input
            style={styles.input}
            type="text"
            placeholder="hello from worker"
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
            disabled={isPending}
          />
        </label>

        <label style={styles.label}>
          Parent Notion page URL
          <input
            style={styles.input}
            type="text"
            placeholder="https://www.notion.so/your-workspace/Page-Name-abc123..."
            value={parentUrl}
            onChange={(e) => setParentUrl(e.target.value)}
            required
            disabled={isPending}
          />
        </label>

        <button style={styles.button} type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create page in Notion"}
        </button>
      </form>

      {result && (
        <div style={result.ok ? styles.success : styles.error}>
          {result.ok ? (
            <>
              <strong>✓ Page created!</strong>{" "}
              <a href={result.url} target="_blank" rel="noopener noreferrer">
                Open &ldquo;{result.title}&rdquo; in Notion →
              </a>
            </>
          ) : (
            <>
              <strong>✗ Error:</strong> {result.error}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    maxWidth: 520,
    margin: "60px auto",
    padding: "36px 40px",
    borderRadius: 12,
    background: "#fff",
    boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
    fontFamily: "system-ui, sans-serif",
  },
  heading: {
    margin: "0 0 8px",
    fontSize: 22,
    fontWeight: 700,
    color: "#111",
  },
  sub: {
    margin: "0 0 24px",
    fontSize: 14,
    color: "#555",
    lineHeight: 1.5,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 14,
    fontWeight: 500,
    color: "#333",
  },
  input: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #ddd",
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.15s",
  },
  button: {
    marginTop: 4,
    padding: "12px 0",
    borderRadius: 8,
    border: "none",
    background: "#000",
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  success: {
    marginTop: 20,
    padding: "12px 16px",
    borderRadius: 8,
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    color: "#166534",
    fontSize: 14,
  },
  error: {
    marginTop: 20,
    padding: "12px 16px",
    borderRadius: 8,
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    fontSize: 14,
  },
};
