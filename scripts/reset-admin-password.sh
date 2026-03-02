#!/usr/bin/env bash

# =============================================================================
# Reset Admin Password (Server Helper)
# =============================================================================
# Resets an existing admin user's password in the database using Prisma.
#
# Key design choices:
# - Loads runtime environment variables from the deployed shared env file
#   (/var/www/lessonflow/shared/.env by default) so DATABASE_URL and
#   secrets match the production deployment.
# - Uses Prisma + bcryptjs from the application install to update the stored
#   password hash (changing ADMIN_PASSWORD in .env alone does not update the DB).
# - Prompts for the new password without echoing to avoid terminal/history leaks.
#
# Usage examples:
#   ./scripts/reset-admin-password.sh
#   ./scripts/reset-admin-password.sh --email owner@example.com
#   sudo ./scripts/reset-admin-password.sh --app-dir /var/www/lessonflow/current
#   sudo ./scripts/reset-admin-password.sh --list
# =============================================================================

set -euo pipefail

ENV_FILE="/var/www/lessonflow/shared/.env"
APP_DIR="/var/www/lessonflow/current"
TARGET_ADMIN_EMAIL=""
NEW_PASSWORD_INPUT=""
LIST_ONLY=false

# Prints command usage and common examples for operators.
show_usage() {
  cat <<'EOF'
Reset Admin Password (Prisma + MySQL)

Usage:
  ./scripts/reset-admin-password.sh [options]

Options:
  --email EMAIL       Admin email to reset (defaults to ADMIN_EMAIL from env file if present)
  --password VALUE    New password (not recommended; prompts securely by default)
  --env-file PATH     Path to deployed .env file (default: /var/www/lessonflow/shared/.env)
  --app-dir PATH      Path to deployed app directory with node_modules (default: /var/www/lessonflow/current)
  --list              List admin users from DB and exit
  --help, -h          Show this help text

Examples:
  sudo ./scripts/reset-admin-password.sh
  sudo ./scripts/reset-admin-password.sh --email owner@example.com
  sudo ./scripts/reset-admin-password.sh --list
EOF
}

# Small consistent prefix for script status lines.
log_info() {
  echo "● $1"
}

# Small consistent prefix for warnings.
log_warn() {
  echo "▲ $1"
}

# Small consistent prefix for fatal errors.
log_error() {
  echo "✖ $1" >&2
}

# Parses CLI flags and validates required option values.
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --email)
        [[ $# -lt 2 ]] && { log_error "--email requires a value"; exit 1; }
        TARGET_ADMIN_EMAIL="$2"
        shift 2
        ;;
      --password)
        [[ $# -lt 2 ]] && { log_error "--password requires a value"; exit 1; }
        NEW_PASSWORD_INPUT="$2"
        shift 2
        ;;
      --env-file)
        [[ $# -lt 2 ]] && { log_error "--env-file requires a value"; exit 1; }
        ENV_FILE="$2"
        shift 2
        ;;
      --app-dir)
        [[ $# -lt 2 ]] && { log_error "--app-dir requires a value"; exit 1; }
        APP_DIR="$2"
        shift 2
        ;;
      --list)
        LIST_ONLY=true
        shift
        ;;
      --help|-h)
        show_usage
        exit 0
        ;;
      *)
        log_error "Unknown option: $1"
        show_usage
        exit 1
        ;;
    esac
  done
}

# Ensures the expected files/commands exist before touching the database.
validate_environment() {
  command -v node >/dev/null 2>&1 || { log_error "node is required but not found in PATH."; exit 1; }

  if [[ ! -f "${ENV_FILE}" ]]; then
    log_error "Env file not found: ${ENV_FILE}"
    exit 1
  fi

  if [[ ! -d "${APP_DIR}" ]]; then
    log_error "App directory not found: ${APP_DIR}"
    exit 1
  fi

  if [[ ! -f "${APP_DIR}/package.json" ]]; then
    log_error "package.json not found in app directory: ${APP_DIR}"
    exit 1
  fi
}

# Loads environment variables from the deployed shared env file.
# Shell sourcing is intentional here so quoted values (for example SMTP_FROM)
# are interpreted exactly like the runtime shell environment.
load_env_file() {
  log_info "Loading env from ${ENV_FILE}"
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a

  if [[ -z "${DATABASE_URL:-}" ]]; then
    log_error "DATABASE_URL is missing after loading ${ENV_FILE}"
    exit 1
  fi
}

# Lists admin users to help operators choose the correct target email.
list_admins() {
  log_info "Listing admin users from database..."
  (
    cd "${APP_DIR}"
    npx tsx --input-type=module <<'NODE'
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import PrismaGenerated from "./src/generated/prisma/client.ts";

(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaMariaDb(connectionString);
  const prisma = new PrismaGenerated.PrismaClient({ adapter });

  try {
    const admins = await prisma.adminUser.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        email: true,
        displayName: true,
        isActive: true,
        createdAt: true
      }
    });

    if (admins.length === 0) {
      console.log("No admin users found.");
      return;
    }

    console.table(admins);
  } finally {
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
  )
}

