"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction, type FormState } from "../actions";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    signupAction,
    undefined,
  );

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">注册</h1>
      <p className="mb-6 text-sm text-muted-foreground">创建账号开始使用</p>

      <form action={formAction} className="space-y-4">
        <Field name="name" type="text" label="姓名（可选）" autoComplete="name" />
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
          label="密码（≥ 8 位）"
          required
          autoComplete="new-password"
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
          {pending ? "创建中…" : "创建账号"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        已有账号？{" "}
        <Link href="/login" className="text-foreground underline">
          去登录
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
