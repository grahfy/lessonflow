import { AdminTable, AdminTableSeparator as Separator } from "@/components/admin/ui/admin-table";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { type CustomerRow } from "./customer-profile-dialog";

interface Props {
    customers: CustomerRow[];
    loadingCustomers: boolean;
    deletingCustomerId: string | null;
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    canManageCustomers: boolean;
    canViewBilling: boolean;
    onSetPage: (page: number) => void;
    onSetPageSize: (size: number) => void;
    onOpenCustomerDialog: (customer: CustomerRow, edit: boolean) => void;
    onDeleteCustomer: (customer: CustomerRow) => void;
    onViewInvoices: (name: string) => void;
}

/**
 * Customer directory table with row-level open behavior plus inline actions.
 *
 * RATIONALE: The whole row is clickable for speed in admin workflows, but
 * action buttons still need to remain independently operable without opening
 * the dialog accidentally.
 */
export function CustomerTable({
    customers,
    loadingCustomers,
    deletingCustomerId,
    page,
    pageSize,
    totalCount,
    totalPages,
    canManageCustomers,
    canViewBilling,
    onSetPage,
    onSetPageSize,
    onOpenCustomerDialog,
    onDeleteCustomer,
    onViewInvoices
}: Props) {
    const header = customers.length ? (
        <>
            <div className="admin-list-col admin-list-col-identity">Customer / Email</div>
            <Separator />
            <div className="admin-list-col admin-list-col-phone">Phone</div>
            <Separator />
            <div className="admin-list-col admin-list-col-skill">Skill / Mode</div>
            <Separator />
            <div className="admin-list-col admin-list-col-portal">Assigned Teacher</div>
            <Separator />
            <div className="admin-list-col admin-list-col-portal">Portal Status</div>
            <Separator />
            <div className="admin-list-col admin-list-col-actions customer-table-actions-col">Actions</div>
        </>
    ) : null;

    return (
        <AdminTable
            header={header}
            loading={loadingCustomers}
            emptyLabel="No customers found."
            pagination={{
                currentPage: page,
                totalPages: totalPages,
                totalCount: totalCount,
                pageSize: pageSize,
                onPageChange: onSetPage,
                onPageSizeChange: onSetPageSize,
                pageSizeOptions: [15, 25, 50, 100, 250]
            }}
        >
            {customers.map((customer) => (
                <div
                    key={customer.id}
                    className="customer-item invoice-row-item customer-table-row admin-list-row-button"
                    onClick={() => onOpenCustomerDialog(customer, false)}
                    onKeyDown={(event) => {
                        // NOTE: Mirror button semantics so keyboard users can
                        // open the dialog from a row that is rendered as a div.
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onOpenCustomerDialog(customer, false);
                        }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open customer ${customer.lastName ? `${customer.lastName}, ${customer.firstName}` : customer.fullName}`}
                >
                    <div className="customer-col-identity admin-list-cell admin-list-col-identity">
                        <span className="admin-mobile-label">Customer</span>
                        <strong>{customer.lastName ? `${customer.lastName}, ${customer.firstName}` : customer.fullName}</strong>
                        <span className="admin-list-subtext">{customer.email}</span>
                    </div>

                    <Separator />
                    <div className="customer-col-phone admin-list-cell admin-list-col-phone">
                        <span className="admin-mobile-label">Phone</span>
                        <span>{customer.phone}</span>
                    </div>

                    <Separator />
                    <div className="customer-col-skill admin-list-cell admin-list-col-skill">
                        <span className="admin-mobile-label">Skill / Mode</span>
                        <span className="admin-list-capitalize">{customer.skillLevel}</span>
                        <span className="admin-list-subtext">{customer.lessonMode === "in_person" ? "In-person" : "Video"}</span>
                    </div>

                    <Separator />
                    <div className="customer-col-portal admin-list-cell admin-list-col-portal">
                        <span className="admin-mobile-label">Teacher</span>
                        <span>{customer.primaryTeacher?.displayName || "Unassigned"}</span>
                    </div>

                    <Separator />
                    <div className="customer-col-portal admin-list-cell admin-list-col-portal">
                        <span className="admin-mobile-label">Portal Status</span>
                        <span>
                            {customer.portalCredential ? `Active (since ${new Date(customer.portalCredential.generatedAt).toLocaleDateString("en-AU")})` : "Not generated"}
                        </span>
                    </div>

                    <Separator />
                    <div className="customer-item-actions admin-list-actions admin-list-col-actions" onClick={e => e.stopPropagation()}>
                        {/* RATIONALE: Stop propagation so Billing/Open/Delete do
                            not also trigger the row's generic open handler. */}
                        <span className="admin-mobile-label">Actions</span>
                        {canViewBilling ? (
                            <Tooltip content="Open this customer's invoice history and billing records.">
                                <button
                                    className="btn btn-secondary admin-list-action-btn"
                                    type="button"
                                    onClick={() => onViewInvoices(customer.fullName)}
                                >
                                    Billing
                                </button>
                            </Tooltip>
                        ) : null}
                        <Tooltip content="Edit this customer's profile, contact details, and portal access.">
                            <button
                                className="btn btn-secondary admin-list-action-btn"
                                type="button"
                                onClick={() => onOpenCustomerDialog(customer, true)}
                            >
                                Open
                            </button>
                        </Tooltip>
                        {canManageCustomers ? (
                            <Tooltip content="Archive or remove this customer record.">
                                <button
                                    className="btn btn-danger admin-list-action-btn"
                                    type="button"
                                    disabled={deletingCustomerId === customer.id}
                                    onClick={() => onDeleteCustomer(customer)}
                                >
                                    {deletingCustomerId === customer.id ? "..." : "Delete"}
                                </button>
                            </Tooltip>
                        ) : null}
                    </div>
                </div>
            ))}
        </AdminTable>
    );
}
