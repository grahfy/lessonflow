import type {
  DeleteMaterialInput,
  GetMaterialInput,
  MaterialBlob,
  MaterialStorageDriver,
  PutMaterialInput
} from "@/lib/student-portal/material-storage";

/**
 * Placeholder S3 driver.
 * The project currently does not include AWS SDK dependencies, so this
 * implementation intentionally fails with a clear message when selected.
 */
export function createS3MaterialStorageDriver(): MaterialStorageDriver {
  async function notImplemented(input: PutMaterialInput | GetMaterialInput | DeleteMaterialInput): Promise<never> {
    void input;
    throw new Error("S3 learning-material storage is not implemented yet. Use LEARNING_MATERIALS_STORAGE_DRIVER=local.");
  }

  return {
    put(input: PutMaterialInput): Promise<void> {
      return notImplemented(input);
    },
    get(input: GetMaterialInput): Promise<MaterialBlob> {
      return notImplemented(input);
    },
    delete(input: DeleteMaterialInput): Promise<void> {
      return notImplemented(input);
    }
  };
}
