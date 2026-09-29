#!/usr/bin/env bash
# Cross-machine consistency: a project committed with LF line endings (as on
# Linux and macOS) and cloned with core.autocrlf=true (as on Windows) must
# sync and check cleanly with the built CLI: agileflow.lock is not rewritten,
# no file changes, no "local modifications", no renderer drift, and the Claude
# compatibility links are really made and resolve to .agents/skills.
#
#   cross-machine-smoke.sh [link-mode]   link-mode: AGILEFLOW_LINK_MODE for the clone (e.g. junction)
set -euo pipefail
cli="${AGILEFLOW_CLI:-node $GITHUB_WORKSPACE/apps/cli/bin/agileflow.js}"
mode="${1:-}"
work=$(mktemp -d)

origin="$work/origin"
mkdir "$origin" && cd "$origin"
git init -q
git config core.autocrlf false
git config user.email ci@example.com
git config user.name ci
# A committed Claude marker, so the adapter is detected (and links are made) in every clone.
mkdir .claude && printf '{}\n' > .claude/settings.json
$cli init --yes
# Links are per machine (a Windows checkout may need junctions); keep them out of git.
printf '.claude/skills/\n' > .gitignore
$cli check
git add -A
git commit -qm agileflow

clone="$work/clone"
git -c core.autocrlf=true clone -q "$origin" "$clone"
cd "$clone"
git config core.autocrlf true
# The checkout really converted line endings; otherwise this proves nothing.
grep -q $'\r' .agents/skills/diagnosing-bugs/SKILL.md
cp agileflow.lock "$work/lock.before"
if [ -n "$mode" ]; then export AGILEFLOW_LINK_MODE="$mode"; fi

$cli sync
cmp agileflow.lock "$work/lock.before"
test -z "$(git status --porcelain)"
$cli check --json > "$work/check.json" || { cat "$work/check.json"; exit 1; }
$cli verify

node - "$work/check.json" "$mode" <<'NODE'
const fs = require('fs');
const path = require('path');
const [file, mode] = process.argv.slice(2);
const report = JSON.parse(fs.readFileSync(file, 'utf8'))[0];
const fail = (msg, data) => { console.error(msg); if (data) console.error(JSON.stringify(data, null, 2)); process.exit(1); };
const section = (title) => report.sections.find((s) => s.title === title)?.diagnostics ?? [];
const skills = section('Skills');
const bad = skills.filter((d) => d.level === 'warn' || d.level === 'error' || /renderer|differ from agileflow\.lock/.test(d.message));
if (bad.length) fail('Skills section is not clean after a CRLF checkout:', bad);
const want = mode || (process.platform === 'win32' ? '(?:symlink|junction)' : 'symlink');
const visible = section('Providers').find((d) => new RegExp(`^Claude: visible in \\.claude/skills \\(\\d+ skills via ${want};`).test(d.message));
if (!visible) fail(`Claude links were not made as ${want}:`, section('Providers'));
const link = path.join('.claude', 'skills', 'diagnosing-bugs');
if (!fs.lstatSync(link).isSymbolicLink()) fail(`${link} is not a link`);
if (fs.realpathSync(link) !== fs.realpathSync(path.join('.agents', 'skills', 'diagnosing-bugs'))) fail(`${link} does not resolve to the canonical skill`);
if (mode === 'junction' && !path.isAbsolute(fs.readlinkSync(link))) fail('junction target is not absolute');
console.log(`${visible.message}`);
NODE
echo "cross-machine consistency: ok${mode:+ ($mode)}"
