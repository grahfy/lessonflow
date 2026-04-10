import { randomUUID } from "crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { StorageCleanupScope, StorageCleanupTaskInput } from "@/lib/storage-cleanup";
import { enqueueStorageCleanupTasks } from "@/lib/storage-cleanup";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";

export const MAX_NOTE_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_NOTE_IMAGE_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

type DbClient = Prisma.TransactionClient | PrismaClient;

type BookingNoteImageRow = {
  id: string;
  bookingId: string;
  storageKey: string;
};

type BookingRequestNoteImageRow = {
  id: string;
  bookingRequestId: string;
  storageKey: string;
};

export function resolveNoteImageExtension(mimeType: string): string | null {
  return ALLOWED_NOTE_IMAGE_MIME_TYPES[mimeType] ?? null;
}

export async function storeNoteImageFile(input: {
  file: File;
  storageKey: string;
}): Promise<void> {
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const driver = createMaterialStorageDriver();
  await driver.put({
    storageKey: input.storageKey,
    buffer,
    mimeType: input.file.type,
  });
}

export async function cloneStoredNoteImage(input: {
  sourceStorageKey: string;
  targetStorageKey: string;
  mimeType: string;
}): Promise<void> {
  const driver = createMaterialStorageDriver();
  const blob = await driver.get({ storageKey: input.sourceStorageKey });
  await driver.put({
    storageKey: input.targetStorageKey,
    buffer: Buffer.from(blob.buffer),
    mimeType: input.mimeType,
  });
}

export async function deleteStoredNoteImage(storageKey: string): Promise<void> {
  const driver = createMaterialStorageDriver();
  await driver.delete({ storageKey });
}

export async function deleteStoredNoteImages(storageKeys: Iterable<string>): Promise<void> {
  const uniqueStorageKeys = Array.from(new Set(Array.from(storageKeys).filter(Boolean)));
  if (uniqueStorageKeys.length === 0) {
    return;
  }

  const failures: Error[] = [];
  await Promise.all(
    uniqueStorageKeys.map(async (storageKey) => {
      try {
        await deleteStoredNoteImage(storageKey);
      } catch (error) {
        failures.push(error instanceof Error ? error : new Error(String(error)));
      }
    })
  );

  if (failures.length > 0) {
    throw new Error(
      `Unable to delete ${failures.length} note image file${failures.length === 1 ? "" : "s"}.`
    );
  }
}

export async function createNoteImageRecordWithRollback<T>(input: {
  db: DbClient;
  storageKey: string;
  scope: StorageCleanupScope;
  entityId: string;
  createRecord: () => Promise<T>;
}): Promise<T> {
  try {
    return await input.createRecord();
  } catch (error) {
    const deleteResult = await deleteStoredNoteImage(input.storageKey)
      .then(() => "deleted" as const)
      .catch(() => "failed" as const);

    if (deleteResult === "failed") {
      await enqueueStorageCleanupTasks({
        db: input.db,
        tasks: [
          {
            storageKey: input.storageKey,
            scope: input.scope,
            entityId: input.entityId,
          },
        ],
      }).catch(() => undefined);
    }
    throw error;
  }
}

export function buildBookingNoteImageStorageKey(bookingId: string, imageId: string, extension: string): string {
  return `bookings/${bookingId}/notes/${imageId}.${extension}`;
}

export function buildBookingRequestNoteImageStorageKey(requestId: string, imageId: string, extension: string): string {
  return `booking-requests/${requestId}/notes/${imageId}.${extension}`;
}

export function buildBookingNoteImageUrl(bookingId: string, imageId: string): string {
  return `/api/admin/bookings/${bookingId}/notes-image/${imageId}`;
}

export function buildBookingRequestNoteImageUrl(requestId: string, imageId: string): string {
  return `/api/admin/booking-requests/${requestId}/notes-image/${imageId}`;
}

export function mapTipTapImageSourcesInDoc(
  doc: unknown,
  transform: (src: string) => string
): Prisma.InputJsonValue | null {
  if (!doc || typeof doc !== "object") {
    return null;
  }

  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((entry) => visit(entry));
    }

    if (!value || typeof value !== "object") {
      return value;
    }

    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(record)) {
      if (key === "attrs" && record.type === "image" && entry && typeof entry === "object") {
        const attrs = entry as Record<string, unknown>;
        next[key] = {
          ...attrs,
          ...(typeof attrs.src === "string" ? { src: transform(attrs.src) } : {}),
        };
        continue;
      }

      next[key] = visit(entry);
    }

    return next;
  };

  return visit(doc) as Prisma.InputJsonValue;
}

export function extractTipTapImageSources(doc: unknown): Set<string> {
  const urls = new Set<string>();

  if (!doc || typeof doc !== "object") {
    return urls;
  }

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry));
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    const record = value as Record<string, unknown>;
    if (record.type === "image" && record.attrs && typeof record.attrs === "object") {
      const src = (record.attrs as Record<string, unknown>).src;
      if (typeof src === "string" && src.trim()) {
        urls.add(src);
      }
    }

    Object.values(record).forEach((entry) => visit(entry));
  };

  visit(doc);
  return urls;
}

