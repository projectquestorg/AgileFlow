# windows-mirror

Fixture for environments where directory links are unavailable. Tests run it with
`AGILEFLOW_LINK_MODE=mirror`, which makes the Claude adapter write generated
mirrors (marked with `.agileflow-mirror.json`) instead of symlinks.