# Prompts for missing input values, using ADMIN_EMAIL from env as a default hint
# when available. Password entry is hidden and confirmed to avoid typos.
prompt_for_missing_inputs() {
  local default_email="${ADMIN_EMAIL:-}"
  local input_email=""

  if [[ -z "${TARGET_ADMIN_EMAIL}" ]]; then
    if [[ -n "${default_email}" ]]; then
      read -r -p "Admin email to reset [${default_email}]: " input_email
      TARGET_ADMIN_EMAIL="${input_email:-${default_email}}"
    else
      read -r -p "Admin email to reset: " TARGET_ADMIN_EMAIL
    fi
  fi

  if [[ -z "${NEW_PASSWORD_INPUT}" ]]; then
    local confirm_password=""
    read -rsp "New admin password: " NEW_PASSWORD_INPUT
    echo
    read -rsp "Confirm new admin password: " confirm_password
    echo

    if [[ "${NEW_PASSWORD_INPUT}" != "${confirm_password}" ]]; then
      log_error "Passwords do not match."
      exit 1
    fi
  else
    log_warn "Using password passed via --password. Prefer interactive prompt to avoid shell history exposure."
  fi

  TARGET_ADMIN_EMAIL="$(printf '%s' "${TARGET_ADMIN_EMAIL}" | tr '[:upper:]' '[:lower:]' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"

  if [[ -z "${TARGET_ADMIN_EMAIL}" ]]; then
    log_error "Admin email is required."
    exit 1
  fi

  if [[ -z "${NEW_PASSWORD_INPUT}" ]]; then
    log_error "Password is required."
    exit 1
  fi
}

# Updates the admin user's password hash in the database with bcrypt cost 12 to
# match setup-time hashing behavior.
reset_password() {
  log_info "Resetting admin password for ${TARGET_ADMIN_EMAIL}"

  (
    cd "${APP_DIR}"
    ADMIN_EMAIL_TO_RESET="${TARGET_ADMIN_EMAIL}" NEW_ADMIN_PASSWORD="${NEW_PASSWORD_INPUT}" npx tsx --input-type=module <<'NODE'
import bcrypt from "bcryptjs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import PrismaGenerated from "./src/generated/prisma/client.ts";

(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaMariaDb(connectionString);
  const prisma = new PrismaGenerated.PrismaClient({ adapter });

  try {
    const email = String(process.env.ADMIN_EMAIL_TO_RESET || "").trim().toLowerCase();
    const password = String(process.env.NEW_ADMIN_PASSWORD || "");

    if (!email || !password) {
      throw new Error("Missing admin email or password input.");
    }

    const user = await prisma.adminUser.findUnique({
      where: { email },
      select: { email: true, isActive: true }
    });

    if (!user) {
      const admins = await prisma.adminUser.findMany({
        orderBy: { createdAt: "asc" },
        select: { email: true, isActive: true }
      });
      console.error(`Admin not found: ${email}`);
      if (admins.length > 0) {
        console.error("Existing admin emails:");
        for (const admin of admins) {
          console.error(`- ${admin.email} (${admin.isActive ? "active" : "inactive"})`);
        }
      }
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.adminUser.update({
      where: { email },
      data: {
        passwordHash,
        isActive: true
      }
    });

    console.log(`Admin password reset for ${email}`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
  )

  # Reduce accidental exposure in child process environments after completion.
  unset NEW_PASSWORD_INPUT
}

# Entry point that wires together validation, env loading, prompts, and reset.
main() {
  parse_args "$@"
  validate_environment
  load_env_file

  if [[ "${LIST_ONLY}" == true ]]; then
    list_admins
    exit 0
  fi

  prompt_for_missing_inputs
  reset_password
  log_info "Done. No app restart is required for a DB password reset."
}

main "$@"
