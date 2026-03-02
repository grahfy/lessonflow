import re

with open("src/components/admin-bookings-client.tsx", "r") as f:
    content = f.read()

# Replace dialog actions
old_actions = """              <div className="dialog-actions dialog-actions-booking">
                {activeTab === 'appointment' ? (
                  <>
                    <button className="btn btn-primary" type="button" disabled={!!busyAction} onClick={() => void saveDetails()}>Save details</button>
                    <button className="btn btn-secondary" type="button" disabled={!!busyAction} onClick={openMoveDialog}>Move</button>
                    <button className="btn btn-secondary" type="button" disabled={!!busyAction} onClick={() => void sendNotification("reminder")}>Send reminder</button>
                    <button className="btn btn-danger" type="button" disabled={!!busyAction} onClick={() => void cancelSelected()}>Cancel</button>
                    <button className="btn btn-danger" type="button" disabled={!!busyAction} onClick={() => void deleteSelected()}>Delete</button>
                  </>
                ) : (
                  <button className="btn btn-secondary" type="button" onClick={() => setActiveTab('appointment')}>Back to appointment</button>
                )}
              </div>"""

new_actions = """              <div className="dialog-actions dialog-actions-booking">
                {activeTab === 'appointment' ? (
                  <>
                    <button className="btn btn-primary" type="button" disabled={!!busyAction} onClick={() => void saveDetails()}>Save details</button>
                    <button className="btn btn-secondary" type="button" disabled={!!busyAction} onClick={openMoveDialog}>
                      {busyAction === "move" ? "Moving..." : selectedIsPending ? "Move request" : "Move booking"}
                    </button>
                    {!selectedIsPending ? (
                      <button className="btn btn-primary" type="button" disabled={!!busyAction} onClick={openInvoiceDialog}>
                        Create invoice
                      </button>
                    ) : null}
                    {selectedIsPending ? (
                      <button
                        className="btn btn-primary"
                        type="button"
                        disabled={!!busyAction}
                        onClick={() => void approveSelected("approve")}
                      >
                        {busyAction === "approve" ? "Approving..." : "Approve request"}
                      </button>
                    ) : null}
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={!!busyAction}
                      onClick={() => void sendNotification("reminder")}
                    >
                      {busyAction === "reminder" ? "Sending..." : "Send reminder"}
                    </button>
                    <button className="btn btn-danger" type="button" disabled={!!busyAction} onClick={() => void cancelSelected()}>
                      {busyAction === "cancel" ? "Cancelling..." : selectedIsPending ? "Cancel request" : "Cancel booking"}
                    </button>
                    <button
                      className="btn btn-danger"
                      type="button"
                      disabled={!!busyAction}
                      onClick={() => void deleteSelected()}
                    >
                      {busyAction === "delete"
                        ? "Deleting..."
                        : selectedIsPending
                          ? "Remove request entirely"
                          : "Delete booking"}
                    </button>
                    {selectedIsPending ? (
                      <button
                        className="btn btn-danger"
                        type="button"
                        disabled={!!busyAction}
                        onClick={() => void approveSelected("reject")}
                      >
                        {busyAction === "reject" ? "Rejecting..." : "Reject request"}
                      </button>
                    ) : null}
                    {selectedSeriesId ? (
                      <button className="btn btn-danger" type="button" disabled={!!busyAction} onClick={() => void removeSeries(selectedSeriesId)}>
                        Remove series
                      </button>
                    ) : null}
                  </>
                ) : (
                  <button className="btn btn-secondary" type="button" onClick={() => setActiveTab('appointment')}>Back to appointment</button>
                )}
              </div>"""

if old_actions not in content:
    print("Could not find the old actions block to replace!")
else:
    content = content.replace(old_actions, new_actions)
    print("Successfully replaced dialog actions.")

