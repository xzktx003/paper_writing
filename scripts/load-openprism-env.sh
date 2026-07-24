#!/bin/sh

# Shared environment loader for every Paper Writer production entry point.
# Repository-local app/.env overrides the repository root .env, matching
# `npm start` and keeping machine-specific values out of source defaults.
load_openprism_env() {
  openprism_repo_root="$1"
  for openprism_env_file in "$openprism_repo_root/.env" "$openprism_repo_root/app/.env"; do
    if [ -f "$openprism_env_file" ]; then
      set -a
      # shellcheck disable=SC1090
      . "$openprism_env_file"
      set +a
    fi
  done
  unset openprism_env_file openprism_repo_root
}
