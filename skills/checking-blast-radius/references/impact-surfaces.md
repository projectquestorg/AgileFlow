# Impact surfaces

Places where a change commonly leaks beyond the files that were edited. Check only the items relevant to the change.

- **Public exports** — package entry points, barrel/index files, `exports` maps, anything re-exported to external users.
- **Shared contracts and schemas** — API request/response shapes, OpenAPI/GraphQL/protobuf definitions, JSON schemas, event payloads, serialized field names.
- **Persistence** — database migrations, existing data that must satisfy new constraints, cached or stored serialized objects, file formats on disk.
- **Config and environment** — config keys, defaults, env vars, feature flags, CLI flags; scripts, CI workflows, and deploy manifests that set them.
- **Generated code** — clients, types, or fixtures generated from the changed source; check whether they must be regenerated rather than hand-edited.
- **Consumers in other packages** — other workspaces in a monorepo, downstream services, plugins, and examples that import or call the changed code.
- **Docs and CLI help** — README usage, docs pages, `--help` text, error messages users match on, changelogs.
- **Tests and fixtures** — snapshots, mocks, and fixtures that encode the old behavior and may now pass for the wrong reason.
