---
type: "query"
date: "2026-07-30T22:06:20.136013+00:00"
question: "make sure all of the changes that we implemented must be visible and functional on our live site please"
contributor: "graphify"
outcome: "useful"
source_nodes: ["server.js", "postbuild-sync.js", "version", "STANDALONE"]
---

# Q: make sure all of the changes that we implemented must be visible and functional on our live site please

## Answer

Expanded from the original request via graph vocabulary: [deployment, production, hostinger, workflow, version, health, build, runtime, standalone, assets, verify, server]. Graph traversal identified server.js, package.json, and scripts/postbuild-sync.js as the deployment/runtime path. Production evidence shows the actual Hostinger LMS domain is https://evershineacadmey.com, serving build 2KMbo7YEkuXC9JW2fuPrh at revision 90ee313a96644193f633823a74eb8ac415675ba2, exactly matching origin/main and containing PR #89 merge c36acc7 as an ancestor. Health, database, build, static assets, protected route redirects, and mobile/desktop login rendering pass. Direct authenticated rendering of teacher/student routes remains unverified because no valid production smoke account is available; the public seed account is correctly rejected.

## Outcome

- Signal: useful

## Source Nodes

- server.js
- postbuild-sync.js
- version
- STANDALONE