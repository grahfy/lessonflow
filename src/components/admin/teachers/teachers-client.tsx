"use client";

import { type ChangeEvent, useDeferredValue, useEffect, useMemo, useState } from "react";
import Image from "next/image";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AddressAutocomplete } from "@/components/admin/ui/address-autocomplete";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { AU_STATES } from "@/lib/admin/types";
import { toAuState } from "@/lib/admin/utils";
import { useStaffDirectory } from "@/lib/admin/use-staff";
import type { StaffProfile } from "@/lib/admin/staff-contracts";

type StaffFormState = {
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  age: string;
  unitNumber: string;
  houseNumber: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: string;
  postcode: string;
  instruments: string;
  specialisations: string;
  background: string;
  musicalHistory: string;
  isActive: boolean;
  password: string;
};

function emptyStaffForm(): StaffFormState {
  return {
    email: "",
    firstName: "",
    lastName: "",
    displayName: "",
    age: "",
    unitNumber: "",
    houseNumber: "",
    streetName: "",
    streetType: "Street",
    suburb: "",
    state: "VIC",
    postcode: "",
    instruments: "",
    specialisations: "",
    background: "",
    musicalHistory: "",
    isActive: true,
    password: ""
  };
}

function formFromProfile(profile: StaffProfile): StaffFormState {
  return {
    email: profile.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    displayName: profile.displayName,
    age: profile.age == null ? "" : String(profile.age),
    unitNumber: profile.unitNumber ?? "",
    houseNumber: profile.houseNumber ?? "",
    streetName: profile.streetName ?? "",
    streetType: profile.streetType || "Street",
    suburb: profile.suburb ?? "",
    state: profile.state || "VIC",
    postcode: profile.postcode ?? "",
    instruments: profile.instruments ?? "",
    specialisations: profile.specialisations ?? "",
    background: profile.background ?? "",
    musicalHistory: profile.musicalHistory ?? "",
    isActive: profile.isActive,
    password: ""
  };
}

