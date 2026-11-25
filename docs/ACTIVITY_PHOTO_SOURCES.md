# Forma activity photography — sources and production constraints

**Owner approval:** 2026-11-25 (visual mockups are in ChatGPT Library `/Forma/ApprovedScreens/`).
The production assets in `src/assets/activities/` are optimized local WebP photographs selected to
reproduce the subjects approved in the mockups, **not extracts or pixel-identical copies of the
AI mockups**. Their license/credit should be checked before external commercial redistribution.

| Local file | Activity/subject | Source |
| --- | --- | --- |
| `gym.webp` | gym / athletic physique | https://images.unsplash.com/photo-1583454110551-21f2fa2afe61 |
| `outdoor.webp` | gravel bike with drop bars in forest | https://images.squarespace-cdn.com/content/v1/5af635497e3c3afe59776e1c/1534625388871-R592OH24UMMQHNF3QQQ5/david-hellmann-286496-unsplash.jpg (David Hellmann, Unsplash) |
| `workout.webp` | workout / gym outdoors | https://images.unsplash.com/photo-1599058917212-d750089bc07e |
| `combat.webp` | boxing gloves | https://images.unsplash.com/photo-1612179736716-d643f0bdcf4e |
| `crossfit.webp` | barbell / strength training | https://images.unsplash.com/photo-1517836357463-d25dfeac3438 |
| `hike.webp` | alpine landscape | https://images.unsplash.com/photo-1464822759023-fed622ff2c3b |
| `steps.webp` | walking / running | https://images.unsplash.com/photo-1552674605-db6ffd4facb5 |
| `series.webp` | runners / active season | https://images.unsplash.com/photo-1476480862126-209bfaa8edc8 |

The images are shipped locally in the app for predictable loading and offline support.
The source photographs must not include any text, logos or overlays intentionally added in Forma;
text and the contrast gradient are drawn by React/CSS.

Reference screenshots (approved concepts, not running application screenshots):
- `/Forma/ApprovedScreens/2026-11-25_activities_dark_autumn_APPROVED.png`
- `/Forma/ApprovedScreens/2026-11-25_stats_full_bleed_APPROVED.png`
