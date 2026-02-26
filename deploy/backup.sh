#!/bin/bash
# =============================================================================
# Melbourne Guitar School - Automatic Backup Script
# =============================================================================
# This script is called by cron for automatic backups.
# It creates backup archives and optionally uploads to cloud storage.
#
# Usage: ./deploy/backup.sh [options]
#
# Options:
#   --frequency FREQ    Backup frequency (hourly, daily, weekly, custom)
#   --upload            Upload to cloud provider after backup
#   --no-upload         Skip cloud upload (local backup only)
#   --help, -h          Show usage
# =============================================================================

set -euo pipefail

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOY_DIR="/var/www/melbourne-guitar-school"
SHARED_DIR="${DEPLOY_DIR}/shared"
CURRENT_LINK="${DEPLOY_DIR}/current"
LOG_DIR="/var/log/melbourne-guitar-school"
BACKUP_DIR="${DEPLOY_DIR}/backups"
SEO_CONFIG_FILE="${REPO_ROOT}/src/lib/seo-config.json"

# Default configuration
BACKUP_FREQUENCY="daily"
CLOUD_UPLOAD=false
BACKUP_CLOUD_PROVIDER="none"
BACKUP_CLOUD_FOLDER="melbourne-guitar-school-backups"
BACKUP_RETENTION_DAYS=30

# Cloud credentials (loaded from .env)
GDRIVE_CLIENT_ID=""
GDRIVE_CLIENT_SECRET=""
GDRIVE_REFRESH_TOKEN=""
KOOFR_WEBDAV_URL=""
KOOFR_USERNAME=""
KOOFR_PASSWORD=""

# Colors (simplified for cron logging)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Logging
mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/backup-$(date +%Y%m%d).log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

log_error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "${LOG_FILE}" >&2
}

show_usage() {
  cat <<'EOF'
Melbourne Guitar School - Automatic Backup Script

Usage: ./deploy/backup.sh [options]

Options:
  --frequency FREQ    Backup frequency (hourly, daily, weekly, custom)
  --upload            Upload to cloud provider after backup
  --no-upload         Skip cloud upload (local backup only)
  --help, -h          Show usage
EOF
}

# Load configuration from shared .env
load_config() {
  if [[ -f "${SHARED_DIR}/.env" ]]; then
    # Cloud provider configuration
    BACKUP_CLOUD_PROVIDER="$(grep -o 'BACKUP_CLOUD_PROVIDER[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || echo "none")"
    BACKUP_CLOUD_FOLDER="$(grep -o 'BACKUP_CLOUD_FOLDER[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || echo "melbourne-guitar-school-backups")"
    BACKUP_RETENTION_DAYS="$(grep -o 'BACKUP_RETENTION_DAYS[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || echo "30")"
    
    # Google Drive credentials
    GDRIVE_CLIENT_ID="$(grep -o 'GDRIVE_CLIENT_ID[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
    GDRIVE_CLIENT_SECRET="$(grep -o 'GDRIVE_CLIENT_SECRET[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
    GDRIVE_REFRESH_TOKEN="$(grep -o 'GDRIVE_REFRESH_TOKEN[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
    
    # Koofr WebDAV credentials
    KOOFR_WEBDAV_URL="$(grep -o 'KOOFR_WEBDAV_URL[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
    KOOFR_USERNAME="$(grep -o 'KOOFR_USERNAME[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
    KOOFR_PASSWORD="$(grep -o 'KOOFR_PASSWORD[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
  fi
  
  # Ensure directories exist
  mkdir -p "${BACKUP_DIR}"
  mkdir -p "${LOG_DIR}"
}

