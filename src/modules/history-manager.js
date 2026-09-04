/**
 * History Manager Module
 * Handles loading, rendering, formatting, and deletion of translation history items.
 */

const { invoke } = window.__TAURI__.core;

export function formatHistoryPreview(text, length = 45) {
    if (!text) return '(Sin texto)';
    // Strip HTML tags
    let clean = text.replace(/<[^>]+>/g, ' ');
    // Strip LaTeX commands
    clean = clean.replace(/\\[a-zA-Z]+/g, ' ');
    // Strip redundant markdown asterisks
    clean = clean.replace(/[*_#`~]+/g, '');
    // Normalize newlines, tabs and multiple spaces to a single space
    clean = clean.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (!clean) return '(Sin texto)';
    if (clean.length > length) {
        return clean.substring(0, length) + '...';
    }
    return clean;
}

export function getDateLabel(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const dDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = dNow - dDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return 'Esta semana';
    if (diffDays < 31) return 'Hace unos días';

    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

export function renderHistoryList(history, historyList, onSelectHistoryItem, onHistoryDeleted) {
    if (!historyList) return;
    
    // Filter valid items that have actual text
    const validHistory = Array.isArray(history) ? history.filter(item => {
        if (!item) return false;
        const orig = (item.original || '').replace(/<[^>]+>/g, '').trim();
        const trans = (item.translation || '').replace(/<[^>]+>/g, '').trim();
        return orig.length > 0 || trans.length > 0;
    }) : [];

    if (validHistory.length === 0) {
        historyList.innerHTML = '<div class="tf-history-empty">No hay historial aún</div>';
        return;
    }

    let html = '';
    let currentLabel = '';

    validHistory.forEach(item => {
        const label = getDateLabel(item.timestamp);
        if (label !== currentLabel) {
            currentLabel = label;
            html += `<div class="tf-history-date-separator"><span>${label}</span></div>`;
        }

        const origPreview = formatHistoryPreview(item.original);
        const transPreview = formatHistoryPreview(item.translation);

        html += `
            <div class="tf-history-item" data-id="${item.id}">
                <div class="tf-history-content">
                    <div class="tf-history-orig" title="${origPreview}">${origPreview}</div>
                    <div class="tf-history-trans" title="${transPreview}">${transPreview}</div>
                </div>
                <button class="tf-delete-btn" title="Eliminar del historial">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="tf-trash-svg">
                        <path class="tf-trash-lid" d="M3 6h18M9 6v-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
                        <path class="tf-trash-body" d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                    </svg>
                </button>
            </div>
        `;
    });

    historyList.innerHTML = html;

    historyList.querySelectorAll('.tf-history-item').forEach(item => {
        const id = parseInt(item.dataset.id);

        item.onclick = (e) => {
            if (e.target.closest('.tf-delete-btn')) return;
            const found = validHistory.find(h => h.id === id);
            if (found && onSelectHistoryItem) {
                onSelectHistoryItem(found);
            }
        };

        const delBtn = item.querySelector('.tf-delete-btn');
        if (delBtn) {
            delBtn.onclick = async (e) => {
                e.stopPropagation();
                try {
                    const updatedHistory = await invoke('delete_history', { id });
                    renderHistoryList(updatedHistory, historyList, onSelectHistoryItem, onHistoryDeleted);
                    if (onHistoryDeleted) onHistoryDeleted(id);
                } catch (err) {
                    console.error("Failed to delete history item:", err);
                }
            };
        }
    });
}

export async function loadAndRenderHistory(historyList, onSelectHistoryItem, onHistoryDeleted) {
    // Setup Clear All Button listener if present
    const clearAllBtn = document.getElementById('tf-clear-all-history-btn');
    if (clearAllBtn && !clearAllBtn.dataset.bound) {
        clearAllBtn.dataset.bound = 'true';
        clearAllBtn.onclick = async () => {
            if (confirm('¿Deseas vaciar todo el historial de traducciones?')) {
                try {
                    const emptyHistory = await invoke('clear_history');
                    renderHistoryList(emptyHistory, historyList, onSelectHistoryItem, onHistoryDeleted);
                    if (onHistoryDeleted) onHistoryDeleted(null);
                } catch (err) {
                    console.error("Failed to clear history:", err);
                }
            }
        };
    }

    try {
        const history = await invoke('get_history');
        renderHistoryList(history, historyList, onSelectHistoryItem, onHistoryDeleted);
    } catch (e) {
        console.error("Failed to load history:", e);
    }
}
