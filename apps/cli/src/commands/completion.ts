import type { Command } from 'commander';
import type { Cli } from '../runtime';
import { EXIT, UsageError } from '../runtime';

interface Tree {
  commands: string[];
  options: Record<string, string[]>;
}

function describe(program: Command): Tree {
  const options: Record<string, string[]> = {};
  const commands: string[] = [];
  const flags = (cmd: Command) => cmd.options.flatMap((o) => [o.long, o.short].filter((f): f is string => !!f));
  options[''] = [...flags(program), '--help', '--version'];
  for (const cmd of program.commands) {
    if ((cmd as unknown as { _hidden?: boolean })._hidden) continue;
    commands.push(cmd.name());
    options[cmd.name()] = [...flags(cmd), '--help'];
    for (const sub of cmd.commands) options[`${cmd.name()} ${sub.name()}`] = [...flags(sub), '--help'];
    if (cmd.commands.length) options[`${cmd.name()}:sub`] = cmd.commands.map((c) => c.name());
  }
  return { commands, options };
}

function bash(tree: Tree): string {
  const cases = Object.entries(tree.options)
    .filter(([k]) => k && !k.endsWith(':sub'))
    .map(([k, v]) => {
      const subs = tree.options[`${k}:sub`] ?? [];
      return `    "${k}") opts="${[...subs, ...v].join(' ')}" ;;`;
    })
    .join('\n');
  return `# agileflow bash completion. Install: agileflow completion bash >> ~/.bashrc
_agileflow() {
  local cur key opts
  cur="\${COMP_WORDS[COMP_CWORD]}"
  key="\${COMP_WORDS[1]}"
  if [ "$COMP_CWORD" -ge 3 ] && [[ "\${COMP_WORDS[2]}" != -* ]]; then key="\${COMP_WORDS[1]} \${COMP_WORDS[2]}"; fi
  if [ "$COMP_CWORD" -eq 1 ]; then
    opts="${tree.commands.join(' ')} ${tree.options['']!.join(' ')}"
  else
    case "$key" in
${cases}
    *) opts="" ;;
    esac
  fi
  COMPREPLY=( $(compgen -W "$opts" -- "$cur") )
}
complete -o default -F _agileflow agileflow
`;
}

function zsh(tree: Tree): string {
  return `#compdef agileflow
# agileflow zsh completion. Install: agileflow completion zsh > "\${fpath[1]}/_agileflow"
_agileflow() {
  local -a commands
  commands=(${tree.commands.map((c) => `'${c}'`).join(' ')})
  if (( CURRENT == 2 )); then
    _describe 'command' commands
    return
  fi
  local key="\${words[2]}"
  if (( CURRENT >= 4 )) && [[ "\${words[3]}" != -* ]]; then key="\${words[2]} \${words[3]}"; fi
  case "$key" in
${Object.entries(tree.options)
  .filter(([k]) => k && !k.endsWith(':sub'))
  .map(([k, v]) => `    "${k}") compadd -- ${[...(tree.options[`${k}:sub`] ?? []), ...v].join(' ')} ;;`)
  .join('\n')}
  esac
}
compdef _agileflow agileflow
`;
}

function fish(tree: Tree): string {
  const lines = ['# agileflow fish completion. Install: agileflow completion fish > ~/.config/fish/completions/agileflow.fish'];
  lines.push(`complete -c agileflow -f -n '__fish_use_subcommand' -a '${tree.commands.join(' ')}'`);
  for (const [k, v] of Object.entries(tree.options)) {
    if (!k || k.includes(' ') || k.endsWith(':sub')) continue;
    const subs = tree.options[`${k}:sub`];
    if (subs) lines.push(`complete -c agileflow -f -n '__fish_seen_subcommand_from ${k}' -a '${subs.join(' ')}'`);
    for (const flag of v.filter((f) => f.startsWith('--'))) {
      lines.push(`complete -c agileflow -n '__fish_seen_subcommand_from ${k}' -l ${flag.slice(2)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** `agileflow completion <bash|zsh|fish>`: print a shell completion script. */
export function runCompletion(cli: Cli, program: Command, shell: string | undefined): number {
  const tree = describe(program);
  const scripts: Record<string, (t: Tree) => string> = { bash, zsh, fish };
  if (!shell || !scripts[shell]) throw new UsageError('Use: agileflow completion <bash|zsh|fish>');
  cli.out.stdout.write(scripts[shell]!(tree));
  return EXIT.OK;
}
