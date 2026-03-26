"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from "react";
import { createPortal } from "react-dom";

import { buildLessonPlanOverlaySegments } from "@/lib/admin/lesson-plan-overlay-segments";
import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import { Tooltip } from "@/components/admin/ui/tooltip";
import type { LearningMaterialRow } from "@/lib/admin/types";
import type {
  LessonPlanFieldValues,
  LessonPlanMaterialLinkFieldKey,
  LessonPlanMaterialLinkInput
} from "@/lib/lesson-plan-contract";

type LessonPlanFieldKey = keyof LessonPlanFieldValues;

interface LessonPlanStructuredFieldsProps {
  value: LessonPlanFieldValues;
  disabled?: boolean;
  className?: string;
  fields?: ReadonlyArray<LessonPlanFieldKey>;
  materialLinking?: {
    materials: LearningMaterialRow[];
    links: LessonPlanMaterialLinkInput[];
    onAddLink: (link: LessonPlanMaterialLinkInput) => void;
    onRemoveLink: (link: LessonPlanMaterialLinkInput) => void;
  };
  onChange: (patch: Partial<LessonPlanFieldValues>) => void;
}

const FIELD_CONFIG: ReadonlyArray<{
  key: LessonPlanFieldKey;
  label: string;
  tooltip: string;
  className: string;
}> = [
  {
    key: "lessonFocus",
    label: "Lesson Focus",
    tooltip: "The main concept or outcome this lesson is built around.",
    className: "admin-editor-textarea admin-editor-textarea-sm"
  },
  {
    key: "goals",
    label: "Goals",
    tooltip: "Specific goals or checkpoints for this lesson.",
    className: "admin-editor-textarea"
  },
  {
    key: "activities",
    label: "Activities",
    tooltip: "Exercises, songs, drills, or teaching steps to run during the lesson.",
    className: "admin-editor-textarea"
  },
  {
    key: "homework",
    label: "Homework",
    tooltip: "Practice tasks the student should complete after the lesson.",
    className: "admin-editor-textarea"
  },
  {
    key: "sharedNotes",
    label: "Shared Notes",
    tooltip: "Extra student-facing notes. This appears in the student portal after the lesson.",
    className: "admin-editor-textarea"
  },
  {
    key: "privateNotes",
    label: "Private Notes",
    tooltip: "Internal teaching notes. This never appears in the student portal.",
    className: "admin-editor-textarea"
  }
];

type SelectionState = {
  startOffset: number;
  endOffset: number;
  selectedText: string;
};

type ScrollOffset = {
  top: number;
  left: number;
};

type ContextMenuState = {
  fieldKey: LessonPlanMaterialLinkFieldKey;
  x: number;
  y: number;
  selection: SelectionState | null;
  activeLink: LessonPlanMaterialLinkInput | null;
};

/**
 * Shared structured lesson-plan fields used by both templates and booking plans.
 */
