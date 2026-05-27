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
#   • two unstaged modifications (README.md, b/new.txt)
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

# A reproducible 128x128 PNG (blue background, pink accent band, "explorer
# v0.1.0" wordmark). Generated once with Pillow and inlined so the script
# has zero runtime dependencies beyond git + coreutils. Bigger than the
# previous 16-pixel red square so the file viewer's image preview shows
# something recognisable in screenshots and demo GIFs.
write_png() {
    local out="$1"
    base64 -d > "$out" <<'PNG'
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
qekFfQAAAABJRU5ErkJggg==
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

# Slightly different PNG bytes (green/amber palette, "v0.2.0" wordmark)
# so the diff is detected as binary modify and the second-commit preview
# is visually distinct from the first.
base64 -d > logo.png <<'PNG'
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
VID3IAAAAABJRU5ErkJggg==
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

# --- Working-tree state: 1 staged, 2 unstaged, 1 untracked ---
# Two unstaged entries on purpose so the demo can show the file-viewer
# strip's "Modified locally" state on BOTH a markdown file (README.md) and
# a plain-text file (b/new.txt) — the latter is what gives the Blame tab
# something to overlay as `uncommitted`.
echo "intro line two (staged)" >> intro.md
git add intro.md

cat >> README.md <<'EOF'

Working tree paragraph (unstaged).
EOF

echo "post-rename edit (unstaged)" >> b/new.txt

echo "this file is untracked" > untracked.txt

echo "Sample repo regenerated at $target"
echo
git log --oneline --decorate --all
echo
git status --short
