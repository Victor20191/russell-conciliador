import "server-only";

import prisma from "@/lib/prisma";

type ProcessNotificationInput = {
  actor?: string | null;
  text: string;
  target: string;
};

export async function createProcessNotification({
  actor,
  text,
  target,
}: ProcessNotificationInput): Promise<void> {
  await prisma.notification.create({
    data: {
      kind: "system",
      who: actor?.trim() || "Sistema",
      text,
      target,
      time: "ahora",
      unread: true,
    },
  });
}