function resolveStaleNoteImages<T extends BookingNoteImageRow | BookingRequestNoteImageRow>(input: {
  images: T[];
  notesContent: unknown;
  toUrl: (image: T) => string;
}): T[] {
  const referencedUrls = extractTipTapImageSources(input.notesContent);
  return input.images.filter((image) => !referencedUrls.has(input.toUrl(image)));
}

export async function reconcileBookingNoteImages(input: {
  tx: DbClient;
  bookingId: string;
  notesContent: unknown;
}): Promise<string[]> {
  const existingImages = await input.tx.bookingNoteImage.findMany({
    where: { bookingId: input.bookingId },
    select: {
      id: true,
      bookingId: true,
      storageKey: true,
    },
  });

  const staleImages = resolveStaleNoteImages({
    images: existingImages,
    notesContent: input.notesContent,
    toUrl: (image) => buildBookingNoteImageUrl(image.bookingId, image.id),
  });

  if (staleImages.length === 0) {
    return [];
  }

  await input.tx.bookingNoteImage.deleteMany({
    where: {
      id: {
        in: staleImages.map((image) => image.id),
      },
    },
  });

  return staleImages.map((image) => image.storageKey);
}

export async function reconcileBookingRequestNoteImages(input: {
  tx: DbClient;
  requestId: string;
  notesContent: unknown;
}): Promise<string[]> {
  const existingImages = await input.tx.bookingRequestNoteImage.findMany({
    where: { bookingRequestId: input.requestId },
    select: {
      id: true,
      bookingRequestId: true,
      storageKey: true,
    },
  });

  const staleImages = resolveStaleNoteImages({
    images: existingImages,
    notesContent: input.notesContent,
    toUrl: (image) => buildBookingRequestNoteImageUrl(image.bookingRequestId, image.id),
  });

  if (staleImages.length === 0) {
    return [];
  }

  await input.tx.bookingRequestNoteImage.deleteMany({
    where: {
      id: {
        in: staleImages.map((image) => image.id),
      },
    },
  });

  return staleImages.map((image) => image.storageKey);
}

export async function listBookingRequestNoteImageStorageKeys(input: {
  db: DbClient;
  requestId: string;
}): Promise<string[]> {
  const images = await input.db.bookingRequestNoteImage.findMany({
    where: { bookingRequestId: input.requestId },
    select: { storageKey: true },
  });
  return images.map((image) => image.storageKey);
}

export type BookingRequestNotesCopyResult = {
  notesContent: Prisma.InputJsonValue | null;
  createdCleanupTasks: StorageCleanupTaskInput[];
};

export async function copyBookingRequestNotesToBooking(input: {
  tx: DbClient;
  requestId: string;
  bookingId: string;
  notesContent: Prisma.JsonValue | null;
}): Promise<BookingRequestNotesCopyResult> {
  const requestImages = await input.tx.bookingRequestNoteImage.findMany({
    where: { bookingRequestId: input.requestId },
    orderBy: { createdAt: "asc" },
  });

  if (requestImages.length === 0) {
    return {
      notesContent: input.notesContent as Prisma.InputJsonValue | null,
      createdCleanupTasks: [],
    };
  }

  const sourceToTargetUrl = new Map<string, string>();
  const createdCleanupTasks: StorageCleanupTaskInput[] = [];

  try {
    for (const image of requestImages) {
      const extension = resolveNoteImageExtension(image.mimeType);
      if (!extension) {
        continue;
      }

      const nextImageId = randomUUID();
      const targetStorageKey = buildBookingNoteImageStorageKey(input.bookingId, nextImageId, extension);
      await cloneStoredNoteImage({
        sourceStorageKey: image.storageKey,
        targetStorageKey,
        mimeType: image.mimeType,
      });
      createdCleanupTasks.push({
        storageKey: targetStorageKey,
        scope: "booking_note_image",
        entityId: input.bookingId,
      });

      await input.tx.bookingNoteImage.create({
        data: {
          id: nextImageId,
          bookingId: input.bookingId,
          storageKey: targetStorageKey,
          mimeType: image.mimeType,
          sizeBytes: image.sizeBytes,
        },
      });

      sourceToTargetUrl.set(
        buildBookingRequestNoteImageUrl(input.requestId, image.id),
        buildBookingNoteImageUrl(input.bookingId, nextImageId)
      );
    }
  } catch (error) {
    await deleteStoredNoteImages(createdCleanupTasks.map((task) => task.storageKey)).catch(() => undefined);
    throw error;
  }

  if (!input.notesContent) {
    return {
      notesContent: null,
      createdCleanupTasks,
    };
  }

  return {
    notesContent: mapTipTapImageSourcesInDoc(input.notesContent, (src) => sourceToTargetUrl.get(src) ?? src),
    createdCleanupTasks,
  };
}
