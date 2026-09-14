# Good Hand

A mobile-first, installable PWA for home poker cash games. One host records players, buy-ins, rebuys, final chip values, blinds and settlements. Data stays in the host's browser; there is no multi-device synchronization.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:5180. Add `?demo=1` for an isolated, disposable sample game. The production build includes the offline service worker; the development server does not.

```sh
npm run build
npm run preview
npm test
```

For the browser flow test, serve the production build on http://127.0.0.1:5181 and run `node tests/browser.mjs` (Google Chrome required). It covers the game lifecycle, validation, fixed blinds, payments, persistence, offline reload and mobile widths.

## Home game flow

1. Start a cash game from a saved template or a fresh setup. Review the game name, currency, standard buy-in, fixed blinds and payment method. Optionally save the setup as a template while starting the game.
2. Add players. Tap a player row to choose Rebuy or Cash out. Slide to adjust the amount, or tap the number to enter exact cents. Cash-out records the remaining chip value; it does not move money.
3. Blinds remain fixed for the entire game. Edit them manually from the Blinds screen if needed. Older timed games keep their last recorded level and stop advancing.
4. End now stops the clock and saves the game immediately, even with no cash-outs. Finish missing cash-outs later from History. Who pays whom previews payments only after all cash-outs are recorded and equal the buy-ins. No rake or fees are deducted.
5. On a tab: settle net results between players. Paid up front: pay gross cash-outs from the game bank. Mark payments paid as they happen; this is bookkeeping, not payment processing.
6. Settings → Saved templates lets you create, rename, edit, and remove reusable setups. Templates contain settings only and never copy players, cash-outs or payments. JSON backups include templates; older backups remain supported. Templates with the same name but distinct IDs are renamed on import rather than dropped.
7. History retains results and unpaid settlements. The Players view aggregates names case-insensitively and keeps different currencies separate.

Amounts use integer cents. Zero chip cash-outs are supported. A capped undo history covers player changes during the current session. Ended games remain editable until all cash-outs reconcile; completed, balanced games are immutable apart from payment status. Unfinished games are excluded from lifetime player results. Export JSON backups in Settings. Restoring merges games by ID without replacing existing games and rejects multiple open games. Existing IDs are intentionally kept, so restore does not overwrite a newer version of a game.

## PWA

The production build precaches the app, icons and self-hosted fonts. HTTPS (or localhost) is required for installation and service workers. On iOS, use Safari → Share → Add to Home Screen. On supported Android/desktop browsers, use the app's install button or browser menu. Installation support varies by browser. Once visited and cached, navigation and saved games work offline.

Local data is specific to browser and origin and is not automatically transferred between preview and hosted URLs, different browsers, or devices. Export a backup before clearing site data. No data leaves the device except explicit result/backup downloads or copying text. Sites hosting is owner-private by default.

## Design references

Researched using Mobbin MCP; adapted into an original phone-first interface:
- [Splitwise group balances](https://mobbin.com/screens/a65c5e3d-efa0-456e-8cf2-dc87f760e198): named people, clear amounts, settle-up actions.
- [Splitwise activity](https://mobbin.com/screens/e0d16eba-18ae-4a6f-bd5a-0c7ac71d06c3): chronological group ledger.
- [Splitwise group setup](https://mobbin.com/screens/a81c0b8a-a1e1-4b66-bd4b-3d3f1c1177ea): compact setup fields and grouped choices.
- [Bevel template chooser](https://mobbin.com/screens/ceb67dfb-5132-4af1-bc5e-2e04baf4bf85): clear selectable options, strong selection state and one continue action.

Typography: DM Sans, bundled locally. Monochrome surfaces and controls. Icons: Phosphor. React, TypeScript, Vite and vite-plugin-pwa. Native HTML dialogs provide focus management, Escape dismissal and phone bottom sheets. An optional, feature-detected WebMCP `get_game_summary` tool exposes a read-only game summary; its contract is tested with an injected registry because the test browser lacks the proposed native API.

PWA implementation references: [Vite PWA guide](https://vite-pwa-org.netlify.app/guide/) and [MDN installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
