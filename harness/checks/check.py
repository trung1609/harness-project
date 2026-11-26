"""Small, dependency-free checks; failures and missing inputs return nonzero."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
REQUIRED_DOCS = ('AGENTS.md', 'README.md', 'docs/PROJECT.md', 'docs/ROADMAP.md', 'docs/PROGRESS.md', 'docs/CONVENTIONS.md', 'docs/SECURITY.md', 'harness/README.md', 'harness/policy/state.json')
REQUIRED_AGENT_FILES = (
    '.agents/rules/core.md',
    '.agents/rules/quality-gates.md',
    '.agents/rules/nestjs-architecture.md',
    '.agents/rules/frontend-design.md',
    '.agents/workflows/task.md',
    '.agents/workflows/phase-gates.md',
    *('.agents/skills/' + name + '/SKILL.md' for name in (
        'project-requirements',
        'project-architecture',
        'project-planning',
        'project-implementation',
        'project-review',
        'project-harness-improvement',
        'frontend-design',
    )),
)


def validate_scope(paths):
    if not isinstance(paths, list) or not paths:
        raise ValueError('allowed_paths must be a nonempty list')
    for path in paths:
        if not isinstance(path, str) or not path or '\\' in path or any(c in path for c in '*?[]:'):
            raise ValueError('invalid allowed path')
        parts = path.rstrip('/').split('/')
        if path.startswith('/') or any(part in ('', '.', '..') for part in parts) or parts[0] == '.git':
            raise ValueError('invalid allowed path')


def out_of_scope(paths, allowed):
    validate_scope(allowed)
    return sorted(path for path in paths if not any(path.startswith(rule) if rule.endswith('/') else path == rule for rule in allowed))


def changed_paths(root, baseline):
    def git(*args):
        result = subprocess.run(['git', '-C', str(root), *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError(result.stderr.decode('utf-8', errors='replace').strip())
        return {item.decode('utf-8', errors='surrogateescape') for item in result.stdout.split(b'\0') if item}
    git('rev-parse', '--verify', baseline + '^{commit}')
    return sorted(git('diff', '--name-only', '--no-renames', '-z', baseline, '--') | git('diff', '--cached', '--name-only', '--no-renames', '-z', baseline, '--') | git('diff', '--name-only', '--no-renames', '-z', '--') | git('ls-files', '--others', '--exclude-standard', '-z'))


def read_baseline_policy(root, baseline, path):
    validate_scope([path])
    if path.endswith('/'):
        raise ValueError('policy must be a file path')
    result = subprocess.run(['git', '-C', str(root), 'show', baseline + ':' + path], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError('could not read policy from baseline: ' + result.stderr.decode('utf-8', errors='replace').strip())
    return json.loads(result.stdout.decode('utf-8'))


def validate_state(state):
    if not isinstance(state, dict):
        return ['state must be an object']
    errors = []
    for key in ('phase', 'task'):
        if not isinstance(state.get(key), str) or not state[key].strip():
            errors.append(key + ' must be a nonempty string')
    if state.get('status') not in ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETE'):
        errors.append('invalid status')
    for key in ('completed', 'blocked', 'issues', 'evidence'):
        if not isinstance(state.get(key), list) or any(not isinstance(item, str) or not item.strip() for item in state[key]):
            errors.append(key + ' must be a list of nonempty strings')
    return errors


def validate_evidence_paths(root, state):
    evidence = state.get('evidence') if isinstance(state, dict) else None
    if not isinstance(evidence, list):
        return []
    return [
        f'missing evidence: {item}'
        for item in evidence
        if isinstance(item, str) and item.strip() and not (root / item).exists()
    ]


def validate_docs(root):
    errors = [f'missing {name}' for name in REQUIRED_DOCS + REQUIRED_AGENT_FILES if not (root / name).is_file()]
    for name in REQUIRED_AGENT_FILES:
        path = root / name
        if path.name == 'SKILL.md' and path.is_file():
            errors.extend(f'{name}: {error}' for error in validate_skill(path))
    return errors


def validate_skill(path):
    # Project skills deliberately use this small, unquoted YAML subset.
    lines = path.read_text(encoding='utf-8').splitlines()
    if len(lines) < 4 or lines[0] != '---' or lines[3] != '---':
        return ['expected name and description frontmatter']
    name = re.fullmatch(r'name: ([a-z0-9]+(?:-[a-z0-9]+)*)', lines[1])
    description = re.fullmatch(r'description: ([^\[\]{}#"\'\r\n]+)', lines[2])
    if not name or name.group(1) != path.parent.name or not description or not description.group(1).strip() or ': ' in description.group(1):
        return ['invalid name or description frontmatter']
    return []


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('context')
    scope = sub.add_parser('scope')
    scope.add_argument('--base', required=True)
    policies = scope.add_mutually_exclusive_group(required=True)
    policies.add_argument('--policy', type=Path)
    policies.add_argument('--policy-from-base')
    args = parser.parse_args()
    try:
        if args.command == 'context':
            errors = validate_docs(ROOT)
            state_file = ROOT / 'harness/policy/state.json'
            if state_file.is_file():
                state = json.loads(state_file.read_text(encoding='utf-8'))
                errors.extend(validate_state(state))
                errors.extend(validate_evidence_paths(ROOT, state))
        else:
            policy = read_baseline_policy(ROOT, args.base, args.policy_from_base) if args.policy_from_base else json.loads(args.policy.read_text(encoding='utf-8'))
            if not isinstance(policy, dict):
                raise ValueError('policy must be an object')
            errors = ['out of scope: ' + p for p in out_of_scope(changed_paths(ROOT, args.base), policy.get('allowed_paths'))]
        if errors:
            print('\n'.join(errors), file=sys.stderr)
            return 1
        print('PASS:', args.command)
        return 0
    except (OSError, ValueError, RuntimeError) as exc:
        print('BLOCKED:', exc, file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
