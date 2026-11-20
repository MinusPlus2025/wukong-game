# Memory / lifecycle QA

- Chapter switch disposes old terrain, props, landmark, sky, fire wall, particles and their materials/textures.
- Enemy clear disposes cloned skins, geometries, materials and maps; mixer/actions are stopped.
- Playwright/Chrome measurement across 4 chapter switches (JS heap, MB): 145 → 77 → 98 → 110.
- renderer.info.memory after switches: geometries 68–110, textures 51–72; no unbounded growth observed in the 4-switch sample.
- Remaining browser process/GPU memory is not fully captured by performance.memory; a long soak test is still recommended.
