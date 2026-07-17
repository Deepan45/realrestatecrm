import { prisma } from "../lib/prisma";

const DEFAULT_APP_NAME = "Thanjai Property";

/** The app name shown to clients in outbound WhatsApp text and email subjects — reads
 * the same "branding" settings key the Settings > Branding UI writes, so renaming the
 * app there updates these without a code change or redeploy. */
export async function getBrandName(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key: "branding" } });
  const value = setting?.value as { appName?: string } | undefined;
  return value?.appName?.trim() || DEFAULT_APP_NAME;
}
