# Historical profile compatibility

Older Workflow chains may contain Core Reference profile records, custom
profile records, preset overlays, or model-plan assignments. The engine keeps
those event shapes readable so an append-only chain can be replayed, but the
current CLI and portal do not expose live profile CRUD or profile rendering.

The current conference position surface uses `--actor-id` for an arbitrary
protocol actor and optional `--stance` text. It does not consult a profile
roster. The event's attestation actor and the position's attribution actor are
separate fields; neither is proof of identity.

Do not invoke or teach the retired profile and model-plan verbs. Use the current
dispatch settings (`execution.dispatchClasses`, `execution.dispatchMode`,
`execution.dispatchModes`, and `execution.dispatchTiers`) and
`host-render` for host-owned model configuration.

Historical profile text is compatibility data only. It does not grant host
authority, approval authority, access to private history, or permission to
write a workspace.
