import { AppError, fail, identity, json, readBody, requestHeadersWithHost, sameOrigin } from "@/lib/server";
import { readPushSettings, registerDeviceToken, unregisterDeviceToken } from "@/lib/push-tokens";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await identity(requestHeadersWithHost(request), true);
    return json(await readPushSettings(user!));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await identity(requestHeadersWithHost(request), true);
    const body = await readBody(request);
    return json(await registerDeviceToken(user!, body.token, body.platform));
  } catch (error) {
    return fail(error instanceof AppError ? error : error);
  }
}

export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const user = await identity(requestHeadersWithHost(request), true);
    const body = await readBody(request);
    return json(await unregisterDeviceToken(user!, body.token));
  } catch (error) {
    return fail(error);
  }
}
