# 02. Admin Login and Access

This chapter is written for music teachers, private studio operators, and music school administration teams using LessonFlow to run lesson scheduling, student communication, and billing with confidence.

Administrative access in LessonFlow is intentionally strict because the same session can change customer data, billing status, and notification behavior. Operators should view login as an operational control point, not just a gate screen. Every sign-in event should be deliberate, and every sign-out should be complete.

The standard login path is `/admin/login`, where the operator provides admin email, password, and CAPTCHA response. CAPTCHA exists to reduce automated abuse before server-side credential checks run. If login fails, do not repeatedly retry without diagnosis. First verify email spelling, then confirm password source, and then refresh the CAPTCHA challenge to rule out expired or stale input.

Session cookies control authenticated access across admin routes. If a cookie expires or becomes invalid, LessonFlow will redirect back to login. This behavior is expected and should be treated as a normal security boundary, not as application instability. When this happens during work, re-authenticate and return to the relevant workflow rather than attempting browser-level workaround behavior.

Credential handling should follow strict operational hygiene. Passwords should live only in approved credential storage, never in plain text notes, chat logs, or documentation files. When staffing changes occur, rotate credentials promptly and confirm successful access with a controlled verification login. If credential changes include email identity updates, coordinate the change window so operators are not interrupted mid-workflow.

Sign-out is mandatory at the end of each active admin session, especially on shared or multi-user devices. A complete sign-out ensures the next user cannot inherit administrative state. In operational audits, incomplete sign-out is one of the most common preventable risks.
