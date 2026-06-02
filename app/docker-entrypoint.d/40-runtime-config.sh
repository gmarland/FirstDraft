#!/bin/sh
set -eu

config_file="/usr/share/nginx/html/config.js"
api_base_url="${VITE_API_BASE_URL:-}"

if [ -n "$api_base_url" ]; then
  escaped_api_base_url="$(printf '%s' "$api_base_url" | sed -e 's/\\/\\\\/g' -e "s/'/\\\\'/g")"
  printf "window.__FIRSTDRAFT_CONFIG__ = { apiBaseUrl: '%s' };\n" "$escaped_api_base_url" > "$config_file"
else
  printf "window.__FIRSTDRAFT_CONFIG__ = window.__FIRSTDRAFT_CONFIG__ || {};\n" > "$config_file"
fi
