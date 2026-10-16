Linear lets you find a Linear issue without leaving Paseo and give it to an agent. The agent gets the issue as an attachment with its title, link, status, priority, assignee, project, labels and full description. This plugin is not made by Linear.

There are two ways to use it:

- **Send a Linear issue.** A Linear button in every agent's composer opens a search popover. Pick an issue, add an optional message, check the exact text the agent will get, then press Send. If the agent is busy, the button changes to Send and steer, and the issue goes into the current turn.
- **Attach Linear issue.** The composer's + menu gets a Linear issue picker. The issue becomes an attachment on the message you are writing, like a file.

Search uses the same rules in both places. Type an identifier such as `ENG-1234` to open that issue directly. Other text matches issue titles. Issues assigned to you come first, then other issues, up to 30, each group sorted by most recently updated. An empty search shows your recent issues. Results you already saw appear immediately and refresh in the background.

## Setup

The plugin needs a Linear personal API key. Create one in Linear under Settings > Security & access > Personal API keys. Then open Paseo's Settings > Plugins, choose Connection in the Linear plugin's menu, and paste the key. The plugin checks the key with Linear as you type and saves it when Linear accepts it. The screen then shows which Linear account is connected, and a Remove button deletes the saved key.

You can set `LINEAR_API_KEY` in the Paseo daemon's environment instead. A key saved in Settings takes precedence. Requires Paseo 0.11.4 or later.

## Data and permissions

- A key you paste is saved on the Paseo host in `$PASEO_HOME/plugin-data/linear/api-key` (by default under `~/.paseo`), readable only by the user that runs the daemon. Apps connected to the host never receive it back; they only see which Linear account is connected. Without a saved key, the plugin uses `LINEAR_API_KEY` from the host environment.
- The host sends requests only to `api.linear.app`, and only after a key is set.
- The plugin only reads from Linear. It never creates or changes issues or comments.
- The issue text you send becomes part of the agent's prompt, so the agent provider receives it.
- Search results are kept only in the app's memory, at most 50 searches, until Paseo restarts.

## Limits

- Search matches titles only, not descriptions or comments.
- Arrow keys do not move the highlight in the popover. Use the mouse or type a more specific search.
- The iOS and Android apps show a generic icon on the button instead of the Linear logo.