invoice_dialog = """
      {invoiceDialogPresence.isMounted ? (
        <div
          className="dialog-backdrop is-secondary"
          ref={invoiceDialogRootRef}
          data-motion-root="admin"
          data-motion-item="invoice-dialog-backdrop"
          onClick={(event) => {
            event.stopPropagation();
            void closeInvoiceDialog();
          }}
        >
          <div
            className="dialog-panel booking-dialog-panel dialog-panel-wide"
            data-motion-item="invoice-dialog-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-head" data-motion-item="invoice-dialog-head">
              <h3 id="invoice-dialog-title" data-motion-item="invoice-dialog-title">
                Create invoice
              </h3>
              <button className="btn btn-secondary" type="button" onClick={() => void closeInvoiceDialog()}>
                Cancel
              </button>
            </div>
            <div className="booking-dialog-scroll">
              <p className="helper-text dialog-status" data-motion-item="invoice-dialog-status">
                Add lesson price and optional extras. You can edit and send the invoice from the invoice console.
              </p>
              <div className="manual-grid manual-grid-2">
                <div className="field">
                  <label>Due date *</label>
                  <input
                    type="datetime-local"
                    value={invoiceForm.dueAtLocal}
                    onChange={(event) => setInvoiceForm((prev) => ({ ...prev, dueAtLocal: event.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Tax mode</label>
                  <select
                    value={invoiceForm.taxMode}
                    onChange={(event) => setInvoiceForm((prev) => ({ ...prev, taxMode: event.target.value as InvoiceTaxMode }))}
                  >
                    <option value="taxable">Taxable (GST)</option>
                    <option value="gst_free">GST-free</option>
                  </select>
                </div>
                <div className="field manual-span-2">
                  <label>Notes</label>
                  <textarea
                    value={invoiceForm.notes}
                    onChange={(event) => setInvoiceForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </div>
              </div>

              <div className="invoice-line-list">
                {editingLineItems.map((lineItem, index) => (
                  <div key={lineItem.key} className="invoice-line-item invoice-line-item-editable">
                    <input
                      value={lineItem.description}
                      onChange={(event) =>
                        setEditingLineItems((previous) =>
                          previous.map((entry, entryIndex) => (entryIndex === index ? { ...entry, description: event.target.value } : entry))
                        )
                      }
                      placeholder="Description"
                    />
                    {!lineItem.isPreset ? (
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={lineItem.quantity}
                        onChange={(event) =>
                          setEditingLineItems((previous) =>
                            previous.map((entry, entryIndex) => (entryIndex === index ? { ...entry, quantity: event.target.value } : entry))
                          )
                        }
                      />
                    ) : (
                      <div />
                    )}
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={lineItem.unitPriceAud}
                      onChange={(event) =>
                        setEditingLineItems((previous) =>
                          previous.map((entry, entryIndex) => (entryIndex === index ? { ...entry, unitPriceAud: event.target.value } : entry))
                        )
                      }
                    />
                    <select
                      value={lineItem.taxMode}
                      onChange={(event) =>
                        setEditingLineItems((previous) =>
                          previous.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, taxMode: event.target.value as InvoiceTaxMode } : entry
                          )
                        )
                      }
                    >
                      <option value="taxable">Taxable (GST)</option>
                      <option value="gst_free">GST-free</option>
                    </select>
                    <button
                      className="btn btn-secondary"
                      onClick={() =>
                        setEditingLineItems((previous) => previous.filter((_, entryIndex) => entryIndex !== index))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="dialog-actions dialog-actions-inline">
                <select
                  value={editingProductPresetId}
                  onChange={(event) => {
                    const val = event.target.value;
                    setEditingProductPresetId(val);
                    const preset = presets.find((entry) => entry.id === val);
                    if (preset) {
                      addInvoiceProductPresetToEditor(preset);
                      setEditingProductPresetId("");
                    }
                  }}
                  className="invoice-product-preset-select"
                >
                  <option value="">Add lesson package preset...</option>
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={!editingProductPresetId}
                  onClick={() => {
                    const preset = presets.find((entry) => entry.id === editingProductPresetId);
                    if (!preset) return;
                    addInvoiceProductPresetToEditor(preset);
                    setEditingProductPresetId("");
                  }}
                >
                  Add product preset
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => addEditableLineItem()}>
                  Add line item
                </button>
              </div>
            </div>

            <div className="dialog-actions" data-motion-item="invoice-dialog-actions">
              <button className="btn btn-secondary" type="button" disabled={!!busyAction} onClick={() => void closeInvoiceDialog()}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={!!busyAction}
                onClick={() => void createInvoiceFromBooking()}
              >
                {busyAction === "create_invoice" ? "Creating..." : "Create invoice"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
"""

if "{invoiceDialogPresence.isMounted ?" not in content:
    # insert before {moveDialogPresence.isMounted ? (
    content = content.replace("      {moveDialogPresence.isMounted ? (", invoice_dialog + "\n      {moveDialogPresence.isMounted ? (")
    print("Successfully added invoice dialog.")
else:
    print("Invoice dialog already present.")

with open("src/components/admin-bookings-client.tsx", "w") as f:
    f.write(content)

