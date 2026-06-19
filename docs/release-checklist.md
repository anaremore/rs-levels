# Release Checklist

Before any public release:

- Choose and add an explicit license.
- Confirm all code is display-data only.
- Run private-term and secret scans.
- Build from a clean clone.
- Test service startup on Windows, macOS, and Linux.
- Test extension install instructions from scratch.
- Verify the service binds to `127.0.0.1` by default.
- Verify plugins do not reference platform order APIs.
- Publish checksums for packaged artifacts.

