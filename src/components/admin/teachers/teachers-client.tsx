"use client";

import { type ChangeEvent, useDeferredValue, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Camera, MapPin, Shield, Sparkles, UserRound, Users } from "lucide-react";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AddressAutocomplete } from "@/components/admin/ui/address-autocomplete";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import { AdminTabBar, type AdminTabItem } from "@/components/admin/ui/admin-tab-bar";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { AU_STATES } from "@/lib/admin/types";
import { toAuState } from "@/lib/admin/utils";
import { useStaffDirectory } from "@/lib/admin/use-staff";
import type { StaffProfile, StaffSummary } from "@/lib/admin/staff-contracts";

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

type StaffEditorTab = "basics" | "teaching" | "address" | "security";

type DirectoryEntry = StaffSummary & {
  isSelf: boolean;
};

const TAB_ITEMS: ReadonlyArray<AdminTabItem<StaffEditorTab>> = [
  { key: "basics", label: "Basics", tooltip: "Identity, sign-in, and account status." },
  { key: "teaching", label: "Teaching", tooltip: "Instruments, specialisations, and teaching profile." },
  { key: "address", label: "Address", tooltip: "Location and structured address details." },
  { key: "security", label: "Security & Media", tooltip: "Password management and profile image." }
];

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

function normalizeForm(form: StaffFormState): StaffFormState {
  return {
    ...form,
    email: form.email.trim(),
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    displayName: form.displayName.trim(),
    age: form.age.trim(),
    unitNumber: form.unitNumber.trim(),
    houseNumber: form.houseNumber.trim(),
    streetName: form.streetName.trim(),
    streetType: form.streetType.trim(),
    suburb: form.suburb.trim(),
    state: form.state.trim(),
    postcode: form.postcode.trim(),
    instruments: form.instruments.trim(),
    specialisations: form.specialisations.trim(),
    background: form.background.trim(),
    musicalHistory: form.musicalHistory.trim(),
    password: form.password,
    isActive: form.isActive
  };
}

function profileLabel(profile: Pick<StaffSummary, "displayName" | "firstName" | "lastName"> | null, isCreating: boolean): string {
  if (isCreating) return "NT";
  if (!profile) return "ST";

  const source = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() || profile.displayName;
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "ST";
}

function completionPercent(form: StaffFormState): number {
  const fields = [
    form.email,
    form.firstName,
    form.lastName,
    form.displayName,
    form.houseNumber,
    form.streetName,
    form.suburb,
    form.state,
    form.postcode,
    form.instruments,
    form.specialisations,
    form.background,
    form.musicalHistory
  ];
  const completed = fields.filter((value) => value.trim().length > 0).length;
  return Math.round((completed / fields.length) * 100);
}

function chipCount(value: string): number {
  if (!value.trim()) return 0;
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean).length;
}

