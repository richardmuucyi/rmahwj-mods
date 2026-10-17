# image-open

Paste an image into Claude Code with Alt+V and an `[open]` button appears above the prompt for each `[Image #N]`. Pressing it opens the full-size picture in your default image viewer. There is no thumbnail.

How it works: the mod saves the clipboard picture as a PNG in your temp folder (`image-open` subfolder), then opens that file. PNG copies older than a day are deleted from that folder.

Windows only: the save step uses PowerShell.

Install: `/plugin install image-open@rmahwj-mods`, then `/reload-plugins`.
