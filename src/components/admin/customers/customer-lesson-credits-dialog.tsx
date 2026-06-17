"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { AppDialog } from "@/components/ui/app-dialog";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminNotice } from "@/components/admin/ui/admin-notice";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import { usePackages } from "@/lib/admin/use-packages";

type LessonCreditBatch = {
    id: string;
    durationMinutes: number | null;
    initialQuantity: number;
    remainingQuantity: number;
    source: string;
    packageLabel: string | null;
    note: string | null;
    expiresAt: string | null;
    isExpired: boolean;
    createdAt: string;
};

/**
 * Friendly labels for the raw `LessonCreditSource` enum values so the dialog
 * shows "Admin grant" rather than the database token "admin_grant". Mirrors the
 * STATUS_LABELS pattern in vouchers-client.tsx.
 */
const SOURCE_LABELS: Record<string, string> = {
    package_purchase: "Package purchase",
    admin_grant: "Admin grant",
    voucher_grant: "Voucher",
};

/** Maps a credit-batch source to a friendly label, falling back to the raw value. */
function formatCreditSource(source: string): string {
    return SOURCE_LABELS[source] ?? source;
}

type Props = {
    open: boolean;
    customer: { id: string; fullName: string } | null;
    onClose: () => void;
};

type GrantMode = "package" | "custom";

