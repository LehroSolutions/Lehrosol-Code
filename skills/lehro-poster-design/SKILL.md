---
name: lehro-poster-design
description: "Design and generate social media posters for Lehro Solutions with diverse visual styles to avoid template fatigue. Generates unique-per-poster designs (gradients, geometry, abstract, minimal, bold, glass, tech, data-viz). Output: HTML preview and PNG capture via browser tool. Use when: creating social media posters, TikTok/Instagram/X posts, marketing visuals, announcement graphics, brand content, promo images, or any Lehro Solutions visual asset. Triggers on: poster, social media design, graphic, visual post, TikTok post, Instagram post, banner, flyer, promo image, announcement image, marketing visual."
---

# Lehro Poster Designer

Generates fresh, non-repetitive social media posters for Lehro Solutions. Every poster gets a unique visual identity — no same-feeling-template repetition.

## Core Workflow

1. **Clarify the ask** — topic, platform, copy/text, vibe (or propose them)
2. **Select a design style** from the palette below (auto-pick one; rotate away from recent styles)
3. **Build the HTML/CSS** using an appropriate template
4. **Render and capture** using browser tool
5. **Deliver the PNG**

## Style Palette

Rotate through these styles. Never render two posters of the same style in succession:

| # | Style ID | Vibe | Colors |
|---|----------|------|--------|
| 1 | **mesh-gradient** | Dreamy, modern | Soft multi-tone gradients |
| 2 | **geometric-bold** | Sharp, confident | Dark bg + bold geometric shapes |
| 3 | **glass-morphism** | Frosted, premium | Glass cards + subtle gradients |
| 4 | **tech-grid** | Coded, structured | Grid lines + monospace accents |
| 5 | **minimal-dark** | Clean, luxury | Pure dark + single accent color |
| 6 | **data-viz** | Analytical, smart | Charts/graphics as hero |
| 7 | **neon-glow** | Electric, energetic | Dark bg + neon color accents |
| 8 | **organic-organic** | Natural, approachable | Organic curves + warm tones |

### Recent-Style Check

Before choosing, check the last used style in `memory/poster-style-history.md`. If found, pick the next style in rotation. After rendering, record the style.

## Building the Poster

Use the templates in `assets/templates/` as starting points. Each template is a standalone HTML file with inline CSS — self-contained, no external deps.

### Template Structure

Every generated HTML file must:

- Be self-contained (all CSS inline in `<style>`)
- Use a fixed size: **1080×1080px** (square by default) unless platform demands otherwise
- Use **Inter** or **system font stack** for compatibility
- Include the Lehro Solutions brand colors as the foundation
- Have a clear visual hierarchy (headline > subline > logo/tag)

### Platform Sizes

| Platform | Size (px) | Aspect |
|----------|-----------|--------|
| Instagram/TikTok Square | 1080×1080 | 1:1 |
| TikTok/Reels Story | 1080×1920 | 9:16 |
| Twitter/X Post | 1600×900 | 16:9 |
| LinkedIn Post | 1200×627 | ~2:1 |

## Render & Capture

```
1. Write the HTML file to a temp path (e.g. /tmp/poster-[id].html)
2. Open in browser: browser(action="open", url="file:///...html")
3. Wait for render: 300ms
4. Screenshot: browser(action="screenshot", fullPage=false, type="png")
5. Download and save the PNG
```

## Brand Reference

Load `references/brand.md` for official brand colors, typography, tone of voice, and logo usage. These are the anchor points for every poster.

## Output Checklist

- [ ] Poster PNG saved to workspace
- [ ] Source HTML preserved for future edits
- [ ] Style ID recorded in `memory/poster-style-history.md`
- [ ] Brief description of design choices (for review)

## Anti-Repetition Rules

1. No consecutive posters share a style
2. Vary composition (center, left, top, diagonal — never default to center alignment every time)
3. Rotate accent colors even within the same style
4. Change hierarchy patterns (text-first vs graphic-first vs split)
