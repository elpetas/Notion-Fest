import { deployNotionWorkerInSandbox } from "@/lib/deploy/sandbox-worker-deploy";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const expected = process.env.DEPLOY_TRIGGER_SECRET;
  const authHeader = request.headers.get("authorization");
  if (
    typeof expected !== "string" ||
    expected.length === 0 ||
    authHeader !== `Bearer ${expected}`
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await deployNotionWorkerInSandbox();

  if (result.ok) {
    return Response.json({
      ok: true,
      sandboxId: result.sandboxId,
      steps: result.steps,
    });
  }

  return Response.json(
    {
      ok: false,
      error: result.error,
      sandboxId: result.sandboxId,
      steps: result.steps,
    },
    { status: 500 },
  );
}
