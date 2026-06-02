#!/usr/bin/env bash
set -euo pipefail

IMAGE="gmarland/firstdraft-app"
VERSION=""
PUSH_LATEST=true
DRY_RUN=false
PLATFORM=""
API_BASE_URL=""

usage() {
  cat <<'USAGE'
Usage:
  scripts/publish-docker-app.sh VERSION [--no-latest] [--platform PLATFORM] [--api-base-url URL] [--dry-run]

Builds the FirstDraft app Docker image and pushes it to Docker Hub as:
  gmarland/firstdraft-app:VERSION
  gmarland/firstdraft-app:latest

Arguments:
  VERSION              Image version, for example 0.1.0 or v0.1.0

Options:
  --no-latest          Do not tag and push latest
  --platform PLATFORM  Pass a Docker platform, for example linux/amd64
  --api-base-url URL   Build the app with VITE_API_BASE_URL set to URL
  --dry-run            Print the Docker commands without running them
  -h, --help           Show this help
USAGE
}

die() {
  echo "error: $*" >&2
  exit 1
}

info() {
  echo "==> $*"
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

run() {
  echo "+ $*" >&2
  if [[ "$DRY_RUN" == false ]]; then
    "$@"
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --no-latest)
        PUSH_LATEST=false
        shift
        ;;
      --platform)
        [[ $# -ge 2 ]] || die "--platform requires a value"
        PLATFORM="$2"
        shift 2
        ;;
      --api-base-url)
        [[ $# -ge 2 ]] || die "--api-base-url requires a value"
        API_BASE_URL="$2"
        shift 2
        ;;
      --dry-run)
        DRY_RUN=true
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      -*)
        die "unknown option: $1"
        ;;
      *)
        [[ -z "$VERSION" ]] || die "unexpected argument: $1"
        VERSION="$1"
        shift
        ;;
    esac
  done

  [[ -n "$VERSION" ]] || die "VERSION is required"
  VERSION="${VERSION#v}"
  [[ "$VERSION" =~ ^[0-9]+[.][0-9]+[.][0-9]+([-+][0-9A-Za-z.-]+)?$ ]] || die "VERSION must look like 0.1.0"
}

require_docker_available() {
  if ! docker info >/dev/null 2>&1; then
    die "docker daemon is not available; start Docker Desktop and try again"
  fi
}

main() {
  parse_args "$@"

  local root
  root="$(git rev-parse --show-toplevel)"
  cd "$root"

  need_command docker
  need_command git

  [[ -f app/Dockerfile ]] || die "app/Dockerfile is required to build the app image"

  if [[ "$DRY_RUN" == true ]]; then
    info "Dry run: skipping Docker availability check, build, and push"
  else
    require_docker_available
  fi

  local version_tag="$IMAGE:$VERSION"
  local latest_tag="$IMAGE:latest"
  local build_args=(docker build --file app/Dockerfile --tag "$version_tag")

  if [[ -n "$PLATFORM" ]]; then
    build_args+=(--platform "$PLATFORM")
  fi

  if [[ -n "$API_BASE_URL" ]]; then
    build_args+=(--build-arg "VITE_API_BASE_URL=$API_BASE_URL")
  fi

  if [[ "$PUSH_LATEST" == true ]]; then
    build_args+=(--tag "$latest_tag")
  fi

  build_args+=(app)

  info "Building app image"
  run "${build_args[@]}"

  info "Pushing $version_tag"
  run docker push "$version_tag"

  if [[ "$PUSH_LATEST" == true ]]; then
    info "Pushing $latest_tag"
    run docker push "$latest_tag"
  fi

  info "Published $version_tag to Docker Hub"
}

main "$@"
