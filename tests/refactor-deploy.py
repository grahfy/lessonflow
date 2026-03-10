import re

with open("deploy/deploy.sh", "r") as f:
    content = f.read()

# Remove reexec_with_sudo_if_needed definition
content = re.sub(r'# Re-runs the deploy script with sudo when root privileges.*?reexec_with_sudo_if_needed\(\) \{.*?\n\}\n', '', content, flags=re.DOTALL)
# Remove the invocation
content = content.replace("reexec_with_sudo_if_needed\n", "")

# Add run_sudo_cmd helper function
run_sudo_cmd = """
# Run a command with sudo if we are not root and sudo is available.
run_sudo_cmd() {
    if [[ ${EUID} -eq 0 ]]; then
        "$@"
    elif command -v sudo >/dev/null 2>&1; then
        sudo "$@"
    else
        "$@"
    fi
}

"""
content = content.replace("auto_size_tui_panel_width() {\n", run_sudo_cmd + "auto_size_tui_panel_width() {\n")

# Remove all EUID -ne 0 exit blocks
content = re.sub(r'[ \t]*if \[\[ \$\{EUID\} -ne 0 \]\]; then\n[ \t]*log_error ".*?requires root.*?"\n[ \t]*return 1\n[ \t]*fi\n', '', content)
content = re.sub(r'[ \t]*if \[\[ \$\{EUID\} -ne 0 \]\]; then\n[ \t]*log_error ".*?requires root.*?"\n[ \t]*exit 1\n[ \t]*fi\n', '', content)
content = re.sub(r'[ \t]*if \[\[ \$\{EUID\} -ne 0 \]\]; then\n[ \t]*log_warn ".*?without root.*?"\n[ \t]*return 0\n[ \t]*fi\n', '', content)

# Replace chown www-data:www-data with chown :www-data 2>/dev/null || true
content = content.replace('chown www-data:www-data "${shared_env_path}" 2>/dev/null || true', 'chown :www-data "${shared_env_path}" 2>/dev/null || true')
content = content.replace('chown -R www-data:www-data "${SHARED_DIR}/data" >/dev/null 2>&1 || true', 'chown -R :www-data "${SHARED_DIR}/data" 2>/dev/null || true')
content = content.replace('chown www-data:www-data "${backup_file}" "${restore_note}" 2>/dev/null || true', 'chown :www-data "${backup_file}" "${restore_note}" 2>/dev/null || true')
content = content.replace('chown -R www-data:www-data "${DEPLOY_DIR}"', 'chown -R :www-data "${DEPLOY_DIR}" 2>/dev/null || true')

# Replace specific systemctl commands with run_sudo_cmd systemctl
systemctl_commands = ['start', 'stop', 'restart', 'enable', 'disable', 'daemon-reload']
for cmd in systemctl_commands:
    content = re.sub(r'([ \t]*)systemctl ' + cmd, r'\1run_sudo_cmd systemctl ' + cmd, content)

# Also fix apt/dnf/yum/zypper/pacman installs
content = re.sub(r'([ \t]*)apt install ', r'\1run_sudo_cmd apt install ', content)
content = re.sub(r'([ \t]*)dnf install ', r'\1run_sudo_cmd dnf install ', content)
content = re.sub(r'([ \t]*)yum install ', r'\1run_sudo_cmd yum install ', content)
content = re.sub(r'([ \t]*)zypper install ', r'\1run_sudo_cmd zypper install ', content)
content = re.sub(r'([ \t]*)pacman -S ', r'\1run_sudo_cmd pacman -S ', content)

# Fix setup-packages script runs
content = content.replace('"${SCRIPT_DIR}/setup-packages.sh"', 'run_sudo_cmd "${SCRIPT_DIR}/setup-packages.sh"')
# But we need to revert it in the if condition where it checks for executable
content = content.replace('if [[ ! -x run_sudo_cmd "${SCRIPT_DIR}/setup-packages.sh" ]]; then', 'if [[ ! -x "${SCRIPT_DIR}/setup-packages.sh" ]]; then')

# Fix crontab
content = content.replace('crontab "${tmp_file}"', 'run_sudo_cmd crontab "${tmp_file}"')

# Fix mysql_admin_exec_local
content = content.replace('"${mysql_bin}" --batch', 'run_sudo_cmd "${mysql_bin}" --batch')

# Fix cp for systemd service
content = content.replace('cp "${tmp_service}" "${service_file}"', 'run_sudo_cmd cp "${tmp_service}" "${service_file}"')
content = content.replace('cp "${static_service_source}" "${service_file}"', 'run_sudo_cmd cp "${static_service_source}" "${service_file}"')
content = content.replace('cp "${SERVICE_SOURCE}" "${SERVICE_FILE}"', 'run_sudo_cmd cp "${SERVICE_SOURCE}" "${SERVICE_FILE}"')

# Swap operations
content = re.sub(r'([ \t]*)fallocate ', r'\1run_sudo_cmd fallocate ', content)
content = re.sub(r'([ \t]*)chmod 600 "\$\{TEMP_BUILD_SWAP_PATH\}"', r'\1run_sudo_cmd chmod 600 "${TEMP_BUILD_SWAP_PATH}"', content)
content = re.sub(r'([ \t]*)mkswap ', r'\1run_sudo_cmd mkswap ', content)
content = re.sub(r'([ \t]*)swapon ', r'\1run_sudo_cmd swapon ', content)
content = re.sub(r'([ \t]*)swapoff ', r'\1run_sudo_cmd swapoff ', content)
content = content.replace('rm -f "${TEMP_BUILD_SWAP_PATH}"', 'run_sudo_cmd rm -f "${TEMP_BUILD_SWAP_PATH}"')

# Legacy migration moves
content = content.replace('mv "${legacy_dir}"', 'run_sudo_cmd mv "${legacy_dir}"')
content = content.replace('mv "${DEPRECATED_DIR}"', 'run_sudo_cmd mv "${DEPRECATED_DIR}"')

with open("deploy/deploy.sh", "w") as f:
    f.write(content)

print("Refactored deploy.sh successfully.")
