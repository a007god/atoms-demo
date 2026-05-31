"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type FormState } from "../actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    loginAction,
    undefined,
  );

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">登录</h1>
      <p className="mb-6 text-sm text-muted-foreground">用邮箱和密码登录</p>

      <form action={formAction} className="space-y-4">
        <Field
          name="email"
          type="email"
          label="邮箱"
          required
          autoComplete="email"
        />
        <Field
          name="password"
          type="password"
          label="密码"
          required
          autoComplete="current-password"
          minLength={8}
        />

        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "登录中…" : "登录"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        还没账号？{" "}
        <Link href="/signup" className="text-foreground underline">
          去注册
        </Link>
      </p>
    </>
  );
}

function Field(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string },
) {
  const { label, ...rest } = props;
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        {...rest}
        className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}