# Create database dump
create_database_dump() {
  local output_file="$1"
  local database_url=""
  
  if [[ -f "${SHARED_DIR}/.env" ]]; then
    database_url="$(grep -o 'DATABASE_URL[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
  fi
  
  if [[ -z "${database_url}" ]]; then
    log_error "DATABASE_URL not found in shared .env"
    return 1
  fi
  
  # Parse MySQL credentials from DATABASE_URL
  local db_user="" db_pass="" db_host="" db_port="3306" db_name=""
  local url_without_prefix="${database_url#mysql://}"
  
  if [[ "${url_without_prefix}" == */* ]]; then
    local creds_and_host="${url_without_prefix%%/*}"
    db_name="${url_without_prefix#*/}"
    db_name="${db_name%%\?*}"
    
    if [[ "${creds_and_host}" == *@* ]]; then
      local creds="${creds_and_host%@*}"
      local host_and_port="${creds_and_host#*@}"
      
      if [[ "${creds}" == *:* ]]; then
        db_user="${creds%%:*}"
        db_pass="${creds#*:}"
      else
        db_user="${creds}"
      fi
      
      if [[ "${host_and_port}" == *:* ]]; then
        db_host="${host_and_port%%:*}"
        db_port="${host_and_port#*:}"
      else
        db_host="${host_and_port}"
      fi
    fi
  fi
  
  if [[ -z "${db_user}" || -z "${db_name}" ]]; then
    log_error "Could not parse database credentials from DATABASE_URL"
    return 1
  fi
  
  log "Creating database dump: ${db_name}@${db_host}:${db_port}"
  
  # Create database dump
  if command -v mysqldump >/dev/null 2>&1; then
    MYSQL_PWD="${db_pass}" mysqldump \
      -h "${db_host}" \
      -P "${db_port}" \
      -u "${db_user}" \
      --single-transaction \
      --quick \
      --lock-tables=false \
      "${db_name}" > "${output_file}" 2>/dev/null
    return $?
  elif command -v mariadb-dump >/dev/null 2>&1; then
    MYSQL_PWD="${db_pass}" mariadb-dump \
      -h "${db_host}" \
      -P "${db_port}" \
      -u "${db_user}" \
      --single-transaction \
      --quick \
      "${db_name}" > "${output_file}" 2>/dev/null
    return $?
  else
    log_error "mysqldump or mariadb-dump not found"
    return 1
  fi
}

# Create backup archive
create_backup_archive() {
  local timestamp="$1"
  local backup_name="backup-${timestamp}"
  local temp_dir=""
  local archive_file="${BACKUP_DIR}/${backup_name}.tar.gz"
  
  temp_dir="$(mktemp -d)"
  mkdir -p "${temp_dir}/${backup_name}"
  
  log "Creating backup archive..."
  
  # 1. Database dump
  if ! create_database_dump "${temp_dir}/${backup_name}/database.sql"; then
    log "Warning: Database dump failed, continuing with other backups"
  else
    log "✓ Database dump created"
  fi
  
  # 2. Shared .env file
  if [[ -f "${SHARED_DIR}/.env" ]]; then
    cp "${SHARED_DIR}/.env" "${temp_dir}/${backup_name}/"
    log "✓ Included shared .env"
  fi
  
  # 3. Learning materials
  local materials_dir="${REPO_ROOT}/.data/learning-materials"
  if [[ -d "${materials_dir}" ]]; then
    cp -r "${materials_dir}" "${temp_dir}/${backup_name}/learning-materials"
    log "✓ Included learning materials"
  fi
  
  # 4. Documentation
  if [[ -d "${REPO_ROOT}/Documentation" ]]; then
    cp -r "${REPO_ROOT}/Documentation" "${temp_dir}/${backup_name}/"
    log "✓ Included documentation"
  fi
  
  # 5. SEO config
  if [[ -f "${SEO_CONFIG_FILE}" ]]; then
    cp "${SEO_CONFIG_FILE}" "${temp_dir}/${backup_name}/"
    log "✓ Included SEO config"
  fi
  
  # Create compressed archive
  tar -czf "${archive_file}" -C "${temp_dir}" "${backup_name}" 2>/dev/null
  
  # Cleanup temp directory
  rm -rf "${temp_dir}"
  
  if [[ -f "${archive_file}" ]]; then
    local size=""
    size="$(du -h "${archive_file}" | cut -f1)"
    log "✓ Backup created: ${archive_file} (${size})"
    echo "${archive_file}"
    return 0
  else
    log_error "Failed to create backup archive"
    return 1
  fi
}

# Upload to Google Drive
upload_to_google_drive() {
  local file_path="$1"
  local folder_name="${BACKUP_CLOUD_FOLDER}"
  
  if [[ -z "${GDRIVE_CLIENT_ID}" || -z "${GDRIVE_CLIENT_SECRET}" || -z "${GDRIVE_REFRESH_TOKEN}" ]]; then
    log_error "Google Drive credentials not configured"
    return 1
  fi
  
  log "Uploading to Google Drive..."
  
  # Get access token using refresh token
  local token_response=""
  token_response="$(curl -s -X POST \
    "https://oauth2.googleapis.com/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=${GDRIVE_CLIENT_ID}" \
    -d "client_secret=${GDRIVE_CLIENT_SECRET}" \
    -d "refresh_token=${GDRIVE_REFRESH_TOKEN}" \
    -d "grant_type=refresh_token" 2>/dev/null || true)"
  
  local access_token=""
  access_token="$(echo "${token_response}" | grep -o '"access_token"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"\([^"]*\)"/\1/' || true)"
  
  if [[ -z "${access_token}" ]]; then
    log_error "Failed to get Google Drive access token"
    return 1
  fi
  
  # Get or create backup folder
  local folder_id=""
  local folder_response=""
  folder_response="$(curl -s \
    "https://www.googleapis.com/drive/v3/files?q=name='${folder_name}'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false" \
    -H "Authorization: Bearer ${access_token}" 2>/dev/null || true)"
  
  folder_id="$(echo "${folder_response}" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*: *"\([^"]*\)"/\1/' || true)"
  
  if [[ -z "${folder_id}" ]]; then
    local create_response=""
    create_response="$(curl -s -X POST \
      "https://www.googleapis.com/drive/v3/files" \
      -H "Authorization: Bearer ${access_token}" \
      -H "Content-Type: application/json" \
      -d "{\"name\": \"${folder_name}\", \"mimeType\": \"application/vnd.google-apps.folder\"}" 2>/dev/null || true)"
    
    folder_id="$(echo "${create_response}" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"\([^"]*\)"/\1/' || true)"
  fi
  
  if [[ -z "${folder_id}" ]]; then
    log_error "Failed to get/create Google Drive folder"
    return 1
  fi
  
  # Upload file using resumable upload for large files
  local file_name=""
  file_name="$(basename "${file_path}")"
  local file_size=""
  file_size="$(stat -c%s "${file_path}" 2>/dev/null || stat -f%z "${file_path}" 2>/dev/null || echo "0")"
  
  # For files < 5MB, use simple upload
  if [[ "${file_size}" -lt 5242880 ]]; then
    local upload_response=""
    upload_response="$(curl -s -X POST \
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart" \
      -H "Authorization: Bearer ${access_token}" \
      -H "Content-Type: multipart/related; boundary=foo_bar_baz" \
      --data-binary @- <<EOF
--foo_bar_baz
Content-Type: application/json; charset=UTF-8

{"name": "${file_name}", "parents": ["${folder_id}"]}
--foo_bar_baz
Content-Type: application/octet-stream

$(cat "${file_path}")
--foo_bar_baz--
EOF
    )"
    
    local upload_id=""
    upload_id="$(echo "${upload_response}" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"\([^"]*\)"/\1/' || true)"
    
    if [[ -n "${upload_id}" ]]; then
      log "✓ Uploaded to Google Drive: ${file_name}"
      return 0
    else
      log_error "Failed to upload to Google Drive"
      return 1
    fi
  else
    # For files >= 5MB, use resumable upload
    log "File is large (${file_size} bytes), using resumable upload..."
    
    # Start resumable upload session
    local upload_url=""
    upload_url="$(curl -s -X POST \
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable" \
      -H "Authorization: Bearer ${access_token}" \
      -H "Content-Type: application/json; charset=UTF-8" \
      -d "{\"name\": \"${file_name}\", \"parents\": [\"${folder_id}\"]}" \
      -D - 2>/dev/null | grep -i "^Location:" | head -1 | sed 's/Location: //i' | tr -d '\r')"
    
    if [[ -z "${upload_url}" ]]; then
      log_error "Failed to start resumable upload session"
      return 1
    fi
    
    # Upload file content
    local upload_response=""
    upload_response="$(curl -s -X PUT \
      "${upload_url}" \
      -H "Authorization: Bearer ${access_token}" \
      -H "Content-Type: application/octet-stream" \
      --data-binary @"${file_path}" 2>/dev/null || true)"
    
    local upload_id=""
    upload_id="$(echo "${upload_response}" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"\([^"]*\)"/\1/' || true)"
    
    if [[ -n "${upload_id}" ]]; then
      log "✓ Uploaded to Google Drive: ${file_name}"
      return 0
    else
      log_error "Failed to upload to Google Drive"
      return 1
    fi
  fi
}

# Upload to Koofr via WebDAV
upload_to_koofr_webdav() {
  local file_path="$1"
  
  if [[ -z "${KOOFR_WEBDAV_URL}" || -z "${KOOFR_USERNAME}" || -z "${KOOFR_PASSWORD}" ]]; then
    log_error "Koofr WebDAV credentials not configured"
    return 1
  fi
  
  log "Uploading to Koofr via WebDAV..."
  
  local file_name=""
  file_name="$(basename "${file_path}")"
  local remote_path="${KOOFR_WEBDAV_URL}/${BACKUP_CLOUD_FOLDER}/${file_name}"
  
  # Create folder if it doesn't exist
  curl -s -X MKCOL \
    -u "${KOOFR_USERNAME}:${KOOFR_PASSWORD}" \
    "${KOOFR_WEBDAV_URL}/${BACKUP_CLOUD_FOLDER}" >/dev/null 2>&1 || true
  
  # Upload using curl PUT
  local http_code=""
  http_code="$(curl -s -o /dev/null -w "%{http_code}" \
    -T "${file_path}" \
    -u "${KOOFR_USERNAME}:${KOOFR_PASSWORD}" \
    "${remote_path}" 2>/dev/null || echo "000")"
  
  if [[ "${http_code}" == "201" || "${http_code}" == "200" || "${http_code}" == "204" ]]; then
    log "✓ Uploaded to Koofr: ${file_name}"
    return 0
  else
    log_error "Failed to upload to Koofr (HTTP ${http_code})"
    return 1
  fi
}

# Cleanup old backups
cleanup_old_backups() {
  log "Cleaning up backups older than ${BACKUP_RETENTION_DAYS} days..."
  
  local deleted=0
  while IFS= read -r -d '' file; do
    rm -f "${file}"
    ((deleted++)) || true
  done < <(find "${BACKUP_DIR}" -name "backup-*.tar.gz" -type f -mtime +${BACKUP_RETENTION_DAYS} -print0 2>/dev/null)
  
  if (( deleted > 0 )); then
    log "✓ Deleted ${deleted} old backup(s)"
  else
    log "No old backups to delete"
  fi
}

# Main backup function
run_backup() {
  log "=========================================="
  log "Starting automatic backup"
  log "Frequency: ${BACKUP_FREQUENCY}"
  log "Cloud Provider: ${BACKUP_CLOUD_PROVIDER}"
  log "Upload: ${CLOUD_UPLOAD}"
  log "=========================================="
  
  local timestamp=""
  timestamp="$(date +%Y%m%d-%H%M%S)"
  
  # Create backup archive
  local archive_file=""
  archive_file="$(create_backup_archive "${timestamp}")" || {
    log_error "Backup archive creation failed"
    exit 1
  }
  
  # Upload to cloud if configured
  if [[ "${CLOUD_UPLOAD}" == "true" ]]; then
    case "${BACKUP_CLOUD_PROVIDER}" in
      google-drive)
        upload_to_google_drive "${archive_file}" || log "Warning: Google Drive upload failed"
        ;;
      koofr)
        upload_to_koofr_webdav "${archive_file}" || log "Warning: Koofr upload failed"
        ;;
      *)
        log "Cloud provider not configured, skipping upload"
        ;;
    esac
  fi
  
  # Cleanup old backups
  cleanup_old_backups
  
  log "=========================================="
  log "Backup completed successfully"
  log "=========================================="
  
  return 0
}

# Parse CLI arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --frequency)
      BACKUP_FREQUENCY="$2"
      shift 2
      ;;
    --upload)
      CLOUD_UPLOAD=true
      shift
      ;;
    --no-upload)
      CLOUD_UPLOAD=false
      shift
      ;;
    --help|-h)
      show_usage
      exit 0
      ;;
    *)
      log_error "Unknown argument: $1"
      show_usage
      exit 1
      ;;
  esac
done

# Load configuration and run backup
load_config
run_backup
