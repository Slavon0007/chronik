# Source validation — 2026-11-03

The user-supplied list is represented once per source in `backend/sources.json`. Collection uses public HTML and JSON-LD, without AI or authentication.

| Source | Collection URL | Status |
|---|---|---|
| Mittelalterlich Phantasie Spectaculum | https://spectaculum.de/ | Enabled; deterministic adapter validated |
| Drachenfest | https://www.drachenfest-ticketshop.info/termine-df-und-zdl | Enabled; deterministic adapter validated |
| LARP-Kalender | https://www.larpkalender.de/termine | Enabled; deterministic adapter validated |
| Sündenfrei | https://www.suendenfrei.tv/terminuebersicht | Enabled; deterministic adapter validated |
| Mittelalterkalender | https://mittelalterkalender.info/ | Enabled; deterministic adapter validated |
| Larp Radar | https://larp-radar.com/de/larps/country/germany | Enabled; deterministic adapter validated |
| EventGilde | https://eventgilde.com/events | Enabled; deterministic adapter validated |
| Realms of Mythodea / Live Adventure | https://realmsofmythodea.com/ | Enabled; deterministic adapter validated |
| HistoFaber | https://histofaber.de/termine-und-veranstaltungen/termine-2026 | HTTP 503 on homepage and calendar during validation 2026-11-03; adapter pending. |
| History Event | https://history-event.de/ | HTTP 503 during validation 2026-11-03; adapter pending. |
| Vehi Mercatus | https://vehi-mercatus.de/marktkalender/ | HTTP 401 for calendar and year page during validation 2026-11-03; no authentication bypass attempted. |

Additional active sources: Burg Satzvey, DoKomi and AnimagiC.

Coverage limits: LARP-Kalender currently reads its 50 newest entries. Larp Radar reads the Germany country listing and its linked event pages. EventGilde reads the visible cards from its current and 2027 listings and their detail pages, capped at 24 pages. It does not claim to cover all database entries. Only listing seed pages expand to details; related events and login links are not crawled. No access controls are bypassed.

Live Adventure redirects to Realms of Mythodea. The detailed event announcements are used instead of the overview because dates can disagree. DrachenFest uses the official date page in its ticket shop, which is linked by its LARP site.

Unconfirmed/starred and cancelled organizer entries are excluded. Burg Satzvey dinner, workshop, seminar and reading entries are excluded. City/ZIP locations are approximate. Category, radius and date filters still apply to the published catalogue.
