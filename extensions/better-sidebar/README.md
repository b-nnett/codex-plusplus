# better-sidebar

Moves the sidebar's ellipsis (Explore) button to the bottom of the navigation
list, just above the profile button. Its original menu remains intact.

Right-click your dot's row (for example, **gremlin**) and choose **Pin to sidebar**.
Its icon appears in the navigation rail below a divider, above the existing
pinned destinations. A lower divider separates it from any destinations below;
there is no lower divider when your dot is the last destination. Click it to open
your dot. Another divider separates the dot from pinned projects. Right-click the icon or the
original row to **Unpin from sidebar**. Shift+F10 also opens these menus.

The pin preference is stored locally per signed-in account and survives app
restarts and extension toggles. Disabling removes the added section and menu
handler; re-enabling restores your pin.

Install this folder through **Settings → Codex++ → Extensions**, then enable
**better-sidebar**. Disabling it restores the original position immediately.

Matches the ellipsis SVG's first dot path inside the navigation rail's popover
buttons, as verified in ChatGPT 26.1007.21159. It does not depend on the translated
Explore label or generated element IDs. An icon or markup change may require a
selector update.

The dot menu adapter reads React's existing menu and navigation callbacks and
uses the app's localization provider to preserve the original native actions,
labels, icons, and shortcuts. It does not mutate React internals. These internal
bindings are version-dependent; if they are unavailable, the original row menu
continues to work. Pin/Unpin text currently uses English.

CSS applies automatically when the sidebar rerenders. On short windows, the
navigation list retains its normal scrolling behavior.

Right-click a project and choose **Pin to sidebar**. This is separate from the
app's existing **Pin** action. Its rail icon opens a view of that project's chats
and sections under **Recents**, regardless of its pin in the normal sidebar,
with the project title replacing the Codex/ChatGPT sidebar heading.
Click **Home** to restore the normal sidebar; other rail destinations leave the
project view too.

Create a section through the native section ellipsis menu's **New section**, or
the chat menu's **Move to section → New section…**. Both use the app's existing
creation dialog. Right-click empty space beneath the chat list to create a section
there too. The native app stores the full name, such as
`ajar » in-review`. Inside ajar it displays `in-review`; elsewhere the full name
identifies its project. Project menus filter section choices to that project.
Project IDs retain section ownership even if a project is renamed. Existing
unprefixed sections remain in the normal sidebar.

Project pins and section ownership are local per account. Created sections use
the app's native section store and remain available when the extension is off.
The native section/router adapter is reviewed for build 26.1007.21159 and must
be updated if the app changes its bundle or internal exports. Unsupported
section creation logs an adapter error instead of writing a separate section store.

Added rail icons use the app's own tooltip component and shared hover manager.
Home uses its native outline icon and suppresses its selected background while a
dot or project icon is active. Project chat rows and Show more align with Recents.

Press **⌘⇧1–9** to select pinned projects in rail order. Their native tooltips
show the corresponding shortcut. Pinned icons retain their original context
menu actions, including a project's **Edit** action.

Right-click **Space**, **Scheduled**, or **Plugins** and choose **Unpin from
sidebar** to move it into Explore. Explore uses the app's native popover, rows,
icons, tooltips, and destination actions. Its pin button or context menu restores
the destination to the rail. Scheduled's **Mark all as read** remains available.
These preferences are local per account; disabling restores the native rail.
If the Explore adapter is unavailable, destinations stay accessible in the rail.

Inside a pinned project, **Pin chat** creates or reuses its own native **Pinned**
section. It is stored as `{ProjectName} » Pinned` and displayed as **Pinned**
inside that project. The context menu and inline pin button use project section
membership, independently of the global chat pin controls. **Unpin chat** removes
the chat from this project section; the section is retained for future pins.
Project pins therefore remain available as named native sections elsewhere and
when the extension is disabled. Existing custom-section membership follows the
app's normal rule that a chat belongs to one custom section at a time.

Project Pinned appears before the project's other sections and Recents. Rail
selection is marked before navigation, so Home keeps its outline and inactive
color while switching between a project and the dot, including native rerenders.

Empty project Pinned sections are hidden until a chat is pinned again. Hidden
chat wrappers are removed from the focused layout so Recents has normal spacing.
Home's outline ignores pointer events and uses native hover opacity transitions.

Activity and Priority lists in a pinned project use the native rows’ project IDs
to show only that project's chats. Empty day groups and their spacers are hidden;
the native Activity controls remain available. Home restores the full list.

Pinned project context menus reuse the native project actions button, including
Edit, even when the project row itself exposes an empty context menu.

Images, Scheduled, Plugins, and Space/Library can be unpinned into Explore.
Context menus resolve native button data even when the click lands on an SVG
path without a React fiber, and retain native destination actions.

Hovering a pinned project while the sidebar is closed uses the app’s native
Home peek and animation, scoped to that project. Leaving the preview restores
the selected project; opening the sidebar or interacting with the preview keeps
the displayed project selected without navigating away from the current chat.

Right-click empty sidebar space and choose **Sidebar Style → Latest / Old**.
Empty space in Latest’s outer navigation rail offers the same style menu.
Latest is the default; Old uses the app’s existing classic sidebar layout, with
labeled navigation and the native profile footer. The choice is saved per
account. Disabling the extension restores the app’s original layout setting.
