#!/usr/bin/env bash
set -euo pipefail

REPO="gmarland/FirstDraft"
TAP="gmarland/homebrew-firstdraft"
DRY_RUN=false
VERSION=""

usage() {
  cat <<'USAGE'
Usage:
  scripts/publish-homebrew.sh VERSION [--dry-run]

Packages the FirstDraft worker CLI for macOS, publishes release tarballs, and
updates the Homebrew formula in gmarland/homebrew-firstdraft.

Arguments:
  VERSION            Release version, for example 0.1.0 or v0.1.0

Options:
  --dry-run          Build and verify packages, print formula, skip publishing
  -h, --help         Show this help
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
  "$@"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
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

require_clean_worktree() {
  if [[ -n "$(git status --porcelain)" ]]; then
    die "git worktree must be clean before publishing"
  fi
}

require_auth_and_repos() {
  info "Checking GitHub authentication and repositories"
  local active_login
  active_login="$(gh api user --jq .login)"
  [[ "$active_login" == "gmarland" ]] || die "active GitHub account must be gmarland, got $active_login"
  run gh repo view "$REPO" >/dev/null
  run gh repo view "$TAP" >/dev/null
}

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

publish_runtime() {
  local rid="$1"
  local out_dir="$2"

  run dotnet publish client/FirstDraft.csproj \
    --configuration Release \
    --runtime "$rid" \
    --self-contained true \
    -p:PublishSingleFile=true \
    -p:EnableCompressionInSingleFile=true \
    -p:DebugType=None \
    -p:DebugSymbols=false \
    --output "$out_dir"

  rm -f "$out_dir/config.json"
  [[ -x "$out_dir/firstdraft" ]] || die "publish did not produce executable: $out_dir/firstdraft"
}

create_archive() {
  local rid="$1"
  local publish_dir="$2"
  local artifacts_dir="$3"
  local archive="$artifacts_dir/firstdraft-$VERSION-$rid.tar.gz"

  run tar -C "$publish_dir" -czf "$archive" firstdraft
  if tar -tzf "$archive" | grep -Eq '(^|/)config[.]json$'; then
    die "archive includes config.json: $archive"
  fi

  echo "$archive"
}

verify_archive() {
  local archive="$1"
  local verify_dir="$2"

  mkdir -p "$verify_dir"
  run tar -C "$verify_dir" -xzf "$archive"
  run "$verify_dir/firstdraft" --help >/dev/null
}

generate_formula() {
  local tag="$1"
  local arm_archive="$2"
  local x64_archive="$3"
  local arm_sha="$4"
  local x64_sha="$5"
  local homepage="https://github.com/$REPO"
  local arm_url="$homepage/releases/download/$tag/$(basename "$arm_archive")"
  local x64_url="$homepage/releases/download/$tag/$(basename "$x64_archive")"

  cat <<FORMULA
class Firstdraft < Formula
  desc "FirstDraft worker CLI"
  homepage "$homepage"
  version "$VERSION"
  license "MIT"

  on_macos do
    on_arm do
      url "$arm_url"
      sha256 "$arm_sha"
    end

    on_intel do
      url "$x64_url"
      sha256 "$x64_sha"
    end
  end

  def install
    bin.install "firstdraft"
  end

  test do
    assert_match "firstdraft", shell_output("#{bin}/firstdraft --help")
  end
end
FORMULA
}

ensure_tag() {
  local tag="$1"

  if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
    info "Tag already exists locally: $tag"
    local tag_commit head_commit
    tag_commit="$(git rev-list -n 1 "$tag")"
    head_commit="$(git rev-parse HEAD)"
    [[ "$tag_commit" == "$head_commit" ]] || die "tag $tag points at $tag_commit, not current HEAD $head_commit"
  else
    run git tag -a "$tag" -m "firstdraft $VERSION"
  fi

  run git push origin "$tag"
}

publish_release() {
  local tag="$1"
  local arm_archive="$2"
  local x64_archive="$3"

  if gh release view "$tag" --repo "$REPO" >/dev/null 2>&1; then
    info "Updating existing GitHub release: $tag"
  else
    run gh release create "$tag" --repo "$REPO" --title "FirstDraft $VERSION" --notes "FirstDraft $VERSION"
  fi

  run gh release upload "$tag" "$arm_archive" "$x64_archive" --repo "$REPO" --clobber
}

update_tap() {
  local formula_file="$1"
  local tap_dir="$2"

  run gh repo clone "$TAP" "$tap_dir"
  mkdir -p "$tap_dir/Formula"
  cp "$formula_file" "$tap_dir/Formula/firstdraft.rb"

  run ruby -c "$tap_dir/Formula/firstdraft.rb"
  run git -C "$tap_dir" add Formula/firstdraft.rb

  if git -C "$tap_dir" diff --cached --quiet; then
    info "Tap formula already up to date"
    return
  fi

  run git -C "$tap_dir" commit -m "firstdraft $VERSION"
  run git -C "$tap_dir" push
}

main() {
  parse_args "$@"

  local tag="v$VERSION"
  local root
  root="$(git rev-parse --show-toplevel)"
  cd "$root"

  need_command dotnet
  need_command gh
  need_command git
  need_command tar
  need_command shasum
  need_command awk
  need_command grep
  need_command ruby

  if [[ "$DRY_RUN" == true ]]; then
    info "Dry run: skipping GitHub auth, tag push, release upload, tap clone, commit, and push"
  else
    require_clean_worktree
    require_auth_and_repos
  fi

  local work_dir artifacts_dir arm_publish_dir x64_publish_dir arm_archive x64_archive verify_dir formula_file
  work_dir="$(mktemp -d "${TMPDIR:-/tmp}/firstdraft-homebrew.XXXXXX")"
  artifacts_dir="$work_dir/artifacts"
  arm_publish_dir="$work_dir/publish/osx-arm64"
  x64_publish_dir="$work_dir/publish/osx-x64"
  verify_dir="$work_dir/verify"
  formula_file="$work_dir/firstdraft.rb"
  mkdir -p "$artifacts_dir"

  info "Packaging FirstDraft $VERSION"
  publish_runtime osx-arm64 "$arm_publish_dir"
  publish_runtime osx-x64 "$x64_publish_dir"

  arm_archive="$(create_archive osx-arm64 "$arm_publish_dir" "$artifacts_dir")"
  x64_archive="$(create_archive osx-x64 "$x64_publish_dir" "$artifacts_dir")"

  info "Verifying archives"
  verify_archive "$arm_archive" "$verify_dir/osx-arm64"
  verify_archive "$x64_archive" "$verify_dir/osx-x64"

  local arm_sha x64_sha
  arm_sha="$(sha256_file "$arm_archive")"
  x64_sha="$(sha256_file "$x64_archive")"

  generate_formula "$tag" "$arm_archive" "$x64_archive" "$arm_sha" "$x64_sha" > "$formula_file"
  run ruby -c "$formula_file"

  if [[ "$DRY_RUN" == true ]]; then
    info "Artifacts"
    printf '%s\n' "$arm_archive" "$x64_archive"
    info "Generated Homebrew formula"
    cat "$formula_file"
    info "Dry run complete"
    return
  fi

  ensure_tag "$tag"
  publish_release "$tag" "$arm_archive" "$x64_archive"
  update_tap "$formula_file" "$work_dir/homebrew-firstdraft"

  info "Published FirstDraft $VERSION to Homebrew tap $TAP"
}

main "$@"
