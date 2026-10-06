import { useCallback, useEffect, useRef, useState } from "react";
import {
  Brain,
  Plus,
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  Heart,
  Lightbulb,
  CheckCircle2,
  Folder,
  Copy,
  Loader2,
  Info,
} from "lucide-react";
import type { MemoryNote, MemoryNoteInput } from "@shared/types";
import { useApp } from "../context/AppContext";
import {
  Field,
  PanelHeader,
  PanelSection,
  errorMessage,
} from "./PanelPrimitives";

const CATEGORIES = {
  preference: { label: "Preference", icon: Heart },
  fact: { label: "Fact", icon: Lightbulb },
  decision: { label: "Decision", icon: CheckCircle2 },
  project: { label: "Project", icon: Folder },
};

export function DotMemory({ dotId }: { dotId: string }) {
  const { activeDot, showToast } = useApp();
  const [notes, setNotes] = useState<MemoryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<MemoryNote["category"] | "all">(
    "all",
  );
  const [editor, setEditor] = useState<MemoryNoteInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      setLoading(true);
      setLoadError("");
      const result = await window.dots.api.listMemoryNotes(dotId);
      if (request === generation.current) setNotes(result);
    } catch (error) {
      if (request === generation.current)
        setLoadError(errorMessage(error, "Could not load memory."));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [dotId]);
  useEffect(() => {
    setNotes([]);
    setSearch("");
    setCategory("all");
    setEditor(null);
    setConfirmDelete(null);
    void load();
    const unsubscribe = window.dots.onEvent((event) => {
      if (event.type === "memory" && event.dotId === dotId)
        setNotes(event.notes);
    });
    return () => {
      generation.current++;
      unsubscribe();
    };
  }, [dotId, load]);
  useEffect(() => {
    if (editor) editorRef.current?.focus();
  }, [editor?.id, editor !== null]);
  const save = async () => {
    if (!editor?.text.trim()) return;
    try {
      setSaving(true);
      const note = await window.dots.api.saveMemoryNote(dotId, {
        ...editor,
        text: editor.text.trim(),
      });
      setNotes((previous) => [
        note,
        ...previous.filter((item) => item.id !== note.id),
      ]);
      setEditor(null);
      showToast("Memory saved.", "success");
    } catch (error) {
      showToast(errorMessage(error, "Could not save memory."), "error");
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id: string) => {
    try {
      setDeleting(id);
      await window.dots.api.deleteMemoryNote(dotId, id);
      setNotes((previous) => previous.filter((note) => note.id !== id));
      setConfirmDelete(null);
      if (editor?.id === id) setEditor(null);
      showToast("Memory removed.", "info");
    } catch (error) {
      showToast(errorMessage(error, "Could not remove this memory."), "error");
    } finally {
      setDeleting(null);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        notes.map((note) => `- [${note.category}] ${note.text}`).join("\n"),
      );
      showToast("Memory copied to clipboard.", "success");
    } catch (error) {
      showToast(errorMessage(error, "Could not copy memory."), "error");
    }
  };
  const filtered = notes.filter(
    (note) =>
      (category === "all" || note.category === category) &&
      note.text.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="profile-panel">
      <PanelHeader
        eyebrow="Shared context"
        title="Things your dot remembers"
        description="Keep the preferences, decisions, and project details that make each conversation feel connected."
        actions={
          <>
            <button
              className="btn-ghost"
              onClick={load}
              disabled={loading}
              aria-label="Refresh memory"
            >
              <RefreshCw size={14} className={loading ? "spin" : ""} />
            </button>
            <button
              className="btn-primary"
              onClick={() => setEditor({ text: "", category: "fact" })}
              disabled={saving}
            >
              <Plus size={14} /> Add memory
            </button>
          </>
        }
      />
      <div className="profile-toolbar">
        <div className="profile-search">
          <Search size={15} />
          <input
            aria-label="Search memories"
            placeholder="Search what we’ve learned…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <span className="profile-count">
          {notes.length} {notes.length === 1 ? "memory" : "memories"}
        </span>
        {notes.length > 0 && (
          <button
            className="btn-ghost"
            onClick={copy}
            title="Copy all memories"
          >
            <Copy size={13} /> Copy all
          </button>
        )}
      </div>
      <div
        className="profile-choice-group"
        role="group"
        aria-label="Memory categories"
        style={{ marginBottom: 22 }}
      >
        <button
          className={category === "all" ? "is-selected" : ""}
          aria-pressed={category === "all"}
          onClick={() => setCategory("all")}
        >
          All memories
        </button>
        {(
          Object.entries(CATEGORIES) as [
            MemoryNote["category"],
            (typeof CATEGORIES)["fact"],
          ][]
        ).map(([id, item]) => (
          <button
            key={id}
            className={category === id ? "is-selected" : ""}
            aria-pressed={category === id}
            onClick={() => setCategory(id)}
          >
            {item.label}s
          </button>
        ))}
      </div>
      {editor && (
        <PanelSection
          title={editor.id ? "Edit memory" : "Something to remember"}
          className="memory-editor"
        >
          <div className="profile-form-grid">
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                lineHeight: 1.6,
              }}
            >
              Write one useful detail in your own words. It will be available
              when {activeDot?.name || "your dot"} works with you.
            </p>
            <Field label="Category">
              <select
                value={editor.category}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    category: event.target.value as MemoryNote["category"],
                  })
                }
              >
                {Object.entries(CATEGORIES).map(([id, item]) => (
                  <option key={id} value={id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <textarea
            ref={editorRef}
            aria-label="Memory text"
            value={editor.text}
            onChange={(event) =>
              setEditor({ ...editor, text: event.target.value })
            }
            maxLength={4000}
            rows={4}
            placeholder="For example: I prefer a short summary first, with the details below."
          />
          <div
            className="profile-actions"
            style={{ justifyContent: "flex-end" }}
          >
            <span className="profile-count" style={{ marginRight: "auto" }}>
              {editor.text.length.toLocaleString()} / 4,000
            </span>
            <button
              className="btn-ghost"
              onClick={() => setEditor(null)}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={save}
              disabled={saving || !editor.text.trim()}
            >
              {saving ? (
                <Loader2 size={13} className="spin" />
              ) : (
                <CheckCircle2 size={13} />
              )}{" "}
              Save memory
            </button>
          </div>
        </PanelSection>
      )}
      {loadError ? (
        <div className="profile-empty">
          <div className="profile-empty-icon">
            <Brain size={23} />
          </div>
          <h3>Memory couldn’t be loaded</h3>
          <p>{loadError}</p>
          <button className="btn-secondary" onClick={load}>
            Try again
          </button>
        </div>
      ) : loading && !notes.length ? (
        <div className="profile-empty" role="status">
          <Loader2 size={22} className="spin" />
          <p>Opening your dot’s memory…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="profile-empty">
          <div className="profile-empty-icon">
            <Brain size={23} />
          </div>
          <h3>
            {notes.length
              ? "No memories match"
              : "A little context goes a long way"}
          </h3>
          <p>
            {notes.length
              ? "Try another search or category."
              : "Add a preference, a project detail, or a decision you’d like your dot to carry into future work."}
          </p>
          {notes.length ? (
            <button
              className="btn-ghost"
              onClick={() => {
                setSearch("");
                setCategory("all");
              }}
            >
              Clear filters
            </button>
          ) : (
            !editor && (
              <button
                className="btn-secondary"
                onClick={() => setEditor({ text: "", category: "preference" })}
              >
                <Plus size={13} /> Add your first memory
              </button>
            )
          )}
        </div>
      ) : (
        <div className="memory-grid">
          {filtered.map((note) => {
            const item = CATEGORIES[note.category];
            const Icon = item.icon;
            return (
              <article className="memory-card" key={note.id}>
                <div className="memory-card-heading">
                  <span className="memory-category-icon">
                    <Icon size={13} />
                    <span className="profile-tag">{item.label}</span>
                  </span>
                  <span className="profile-count">
                    {note.source === "agent"
                      ? "Remembered by your dot"
                      : "Added by you"}
                  </span>
                </div>
                <p>{note.text}</p>
                <div className="memory-card-footer">
                  <span title={new Date(note.updatedAt).toLocaleString()}>
                    Updated{" "}
                    {new Date(note.updatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <div>
                    {confirmDelete === note.id ? (
                      <>
                        <button
                          className="btn-ghost"
                          onClick={() => setConfirmDelete(null)}
                          disabled={deleting === note.id}
                        >
                          Keep
                        </button>
                        <button
                          className="btn-danger"
                          onClick={() => remove(note.id)}
                          disabled={deleting === note.id}
                        >
                          {deleting === note.id ? "Removing…" : "Remove"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn-ghost"
                          aria-label="Edit memory"
                          onClick={() =>
                            setEditor({
                              id: note.id,
                              text: note.text,
                              category: note.category,
                            })
                          }
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          className="btn-ghost"
                          aria-label="Delete memory"
                          onClick={() => setConfirmDelete(note.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="profile-note" style={{ marginTop: 23 }}>
        <Info size={15} />
        <div>
          These notes are included in future tasks and scheduled work. You can
          review, correct, or remove them whenever your plans change.
        </div>
      </div>
    </div>
  );
}
