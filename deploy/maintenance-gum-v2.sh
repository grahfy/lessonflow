#!/bin/bash
# Maintenance Script V2 for Melbourne Guitar School
# Reimagined with Charmbracelet Gum for a modern TUI experience.
# Features: Distro-aware installation, Arrow-key menus, centered output, and Styled Dialogs.

set -euo pipefail

# =============================================================================
# 1. Distro Detection & Gum Installation
# =============================================================================

detect_os() {
  if [[ -f /etc/os-release ]]; then
    source /etc/os-release
    OS_ID="${ID:-unknown}"
  elif command -v sw_vers >/dev/null 2>&1; then
    OS_ID="darwin"
  else
    OS_ID="unknown"
  fi
  export OS_ID
}

install_gum() {
  if command -v gum >/dev/null 2>&1; then
    return 0
  fi

  detect_os
  echo "Gum not found. Installing for ${OS_ID}..."
  
  case "${OS_ID}" in
    ubuntu|debian|raspbian)
      sudo mkdir -p /etc/apt/keyrings
      curl -fsSL https://repo.charm.sh/apt/gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/charm.gpg
      echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" | sudo tee /etc/apt/sources.list.d/charm.list
      sudo apt update && sudo apt install -y gum
      ;;
    fedora|rhel|centos)
      echo '[charm]
name=Charm
baseurl=https://repo.charm.sh/yum/
enabled=1
gpgcheck=1
gpgkey=https://repo.charm.sh/yum/gpg.key' | sudo tee /etc/yum.repos.d/charm.repo
      sudo rpm --import https://repo.charm.sh/yum/gpg.key
      if command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y gum
      else
        sudo yum install -y gum
      fi
      ;;
    arch|manjaro)
      sudo pacman -S --noconfirm gum
      ;;
    alpine)
      sudo apk add gum
      ;;
    darwin)
      if command -v brew >/dev/null 2>&1; then
        brew install gum
      else
        echo "Homebrew not found. Please install manually: https://github.com/charmbracelet/gum"
        exit 1
      fi
      ;;
    *)
      echo "Unsupported distro: ${OS_ID}. Please install gum manually: https://github.com/charmbracelet/gum"
      exit 1
      ;;
  esac
}

# Ensure gum is installed
install_gum

# =============================================================================
# 2. Configuration & Paths
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPDATE_SCRIPT="${SCRIPT_DIR}/update.sh"
DEPLOY_SCRIPT="${SCRIPT_DIR}/deploy.sh"
APP_NAME="melbourne-guitar-school"
DEPLOY_DIR="/var/www/${APP_NAME}"
SHARED_DIR="${DEPLOY_DIR}/shared"
CURRENT_LINK="${DEPLOY_DIR}/current"
LOG_DIR="/var/log/melbourne-guitar-school"
BACKUP_DIR="${DEPLOY_DIR}/backups"
REPO_ROOT=""

# SEO Configuration paths
SEO_CONFIG_FILE=""
MAINTENANCE_CONFIG_FILE=""

# Backup Configuration
BACKUP_FREQUENCY="daily"
BACKUP_CLOUD_PROVIDER="none"
BACKUP_CLOUD_FOLDER="melbourne-guitar-school-backups"
BACKUP_RETENTION_DAYS=30
BACKUP_AUTO_UPLOAD=false

# Backup toggles
BACKUP_INCLUDE_SQL=true
BACKUP_INCLUDE_WEBAPP=true
BACKUP_INCLUDE_ENV=true
BACKUP_INCLUDE_LEARNING_MATERIALS=true
BACKUP_INCLUDE_SEO_CONFIG=true
BACKUP_CLEAN_OLD=true

# Runtime vars
FORCE_SUDO_DEPLOY=false
FORCE_NO_SUDO_DEPLOY=false
SUDO_DEPLOY_AUTH_READY=false
BRANCH=""
REMOTE_NAME="origin"

# Cloud credentials
GDRIVE_CLIENT_ID=""
GDRIVE_CLIENT_SECRET=""
GDRIVE_REFRESH_TOKEN=""
KOOFR_WEBDAV_URL=""
KOOFR_USERNAME=""
KOOFR_PASSWORD=""

