# 12. How LessonFlow Works

<div class="manual-callout info">
<strong>Security note:</strong> This chapter explains the system at a safe high level. It is for understanding how the product fits together, not for exposing live infrastructure details or security-sensitive internals.
</div>

## The Main Parts of LessonFlow

LessonFlow is made up of several connected parts:

- a public website for enquiries and booking requests
- an admin console for operations, billing, configuration, and diagnostics
- a student portal for lesson access and materials
- a database that stores operational records
- email and reporting services
- a VPS deployment environment managed with scripts and services

## How the Pieces Work Together

At a high level:

1. the public site or student portal creates requests and support activity
2. the admin console processes those records into live bookings, customer records, and invoices
3. customers and lessons feed materials, communication history, and billing actions
4. reports summarize what happened
5. logs record important technical and operational events

## What Each Subsystem Is Responsible For

### Public pages

- attract enquiries
- collect booking and contact submissions

### Admin console

- daily lesson operations
- customer care
- billing
- reporting
- diagnostics
- controlled configuration

### Student portal

- student login
- lesson request and cancellation actions
- materials access

### Data layer

- stores bookings, requests, customers, invoices, materials, and operational history

### Email and reporting

- sends automated or manual emails
- produces summaries and scheduled operational outputs

### Deployment layer

- installs and updates the system
- runs background services and scheduled jobs

## What Most Users Do Not Need to Manage

Most operators do not need to change:

- infrastructure settings
- deploy scripts
- service configuration
- low-level secrets

Those belong to the technical-owner appendix.
