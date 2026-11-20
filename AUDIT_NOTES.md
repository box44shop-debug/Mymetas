# Dependency audit

This branch isolates dependency-security review from `main`.

The audit workflow resolves the dependency tree, reports affected versions for `glob`, `minimatch`, and `workbox-build`, and stores the npm audit JSON as a workflow artifact.

No application dependencies or production data are changed by this note.
