#!/bin/bash
set -euo pipefail

FILE="deploy/deploy.sh"

# 1. Add run_sudo_cmd after auto_size_tui_panel_width
awk '
/auto_size_tui_panel_width\(\) \{/ { print; in_func=1; next }
/^}/ { if (in_func) { print; print ""; print "run_sudo_cmd() {"; print "    if [[ ${EUID} -eq 0 ]]; then"; print "        \"$@\""; print "    elif command -v sudo >/dev/null 2>&1; then"; print "        sudo \"$@\""; print "    else"; print "        \"$@\""; print "    fi"; print "}"; in_func=0; next } }
{ print }
' $FILE > $FILE.tmp && mv $FILE.tmp $FILE

# 2. Replace EUID checks
sed -i '/if \[\[ ${EUID} -ne 0 \]\]; then/,/fi/d' $FILE

# 3. Replace systemctl with run_sudo_cmd systemctl in appropriate places
sed -i 's/systemctl start /run_sudo_cmd systemctl start /g' $FILE
sed -i 's/systemctl stop /run_sudo_cmd systemctl stop /g' $FILE
sed -i 's/systemctl restart /run_sudo_cmd systemctl restart /g' $FILE
sed -i 's/systemctl enable /run_sudo_cmd systemctl enable /g' $FILE
sed -i 's/systemctl disable /run_sudo_cmd systemctl disable /g' $FILE
sed -i 's/systemctl daemon-reload/run_sudo_cmd systemctl daemon-reload/g' $FILE

# 4. Replace other commands
sed -i 's/ apt install / run_sudo_cmd apt install /g' $FILE
sed -i 's/ dnf install / run_sudo_cmd dnf install /g' $FILE
sed -i 's/ yum install / run_sudo_cmd yum install /g' $FILE
sed -i 's/ zypper install / run_sudo_cmd zypper install /g' $FILE
sed -i 's/ pacman -S / run_sudo_cmd pacman -S /g' $FILE

sed -i 's/"${SCRIPT_DIR}\/setup-packages.sh"/run_sudo_cmd "${SCRIPT_DIR}\/setup-packages.sh"/g' $FILE
sed -i 's/crontab "${tmp_file}"/run_sudo_cmd crontab "${tmp_file}"/g' $FILE
sed -i 's/cp "${tmp_service}" "${service_file}"/run_sudo_cmd cp "${tmp_service}" "${service_file}"/g' $FILE
sed -i 's/cp "${static_service_source}" "${service_file}"/run_sudo_cmd cp "${static_service_source}" "${service_file}"/g' $FILE

# Fix mysql_admin_exec_local
sed -i 's/"${mysql_bin}" --batch/run_sudo_cmd "${mysql_bin}" --batch/g' $FILE

# Fix swap setup
sed -i 's/ fallocate / run_sudo_cmd fallocate /g' $FILE
sed -i 's/ chmod 600 / run_sudo_cmd chmod 600 /g' $FILE
sed -i 's/ mkswap / run_sudo_cmd mkswap /g' $FILE
sed -i 's/ swapon / run_sudo_cmd swapon /g' $FILE
sed -i 's/ swapoff / run_sudo_cmd swapoff /g' $FILE
sed -i 's/ rm -f "\${TEMP_BUILD_SWAP_PATH}"/ run_sudo_cmd rm -f "\${TEMP_BUILD_SWAP_PATH}"/g' $FILE

# Remove the root check for legacy migration entirely (it was deleted by the first sed, let us just make sure the mv/rm run with sudo)
sed -i 's/mv "${legacy_dir}"/run_sudo_cmd mv "${legacy_dir}"/g' $FILE

