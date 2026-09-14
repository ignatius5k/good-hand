# Good Hand workflow

User preference: after every change, use subagents to walk through the UI and identify points of difficult use. Report the findings to the user, fix actionable problems, and recheck affected flows before delivery.

Run UI reviews on the local app using isolated browser sessions and disposable test data. Preserve actual saved games. Review mobile layouts first. Reviewers should not edit files or invoke Sites tools; the main agent owns implementation and publishing.

Keep the interface primarily black and white, with a simple readable sans-serif font and minimal clutter. Blinds are fixed. Preserve reusable game templates, immediate game ending with deferred cash-outs, exact automatic settlements, and slider plus exact-entry amounts.

The user requested GitHub and GitHub Pages publication. The primary repository is `ignatius5k/good-hand` and live URL is https://ignatius5k.github.io/good-hand/. Publish through `.github/workflows/pages.yml` on `main`; it sets `GOOD_HAND_BASE=/good-hand/`. Preserve the existing `.openai/hosting.json` for compatibility, but use GitHub Pages for subsequent requested deployments unless the user chooses another host.
