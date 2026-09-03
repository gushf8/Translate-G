/**
 * History Manager Module
 * Handles loading, rendering, formatting and deletion of translation history items.
 */

const { invoke } = window.__TAURI__.core;

function truncate(text, length = 40) {
    return text.length > length ? text.substring(0, length) + '...' : text;
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
    if (!history || history.length === 0) {
        historyList.innerHTML = '<div class="tf-history-empty">No hay historial aún</div>';
        return;
    }

    let html = '';
    let currentLabel = '';

    history.forEach(item => {
        const label = getDateLabel(item.timestamp);
        if (label !== currentLabel) {
            currentLabel = label;
            html += `<div class="tf-history-date-separator"><span>${label}</span></div>`;
        }

        html += `
            <div class="tf-history-item" data-id="${item.id}">
                <div class="tf-history-content">
                    <div class="tf-history-orig">${truncate(item.original)}</div>
                    <div class="tf-history-trans">${truncate(item.translation)}</div>
                </div>
                <button class="tf-delete-btn" title="Eliminar">
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
            const found = history.find(h => h.id === id);
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
    try {
        const history = await invoke('get_history');
        renderHistoryList(history, historyList, onSelectHistoryItem, onHistoryDeleted);
    } catch (e) {
        console.error("Failed to load history:", e);
    }
}
