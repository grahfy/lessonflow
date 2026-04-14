#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

ENV_FILE="${TEST_ROOT}/shared.env"
PWNED_FILE="${TEST_ROOT}/pwned"
FUNCS_FILE="${TEST_ROOT}/deploy-env-functions.sh"

cat > "${ENV_FILE}" <<ENV
# Comments are ignored.
PLAIN_VALUE=plain
QUOTED_VALUE="one two"
EXPORTED_VALUE='three four'
MALICIOUS_VALUE="\$(touch ${PWNED_FILE})"
ENV

sed -n '/^extract_env_assignment_key()/,/^}/p;/^export_env_file_assignments()/,/^}/p' deploy/deploy.sh > "${FUNCS_FILE}"

output="$(
  ENV_FILE="${ENV_FILE}" FUNCS_FILE="${FUNCS_FILE}" bash -lc '
    set -euo pipefail
    source "${FUNCS_FILE}"
    export_env_file_assignments "${ENV_FILE}"
    printf "%s|%s|%s|%s" "${PLAIN_VALUE}" "${QUOTED_VALUE}" "${EXPORTED_VALUE}" "${MALICIOUS_VALUE}"
  '
)"

expected="plain|one two|three four|\$(touch ${PWNED_FILE})"
if [[ "${output}" != "${expected}" ]]; then
  echo "Unexpected exported values."
  echo "Expected: ${expected}"
  echo "Actual:   ${output}"
  exit 1
fi

if [[ -e "${PWNED_FILE}" ]]; then
  echo "Expected env export helper not to execute command substitutions."
  exit 1
fi

echo "Deploy env export safety check passed."
