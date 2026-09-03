/**
 * Sentence Sync and Interactive Scroll Module
 * Handles hover synchronization and click-to-scroll exact positioning
 * between original text panel and translated text panel.
 */

export function setupSentenceSync() {
    // 1. Mouseover / mouseout highlight synchronization
    const syncHighlight = (e, isEnter) => {
        const sentence = e.target.closest('.tf-sentence');
        if (!sentence) return;
        const index = sentence.dataset.index;
        if (index === undefined || index === null) return;

        const targetSide = sentence.closest('.tf-input-side') ? '.tf-output-side' : '.tf-input-side';
        const mirror = document.querySelector(`${targetSide} .tf-sentence[data-index="${index}"]`);
        
        if (isEnter) {
            sentence.classList.add('tf-sentence-highlighted');
            if (mirror) mirror.classList.add('tf-sentence-highlighted');
        } else {
            sentence.classList.remove('tf-sentence-highlighted');
            if (mirror) mirror.classList.remove('tf-sentence-highlighted');
        }
    };

    document.addEventListener('mouseover', (e) => syncHighlight(e, true));
    document.addEventListener('mouseout', (e) => syncHighlight(e, false));

    // 2. Click synchronization: scroll the opposite panel directly to the mirrored sentence/paragraph
    document.addEventListener('click', (e) => {
        // If user is selecting text, don't trigger auto-scroll
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) return;

        const sentence = e.target.closest('.tf-sentence');
        if (!sentence) return;

        const index = sentence.dataset.index;
        if (index === undefined || index === null) return;

        const isOriginalSide = !!sentence.closest('.tf-input-side');
        const targetSide = isOriginalSide ? '.tf-output-side' : '.tf-input-side';
        const mirror = document.querySelector(`${targetSide} .tf-sentence[data-index="${index}"]`);

        if (mirror) {
            // Smoothly scroll the mirror sentence into the center of its scroll container
            mirror.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Visual feedback flash
            mirror.classList.add('tf-sentence-highlighted');
            setTimeout(() => {
                // If not currently hovered, remove highlight
                if (!mirror.matches(':hover')) {
                    mirror.classList.remove('tf-sentence-highlighted');
                }
            }, 1200);
        }
    });
}
