import { auth } from "@/lib/auth";
import { logoutAction } from "./(auth)/actions";

export default async function HomePage() {
  const session = await auth();
  // Middleware already gates this route; session should be present.
  const user = session?.user;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Atoms Demo</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        欢迎，{user?.name || user?.email}。
      </p>

      <div className="mt-8 rounded-lg border border-border bg-card p-4 text-sm">
        <div className="text-muted-foreground">已登录账号</div>
        <div className="mt-1 font-mono text-xs">{user?.email}</div>
        <div className="mt-1 font-mono text-xs">ID: {user?.id}</div>
      </div>

      <form action={logoutAction} className="mt-6">
        <button
          type="submit"
          className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
        >
          退出登录
        </button>
      </form>

      <p className="mt-12 text-xs text-muted-foreground">
        下一阶段：项目 CRUD（SPEC §1.2）+ 聊天 SSE（SPEC §1.3）。
      </p>
    </main>
  );
}
