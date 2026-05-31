import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logoutAction } from "../(auth)/actions";
import { ProjectList } from "./_components/project-list";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = session!.user;

  const projects = await prisma.project.findMany({
    where: { ownerId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
  });

  return (
    <div className="flex min-h-dvh">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
        <header className="border-b border-border px-4 py-4">
          <Link
            href="/"
            className="block transition-opacity hover:opacity-80"
          >
            <h1 className="text-base font-semibold">Atoms Demo</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              多 Agent 协作工作台
            </p>
          </Link>
        </header>

        <div className="border-b border-border p-3">
          <Link
            href="/"
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            <span className="text-base leading-none">+</span>
            <span>新对话</span>
          </Link>
        </div>

        <ProjectList projects={projects} />

        <footer className="border-t border-border p-3 text-xs">
          <div className="truncate font-medium" title={user.email}>
            {user.name || user.email}
          </div>
          <div
            className="truncate text-muted-foreground"
            title={user.email}
          >
            {user.email}
          </div>
          <form action={logoutAction} className="mt-2">
            <button
              type="submit"
              className="text-muted-foreground hover:text-foreground"
            >
              退出登录
            </button>
          </form>
        </footer>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