export function CustomerLessonCreditsDialog({ open, customer, onClose }: Props) {
    const formId = useId();

    const [loading, setLoading] = useState(false);
    const [totalRemaining, setTotalRemaining] = useState<number>(0);
    const [batches, setBatches] = useState<LessonCreditBatch[]>([]);
    const [fetchError, setFetchError] = useState("");

    const [grantMode, setGrantMode] = useState<GrantMode>("package");
    const [selectedPackageId, setSelectedPackageId] = useState("");
    const [customLessonCount, setCustomLessonCount] = useState("");
    const [customDurationMinutes, setCustomDurationMinutes] = useState("");
    const [customExpiresAt, setCustomExpiresAt] = useState("");
    const [customNote, setCustomNote] = useState("");
    const [granting, setGranting] = useState(false);
    const [grantError, setGrantError] = useState("");
    const [grantNotice, setGrantNotice] = useState("");

    const { safeFetch } = useSafeFetch();
    const { packages, loading: packagesLoading } = usePackages({ autoLoad: true });

    const loadCredits = useCallback(async () => {
        if (!customer) return;
        setLoading(true);
        setFetchError("");
        try {
            const response = await safeFetch(`/api/admin/customers/${customer.id}/lesson-credits`, {
                cache: "no-store"
            });
            if (!response.ok) {
                setFetchError("Unable to load lesson credits.");
                return;
            }
            const data = await response.json() as { totalRemaining: number; batches: LessonCreditBatch[] };
            setTotalRemaining(data.totalRemaining);
            setBatches(data.batches);
        } catch {
            setFetchError("Network error loading lesson credits.");
        } finally {
            setLoading(false);
        }
    }, [customer, safeFetch]);

    useEffect(() => {
        if (open && customer) {
            void loadCredits();
            setGrantMode("package");
            setSelectedPackageId("");
            setCustomLessonCount("");
            setCustomDurationMinutes("");
            setCustomExpiresAt("");
            setCustomNote("");
            setGrantError("");
            setGrantNotice("");
        }
    }, [open, customer, loadCredits]);

    async function handleGrant() {
        if (!customer) return;
        setGrantError("");
        setGrantNotice("");
        setGranting(true);

        try {
            let body: Record<string, unknown>;

            if (grantMode === "package") {
                if (!selectedPackageId) {
                    setGrantError("Please select a package.");
                    setGranting(false);
                    return;
                }
                body = { packageId: selectedPackageId };
            } else {
                const count = parseInt(customLessonCount, 10);
                if (!customLessonCount || isNaN(count) || count < 1) {
                    setGrantError("Lesson count must be a whole number of at least 1.");
                    setGranting(false);
                    return;
                }
                body = {
                    lessonCount: count,
                    durationMinutes: customDurationMinutes ? parseInt(customDurationMinutes, 10) : null,
                    expiresAt: customExpiresAt || null,
                    note: customNote.trim() || null
                };
            }

            const response = await safeFetch(`/api/admin/customers/${customer.id}/lesson-credits`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({})) as { error?: string };
                setGrantError(data.error || "Unable to grant lesson credits.");
                return;
            }

            setGrantNotice("Lesson credits granted successfully.");
            setSelectedPackageId("");
            setCustomLessonCount("");
            setCustomDurationMinutes("");
            setCustomExpiresAt("");
            setCustomNote("");
            await loadCredits();
        } catch {
            setGrantError("Network error granting lesson credits.");
        } finally {
            setGranting(false);
        }
    }

    const description = customer ? (
        <span>
            Prepaid lesson credits for <strong>{customer.fullName}</strong>
        </span>
    ) : null;

    return (
        <AppDialog
            isOpen={open}
            onClose={onClose}
            title="Lesson Credits"
            size="md"
            description={description}
            id="customer-lesson-credits-dialog"
        >
            <div className="dialog-layout customer-tab-panel customer-lesson-credits-panel">
                {fetchError ? (
                    <AdminNotice tone="error">{fetchError}</AdminNotice>
                ) : loading ? (
                    <p className="helper-text">Loading lesson credits...</p>
                ) : (
                    <>
                        <AdminCard className="customer-lesson-credits-summary-card">
                            <div className="customer-lesson-credits-summary">
                                <strong>Total remaining: {totalRemaining} lesson{totalRemaining === 1 ? "" : "s"}</strong>
                            </div>
                        </AdminCard>

                        <AdminCard className="customer-lesson-credits-batches-card">
                            <h4>Credit Batches</h4>
                            {batches.length === 0 ? (
                                <p className="helper-text">No lesson credit batches for this customer yet.</p>
                            ) : (
                                <div className="customer-lesson-credits-list">
                                    {batches.map((batch) => {
                                        const isDepleted = batch.remainingQuantity === 0;
                                        const isBadged = isDepleted || batch.isExpired;
                                        return (
                                            <div key={batch.id} className="customer-lesson-credits-item">
                                                <div className="customer-lesson-credits-item-main">
                                                    <div className="customer-lesson-credits-item-title-row">
                                                        <strong>
                                                            {batch.remainingQuantity} / {batch.initialQuantity}
                                                            {" "}lesson{batch.initialQuantity === 1 ? "" : "s"}
                                                        </strong>
                                                        {" · "}
                                                        <span>{batch.durationMinutes ? `${batch.durationMinutes} min` : "Any duration"}</span>
                                                        {isBadged && (
                                                            <span className="customer-lesson-credits-badge">
                                                                {isDepleted ? "Depleted" : "Expired"}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="helper-text">
                                                        Source: {formatCreditSource(batch.source)}
                                                        {batch.packageLabel ? ` · ${batch.packageLabel}` : ""}
                                                        {" · "}
                                                        {batch.expiresAt
                                                            ? `Expires ${new Date(batch.expiresAt).toLocaleDateString()}`
                                                            : "No expiry"}
                                                    </p>
                                                    {batch.note ? (
                                                        <p className="helper-text">{batch.note}</p>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </AdminCard>
                    </>
                )}

                <AdminCard className="customer-lesson-credits-grant-card">
                    <h4>Grant Credits</h4>

                    {grantError ? <AdminNotice tone="error">{grantError}</AdminNotice> : null}
                    {grantNotice ? <AdminNotice tone="success">{grantNotice}</AdminNotice> : null}

                    <AdminForm id={formId} className="dialog-form-grid customer-lesson-credits-grant-form">
                        <AdminField label="Grant mode" tooltip="Grant from a predefined package or set custom amounts." fullWidth>
                            <select
                                value={grantMode}
                                onChange={(e) => setGrantMode(e.target.value as GrantMode)}
                                disabled={granting}
                            >
                                <option value="package">Package</option>
                                <option value="custom">Custom</option>
                            </select>
                        </AdminField>

                        {grantMode === "package" ? (
                            <AdminField label="Package" tooltip="Select a predefined lesson package to grant." fullWidth>
                                <select
                                    value={selectedPackageId}
                                    onChange={(e) => setSelectedPackageId(e.target.value)}
                                    disabled={granting || packagesLoading}
                                >
                                    <option value="">Select a package...</option>
                                    {packages.filter((p) => p.isActive).map((pkg) => (
                                        <option key={pkg.id} value={pkg.id}>
                                            {pkg.label} — {pkg.lessonCount} lesson{pkg.lessonCount === 1 ? "" : "s"}
                                            {pkg.durationMinutes ? ` (${pkg.durationMinutes} min)` : ""}
                                        </option>
                                    ))}
                                </select>
                            </AdminField>
                        ) : (
                            <>
                                <AdminField label="Lesson count" tooltip="Number of prepaid lessons to grant (required)." required>
                                    <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        value={customLessonCount}
                                        onChange={(e) => setCustomLessonCount(e.target.value)}
                                        disabled={granting}
                                        placeholder="e.g. 5"
                                    />
                                </AdminField>
                                <AdminField label="Duration (minutes)" tooltip="Restrict credits to a specific lesson duration. Leave blank for any duration.">
                                    <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        value={customDurationMinutes}
                                        onChange={(e) => setCustomDurationMinutes(e.target.value)}
                                        disabled={granting}
                                        placeholder="e.g. 60 (optional)"
                                    />
                                </AdminField>
                                <AdminField label="Expiry date" tooltip="Credits will not be usable after this date. Leave blank for no expiry.">
                                    <input
                                        type="date"
                                        value={customExpiresAt}
                                        onChange={(e) => setCustomExpiresAt(e.target.value)}
                                        disabled={granting}
                                    />
                                </AdminField>
                                <AdminField label="Note" tooltip="Optional internal note for this credit grant." fullWidth>
                                    <input
                                        type="text"
                                        value={customNote}
                                        onChange={(e) => setCustomNote(e.target.value)}
                                        disabled={granting}
                                        placeholder="e.g. Courtesy credits (optional)"
                                    />
                                </AdminField>
                            </>
                        )}
                    </AdminForm>

                    <div className="dialog-actions customer-lesson-credits-grant-actions">
                        <button
                            className="btn btn-primary"
                            type="button"
                            onClick={() => void handleGrant()}
                            disabled={granting}
                        >
                            {granting ? "Granting..." : "Grant Credits"}
                        </button>
                    </div>
                </AdminCard>
            </div>
        </AppDialog>
    );
}
