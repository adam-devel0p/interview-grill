import type { Hono } from "hono";
import type { AppEnv } from "../../../src/worker/lib/honoEnv";

export async function postJson(
  app: Hono<AppEnv>,
  path: string,
  body: unknown,
  env: AppEnv["Bindings"],
): Promise<Response> {
  return app.request(
    path,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    env,
  );
}
