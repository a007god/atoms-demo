"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useState,
  useRef,
  useEffect,
  useTransition,
  type ReactNode,
} from "react";
import { deleteProject, renameProject } from "../projects/actions";

type Item = { id: string; name: string };

export function ProjectList({ projects }: { projects: Item[] }) {
  if (projects.length === 0) {
    return (
      <div className="flex-1 px-4 py-6 text-xs text-muted-foreground">
        还没项目。点上方"+ 新对话"或在右侧输入第一句话开始。
      </div>
    );
  }

  return (
    <nav className="flex-1 overflow-y-auto py-2">
      <ul className="px-2">
        {projects.map((p) => (
          <ProjectRow key={p.id} project={p} />
        ))}
      </ul>
    </nav>
  );
}

function ProjectRow({ project }: { project: Item }) {
  const pathname = usePathname();
  const href = `/projects/${project.id}`;
  const active = pathname === href;

  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleRename = async (formData: FormData) => {
    await renameProject(project.id, formData);
    setRenameOpen(false);
  };

  const handleDelete = () => {
    setDeleteOpen(false);
    startTransition(async () => {
      await deleteProject(project.id);
    });
  };

  return (
    <li
      className={[
        "group relative flex items-center rounded-md transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        pending ? "opacity-50" : "",
      ].join(" ")}
    >
      <Link
        href={href}
        className={[
          "flex-1 truncate px-3 py-2 text-sm",
          active ? "font-medium" : "",
        ].join(" ")}
      >
        {project.name}
      </Link>

      <div className="pr-1">
        <KebabMenu
          open={menuOpen}
          onToggle={() => setMenuOpen((o) => !o)}
          onClose={() => setMenuOpen(false)}
          onRename={() => {
            setMenuOpen(false);
            setRenameOpen(true);
          }}
          onDelete={() => {
            setMenuOpen(false);
            setDeleteOpen(true);
          }}
        />
      </div>

      <Modal open={renameOpen} onClose={() => setRenameOpen(false)}>
        <form action={handleRename} className="w-80">
          <header className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-medium">重命名项目</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              当前名称：{project.name}
            </p>
          </header>

          <div className="px-5 py-4">
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted-foreground">
                新名称
              </span>
              <input
                key={String(renameOpen)}
                name="name"
                defaultValue={project.name}
                required
                maxLength={80}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>

          <footer className="flex justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
            <button
              type="button"
              onClick={() => setRenameOpen(false)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-accent"
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              确定
            </button>
          </footer>
        </form>
      </Modal>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <div className="w-80">
          <header className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-medium">删除项目</h2>
          </header>

          <div className="space-y-2 px-5 py-4 text-sm">
            <p>
              确认删除项目「
              <span className="font-medium">{project.name}</span>
              」？
            </p>
            <p className="text-xs text-muted-foreground">
              此操作不可撤销。项目下的对话和消息会一并删除。
            </p>
          </div>

          <footer className="flex justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-accent"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:opacity-90"
            >
              删除
            </button>
          </footer>
        </div>
      </Modal>
    </li>
  );
}

function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // Sync React state ↔ native <dialog>.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Centering trick: UA `dialog[open]` sets inset:0 + margin:auto which only
      // centers a fit-content dialog; with Tailwind's class soup interfering we
      // pin top-left to viewport center and translate back by -50%.
      className="fixed left-1/2 top-1/2 right-auto bottom-auto -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-black/40"
    >
      {children}
    </dialog>
  );
}

function KebabMenu({
  open,
  onToggle,
  onClose,
  onRename,
  onDelete,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="项目操作"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
        className={[
          "grid h-6 w-6 place-items-center rounded text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground",
          open ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
        ].join(" ")}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-7 z-20 min-w-32 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            onClick={onRename}
            className="block w-full px-3 py-1.5 text-left text-xs hover:bg-accent"
          >
            重命名
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onDelete}
            className="block w-full px-3 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10"
          >
            删除
          </button>
        </div>
      )}
    </div>
  );
}
