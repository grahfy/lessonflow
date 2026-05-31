"use client";

import { useCallback, useState } from "react";

import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import type { StaffProfile, StaffSummary } from "@/lib/admin/staff-contracts";

type StaffDirectoryPayload = {
  currentAdmin: StaffProfile;
  teachers: StaffSummary[];
};

export function useStaffDirectory(options: { onAuthError?: () => void; onError?: (message: string) => void } = {}) {
  const { onAuthError, onError } = options;
  const [currentAdmin, setCurrentAdmin] = useState<StaffProfile | null>(null);
  const [teachers, setTeachers] = useState<StaffSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await safeFetch("/api/admin/staff", {
        cache: "no-store"
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to load staff.");
        return null;
      }
      const body = (await response.json()) as StaffDirectoryPayload;
      setCurrentAdmin(body.currentAdmin || null);
      setTeachers(body.teachers || []);
      return body;
    } finally {
      setLoading(false);
    }
  }, [safeFetch, handleApiError]);

  const loadProfile = useCallback(async (id: string) => {
    const response = await safeFetch(`/api/admin/staff/${id}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      await handleApiError(response, "Unable to load staff profile.");
      return null;
    }
    const body = (await response.json()) as { staff: StaffProfile };
    return body.staff;
  }, [safeFetch, handleApiError]);

  const createTeacher = useCallback(async (payload: Record<string, unknown>) => {
    const response = await safeFetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      await handleApiError(response, "Unable to create teacher.");
      return null;
    }
    const body = (await response.json()) as { teacher: StaffProfile };
    return body.teacher;
  }, [safeFetch, handleApiError]);

  const updateProfile = useCallback(async (id: string, payload: Record<string, unknown>) => {
    const response = await safeFetch(`/api/admin/staff/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      await handleApiError(response, "Unable to update staff profile.");
      return null;
    }
    const body = (await response.json()) as { staff: StaffProfile };
    return body.staff;
  }, [safeFetch, handleApiError]);

  const updatePassword = useCallback(async (id: string, password: string, currentPassword?: string) => {
    const response = await safeFetch(`/api/admin/staff/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "password",
        password,
        // Self-service rotations must re-authenticate; the server requires this
        // when the target account is the acting admin's own.
        ...(currentPassword ? { currentPassword } : {})
      })
    });
    if (!response.ok) {
      await handleApiError(response, "Unable to update password.");
      return false;
    }
    return true;
  }, [safeFetch, handleApiError]);

  const uploadPhoto = useCallback(async (id: string, file: File) => {
    const form = new FormData();
    form.set("file", file);
    const response = await safeFetch(`/api/admin/staff/${id}/photo`, {
      method: "POST",
      body: form
    });
    if (!response.ok) {
      await handleApiError(response, "Unable to upload profile photo.");
      return null;
    }
    const body = (await response.json()) as { profilePhotoUrl: string | null };
    return body.profilePhotoUrl;
  }, [safeFetch, handleApiError]);

  const deletePhoto = useCallback(async (id: string) => {
    const response = await safeFetch(`/api/admin/staff/${id}/photo`, {
      method: "DELETE"
    });
    if (!response.ok) {
      await handleApiError(response, "Unable to delete profile photo.");
      return false;
    }
    return true;
  }, [safeFetch, handleApiError]);

  return {
    currentAdmin,
    teachers,
    loading,
    load,
    loadProfile,
    createTeacher,
    updateProfile,
    updatePassword,
    uploadPhoto,
    deletePhoto
  };
}
