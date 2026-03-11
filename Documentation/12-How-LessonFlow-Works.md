# How LessonFlow Works

LessonFlow is a multi-surface lesson-management system composed of public pages, an administrative console, a student portal, a persistent data layer, and host-side services that support deployment and background jobs. This chapter provides a high-level systems overview intended for operational understanding rather than low-level implementation work.

<div class="manual-callout info">
<strong>Security note:</strong> This chapter describes the system in broad product and operational terms. It is intentionally limited to safe, high-level detail and does not expose sensitive infrastructure information.
</div>

## System Components

The platform can be understood as six cooperating parts:

| Subsystem | Primary responsibility |
| --- | --- |
| Public pages | Enquiry capture and booking intake |
| Admin console | Operations, support, billing, configuration, diagnostics |
| Student portal | Student self-service and materials access |
| Data layer | Storage of bookings, customers, invoices, materials, and logs |
| Email and reporting services | Delivery and summary generation |
| Deployment layer | Installation, updates, services, timers, and recovery operations |

## General Flow of Information

At a high level, LessonFlow operates as follows:

1. the public site or student portal creates requests and support activity
2. the admin console interprets that activity into bookings, customer maintenance, and invoice actions
3. materials and communication history accumulate around those records
4. reports summarise operational and financial outcomes
5. logs capture relevant system events for later diagnosis

This flow explains why the manual emphasises cross-references rather than isolated page descriptions.

## Administrative and Technical Boundaries

Most administrators operate mainly within the bookings, customers, invoices, reports, and logs areas. Technical owners extend that responsibility into deployment, services, and environment-backed configuration.

The distinction matters because some screens present operational context for all readers, while others expose actions that should only be used by the person responsible for the host and runtime.

## What Most Users Do Not Need to Manage

Routine operators ordinarily do not need to manage:

- infrastructure settings
- deploy scripts
- systemd services
- low-level secrets

Those concerns belong to the technical-owner documentation unless a controlled escalation specifically requires them.

## Related Sections

- [Start Here and Features](01-Start-Here-and-Features.md)
- [Updates and Release Visibility](11-Updates-and-Release-Visibility.md)
- [Technical Owner Runbook: Installation, Updates, and Deploy Scripts](digitalocean-admin-operations.md)