export function LessonPlanStructuredFields({
  value,
  disabled = false,
  className,
  fields,
  materialLinking,
  onChange
}: LessonPlanStructuredFieldsProps) {
  const textareaRefs = useRef<Partial<Record<LessonPlanFieldKey, HTMLTextAreaElement | null>>>({});
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const contextMenuSelectionRef = useRef<Partial<Record<LessonPlanFieldKey, SelectionState | null>>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [fieldSelections, setFieldSelections] = useState<Partial<Record<LessonPlanFieldKey, SelectionState>>>({});
  const [fieldScrollOffsets, setFieldScrollOffsets] = useState<Partial<Record<LessonPlanFieldKey, ScrollOffset>>>({});

  const visibleFields = fields
    ? FIELD_CONFIG.filter((field) => fields.includes(field.key))
    : FIELD_CONFIG;
  const materialsById = useMemo(() => (
    new Map((materialLinking?.materials || []).map((material) => [material.id, material]))
  ), [materialLinking?.materials]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setContextMenu(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    const closeMenu = () => setContextMenu(null);

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", closeMenu);
    document.addEventListener("scroll", closeMenu, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", closeMenu);
      document.removeEventListener("scroll", closeMenu, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (disabled && contextMenu) {
      setContextMenu(null);
    }
  }, [contextMenu, disabled]);

  const contextMenuTargetRange = contextMenu
    ? contextMenu.selection || (contextMenu.activeLink ? selectionFromLink(contextMenu.activeLink) : null)
    : null;
  const currentMaterialId = contextMenu?.activeLink?.materialId || null;

  return (
    <>
      <AdminForm className={className}>
        {visibleFields.map((field) => {
          const linkConfig = materialLinking && isLinkableField(field.key) ? materialLinking : null;
          const isLinkable = Boolean(linkConfig);
          const scrollOffset = fieldScrollOffsets[field.key] || { top: 0, left: 0 };
          const fieldLinks = linkConfig
            ? linkConfig.links.filter((link) => link.fieldKey === field.key)
            : [];
          const overlaySegments = isLinkable
            ? buildLessonPlanOverlaySegments({
                text: value[field.key],
                materialLinks: fieldLinks
              })
            : [];

          return (
            <AdminField
              key={field.key}
              label={field.label}
              tooltip={field.tooltip}
              fullWidth
            >
              {isLinkable ? (
                <div className="lesson-plan-linked-field-shell">
                  <div className="lesson-plan-linked-field-underlay" aria-hidden="true">
                    <div
                      className="lesson-plan-linked-field-mirror admin-editor-textarea"
                      style={{
                        transform: buildMirrorTransform(scrollOffset.left, scrollOffset.top)
                      }}
                    >
                      {overlaySegments.map((segment) => {
                        if (segment.isLinked && segment.materialId) {
                          const material = materialsById.get(segment.materialId);
                          const tooltipLabel = material?.description || material?.title || "Linked file";
                          return (
                            <Tooltip
                              key={`${field.key}-${segment.startOffset}-${segment.endOffset}`}
                              content={tooltipLabel}
                              side="top"
                            >
                              <span
                                className="lesson-plan-linked-field-segment is-linked"
                                title={tooltipLabel}
                                onPointerDown={(event) => forwardPointerToTextarea(field.key, event)}
                                onContextMenu={(event) => forwardContextMenuToTextarea(field.key, event)}
                              >
                                {segment.text}
                              </span>
                            </Tooltip>
                          );
                        }
                        return (
                          <span
                            key={`${field.key}-${segment.startOffset}-${segment.endOffset}`}
                            className="lesson-plan-linked-field-segment"
                          >
                            {segment.text}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <textarea
                    className={`${field.className} lesson-plan-linked-field-textarea`}
                    ref={(node) => {
                      textareaRefs.current[field.key] = node;
                    }}
                    value={value[field.key]}
                    onChange={(event) => {
                      if (contextMenu?.fieldKey === field.key) {
                        setContextMenu(null);
                      }
                      setFieldSelections((previous) => ({
                        ...previous,
                        [field.key]: undefined
                      }));
                      contextMenuSelectionRef.current[field.key] = null;
                      onChange({ [field.key]: event.target.value } as Partial<LessonPlanFieldValues>);
                    }}
                    onMouseDownCapture={(event) => {
                      if (event.button === 2) {
                        contextMenuSelectionRef.current[field.key] = readSelection(event.currentTarget);
                      }
                    }}
                    onMouseUp={(event) => syncFieldSelection(field.key, event.currentTarget)}
                    onKeyUp={(event) => syncFieldSelection(field.key, event.currentTarget)}
                    onSelect={(event) => syncFieldSelection(field.key, event.currentTarget)}
                    onContextMenu={(event) => openFieldContextMenu(field.key, fieldLinks, event)}
                    onScroll={(event) => syncFieldScroll(field.key, event.currentTarget)}
                    disabled={disabled}
                  />
                </div>
              ) : (
                <textarea
                  className={field.className}
                  ref={(node) => {
                    textareaRefs.current[field.key] = node;
                  }}
                  value={value[field.key]}
                  onChange={(event) => onChange({ [field.key]: event.target.value } as Partial<LessonPlanFieldValues>)}
                  disabled={disabled}
                />
              )}

              {materialLinking && isLinkableField(field.key) ? (
                <div className="lesson-plan-inline-links">
                  <p className="helper-text">
                    {materialLinking.materials.length > 0
                      ? "Select text in this field and right-click to assign an attached booking file."
                      : "Attach a booking-linked learning material first to enable inline links."}
                  </p>

                  {fieldLinks.length > 0 ? (
                    <div className="lesson-plan-inline-links-list">
                      {fieldLinks.map((link) => (
                        <div
                          key={`${link.fieldKey}-${link.startOffset}-${link.endOffset}-${link.materialId}`}
                          className="lesson-plan-inline-link-item"
                        >
                          <div className="lesson-plan-inline-link-copy">
                            <strong>&quot;{link.linkedText}&quot;</strong>
                            <span className="helper-text">
                              {materialsById.get(link.materialId)?.description || materialsById.get(link.materialId)?.title || "Attached file"}
                            </span>
                          </div>
                          <Tooltip content="Remove this inline material link and keep the plain text.">
                            <button
                              className="btn btn-secondary"
                              type="button"
                              disabled={disabled}
                              onClick={() => materialLinking.onRemoveLink(link)}
                            >
                              Remove Link
                            </button>
                          </Tooltip>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </AdminField>
          );
        })}
      </AdminForm>

      {contextMenu && typeof document !== "undefined" ? createPortal(
        <div
          ref={contextMenuRef}
          className="lesson-plan-link-context-menu"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`
          }}
          role="menu"
        >
          <div className="lesson-plan-link-context-menu-head">
            <strong className="lesson-plan-link-context-menu-title">
              {contextMenu.activeLink ? "Linked Text" : "Assign Learning Material"}
            </strong>
            <span className="lesson-plan-link-context-menu-copy">
              {contextMenuTargetRange ? formatMenuSelectionLabel(contextMenuTargetRange.selectedText) : "Choose an attached file."}
            </span>
          </div>

          {materialLinking && materialLinking.materials.length > 0 ? (
            <div className="lesson-plan-link-context-menu-list">
              {materialLinking.materials.map((material) => {
                const label = material.description || material.title;
                const isCurrent = currentMaterialId === material.id;

                return (
                  <button
                    key={material.id}
                    className={`lesson-plan-link-context-menu-item${isCurrent ? " is-current" : ""}`}
                    type="button"
                    role="menuitem"
                    disabled={!contextMenuTargetRange || isCurrent}
                    onClick={() => assignMaterialFromMenu(material.id)}
                  >
                    <span>{label}</span>
                    {isCurrent ? <span className="lesson-plan-link-context-menu-status">Current</span> : null}
                  </button>
                );
              })}
            </div>
          ) : contextMenu.activeLink ? (
            <div className="lesson-plan-link-context-menu-static">
              <span className="lesson-plan-link-context-menu-status">Current file</span>
              <strong>
                {materialsById.get(contextMenu.activeLink.materialId)?.description
                  || materialsById.get(contextMenu.activeLink.materialId)?.title
                  || "Linked file unavailable"}
              </strong>
            </div>
          ) : null}

          {contextMenu.activeLink ? (
            <button
              className="lesson-plan-link-context-menu-item is-danger"
              type="button"
              role="menuitem"
              onClick={removeLinkFromMenu}
            >
              Remove Link
            </button>
          ) : null}
        </div>,
        document.body
      ) : null}
    </>
  );

  function openFieldContextMenu(
    fieldKey: LessonPlanFieldKey,
    fieldLinks: LessonPlanMaterialLinkInput[],
    event: ReactMouseEvent<HTMLTextAreaElement>
  ) {
    if (!materialLinking || !isLinkableField(fieldKey) || disabled) {
      return;
    }

    const hasAvailableMenuActions = materialLinking.materials.length > 0 || fieldLinks.length > 0;
    if (!hasAvailableMenuActions) {
      return;
    }

    event.preventDefault();
    const textarea = event.currentTarget;
    const selection = getContextMenuSelection(fieldKey, textarea);
    const exactLink = selection
      ? fieldLinks.find((link) => (
          link.startOffset === selection.startOffset
            && link.endOffset === selection.endOffset
        )) || null
      : null;
    const linkAtCaret = selection ? null : findLinkAtOffset(fieldLinks, textarea.selectionStart ?? 0);
    const activeLink = exactLink || linkAtCaret;

    const menuWidth = 336;
    const menuHeight = 320;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    setContextMenu({
      fieldKey,
      x: Math.max(12, Math.min(event.clientX, viewportWidth - menuWidth)),
      y: Math.max(12, Math.min(event.clientY, viewportHeight - menuHeight)),
      selection,
      activeLink
    });
  }

  function syncFieldSelection(fieldKey: LessonPlanFieldKey, textarea: HTMLTextAreaElement) {
    const selection = readSelection(textarea) || undefined;
    contextMenuSelectionRef.current[fieldKey] = selection || null;
    setFieldSelections((previous) => ({
      ...previous,
      [fieldKey]: selection
    }));
  }

  function syncFieldScroll(fieldKey: LessonPlanFieldKey, textarea: HTMLTextAreaElement) {
    setFieldScrollOffsets((previous) => ({
      ...previous,
      [fieldKey]: {
        top: textarea.scrollTop,
        left: textarea.scrollLeft
      }
    }));
  }

  function assignMaterialFromMenu(materialId: string) {
    if (!materialLinking || !contextMenu || !contextMenuTargetRange) {
      return;
    }

    materialLinking.onAddLink({
      fieldKey: contextMenu.fieldKey,
      materialId,
      startOffset: contextMenuTargetRange.startOffset,
      endOffset: contextMenuTargetRange.endOffset,
      linkedText: contextMenuTargetRange.selectedText
    });
    textareaRefs.current[contextMenu.fieldKey]?.focus();
    setContextMenu(null);
  }

  function removeLinkFromMenu() {
    if (!materialLinking || !contextMenu?.activeLink) {
      return;
    }

    materialLinking.onRemoveLink(contextMenu.activeLink);
    textareaRefs.current[contextMenu.fieldKey]?.focus();
    setContextMenu(null);
  }

  function forwardPointerToTextarea(
    fieldKey: LessonPlanFieldKey,
    event: ReactMouseEvent<HTMLSpanElement>
  ) {
    const segment = event.currentTarget;
    segment.style.pointerEvents = "none";
    const below = document.elementFromPoint(event.clientX, event.clientY);
    segment.style.pointerEvents = "";
    if (below instanceof HTMLTextAreaElement) {
      below.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        clientX: event.clientX,
        clientY: event.clientY,
        button: event.button
      }));
    }
    event.preventDefault();
  }

  function forwardContextMenuToTextarea(
    fieldKey: LessonPlanFieldKey,
    event: ReactMouseEvent<HTMLSpanElement>
  ) {
    const segment = event.currentTarget;
    segment.style.pointerEvents = "none";
    const below = document.elementFromPoint(event.clientX, event.clientY);
    segment.style.pointerEvents = "";
    if (below instanceof HTMLTextAreaElement) {
      // Dispatch mousedown first so onMouseDownCapture captures the selection.
      below.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        clientX: event.clientX,
        clientY: event.clientY,
        button: 2
      }));
      below.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: event.clientX,
        clientY: event.clientY,
        button: 2
      }));
    }
    event.preventDefault();
  }

  function getContextMenuSelection(
    fieldKey: LessonPlanFieldKey,
    textarea: HTMLTextAreaElement
  ): SelectionState | null {
    const capturedSelection = contextMenuSelectionRef.current[fieldKey];
    if (capturedSelection) {
      contextMenuSelectionRef.current[fieldKey] = null;
      if (textarea.value.slice(capturedSelection.startOffset, capturedSelection.endOffset) === capturedSelection.selectedText) {
        return capturedSelection;
      }
    }

    const previousSelection = fieldSelections[fieldKey];
    if (!previousSelection) {
      return readSelection(textarea);
    }

    return textarea.value.slice(previousSelection.startOffset, previousSelection.endOffset) === previousSelection.selectedText
      ? previousSelection
      : readSelection(textarea);
  }
}

function isLinkableField(fieldKey: LessonPlanFieldKey): fieldKey is LessonPlanMaterialLinkFieldKey {
  return fieldKey === "lessonFocus"
    || fieldKey === "goals"
    || fieldKey === "activities"
    || fieldKey === "homework"
    || fieldKey === "sharedNotes";
}

function buildMirrorTransform(left: number, top: number): string {
  return `translate(${-left}px, ${-top}px)`;
}

function readSelection(textarea: HTMLTextAreaElement): SelectionState | null {
  const startOffset = textarea.selectionStart ?? 0;
  const endOffset = textarea.selectionEnd ?? 0;
  if (endOffset <= startOffset) {
    return null;
  }

  return {
    startOffset,
    endOffset,
    selectedText: textarea.value.slice(startOffset, endOffset)
  };
}

function findLinkAtOffset(
  fieldLinks: ReadonlyArray<LessonPlanMaterialLinkInput>,
  offset: number
): LessonPlanMaterialLinkInput | null {
  return fieldLinks.find((link) => offset >= link.startOffset && offset < link.endOffset) || null;
}

function selectionFromLink(link: LessonPlanMaterialLinkInput): SelectionState {
  return {
    startOffset: link.startOffset,
    endOffset: link.endOffset,
    selectedText: link.linkedText
  };
}

function formatMenuSelectionLabel(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= 48) {
    return `"${compact}"`;
  }
  return `"${compact.slice(0, 45)}..."`;
}