export function AdminTeachersClient() {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState<string>("self");
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<StaffProfile | null>(null);
  const [form, setForm] = useState<StaffFormState>(emptyStaffForm());
  const [baselineForm, setBaselineForm] = useState<StaffFormState>(emptyStaffForm());
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<StaffEditorTab>("basics");

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
  const isDirty = useMemo(
    () => JSON.stringify(normalizeForm(form)) !== JSON.stringify(normalizeForm(baselineForm)),
    [form, baselineForm]
  );

  const directoryEntries = useMemo(() => {
    const entries: DirectoryEntry[] = currentAdmin
      ? [
          {
            ...currentAdmin,
            isSelf: true
          }
        ]
      : [];

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
      [entry.displayName, entry.email, entry.instruments || "", entry.specialisations || ""].some((value) =>
        value.toLowerCase().includes(query)
      )
    );
  }, [currentAdmin, deferredDirectoryQuery, isOwner, teachers]);

  const activeTeacherCount = useMemo(() => teachers.filter((teacher) => teacher.isActive).length, [teachers]);
  const inactiveTeacherCount = useMemo(() => teachers.filter((teacher) => !teacher.isActive).length, [teachers]);
  const workspaceCompletion = useMemo(() => completionPercent(form), [form]);

  const workspaceTitle = isCreating ? "New Teacher" : activeSelection?.displayName || "Select a profile";
  const workspaceKicker = isCreating
    ? "Create teacher"
    : activeSelection?.role === "owner"
      ? "Owner account"
      : activeSelection
        ? "Teacher profile"
        : "Staff workspace";
  const workspaceSummary = isCreating
    ? "Create a staff account, set the essentials, and then flesh out the teaching profile without leaving this page."
    : activeSelection
      ? [activeSelection.email, activeSelection.instruments, activeSelection.specialisations].filter(Boolean).join(" · ")
      : "Choose a staff member from the directory to open the editing workspace.";
  const workspaceLocation = [form.suburb.trim(), form.state.trim()].filter(Boolean).join(", ");

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedId === "self" && currentAdmin) {
      const nextForm = formFromProfile(currentAdmin);
      setSelectedProfile(currentAdmin);
      setForm(nextForm);
      setBaselineForm(nextForm);
      setIsCreating(false);
      setActiveTab("basics");
    }
  }, [currentAdmin, selectedId]);

  useEffect(() => {
    if (!isDirty) return undefined;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  function confirmDiscardChanges(): boolean {
    if (!isDirty) return true;
    return window.confirm("You have unsaved teacher profile changes. Discard them and continue?");
  }

  async function openStaff(id: string) {
    if (!confirmDiscardChanges()) return;

    setError("");
    setNotice("");
    setIsCreating(false);
    setSelectedId(id);
    setActiveTab("basics");

    if (id === "self") {
      if (currentAdmin) {
        const nextForm = formFromProfile(currentAdmin);
        setSelectedProfile(currentAdmin);
        setForm(nextForm);
        setBaselineForm(nextForm);
      }
      return;
    }

    setLoadingProfile(true);
    const profile = await loadProfile(id);
    setLoadingProfile(false);
    if (profile) {
      const nextForm = formFromProfile(profile);
      setSelectedProfile(profile);
      setForm(nextForm);
      setBaselineForm(nextForm);
    }
  }

  function beginCreateTeacher() {
    if (!confirmDiscardChanges()) return;

    const nextForm = emptyStaffForm();
    setSelectedId("new");
    setSelectedProfile(null);
    setForm(nextForm);
    setBaselineForm(nextForm);
    setIsCreating(true);
    setError("");
    setNotice("");
    setActiveTab("basics");
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
      const nextForm = { ...normalizeForm(form), password: "" };
      setNotice(form.password.trim() ? "Profile and password updated." : "Profile updated.");
      setForm(nextForm);
      setBaselineForm(nextForm);
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

  const showDirectory = isOwner;
  const avatarLabel = profileLabel(activeSelection || currentAdmin, isCreating);

  return (
    <AdminShell title="Teachers" error={error} notice={notice} loading={loading || loadingProfile}>
      <div
        className={[
          "admin-layout-content",
          showDirectory ? "admin-layout-content-split" : "",
          "teacher-admin-layout",
          !showDirectory ? "teacher-admin-layout-single" : ""
        ].join(" ")}
      >
        {showDirectory ? (
          <AdminCard className="admin-card admin-toolbar-card teacher-directory-card">
            <div className="teacher-directory-header">
              <div>
                <p className="helper-text">Staff directory</p>
                <h2>Teachers and owner account</h2>
                <p className="helper-text teacher-directory-copy">
                  Jump between staff accounts without leaving the page, then make changes in the workspace beside it.
                </p>
              </div>
              <Tooltip content="Create a new teacher account.">
                <button className="btn btn-primary" type="button" onClick={beginCreateTeacher}>
                  New Teacher
                </button>
              </Tooltip>
            </div>

            <div className="teacher-directory-metrics">
              <Tooltip content="Number of teacher accounts that can currently sign in and receive assignments.">
                <div className="teacher-directory-metric-card">
                  <Users size={16} aria-hidden="true" />
                  <div>
                    <span className="teacher-directory-metric-label">Active teachers</span>
                    <strong>{activeTeacherCount}</strong>
                  </div>
                </div>
              </Tooltip>
              <Tooltip content="Teacher accounts kept for history but currently unavailable for new work.">
                <div className="teacher-directory-metric-card">
                  <Sparkles size={16} aria-hidden="true" />
                  <div>
                    <span className="teacher-directory-metric-label">Inactive</span>
                    <strong>{inactiveTeacherCount}</strong>
                  </div>
                </div>
              </Tooltip>
            </div>

            <label className="teacher-directory-search">
              <span className="helper-text">Search staff</span>
              <Tooltip content="Search the directory by staff name, email, instruments, or specialisations.">
                <input
                  type="search"
                  value={directoryQuery}
                  placeholder="Name, email, instrument"
                  onChange={(event) => setDirectoryQuery(event.target.value)}
                />
              </Tooltip>
            </label>

            <div className="teacher-directory-scroll">
              <div className="teacher-directory-list">
                {directoryEntries.map((entry) => {
                  const isSelected = !isCreating && selectedId === entry.id;

                  return (
                    <Tooltip
                      key={entry.id}
                      content={`Open ${entry.displayName}${entry.isSelf ? " (your account)" : ""} in the editing workspace.`}
                    >
                      <button
                        className={`teacher-directory-item ${isSelected ? "is-selected" : ""}`}
                        type="button"
                        onClick={() => void openStaff(entry.id)}
                      >
                        <div className="teacher-directory-item-avatar">
                          {entry.profilePhotoUrl ? (
                            <Image
                              src={entry.profilePhotoUrl}
                              alt={`${entry.displayName} profile`}
                              fill
                              sizes="52px"
                              unoptimized
                            />
                          ) : (
                            <span>{profileLabel(entry, false)}</span>
                          )}
                        </div>
                        <div className="teacher-directory-item-body">
                          <div className="teacher-directory-item-head">
                            <div>
                              <strong>{entry.isSelf ? `${entry.displayName} (You)` : entry.displayName}</strong>
                              <p>{entry.email}</p>
                            </div>
                            <div className="teacher-directory-badges">
                              <span className={`teacher-role-badge is-${entry.role}`}>
                                {entry.role === "owner" ? "Owner" : "Teacher"}
                              </span>
                              {!entry.isActive ? <span className="teacher-role-badge is-inactive">Inactive</span> : null}
                            </div>
                          </div>
                          <p className="teacher-directory-summary">
                            {[entry.instruments, entry.specialisations].filter(Boolean).join(" · ") || "Ready for teaching details."}
                          </p>
                        </div>
                      </button>
                    </Tooltip>
                  );
                })}

                {directoryEntries.length === 0 ? (
                  <div className="teacher-directory-empty">No staff matched “{deferredDirectoryQuery.trim()}”.</div>
                ) : null}
              </div>
            </div>
          </AdminCard>
        ) : null}

        <AdminCard className="admin-card admin-toolbar-card teacher-profile-card">
          <div className="teacher-workspace-hero">
            <div className="teacher-workspace-hero-main">
              <Tooltip content="Profile image or initials used across staff cards and workspace headers.">
                <div className="teacher-workspace-avatar">
                  {activeSelection?.profilePhotoUrl ? (
                    <Image
                      className="teacher-profile-avatar"
                      src={activeSelection.profilePhotoUrl}
                      alt={`${activeSelection.displayName} profile`}
                      fill
                      sizes="112px"
                      unoptimized
                    />
                  ) : (
                    <span>{avatarLabel}</span>
                  )}
                </div>
              </Tooltip>

              <div className="teacher-workspace-title-group">
                <p className="helper-text">{workspaceKicker}</p>
                <h2>{workspaceTitle}</h2>
                <p className="helper-text teacher-workspace-copy">{workspaceSummary}</p>

                <div className="teacher-workspace-chips">
                  {!isCreating && activeSelection ? (
                    <>
                      <Tooltip content="Role determines whether this staff account owns the admin console or teaches lessons only.">
                        <span className={`teacher-role-badge is-${activeSelection.role}`}>
                          {activeSelection.role === "owner" ? "Owner" : "Teacher"}
                        </span>
                      </Tooltip>
                      {activeSelection.isActive ? (
                        <Tooltip content="This staff account can currently sign in and receive assignments.">
                          <span className="teacher-role-badge teacher-role-badge-neutral">Active</span>
                        </Tooltip>
                      ) : (
                        <Tooltip content="This staff account is kept for history but is currently unavailable for new work.">
                          <span className="teacher-role-badge is-inactive">Inactive</span>
                        </Tooltip>
                      )}
                    </>
                  ) : (
                    <Tooltip content="This profile has not been saved yet. Required fields and an initial password still need to be confirmed.">
                      <span className="teacher-role-badge teacher-role-badge-neutral">Draft profile</span>
                    </Tooltip>
                  )}

                  {workspaceLocation ? (
                    <Tooltip content="Primary state/location used for this staff member's address details.">
                      <span className="teacher-role-badge teacher-role-badge-neutral">{workspaceLocation}</span>
                    </Tooltip>
                  ) : null}

                  <Tooltip content="Rough completion score based on how much of this staff profile has been filled out.">
                    <span className="teacher-role-badge teacher-role-badge-neutral">
                      {workspaceCompletion}% complete
                    </span>
                  </Tooltip>
                </div>
              </div>
            </div>

            <div className="teacher-workspace-hero-side">
              <Tooltip content="Count of instrument tags currently listed in the teaching profile.">
                <div className="teacher-hero-stat">
                  <span className="teacher-hero-stat-icon">
                    <Sparkles size={15} aria-hidden="true" />
                  </span>
                  <span className="teacher-hero-stat-label">Instruments</span>
                  <strong>{chipCount(form.instruments)}</strong>
                </div>
              </Tooltip>
              <Tooltip content="Count of styles, genres, or teaching specialisations currently listed.">
                <div className="teacher-hero-stat">
                  <span className="teacher-hero-stat-icon">
                    <UserRound size={15} aria-hidden="true" />
                  </span>
                  <span className="teacher-hero-stat-label">Specialisations</span>
                  <strong>{chipCount(form.specialisations)}</strong>
                </div>
              </Tooltip>
            </div>
          </div>

          <AdminTabBar
            items={TAB_ITEMS}
            activeTab={activeTab}
            onChange={setActiveTab}
            className="teacher-tab-bar"
            listClassName="teacher-tab-bar-list"
            rightSlot={
              isDirty ? (
                <Tooltip content="This workspace has edits that have not been saved to the staff account yet.">
                  <span className="teacher-unsaved-pill">Unsaved changes</span>
                </Tooltip>
              ) : null
            }
          />

          <div className="teacher-workspace-scroll">
            {activeTab === "basics" ? (
              <section className="teacher-editor-section">
                <div className="teacher-editor-section-head">
                  <div>
                    <h3>Basics</h3>
                    <p>Identity, sign-in, and account status all stay in one place for quick updates.</p>
                  </div>
                </div>

                <div className="teacher-editor-feature-grid">
                  <div className="teacher-editor-feature-card">
                    <UserRound size={18} aria-hidden="true" />
                    <div>
                      <h4>Profile identity</h4>
                      <p>These fields drive labels across bookings, customers, and the admin shell.</p>
                    </div>
                  </div>
                  <div className="teacher-editor-feature-card">
                    <Shield size={18} aria-hidden="true" />
                    <div>
                      <h4>Account state</h4>
                      <p>
                        {isCreating
                          ? "New staff begin active and need an initial password before save."
                          : "Pause teacher access without deleting historical bookings or profile content."}
                      </p>
                    </div>
                  </div>
                </div>

                <AdminForm className="dialog-form-grid teacher-editor-grid">
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
                      <select
                        value={form.isActive ? "active" : "inactive"}
                        onChange={(event) => updateForm({ isActive: event.target.value === "active" })}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </AdminField>
                  ) : null}
                </AdminForm>
              </section>
            ) : null}

            {activeTab === "teaching" ? (
              <section className="teacher-editor-section">
                <div className="teacher-editor-section-head">
                  <div>
                    <h3>Teaching Profile</h3>
                    <p>Shape how this teacher is described internally now and in future public-facing content.</p>
                  </div>
                </div>
                <AdminForm className="dialog-form-grid teacher-editor-grid">
                  <AdminField label="Instruments" tooltip="Comma-separated instruments taught or performed." fullWidth>
                    <textarea value={form.instruments} onChange={(event) => updateForm({ instruments: event.target.value })} />
                  </AdminField>
                  <AdminField label="Styles / Specialisations" tooltip="Comma-separated genres or teaching specialisations." fullWidth>
                    <textarea
                      value={form.specialisations}
                      onChange={(event) => updateForm({ specialisations: event.target.value })}
                    />
                  </AdminField>
                  <AdminField label="Background" tooltip="Short professional background or bio." fullWidth>
                    <textarea value={form.background} onChange={(event) => updateForm({ background: event.target.value })} />
                  </AdminField>
                  <AdminField label="Musical History" tooltip="Career milestones, bands, study, or performance history." fullWidth>
                    <textarea
                      value={form.musicalHistory}
                      onChange={(event) => updateForm({ musicalHistory: event.target.value })}
                    />
                  </AdminField>
                </AdminForm>
              </section>
            ) : null}

            {activeTab === "address" ? (
              <section className="teacher-editor-section">
                <div className="teacher-editor-section-head">
                  <div>
                    <h3>Address</h3>
                    <p>Use the same OpenStreetMap-assisted lookup pattern as the rest of the admin console.</p>
                  </div>
                </div>

                <div className="teacher-address-lookup-card">
                  <div className="teacher-address-lookup-copy">
                    <MapPin size={18} aria-hidden="true" />
                    <div>
                      <strong>Quick fill</strong>
                      <p>Search first, then refine the structured address fields if anything needs to be adjusted.</p>
                    </div>
                  </div>
                  <div className="admin-address-search-row">
                    <AddressAutocomplete
                      onAddressSelect={(addr) => updateForm({ ...addr, state: toAuState(addr.state) })}
                      disabled={saving}
                    />
                  </div>
                </div>

                <AdminForm className="dialog-form-grid teacher-editor-grid">
                  <AdminField label="Unit / Apartment" tooltip="Unit or apartment number for the staff address.">
                    <input value={form.unitNumber} onChange={(event) => updateForm({ unitNumber: event.target.value })} />
                  </AdminField>
                  <AdminField label="House Number" tooltip="Street or building number for the address.">
                    <input value={form.houseNumber} onChange={(event) => updateForm({ houseNumber: event.target.value })} />
                  </AdminField>
                  <AdminField label="Street Name" tooltip="Name of the street for the staff address.">
                    <input value={form.streetName} onChange={(event) => updateForm({ streetName: event.target.value })} />
                  </AdminField>
                  <AdminField label="Street Type" tooltip="Street type such as Street, Road, or Avenue.">
                    <input value={form.streetType} onChange={(event) => updateForm({ streetType: event.target.value })} />
                  </AdminField>
                  <AdminField label="Suburb" tooltip="Suburb or locality for the staff address.">
                    <input value={form.suburb} onChange={(event) => updateForm({ suburb: event.target.value })} />
                  </AdminField>
                  <AdminField label="State" tooltip="Australian state or territory for the staff address.">
                    <select value={form.state} onChange={(event) => updateForm({ state: event.target.value })}>
                      {AU_STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </AdminField>
                  <AdminField label="Postcode" tooltip="Four-digit postcode for the staff address.">
                    <input value={form.postcode} onChange={(event) => updateForm({ postcode: event.target.value.replace(/\D/g, "").slice(0, 4) })} />
                  </AdminField>
                </AdminForm>
              </section>
            ) : null}

            {activeTab === "security" ? (
              <section className="teacher-editor-section">
                <div className="teacher-editor-section-head">
                  <div>
                    <h3>Security & Media</h3>
                    <p>Rotate credentials when needed and keep the profile image consistent across the workspace.</p>
                  </div>
                </div>

                <div className="teacher-security-grid">
                  <div className="teacher-security-card">
                    <div className="teacher-security-head">
                      <Shield size={18} aria-hidden="true" />
                      <div>
                        <h4>{isCreating ? "Initial password" : "Password rotation"}</h4>
                        <p>
                          {isCreating
                            ? "Set the first sign-in password before creating the account."
                            : "Leave this blank if the current password should stay unchanged."}
                        </p>
                      </div>
                    </div>
                    <AdminForm className="dialog-form-grid teacher-editor-grid">
                      <AdminField
                        label={isCreating ? "Initial Password" : "New Password"}
                        tooltip="Leave blank to keep the existing password."
                        fullWidth
                      >
                        <input type="password" value={form.password} onChange={(event) => updateForm({ password: event.target.value })} />
                      </AdminField>
                    </AdminForm>
                  </div>

                  <div className="teacher-security-card">
                    <div className="teacher-security-head">
                      <Camera size={18} aria-hidden="true" />
                      <div>
                        <h4>Profile image</h4>
                        <p>Use a square-friendly image so cards, headers, and future staff views feel consistent.</p>
                      </div>
                    </div>
                    <AdminForm className="dialog-form-grid teacher-editor-grid">
                      <AdminField label="Profile Picture" tooltip="JPEG, PNG, GIF, or WebP up to 5MB." fullWidth>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          onChange={handlePhotoChange}
                          disabled={!activeSelection || uploadingPhoto}
                        />
                      </AdminField>
                    </AdminForm>
                  </div>
                </div>
              </section>
            ) : null}
          </div>

          <div className="teacher-profile-footer">
            <p className="helper-text teacher-profile-footer-copy">
              {isCreating
                ? "Passwords must be at least 8 characters."
                : isDirty
                  ? "You have unsaved edits in this workspace."
                  : "Changes apply to the selected staff account immediately after save."}
            </p>
            <div className="button-row">
              {isDirty ? (
                <Tooltip content="Revert all unsaved edits in the current workspace back to the last saved state.">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setForm(baselineForm);
                      setError("");
                      setNotice("");
                    }}
                  >
                    Discard Changes
                  </button>
                </Tooltip>
              ) : null}
              <Tooltip
                content={
                  isCreating
                    ? "Create this teacher account using the details currently entered in the workspace."
                    : "Save the current workspace edits to this staff profile immediately."
                }
              >
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={saving || (!isCreating && !activeSelection)}
                  onClick={() => void handleSave()}
                >
                  {saving ? "Saving..." : isCreating ? "Create Teacher" : "Save Profile"}
                </button>
              </Tooltip>
              {activeSelection?.profilePhotoUrl ? (
                <Tooltip content="Remove the current profile image and fall back to initials in the workspace and directory.">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => void handlePhotoDelete()}
                  >
                    Remove Photo
                  </button>
                </Tooltip>
              ) : null}
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminShell>
  );
}
