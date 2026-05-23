#!/usr/bin/env bash
# scripts/sample-repo.sh — regenerate testdata/sample-repo/ with deterministic commits.
#
# Shape (matches the openspec change add-git-reader):
#   • 3 commits on `main`
#   • secondary branch `feature/x` with 1 extra commit
#   • annotated tag `v0.1.0` on commit #2 of main
#   • binary file (logo.png) modified across two commits
#   • rename across two commits (a/old.txt -> b/new.txt)
#   • one staged modification (intro.md)
#   • one unstaged modification (README.md)
#   • one untracked file (untracked.txt)
#
# All timestamps and identities are fixed so the resulting object SHAs are
# stable across machines — required by the Playwright e2e suite.

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
target="${1:-${repo_root}/testdata/sample-repo}"

export GIT_AUTHOR_NAME="Sample Author"
export GIT_AUTHOR_EMAIL="author@example.com"
export GIT_COMMITTER_NAME="Sample Committer"
export GIT_COMMITTER_EMAIL="committer@example.com"

# Reproducible commit timestamps — values are ISO-8601 strings git accepts.
T1="2025-01-01T10:00:00+00:00"
T2="2025-01-02T10:00:00+00:00"
T3="2025-01-03T10:00:00+00:00"
T4="2025-01-04T10:00:00+00:00"

# Pin the initial-branch name so the script works on systems with init.defaultBranch != main.
git_init_main() {
    if git init --initial-branch=main -- "$1" >/dev/null 2>&1; then
        return
    fi
    git init -- "$1" >/dev/null
    git -C "$1" symbolic-ref HEAD refs/heads/main
}

# Wipe any previous run first.
rm -rf "$target"
mkdir -p "$target"

git_init_main "$target"

cd "$target"

# Pin local repo identity so it does not inherit the host's user.name/email
# (which would change the commit shas).
git config user.name "$GIT_COMMITTER_NAME"
git config user.email "$GIT_COMMITTER_EMAIL"
git config commit.gpgsign false

# A reproducible 16x16 PNG (red square). Generated once and inlined so the
# script has zero runtime dependencies beyond git + coreutils.
write_png() {
    local out="$1"
    base64 -d > "$out" <<'PNG'
iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nO3OMQEAAAjDsK1/aTzC
AwzkdHEEAAAAAAAA8GoBR4UB9XJ2nzMAAAAASUVORK5CYII=
PNG
}

# --- Commit 1: initial files on main ---
echo "# Sample repo" > README.md
echo "intro line one" > intro.md
mkdir -p a
echo "old contents" > a/old.txt
write_png logo.png

git add README.md intro.md a/old.txt logo.png
GIT_AUTHOR_DATE="$T1" GIT_COMMITTER_DATE="$T1" \
    git commit -m "Initial commit" >/dev/null

# --- Commit 2: bump README, modify binary, add second text file ---
cat > README.md <<'EOF'
# Sample repo

Second iteration of the README — adds a paragraph for the v0.1.0 tag.
EOF

# Slightly different PNG bytes so the diff is detected as binary modify.
base64 -d > logo.png <<'PNG'
iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAH0lEQVR4nO3OQQ0AAAjEsAv/nokz
DhcmqdoZAAAAAACYbgEFFwH9k9ChEgAAAABJRU5ErkJggg==
PNG

echo "second commit text" > extra.md

git add README.md logo.png extra.md
GIT_AUTHOR_DATE="$T2" GIT_COMMITTER_DATE="$T2" \
    git commit -m "Second commit: expand README and bump binary" >/dev/null

# Annotated tag on commit #2.
GIT_AUTHOR_DATE="$T2" GIT_COMMITTER_DATE="$T2" \
    git tag -a v0.1.0 -m "v0.1.0 release" HEAD

# --- Commit 3: rename a/old.txt -> b/new.txt and amend its content ---
mkdir -p b
git mv a/old.txt b/new.txt
cat > b/new.txt <<'EOF'
renamed contents
plus an extra line so the diff has a hunk
plus another line
plus another line
plus another line
plus another line
EOF

# Make sure the directory `a/` is removed when the only file moves out, so git
# treats it as a clean rename + directory removal.
rmdir a 2>/dev/null || true

git add -A
GIT_AUTHOR_DATE="$T3" GIT_COMMITTER_DATE="$T3" \
    git commit -m "Third commit: rename a/old.txt to b/new.txt" >/dev/null

# --- Branch feature/x with one extra commit ---
git branch feature/x
git checkout feature/x >/dev/null 2>&1
echo "feature only" > feature.md
git add feature.md
GIT_AUTHOR_DATE="$T4" GIT_COMMITTER_DATE="$T4" \
    git commit -m "Feature x: add feature.md" >/dev/null

git checkout main >/dev/null 2>&1

# --- Working-tree state: 1 staged, 1 unstaged, 1 untracked ---
echo "intro line two (staged)" >> intro.md
git add intro.md

cat >> README.md <<'EOF'

Working tree paragraph (unstaged).
EOF

echo "this file is untracked" > untracked.txt

echo "Sample repo regenerated at $target"
echo
git log --oneline --decorate --all
echo
git status --short