export function AdminTeachersClient() {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState<string>("self");
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<StaffProfile | null>(null);
  const [form, setForm] = useState<StaffFormState>(emptyStaffForm());
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const {
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
  } = useStaffDirectory({
    onAuthError: () => window.location.assign("/admin/login"),
    onError: setError
  });

  const isOwner = currentAdmin?.role === "owner";
  const deferredDirectoryQuery = useDeferredValue(directoryQuery);
  const activeSelection = useMemo(() => {
    if (isCreating) return null;
    if (selectedId === "self") return currentAdmin;
    return selectedProfile;
  }, [currentAdmin, isCreating, selectedId, selectedProfile]);
  const directoryEntries = useMemo(() => {
    const entries = currentAdmin ? [{
      id: "self",
      role: currentAdmin.role,
      displayName: currentAdmin.displayName,
      email: currentAdmin.email,
      isActive: currentAdmin.isActive,
      instruments: currentAdmin.instruments,
      specialisations: currentAdmin.specialisations,
      profilePhotoUrl: currentAdmin.profilePhotoUrl,
      isSelf: true
    }] : [];

    if (isOwner) {
      entries.push(
        ...teachers.map((teacher) => ({
          ...teacher,
          isSelf: false
        }))
      );
    }

    const query = deferredDirectoryQuery.trim().toLowerCase();
    if (!query) {
      return entries;
    }

    return entries.filter((entry) =>
      [entry.displayName, entry.email, entry.instruments || "", entry.specialisations || ""]
        .some((value) => value.toLowerCase().includes(query))
    );
  }, [currentAdmin, deferredDirectoryQuery, isOwner, teachers]);
  const workspaceTitle = isCreating
    ? "New Teacher"
    : activeSelection?.displayName || "Select a profile";
  const workspaceKicker = isCreating
    ? "Create teacher"
    : activeSelection?.role === "owner"
      ? "Owner account"
      : activeSelection
        ? "Teacher profile"
        : "Staff workspace";
  const workspaceSummary = isCreating
    ? "Create a staff account and fill in the teacher profile details before saving."
    : activeSelection
      ? [activeSelection.email, activeSelection.instruments, activeSelection.specialisations].filter(Boolean).join(" · ")
      : "Choose a staff member from the directory to edit their profile.";

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedId === "self" && currentAdmin) {
      setSelectedProfile(currentAdmin);
      setForm(formFromProfile(currentAdmin));
      setIsCreating(false);
    }
  }, [currentAdmin, selectedId]);

  async function openStaff(id: string) {
    setError("");
    setNotice("");
    setIsCreating(false);
    setSelectedId(id);

    if (id === "self") {
      if (currentAdmin) {
        setSelectedProfile(currentAdmin);
        setForm(formFromProfile(currentAdmin));
      }
      return;
    }

    setLoadingProfile(true);
    const profile = await loadProfile(id);
    setLoadingProfile(false);
    if (profile) {
      setSelectedProfile(profile);
      setForm(formFromProfile(profile));
    }
  }

  function beginCreateTeacher() {
    setSelectedId("new");
    setSelectedProfile(null);
    setForm(emptyStaffForm());
    setIsCreating(true);
    setError("");
    setNotice("");
  }

  function updateForm(patch: Partial<StaffFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function handleSave() {
    setError("");
    setNotice("");
    setSaving(true);

    const payload = {
      email: form.email,
      firstName: form.firstName,
      lastName: form.lastName,
      displayName: form.displayName,
      age: form.age ? Number(form.age) : null,
      unitNumber: form.unitNumber || null,
      houseNumber: form.houseNumber,
      streetName: form.streetName,
      streetType: form.streetType,
      suburb: form.suburb,
      state: form.state,
      postcode: form.postcode,
      instruments: form.instruments || null,
      specialisations: form.specialisations || null,
      background: form.background || null,
      musicalHistory: form.musicalHistory || null,
      isActive: form.isActive
    };

    if (isCreating) {
      const created = await createTeacher({
        ...payload,
        password: form.password
      });
      setSaving(false);
      if (created) {
        setNotice("Teacher created.");
        await load();
        await openStaff(created.id);
      }
      return;
    }

    if (!activeSelection) {
      setSaving(false);
      return;
    }

    const updated = await updateProfile(activeSelection.id, payload);
    if (updated && form.password.trim()) {
      await updatePassword(activeSelection.id, form.password.trim());
    }
    setSaving(false);

    if (updated) {
      setNotice(form.password.trim() ? "Profile and password updated." : "Profile updated.");
      setForm((current) => ({ ...current, password: "" }));
      await load();
      await openStaff(updated.id);
    }
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !activeSelection) {
      return;
    }

    setUploadingPhoto(true);
    const url = await uploadPhoto(activeSelection.id, file);
    setUploadingPhoto(false);
    if (url) {
      setNotice("Profile photo updated.");
      await load();
      await openStaff(activeSelection.id);
    }
    event.target.value = "";
  }

  async function handlePhotoDelete() {
    if (!activeSelection) return;
    const success = await deletePhoto(activeSelection.id);
    if (success) {
      setNotice("Profile photo removed.");
      await load();
      await openStaff(activeSelection.id);
    }
  }

  return (
    <AdminShell title="Teachers" error={error} notice={notice} loading={loading || loadingProfile}>
      <div className="admin-layout-content admin-layout-content-split teacher-admin-layout">
        <AdminCard className="admin-card admin-toolbar-card teacher-directory-card">
          <div className="teacher-directory-header">
            <div>
              <p className="helper-text">Staff directory</p>
              <h2>{isOwner ? "Teachers and owner account" : "Your teacher profile"}</h2>
              <p className="helper-text teacher-directory-copy">
                {isOwner ? "Select a staff account to edit the profile workspace." : "You can review and update your own staff profile here."}
              </p>
            </div>
            {isOwner ? (
              <Tooltip content="Create a new teacher account.">
                <button className="btn btn-primary" type="button" onClick={beginCreateTeacher}>
                  New Teacher
                </button>
              </Tooltip>
            ) : null}
          </div>

          {isOwner ? (
            <label className="teacher-directory-search">
              <span className="helper-text">Search staff</span>
              <input
                type="search"
                value={directoryQuery}
                placeholder="Name, email, instrument"
                onChange={(event) => setDirectoryQuery(event.target.value)}
              />
            </label>
          ) : null}

          <div className="teacher-directory-scroll">
            <div className="teacher-directory-list">
              {directoryEntries.map((entry) => {
                const isSelected = !isCreating && selectedId === entry.id;
                return (
                  <button
                    key={entry.id}
                    className={`teacher-directory-item ${isSelected ? "is-selected" : ""}`}
                    type="button"
                    onClick={() => void openStaff(entry.id)}
                  >
                    <div className="teacher-directory-item-head">
                      <div>
                        <strong>{entry.isSelf ? `${entry.displayName} (You)` : entry.displayName}</strong>
                        <p>{entry.email}</p>
                      </div>
                      <div className="teacher-directory-badges">
                        <span className={`teacher-role-badge is-${entry.role}`}>{entry.role === "owner" ? "Owner" : "Teacher"}</span>
                        {!entry.isActive ? <span className="teacher-role-badge is-inactive">Inactive</span> : null}
                      </div>
                    </div>
                    <p className="teacher-directory-summary">
                      {[entry.instruments, entry.specialisations].filter(Boolean).join(" · ") || "Profile ready for teaching details."}
                    </p>
                  </button>
                );
              })}
              {isOwner && directoryEntries.length === 0 ? (
                <div className="teacher-directory-empty">
                  No staff matched “{deferredDirectoryQuery.trim()}”.
                </div>
              ) : null}
            </div>
          </div>
        </AdminCard>

        <AdminCard className="admin-card admin-toolbar-card teacher-profile-card">
          <div className="teacher-workspace-header">
            <div className="teacher-workspace-title-group">
              <p className="helper-text">{workspaceKicker}</p>
              <h2>{workspaceTitle}</h2>
              <p className="helper-text teacher-workspace-copy">{workspaceSummary}</p>
            </div>
            {activeSelection?.profilePhotoUrl ? (
              <Image
                className="teacher-profile-avatar"
                src={activeSelection.profilePhotoUrl}
                alt={`${activeSelection.displayName} profile`}
                width={88}
                height={88}
                unoptimized
              />
            ) : null}
          </div>

          <div className="teacher-workspace-scroll">
            <section className="teacher-editor-section">
              <div className="teacher-editor-section-head">
                <div>
                  <h3>Overview</h3>
                  <p>Core sign-in and profile identity fields.</p>
                </div>
                {!isCreating && activeSelection ? (
                  <div className="teacher-directory-badges">
                    <span className={`teacher-role-badge is-${activeSelection.role}`}>{activeSelection.role === "owner" ? "Owner" : "Teacher"}</span>
                    {!activeSelection.isActive ? <span className="teacher-role-badge is-inactive">Inactive</span> : null}
                  </div>
                ) : null}
              </div>
              <AdminForm className="dialog-form-grid">
                <AdminField label="Email" tooltip="Sign-in email for this staff account." required>
                  <input
                    type="email"
                    value={form.email}
                    readOnly={!isOwner && !isCreating}
                    onChange={(event) => updateForm({ email: event.target.value })}
                  />
                </AdminField>
                <AdminField label="Display Name" tooltip="Name shown across bookings and admin screens." required>
                  <input value={form.displayName} onChange={(event) => updateForm({ displayName: event.target.value })} />
                </AdminField>
                <AdminField label="First Name" tooltip="Teacher given name." required>
                  <input value={form.firstName} onChange={(event) => updateForm({ firstName: event.target.value })} />
                </AdminField>
                <AdminField label="Last Name" tooltip="Teacher family name." required>
                  <input value={form.lastName} onChange={(event) => updateForm({ lastName: event.target.value })} />
                </AdminField>
                <AdminField label="Age" tooltip="Optional teacher age." fullWidth={false}>
                  <input value={form.age} onChange={(event) => updateForm({ age: event.target.value.replace(/\D/g, "").slice(0, 3) })} />
                </AdminField>
                {isOwner && !isCreating && activeSelection?.role === "teacher" ? (
                  <AdminField label="Active" tooltip="Deactivate teacher access without deleting history.">
                    <select value={form.isActive ? "active" : "inactive"} onChange={(event) => updateForm({ isActive: event.target.value === "active" })}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </AdminField>
                ) : null}
              </AdminForm>
            </section>

            <section className="teacher-editor-section">
              <div className="teacher-editor-section-head">
                <div>
                  <h3>Teaching Profile</h3>
                  <p>How this teacher is described in admin operations and future public-facing content.</p>
                </div>
              </div>
              <AdminForm className="dialog-form-grid">
                <AdminField label="Instruments" tooltip="Comma-separated instruments taught or performed." fullWidth>
                  <textarea value={form.instruments} onChange={(event) => updateForm({ instruments: event.target.value })} />
                </AdminField>
                <AdminField label="Styles / Specialisations" tooltip="Comma-separated genres or teaching specialisations." fullWidth>
                  <textarea value={form.specialisations} onChange={(event) => updateForm({ specialisations: event.target.value })} />
                </AdminField>
                <AdminField label="Background" tooltip="Short professional background or bio." fullWidth>
                  <textarea value={form.background} onChange={(event) => updateForm({ background: event.target.value })} />
                </AdminField>
                <AdminField label="Musical History" tooltip="Career milestones, bands, study, or performance history." fullWidth>
                  <textarea value={form.musicalHistory} onChange={(event) => updateForm({ musicalHistory: event.target.value })} />
                </AdminField>
              </AdminForm>
            </section>

            <section className="teacher-editor-section">
              <div className="teacher-editor-section-head">
                <div>
                  <h3>Address</h3>
                  <p>Use the same OpenStreetMap-assisted lookup pattern as the rest of the admin console.</p>
                </div>
              </div>
              <div className="admin-address-search-row">
                <AddressAutocomplete onAddressSelect={(addr) => updateForm({ ...addr, state: toAuState(addr.state) })} disabled={saving} />
              </div>
              <AdminForm className="dialog-form-grid">
                <AdminField label="Unit / Apartment">
                  <input value={form.unitNumber} onChange={(event) => updateForm({ unitNumber: event.target.value })} />
                </AdminField>
                <AdminField label="House Number">
                  <input value={form.houseNumber} onChange={(event) => updateForm({ houseNumber: event.target.value })} />
                </AdminField>
                <AdminField label="Street Name">
                  <input value={form.streetName} onChange={(event) => updateForm({ streetName: event.target.value })} />
                </AdminField>
                <AdminField label="Street Type">
                  <input value={form.streetType} onChange={(event) => updateForm({ streetType: event.target.value })} />
                </AdminField>
                <AdminField label="Suburb">
                  <input value={form.suburb} onChange={(event) => updateForm({ suburb: event.target.value })} />
                </AdminField>
                <AdminField label="State">
                  <select value={form.state} onChange={(event) => updateForm({ state: event.target.value })}>
                    {AU_STATES.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </AdminField>
                <AdminField label="Postcode">
                  <input value={form.postcode} onChange={(event) => updateForm({ postcode: event.target.value.replace(/\D/g, "").slice(0, 4) })} />
                </AdminField>
              </AdminForm>
            </section>

            <section className="teacher-editor-section">
              <div className="teacher-editor-section-head">
                <div>
                  <h3>Security & Photo</h3>
                  <p>Credential rotation and profile image management.</p>
                </div>
              </div>
              <AdminForm className="dialog-form-grid">
                <AdminField label={isCreating ? "Initial Password" : "New Password"} tooltip="Leave blank to keep the existing password." fullWidth>
                  <input type="password" value={form.password} onChange={(event) => updateForm({ password: event.target.value })} />
                </AdminField>
                <AdminField label="Profile Picture" tooltip="JPEG, PNG, GIF, or WebP up to 5MB." fullWidth>
                  <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handlePhotoChange} disabled={!activeSelection || uploadingPhoto} />
                </AdminField>
              </AdminForm>
            </section>
          </div>

          <div className="teacher-profile-footer">
            <p className="helper-text teacher-profile-footer-copy">
              {isCreating ? "Passwords must be at least 8 characters." : "Changes apply to the selected staff account immediately after save."}
            </p>
            <div className="button-row">
              <button className="btn btn-primary" type="button" disabled={saving || (!isCreating && !activeSelection)} onClick={() => void handleSave()}>
                {saving ? "Saving..." : isCreating ? "Create Teacher" : "Save Profile"}
              </button>
              {activeSelection?.profilePhotoUrl ? (
                <button className="btn btn-secondary" type="button" disabled={uploadingPhoto} onClick={() => void handlePhotoDelete()}>
                  Remove Photo
                </button>
              ) : null}
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminShell>
  );
}
