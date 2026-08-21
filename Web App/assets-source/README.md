# assets-source

Original designer deliverables, kept out of `frontend/public/` because they are **not**
web-servable in the form they arrived in. Nothing here is loaded at runtime.

## `last-pages-cmyk/`

The project owner's print-ready last-page artwork, exactly as supplied: A4 at 300dpi
(2480×3508), **CMYK with a U.S. Web Coated (SWOP) v2 profile**.

These are the masters. The copies the app actually serves live at
`frontend/public/components/images/` under the same filenames and were converted to
**sRGB IEC61966-2.1** on 2026-08-21 (`sips -m "sRGB Profile.icc" -s formatOptions best`).

**Why the conversion was needed.** The PDF renderer is a headless browser, and its
implicit CMYK→RGB conversion was noticeably lighter than a colour-managed one: the
Kinder mascot's rich black came out `rgb(71,68,70)` in the rendered PDF, versus
`rgb(36,30,32)` converting the same pixel through ColorSync. Converting once, up front,
makes the conversion controlled and reviewable instead of a side effect of whichever
browser build renders the PDF. (Primary's darkest pixel converts to `rgb(0,2,1)`.)

**If the designer ships new artwork:** drop the CMYK original here, convert a copy into
`frontend/public/components/images/`, and keep the filename identical — `LastPage.tsx`
maps level → filename.

**If a real print run is ever needed**, use these CMYK masters, not the sRGB copies —
round-tripping RGB back to CMYK will not reproduce the original separations.