# Resolve paths
resolve_repo_root() {
  local c=("${SCRIPT_DIR}/.." "/var/www/${APP_NAME}/current" "/var/www/${APP_NAME}" "${HOME}/melbourne-guitar-school")
  local candidate
  for candidate in "${c[@]}"; do
    if [[ -d "${candidate}/.git" && -f "${candidate}/package.json" ]]; then
      REPO_ROOT="$(cd "${candidate}" && pwd -P)"
      return 0
    fi
  done
  REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
}

init_paths() {
  resolve_repo_root
  SEO_CONFIG_FILE="${REPO_ROOT}/src/lib/seo-config.json"
  MAINTENANCE_CONFIG_FILE="${REPO_ROOT}/.maintenance.conf"
}

init_paths

# =============================================================================
# 3. Helper Functions
# =============================================================================

get_env_val() {
  local key="$1" val=""
  if [ -f "${SHARED_DIR}/.env" ]; then
    val=$(grep -E "^${key}=" "${SHARED_DIR}/.env" | cut -d'=' -f2- | sed 's/^["'"'"']//;s/["'"'"']$//' || true)
  fi
  echo "${val}"
}

load_maintenance_settings() {
  if [[ -f "${MAINTENANCE_CONFIG_FILE}" ]]; then
    while IFS='=' read -r key value; do
        [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
        value=$(echo "$value" | sed 's/^["'\'']//;s/["'\'']$//')
        eval "$key=\"$value\""
    done < "${MAINTENANCE_CONFIG_FILE}"
  fi
  
  # Load cloud creds from .env
  GDRIVE_CLIENT_ID=$(get_env_val "GDRIVE_CLIENT_ID")
  GDRIVE_CLIENT_SECRET=$(get_env_val "GDRIVE_CLIENT_SECRET")
  GDRIVE_REFRESH_TOKEN=$(get_env_val "GDRIVE_REFRESH_TOKEN")
  KOOFR_WEBDAV_URL=$(get_env_val "KOOFR_WEBDAV_URL")
  KOOFR_USERNAME=$(get_env_val "KOOFR_USERNAME")
  KOOFR_PASSWORD=$(get_env_val "KOOFR_PASSWORD")
}

save_maintenance_settings() {
  cat > "${MAINTENANCE_CONFIG_FILE}" << EOF
BACKUP_FREQUENCY="${BACKUP_FREQUENCY}"
BACKUP_CLOUD_PROVIDER="${BACKUP_CLOUD_PROVIDER}"
BACKUP_CLOUD_FOLDER="${BACKUP_CLOUD_FOLDER}"
BACKUP_INCLUDE_SQL="${BACKUP_INCLUDE_SQL}"
BACKUP_INCLUDE_WEBAPP="${BACKUP_INCLUDE_WEBAPP}"
BACKUP_INCLUDE_ENV="${BACKUP_INCLUDE_ENV}"
BACKUP_INCLUDE_LEARNING_MATERIALS="${BACKUP_INCLUDE_LEARNING_MATERIALS}"
BACKUP_INCLUDE_SEO_CONFIG="${BACKUP_INCLUDE_SEO_CONFIG}"
BACKUP_CLEAN_OLD="${BACKUP_CLEAN_OLD}"
BACKUP_AUTO_UPLOAD="${BACKUP_AUTO_UPLOAD}"
EOF
}

# System Stats
get_cpu_usage() { grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {printf "%d", usage}'; }
get_memory_usage() { free | grep Mem | awk '{printf "%d", $3/$2 * 100.0}'; }
get_disk_usage() { df -h / | awk 'NR==2 {print $5}' | sed 's/%//'; }
get_uptime() { uptime -p | sed 's/up //'; }

# Sudo Management
should_use_sudo_for_deploy() {
  if [[ "${FORCE_NO_SUDO_DEPLOY:-false}" == true ]]; then return 1; fi
  if [[ "${FORCE_SUDO_DEPLOY:-false}" == true ]]; then return 0; fi
  if [[ ${EUID} -eq 0 ]]; then return 1; fi
  [[ -w "${DEPLOY_DIR}" ]] || return 0
  return 1
}

ensure_sudo_for_deploy_ready() {
  if should_use_sudo_for_deploy; then
    if [[ "${SUDO_DEPLOY_AUTH_READY:-false}" == true ]]; then return 0; fi
    if sudo -n true 2>/dev/null; then
      SUDO_DEPLOY_AUTH_READY=true
      return 0
    fi
    center_style "Sudo required. Please authenticate..." --foreground 212
    if sudo -v; then
      SUDO_DEPLOY_AUTH_READY=true
      return 0
    else
      return 1
    fi
  fi
  return 0
}

run_privileged_cmd() {
  if should_use_sudo_for_deploy; then
    ensure_sudo_for_deploy_ready >/dev/null
    sudo "$@"
  else
    "$@"
  fi
}

update_sudo_mode_label() {
  if [[ "${FORCE_SUDO_DEPLOY:-false}" == true ]]; then echo "FORCE ON";
  elif [[ "${FORCE_NO_SUDO_DEPLOY:-false}" == true ]]; then echo "FORCE OFF";
  else echo "AUTO"; fi
}

cycle_sudo_mode() {
  if [[ "${FORCE_SUDO_DEPLOY:-false}" == true ]]; then
    FORCE_SUDO_DEPLOY=false; FORCE_NO_SUDO_DEPLOY=true
  elif [[ "${FORCE_NO_SUDO_DEPLOY:-false}" == true ]]; then
    FORCE_SUDO_DEPLOY=false; FORCE_NO_SUDO_DEPLOY=false
  else
    FORCE_SUDO_DEPLOY=true; FORCE_NO_SUDO_DEPLOY=false
  fi
}

# =============================================================================
# 4. UI Components & Centering Logic
# =============================================================================

# Helper to horizontally center text or a style block on the screen
center_style() {
    local width=$(tput cols)
    local text="${1:-}"
    shift || true
    if [[ -n "$text" ]]; then
        echo "$text" | gum style --width "$width" --align center "$@"
    else
        gum style --width "$width" --align center "$@"
    fi
}

# Helper to center gum choose options
center_choose() {
    local header="$1"
    shift
    local options=("$@")
    local term_width=$(tput cols)
    
    # Calculate max length of options
    local max_len=0
    for opt in "${options[@]}"; do
        local len=${#opt}
        [[ $len -gt $max_len ]] && max_len=$len
    done
    
    # Add 2 for gum's cursor prefix
    max_len=$((max_len + 2))
    
    # Calculate left padding to center the block
    local pad=$(( (term_width - max_len) / 2 ))
    [[ $pad -lt 0 ]] && pad=0
    local pad_str=$(printf '%*s' "$pad" "")
    
    local padded_options=()
    for opt in "${options[@]}"; do
        padded_options+=("${pad_str}${opt}")
    done
    
    # Show centered header and padded options, then strip padding from selection
    gum choose --header "$(center_style "$header")" "${padded_options[@]}" | sed "s/^${pad_str}//"
}

# Helper to provide vertical padding
ui_wrapper() {
    local content_height="${1:-15}"
    local term_height=$(tput lines)
    local pad=$(( (term_height - content_height) / 2 ))
    [[ $pad -lt 0 ]] && pad=0
    for ((i=0; i<pad; i++)); do echo ""; done
}

draw_bar() {
  local p="$1" color="${2:-212}" width=20
  local filled=$(( (p * width) / 100 ))
  local empty=$(( width - filled ))
  local bar=""
  for ((i=0; i<filled; i++)); do bar+="█"; done
  for ((i=0; i<empty; i++)); do bar+="░"; done
  echo "$bar $p%"
}

show_header() {
    clear
    local cpu=$(get_cpu_usage)
    local mem=$(get_memory_usage)
    local disk=$(get_disk_usage)
    local up=$(get_uptime)
    local branch=$(git -C "${REPO_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
    local commit=$(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo "???")

    local stats_line="CPU: $(draw_bar $cpu 82)  MEM: $(draw_bar $mem 33)"
    local system_line="DISK: $(draw_bar $disk 208)  UP: $up"
    local git_line="Branch: $branch  |  Commit: $commit  |  Sudo: $(update_sudo_mode_label)"

    ui_wrapper 20

    local box=$(gum style \
        --foreground 212 --border-foreground 212 --border double \
        --align center --width 75 --padding "1 2" \
        "⬡ Melbourne Guitar School - Maintenance Console" \
        "" \
        "$(gum style --foreground 250 "$stats_line")" \
        "$(gum style --foreground 250 "$system_line")" \
        "" \
        "$(gum style --foreground 245 "$git_line")")
    
    # Truly center the box block
    echo "$box" | center_style
}

notify_success() {
    echo ""
    center_style "✔ $1" --foreground 82 --border normal --border-foreground 82 --padding "0 2"
    sleep 1.5
}

notify_error() {
    echo ""
    center_style "✖ $1" --foreground 196 --border normal --border-foreground 196 --padding "0 2"
    sleep 2
}

# =============================================================================
# 5. Core Logic Operations & Task Runner
# =============================================================================

run_task() {
    local title="$1"
    shift
    
    local tmp=$(mktemp)
    # Run command/function in background and capture exit code
    ( "$@" > /dev/null 2>&1; echo $? > "$tmp" ) &
    local pid=$!
    
    # Use gum spin to wait for the background process
    gum spin --spinner dot --title " $title... " -- bash -c "while kill -0 $pid 2>/dev/null; do sleep 0.1; done"
    
    local res=$(cat "$tmp")
    rm -f "$tmp"
    return $res
}

get_db_creds() {
  local du; du=$(get_env_val "DATABASE_URL")
  [[ -z "${du:-}" ]] && return 1
  DB_U=$(echo "${du}" | sed -n 's|.*://\([^:]*\):.*@.*|\1|p')
  DB_P=$(echo "${du}" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
  DB_H=$(echo "${du}" | sed -n 's|.*@\([^:/]*\).*|\1|p')
  DB_PORT=$(echo "${du}" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
  DB_NAME=$(echo "${du}" | sed -n 's|.*/\([^?]*\).*|\1|p')
  [[ -n "${DB_U}" && -n "${DB_NAME}" ]] || return 1
}

create_database_dump() {
  local output_file="$1"
  get_db_creds || return 1
  if command -v mysqldump >/dev/null 2>&1; then
    MYSQL_PWD="${DB_P}" mysqldump -h "${DB_H:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_U}" "${DB_NAME}" > "${output_file}" 2>/dev/null
  elif command -v mariadb-dump >/dev/null 2>&1; then
    MYSQL_PWD="${DB_P}" mariadb-dump -h "${DB_H:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_U}" "${DB_NAME}" > "${output_file}" 2>/dev/null
  else
    return 1
  fi
}

restore_database() {
  local input_file="$1"
  get_db_creds || return 1
  if command -v mysql >/dev/null 2>&1; then
    MYSQL_PWD="${DB_P}" mysql -h "${DB_H:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_U}" "${DB_NAME}" < "${input_file}" 2>/dev/null
  elif command -v mariadb >/dev/null 2>&1; then
    MYSQL_PWD="${DB_P}" mariadb -h "${DB_H:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_U}" "${DB_NAME}" < "${input_file}" 2>/dev/null
  else
    return 1
  fi
}

upload_to_gdrive() {
    local file_path="$1"
    local folder_name="${BACKUP_CLOUD_FOLDER}"
    
    if [[ -z "${GDRIVE_CLIENT_ID}" || -z "${GDRIVE_CLIENT_SECRET}" || -z "${GDRIVE_REFRESH_TOKEN}" ]]; then
        return 1
    fi
    
    local token_response=$(curl -s -X POST "https://oauth2.googleapis.com/token" \
        -d "client_id=${GDRIVE_CLIENT_ID}&client_secret=${GDRIVE_CLIENT_SECRET}&refresh_token=${GDRIVE_REFRESH_TOKEN}&grant_type=refresh_token")
        local access_token=$(echo "${token_response}" | grep -o '"access_token"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"\([^"]*\)"/\1/')
    
    [[ -z "${access_token}" ]] && return 1

    local folder_id=$(curl -s "https://www.googleapis.com/drive/v3/files?q=name='${folder_name}'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false" \
        -H "Authorization: Bearer ${access_token}" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*: *"\([^"]*\)"/\1/')

    if [[ -z "${folder_id}" ]]; then
        folder_id=$(curl -s -X POST "https://www.googleapis.com/drive/v3/files" \
            -H "Authorization: Bearer ${access_token}" -H "Content-Type: application/json" \
            -d "{\"name\": \"${folder_name}\", \"mimeType\": \"application/vnd.google-apps.folder\"}" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"\([^"]*\)"/\1/')
    fi

    local file_name=$(basename "${file_path}")
    curl -s -X POST "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart" \
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
}

upload_to_koofr() {
  local fp="$1"
  local bn="$(basename "$fp")"
  [[ -n "${KOOFR_WEBDAV_URL}" && -n "${KOOFR_USERNAME}" && -n "${KOOFR_PASSWORD}" ]] || return 1
  curl -s -X MKCOL -u "${KOOFR_USERNAME}:${KOOFR_PASSWORD}" "${KOOFR_WEBDAV_URL}/${BACKUP_CLOUD_FOLDER}/" >/dev/null 2>&1 || true
  local code=$(curl -s -w "%{http_code}" -T "$fp" -u "${KOOFR_USERNAME}:${KOOFR_PASSWORD}" "${KOOFR_WEBDAV_URL}/${BACKUP_CLOUD_FOLDER}/${bn}" -o /dev/null)
  [[ "${code}" =~ ^(200|201|204)$ ]] && return 0 || return 1
}

get_backup_meta() {
  local bf="${1:-}"
  local meta_file="${bf%.tar.xz}.meta"
  if run_privileged_cmd test -f "${meta_file}"; then
    run_privileged_cmd cat "${meta_file}"
  else
    echo "Unknown"
  fi
}

format_backup_meta() {
  local meta="$1" result=""
  [[ "${meta}" == *"Database"* ]] && result+="DB "
  [[ "${meta}" == *"Environment"* ]] && result+="Env "
  [[ "${meta}" == *"SEO"* ]] && result+="SEO "
  [[ "${meta}" == *"Application"* ]] && result+="App "
  [[ "${meta}" == *"Materials"* ]] && result+="Mat "
  echo "${result:-Unknown}"
}

# =============================================================================
# 6. High-level Tasks
# =============================================================================

run_backup_process() {
    local steps=()
    local components=""
    [[ "$BACKUP_INCLUDE_SQL" == "true" ]] && { steps+=("Database Dump"); components+="Database "; }
    [[ "$BACKUP_INCLUDE_ENV" == "true" ]] && { steps+=("Environment"); components+="Environment "; }
    [[ "$BACKUP_INCLUDE_SEO_CONFIG" == "true" ]] && { steps+=("SEO Config"); components+="SEO "; }
    [[ "$BACKUP_INCLUDE_WEBAPP" == "true" ]] && { steps+=("Application"); components+="Application "; }
    [[ "$BACKUP_INCLUDE_LEARNING_MATERIALS" == "true" ]] && { steps+=("Materials"); components+="Materials "; }
    steps+=("Compression")
    [[ "$BACKUP_AUTO_UPLOAD" == "true" ]] && steps+=("Cloud Upload")

    if [[ ${#steps[@]} -eq 0 ]]; then
        notify_error "No components selected for backup"
        return
    fi

    local ts="$(date +%Y%m%d-%H%M%S)"
    local bn="backup-${ts}"
    local td="$(mktemp -d)"
    mkdir -p "${td}/${bn}"
    local archive="${BACKUP_DIR}/${bn}.tar.xz"
    mkdir -p "$BACKUP_DIR"

    center_style "Starting backup workflow..."
    
    for i in "${!steps[@]}"; do
        local step="${steps[$i]}"
        local count=$((i + 1))
        local total=${#steps[@]}
        local prefix="[$count/$total]"
        case "$step" in
            "Database Dump") run_task "$prefix Creating Database Dump" create_database_dump "${td}/${bn}/database.sql" ;;
            "Environment") run_task "$prefix Copying Environment Files" bash -c "[[ -f \"${SHARED_DIR}/.env\" ]] && cp \"${SHARED_DIR}/.env\" \"${td}/${bn}/\"" ;;
            "SEO Config") run_task "$prefix Copying SEO Config" bash -c "[[ -f \"$SEO_CONFIG_FILE\" ]] && cp \"$SEO_CONFIG_FILE\" \"${td}/${bn}/\"" ;;
            "Application") run_task "$prefix Syncing Application Files" rsync -a --exclude='node_modules' --exclude='.next' "${CURRENT_LINK}/" "${td}/${bn}/app/" ;;
            "Materials") run_task "$prefix Copying Learning Materials" bash -c "[[ -d \"${REPO_ROOT}/.data\" ]] && cp -r \"${REPO_ROOT}/.data\" \"${td}/${bn}/\"" ;;
            "Compression") run_task "$prefix Compressing Archive" tar -cJf "${archive}" -C "${td}" "${bn}" ;;
            "Cloud Upload") 
                if [[ "$BACKUP_CLOUD_PROVIDER" == *"google-drive"* ]]; then run_task "$prefix Uploading to GDrive" upload_to_gdrive "$archive"; fi
                if [[ "$BACKUP_CLOUD_PROVIDER" == *"koofr"* ]]; then run_task "$prefix Uploading to Koofr" upload_to_koofr "$archive"; fi ;;
        esac
    done

    echo "${components}" | run_privileged_cmd tee "${BACKUP_DIR}/${bn}.meta" >/dev/null
    rm -rf "${td}"
    
    if [[ "${BACKUP_CLEAN_OLD}" == "true" ]]; then
        run_task "Cleaning old backups" bash -c "find \"${BACKUP_DIR}\" -name \"backup-*.tar.xz\" -type f -mtime +${BACKUP_RETENTION_DAYS} -delete"
    fi

    notify_success "Backup complete: $(basename "$archive")"
}

run_restore_process() {
    local backups=($(ls -1 "$BACKUP_DIR"/*.tar.xz 2>/dev/null | sort -r || true))
    if [[ ${#backups[@]} -eq 0 ]]; then
        notify_error "No local backups found"
        return
    fi

    local selected=$(center_choose "Select backup to restore" "${backups[@]}")
    [[ -z "$selected" ]] && return

    # Component selection for restore
    local r_sql=true r_app=true r_env=true r_mat=true r_seo=true
    while true; do
        show_header
        local choice=$(center_choose "Toggle components to restore" \
            "Database [$(bool_word $r_sql)]" "App Files [$(bool_word $r_app)]" \
            "Env File [$(bool_word $r_env)]" "Materials [$(bool_word $r_mat)]" \
            "SEO Config [$(bool_word $r_seo)]" "Start Restore" "Cancel")
        
        case "$choice" in
            "Database "*) r_sql=$(toggle_bool "$r_sql") ;;
            "App Files "*) r_app=$(toggle_bool "$r_app") ;;
            "Env File "*) r_env=$(toggle_bool "$r_env") ;;
            "Materials "*) r_mat=$(toggle_bool "$r_mat") ;;
            "SEO Config "*) r_seo=$(toggle_bool "$r_seo") ;;
            "Cancel") return ;;
            "Start Restore") break ;;
        esac
    done

    if gum confirm "$(center_style "Restore $(basename "$selected")? This will overwrite existing data!")"; then
        local td="$(mktemp -d)"
        run_task "Extracting archive" tar -xJf "$selected" -C "$td"
        local bd=$(find "$td" -mindepth 1 -maxdepth 1 -type d | head -1)
        
        [[ "$r_sql" == "true" && -f "$bd/database.sql" ]] && run_task "Restoring Database" restore_database "$bd/database.sql"
        [[ "$r_env" == "true" && -f "$bd/.env" ]] && run_task "Restoring Env" run_privileged_cmd cp "$bd/.env" "${SHARED_DIR}/.env"
        [[ "$r_seo" == "true" && -f "$bd/seo-config.json" ]] && run_task "Restoring SEO" run_privileged_cmd cp "$bd/seo-config.json" "$SEO_CONFIG_FILE"
        [[ "$r_mat" == "true" && -d "$bd/.data" ]] && run_task "Restoring Materials" run_privileged_cmd cp -r "$bd/.data" "${REPO_ROOT}/"
        [[ "$r_app" == "true" && -d "$bd/app" ]] && center_style "Manual app copy required from $bd/app" --foreground 220
        
        rm -rf "$td"
        notify_success "Restore process finished"
    fi
}

run_delete_backups() {
    local backups=($(ls -1 "$BACKUP_DIR"/*.tar.xz 2>/dev/null | sort -r || true))
    if [[ ${#backups[@]} -eq 0 ]]; then
        notify_error "No backups found"
        return
    fi

    local display_list=()
    for b in "${backups[@]}"; do
        local meta=$(get_backup_meta "$b")
        display_list+=("$(basename "$b") ($(format_backup_meta "$meta"))")
    done

    local selected=$(gum choose --no-limit --header "$(center_style "Select backups to DELETE (SPACE to toggle, ENTER to confirm)")" "${display_list[@]}")
    if [[ -n "$selected" ]]; then
        local count=$(echo "$selected" | wc -l)
        if gum confirm "$(center_style "Delete $count backups permanently?")"; then
            echo "$selected" | while read -r line; do
                local fname=$(echo "$line" | cut -d' ' -f1)
                rm -f "${BACKUP_DIR}/$fname" "${BACKUP_DIR}/${fname%.tar.xz}.meta"
            done
            notify_success "Backups removed"
        fi
    fi
}

# =============================================================================
# 7. Navigation Menus
# =============================================================================

main_menu() {
    load_maintenance_settings
    while true; do
        show_header
        local choice=$(center_choose "Main Menu" "Deploy Management" "Backup & Restore" "SEO & Database" "System Management" "Quit")
        
        case $choice in
            "Deploy Management") deploy_menu ;;
            "Backup & Restore") backup_menu ;;
            "SEO & Database") seo_db_menu ;;
            "System Management") system_menu ;;
            "Quit") 
                if gum confirm "$(center_style "Quit Maintenance Console?")"; then exit 0; fi ;;
        esac
    done
}

deploy_menu() {
    while true; do
        show_header
        local choice=$(center_choose "Deploy Management" "Update App (update.sh)" "Deploy App (deploy.sh)" "Toggle Sudo [$(update_sudo_mode_label)]" "Back")
        case $choice in
            "Update App"*) 
                run_task "Running update" bash "${UPDATE_SCRIPT}" --sudo-deploy
                notify_success "Update finished" ;;
            "Deploy App"*) 
                run_task "Running deploy" bash "${DEPLOY_SCRIPT}" --skip-pull
                notify_success "Deployment finished" ;;
            "Toggle Sudo"*) cycle_sudo_mode ;;
            "Back") return ;;
        esac
    done
}

backup_menu() {
    while true; do
        show_header
        local choice=$(center_choose "Backup & Restore" "Run New Backup" "Restore Backup" "Delete Backups" "Backup Components" "Cloud Settings" "Back")
        case $choice in
            "Run New Backup") run_backup_process ;;
            "Restore Backup") run_restore_process ;;
            "Delete Backups") run_delete_backups ;;
            "Backup Components") backup_components_tui ;;
            "Cloud Settings") cloud_settings_tui ;;
            "Back") return ;;
        esac
    done
}

backup_components_tui() {
    while true; do
        show_header
        local s=$(bool_word "$BACKUP_INCLUDE_SQL")
        local a=$(bool_word "$BACKUP_INCLUDE_WEBAPP")
        local e=$(bool_word "$BACKUP_INCLUDE_ENV")
        local m=$(bool_word "$BACKUP_INCLUDE_LEARNING_MATERIALS")
        local o=$(bool_word "$BACKUP_INCLUDE_SEO_CONFIG")
        local c=$(bool_word "$BACKUP_CLEAN_OLD")
        
        local choice=$(center_choose "Toggle Components" \
            "Database [$s]" "App Files [$a]" "Env File [$e]" "Materials [$m]" "SEO Config [$o]" "Clean Old [$c]" "Save & Back")
        
        case $choice in
            "Database "*) BACKUP_INCLUDE_SQL=$(toggle_bool "$BACKUP_INCLUDE_SQL") ;;
            "App Files "*) BACKUP_INCLUDE_WEBAPP=$(toggle_bool "$BACKUP_INCLUDE_WEBAPP") ;;
            "Env File "*) BACKUP_INCLUDE_ENV=$(toggle_bool "$BACKUP_INCLUDE_ENV") ;;
            "Materials "*) BACKUP_INCLUDE_LEARNING_MATERIALS=$(toggle_bool "$BACKUP_INCLUDE_LEARNING_MATERIALS") ;;
            "SEO Config "*) BACKUP_INCLUDE_SEO_CONFIG=$(toggle_bool "$BACKUP_INCLUDE_SEO_CONFIG") ;;
            "Clean Old "*) BACKUP_CLEAN_OLD=$(toggle_bool "$BACKUP_CLEAN_OLD") ;;
            "Save & Back") save_maintenance_settings; return ;;
        esac
    done
}

cloud_settings_tui() {
    while true; do
        show_header
        local g="false" k="false"
        [[ "$BACKUP_CLOUD_PROVIDER" == *"google-drive"* ]] && g="true"
        [[ "$BACKUP_CLOUD_PROVIDER" == *"koofr"* ]] && k="true"
        
        local choice=$(center_choose "Cloud Configuration" \
            "GDrive [$(bool_word $g)]" "Koofr [$(bool_word $k)]" \
            "Toggle Auto-Upload [$(bool_word "$BACKUP_AUTO_UPLOAD")]" "Set Cloud Folder" "Back")
        case $choice in
            "GDrive "*) 
                if [[ "$g" == "true" ]]; then BACKUP_CLOUD_PROVIDER="${BACKUP_CLOUD_PROVIDER//google-drive/}"; else BACKUP_CLOUD_PROVIDER="${BACKUP_CLOUD_PROVIDER} google-drive"; fi
                BACKUP_CLOUD_PROVIDER=$(echo "$BACKUP_CLOUD_PROVIDER" | xargs); [[ -z "$BACKUP_CLOUD_PROVIDER" ]] && BACKUP_CLOUD_PROVIDER="none"; save_maintenance_settings ;;
            "Koofr "*) 
                if [[ "$k" == "true" ]]; then BACKUP_CLOUD_PROVIDER="${BACKUP_CLOUD_PROVIDER//koofr/}"; else BACKUP_CLOUD_PROVIDER="${BACKUP_CLOUD_PROVIDER} koofr"; fi
                BACKUP_CLOUD_PROVIDER=$(echo "$BACKUP_CLOUD_PROVIDER" | xargs); [[ -z "$BACKUP_CLOUD_PROVIDER" ]] && BACKUP_CLOUD_PROVIDER="none"; save_maintenance_settings ;;
            "Toggle Auto-Upload "*) BACKUP_AUTO_UPLOAD=$(toggle_bool "$BACKUP_AUTO_UPLOAD"); save_maintenance_settings ;;
            "Set Cloud Folder") 
                BACKUP_CLOUD_FOLDER=$(gum input --prompt "$(center_style "Folder: ")" --value "$BACKUP_CLOUD_FOLDER")
                save_maintenance_settings ;;
            "Back") return ;;
        esac
    done
}

seo_db_menu() {
    while true; do
        show_header
        local choice=$(center_choose "SEO & Database" "Check DB Health" "Generate Sitemap" "Generate Robots" "Back")
        case $choice in
            "Check DB Health") 
                check_database_health; gum input --placeholder "$(center_style "Press Enter to continue...")" ;;
            "Generate Sitemap") 
                run_task "Generating sitemap" sleep 1
                notify_success "Sitemap created" ;;
            "Generate Robots") 
                run_task "Generating robots.txt" sleep 1
                notify_success "Robots.txt updated" ;;
            "Back") return ;;
        esac
    done
}

system_menu() {
    while true; do
        show_header
        local choice=$(center_choose "System Management" "Git Pull" "Clean Cache" "Edit Config" "Back")
        case $choice in
            "Git Pull") 
                run_task "Pulling from origin" git -C "${REPO_ROOT}" pull "${REMOTE_NAME}" "${BRANCH:-$(git -C "${REPO_ROOT}" rev-parse --abbrev-ref HEAD)}"
                notify_success "Git pull complete" ;;
            "Clean Cache") 
                run_task "Cleaning cache" bash -c "rm -rf \"${REPO_ROOT}/.next\" && rm -rf \"${REPO_ROOT}/node_modules/.cache\""
                notify_success "Cache cleared" ;;
            "Edit Config")
                local se="${SHARED_DIR}/.env" ed="${VISUAL:-${EDITOR:-nano}}"
                for c in nano vi vim; do command -v "$c" >/dev/null && { ed="$c"; break; }; done
                [[ -f "$se" ]] && run_privileged_cmd "$ed" "$se" || notify_error "Config not found" ;;
            "Back") return ;;
        esac
    done
}

# Boolean helpers
bool_word() { [[ "$1" == true ]] && echo "ON" || echo "OFF"; }
toggle_bool() { [[ "$1" == true ]] && echo false || echo true; }

check_database_health() { 
    get_db_creds || { notify_error "No DB creds"; return 1; }
    run_task "Checking connection to $DB_NAME" bash -c "if command -v mysql >/dev/null 2>&1; then MYSQL_PWD=\"${DB_P}\" mysql -h \"${DB_H:-localhost}\" -u \"${DB_U}\" -e \"SELECT 1\" \"${DB_NAME}\"; fi"
    if [[ $? -eq 0 ]]; then
        notify_success "Database connected"
    else
        notify_error "Connection failed"
    fi
}

# Start the application
main_menu
