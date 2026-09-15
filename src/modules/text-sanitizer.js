/**
 * Text Sanitizer and Formatter Module
 */

export function extractFormattedText(container) {
    if (!container) return '';
    const clone = container.cloneNode(true);

    // Normalize strong -> b, em -> i
    clone.querySelectorAll('strong').forEach(el => {
        const b = document.createElement('b');
        b.innerHTML = el.innerHTML;
        el.replaceWith(b);
    });
    clone.querySelectorAll('em').forEach(el => {
        const i = document.createElement('i');
        i.innerHTML = el.innerHTML;
        el.replaceWith(i);
    });

    // Convert line break elements into \n
    clone.querySelectorAll('.tf-line-empty').forEach(el => el.replaceWith('\n'));
    clone.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
    clone.querySelectorAll('.tf-line, p, div').forEach(el => {
        el.append('\n');
    });

    let text = clone.innerHTML || clone.innerText || '';

    // Remove span wrapper tags (.tf-sentence etc.) but preserve inner content
    text = text.replace(/<span[^>]*>/gi, '').replace(/<\/span>/gi, '');
    // Remove div/p wrapper tags
    text = text.replace(/<\/?(div|p)[^>]*>/gi, '');
    // Normalize newlines
    text = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    return text;
}

export function renderMarkdownFormatting(text) {
    if (!text) return '';
    // Markdown headers: # Heading -> <b>Heading</b>
    text = text.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');
    // Bold + Italic: ***text***
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<b><i>$1</i></b>');
    // Bold: **text** or __text__
    text = text.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    text = text.replace(/__([^_]+)__/g, '<b>$1</b>');
    // Italic: *text* (not surrounded by other *)
    text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<i>$1</i>');
    // Italic: _text_ (word-boundary safe)
    text = text.replace(/(?<![a-zA-Z0-9_])_([^_]+)_(?![a-zA-Z0-9_])/g, '<i>$1</i>');
    return text;
}

export function isStructuralLine(line) {
    if (!line) return false;
    const trimmed = line.replace(/<[^>]+>/g, '').trim();
    if (!trimmed) return false;
    
    // 1. Bullets (-, *, •, +, >, ▪, ▫, –, —)
    if (/^[-*•+>▪▫–—]\s+/.test(trimmed)) return true;
    
    // 2. Numbered & hierarchical lists (1., 1.1, 1.1.1, (1), 1), a., a), (a), i., I.)
    if (/^(\(?\d+[\.\)]|\(?[a-zA-Z][\.\)]|\d+(\.\d+)+[\.\)]?|[IVXLCDM]+[\.\)])\s+/i.test(trimmed)) return true;
    
    // 3. Colon labels including digits & symbols (H0:, H1:, Ha:, Paso 1:, Step 1:, Nota:, Fuente:, Speaker 1:, Q:)
    if (/^[A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s_\-\.\(\)\/]{1,35}:(?!\/)/i.test(trimmed)) return true;
    
    // 4. Markdown headers (# Title) or HTML bold headers (<b>Title</b>)
    if (/^#{1,6}\s+/.test(trimmed) || /^<b>[^<]{2,60}<\/b>$/i.test(line.trim())) return true;
    
    // 5. Standalone short headings / titles (< 50 chars, no ending sentence punctuation)
    if (trimmed.length <= 50 && /^[A-ZÁÉÍÓÚÑ0-9]/.test(trimmed) && !/[.,;!?]$/.test(trimmed)) {
        const endsWithConjunction = /\b(y|e|o|u|que|de|en|con|para|por|el|la|los|las|un|una|and|or|to|with|for|of|in|the|a|an|is|are|was|were)\s*$/i.test(trimmed);
        if (!endsWithConjunction) {
            return true;
        }
    }
    return false;
}

export function isHeadingLine(line) {
    if (!line) return false;
    const trimmed = line.replace(/<[^>]+>/g, '').trim();
    if (!trimmed || trimmed.length > 70) return false;
    if (/^#{1,6}\s+/.test(trimmed) || /^<b>[^<]{2,60}<\/b>$/i.test(line.trim())) return true;
    if (/^(\d+[\.\)]|\d+(\.\d+)+|[IVXLCDM]+[\.\)])\s+[A-ZÁÉÍÓÚÑ]/.test(trimmed) && !trimmed.endsWith('.')) return true;
    if (/^(cap[ií]tulo|secci[oó]n|resumen|abstract|introducci[oó]n|conclusi[oó]n|m[eé]todo|hip[oó]tesis|paso\s*\d+|step\s*\d+|etapa\s*\d+|fase\s*\d+|tabla|figura|anexo)/i.test(trimmed) && !trimmed.endsWith('.')) return true;
    if (/^[A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s_\-\.\(\)\/]{1,35}:(?!\/)/i.test(trimmed)) return true;
    if (trimmed.length <= 50 && /^[A-ZÁÉÍÓÚÑ0-9]/.test(trimmed) && !/[.,;!?]$/.test(trimmed)) {
        const endsWithConjunction = /\b(y|e|o|u|que|de|en|con|para|por|el|la|los|las|un|una|and|or|to|with|for|of|in|the|a|an|is|are|was|were)\s*$/i.test(trimmed);
        if (!endsWithConjunction) {
            return true;
        }
    }
    return false;
}

export function cleanOcrAndScanText(text) {
    if (!text) return '';
    
    // Normalize newlines to \n
    let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Normalize unicode soft hyphens & non-breaking spaces
    normalized = normalized.replace(/\u00AD/g, '-').replace(/\u00A0/g, ' ');
    
    // Fix collapsed line breaks (e.g. "L2O)En" -> "L2O)\nEn")
    normalized = normalized.replace(/\)([A-ZÁÉÍÓÚÑ])/g, ')\n$1');
    // Fix collapsed colon headings e.g. "Óptimos:En lugar" -> "Óptimos:\nEn lugar"
    normalized = normalized.replace(/([:;])([A-ZÁÉÍÓÚÑ])/g, '$1\n$2');
    
    // Split by 2 or more newlines into distinct paragraph blocks
    const rawParagraphs = normalized.split(/\n\s*\n+/);
    
    const cleanedParagraphs = rawParagraphs.map(para => {
        const rawLines = para.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (rawLines.length === 0) return '';
        
        let merged = [];
        
        for (let i = 0; i < rawLines.length; i++) {
            let current = rawLines[i];
            
            if (merged.length === 0) {
                merged.push(current);
                continue;
            }
            
            let prev = merged[merged.length - 1];
            
            const isCurrStructural = isStructuralLine(current);
            const isPrevHead = isHeadingLine(prev);
            
            if (isCurrStructural || isPrevHead) {
                merged.push(current);
            } else {
                if (prev.endsWith('-') && /^[a-záéíóúñ]/i.test(current)) {
                    merged[merged.length - 1] = prev.slice(0, -1) + current;
                } else {
                    merged[merged.length - 1] = prev + ' ' + current;
                }
            }
        }
        
        return merged.join('\n\n');
    });
    
    return cleanedParagraphs.filter(p => p.trim() !== '').join('\n\n');
}

/**
 * Sanitize HTML from clipboard: keep only safe formatting tags (b, i, u, sub, sup).
 * Strips scripts, styles, images, and other dangerous elements.
 * Preserves bold styles from CSS (font-weight: bold / 600+) and semantic HTML elements.
 * Unifies soft-wrapped lines inside paragraphs while preserving bold, italic, and lists.
 */
export function sanitizeClipboardHtml(html) {
    if (!html) return '';

    // Extract fragment between <!--StartFragment--> and <!--EndFragment--> if present
    if (html.includes('<!--StartFragment-->')) {
        const startMarker = '<!--StartFragment-->';
        const start = html.indexOf(startMarker) + startMarker.length;
        const end = html.indexOf('<!--EndFragment-->');
        if (end > start) {
            html = html.substring(start, end);
        }
    }

    if (typeof DOMParser !== 'undefined') {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const body = doc.body;
            if (body) {
                const removeSelectors = [
                    'script', 'style', 'noscript', 'meta', 'link', 'svg', 'canvas',
                    'iframe', 'object', 'embed', 'input', 'button', 'select', 'textarea',
                    'img', 'audio', 'video', 'template', 'annotation', 'math',
                    '.katex-mathml', 'o\\:p'
                ];
                removeSelectors.forEach(sel => {
                    try {
                        body.querySelectorAll(sel).forEach(el => el.remove());
                    } catch (e) {}
                });

                // Convert styled elements (span with bold/italic styles)
                const allElements = body.querySelectorAll('*');
                allElements.forEach(el => {
                    const tag = el.tagName.toLowerCase();
                    const style = el.getAttribute('style') || '';
                    const className = el.className || '';
                    const classStr = typeof className === 'string' ? className.toLowerCase() : '';

                    const isBold = tag === 'strong' || tag === 'th' ||
                        /font-weight\s*:\s*(bold|[6-9]00)/i.test(style) ||
                        /\b(text-bold|font-bold|fw-bold|bold)\b/i.test(classStr);

                    const isItalic = tag === 'em' || tag === 'cite' || tag === 'var' || tag === 'dfn' ||
                        /font-style\s*:\s*italic/i.test(style) ||
                        /\b(italic|fst-italic)\b/i.test(classStr);

                    const isUnderline = tag === 'ins' ||
                        /text-decoration\s*:\s*underline/i.test(style);

                    if (/^h[1-6]$/.test(tag) || tag === 'dt') {
                        if (el.innerHTML.trim() && !el.querySelector('b, strong')) {
                            el.innerHTML = `<b>${el.innerHTML.trim()}</b>`;
                        }
                    } else if (isBold && tag !== 'b') {
                        const b = doc.createElement('b');
                        b.innerHTML = el.innerHTML;
                        el.innerHTML = '';
                        el.appendChild(b);
                    }

                    if (isItalic && tag !== 'i') {
                        const i = doc.createElement('i');
                        i.innerHTML = el.innerHTML;
                        el.innerHTML = '';
                        el.appendChild(i);
                    }

                    if (isUnderline && tag !== 'u') {
                        const u = doc.createElement('u');
                        u.innerHTML = el.innerHTML;
                        el.innerHTML = '';
                        el.appendChild(u);
                    }
                });

                function serializeNode(node) {
                    if (node.nodeType === 3) {
                        return node.nodeValue;
                    }
                    if (node.nodeType !== 1) {
                        return '';
                    }

                    const tag = node.tagName.toLowerCase();

                    if (tag === 'b' || tag === 'strong') {
                        const inner = Array.from(node.childNodes).map(serializeNode).join('');
                        return inner.trim() ? `<b>${inner}</b>` : inner;
                    }
                    if (tag === 'i' || tag === 'em') {
                        const inner = Array.from(node.childNodes).map(serializeNode).join('');
                        return inner.trim() ? `<i>${inner}</i>` : inner;
                    }
                    if (tag === 'u') {
                        const inner = Array.from(node.childNodes).map(serializeNode).join('');
                        return inner.trim() ? `<u>${inner}</u>` : inner;
                    }
                    if (tag === 'sub') {
                        const inner = Array.from(node.childNodes).map(serializeNode).join('');
                        return inner.trim() ? `<sub>${inner}</sub>` : inner;
                    }
                    if (tag === 'sup') {
                        const inner = Array.from(node.childNodes).map(serializeNode).join('');
                        return inner.trim() ? `<sup>${inner}</sup>` : inner;
                    }
                    if (tag === 'br') {
                        return '\n';
                    }
                    if (tag === 'hr') {
                        return '\n\n';
                    }

                    if (tag === 'li') {
                        const inner = Array.from(node.childNodes).map(serializeNode).join('').trim();
                        if (!inner) return '';
                        if (/^(\(?\d+[\.\)]|[a-zA-Z][\.\)]|•|\-|\*)/.test(inner)) {
                            return `\n${inner}\n`;
                        }
                        return `\n• ${inner}\n`;
                    }

                    if (/^(p|h[1-6]|blockquote|pre|section|article|aside|figure|figcaption|details|dt|dd)$/.test(tag)) {
                        const inner = Array.from(node.childNodes).map(serializeNode).join('').trim();
                        return inner ? `\n\n${inner}\n\n` : '';
                    }

                    if (/^(div|tr|header|footer|main|nav|fieldset|legend|summary|label|dl|ul|ol|table|tbody|thead|tfoot)$/.test(tag)) {
                        const inner = Array.from(node.childNodes).map(serializeNode).join('').trim();
                        return inner ? `\n${inner}\n` : '';
                    }

                    if (tag === 'td' || tag === 'th') {
                        const inner = Array.from(node.childNodes).map(serializeNode).join('').trim();
                        return inner ? ` ${inner} ` : ' ';
                    }

                    return Array.from(node.childNodes).map(serializeNode).join('');
                }

                let s = serializeNode(body);
                return formatParagraphs(s);
            }
        } catch (e) {
            console.warn('DOMParser fallback in sanitizeClipboardHtml:', e);
        }
    }

    // Fallback regex sanitizer if DOMParser is unavailable
    let s = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Remove comments, head, script, style, meta, link, xml, office tags
    s = s.replace(/<!DOCTYPE[^>]*>/gi, '');
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    s = s.replace(/<\/?(html|body|head|meta|link|xml)[^>]*>/gi, '');
    s = s.replace(/<(script|style|meta|link|head|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '');
    s = s.replace(/<(img|iframe|object|embed|form|input|textarea|select|button)[^>]*>/gi, '');
    s = s.replace(/<o:p>[\s\S]*?<\/o:p>/gi, '');
    s = s.replace(/<\/?o:p[^>]*>/gi, '');

    // Strip KaTeX / MathML
    s = s.replace(/<span\b[^>]*class=["'][^"']*katex-mathml[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, '');
    s = s.replace(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/gi, '');
    s = s.replace(/<math\b[^>]*>[\s\S]*?<\/math>/gi, '');

    // Convert styled spans / tags with bold styles to <b>
    s = s.replace(/<(span|label|p|div|dt|th)\b[^>]*style=["'][^"']*font-weight\s*:\s*(?:bold|[6-9]00)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi, '<b>$2</b>');
    s = s.replace(/<(span|label|p|div|dt|th)\b[^>]*class=["'][^"']*\b(?:text-bold|font-bold|fw-bold|bold)\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi, '<b>$2</b>');

    // Headings and definition terms: ensure clean line breaks and bold
    s = s.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n\n<b>$1</b>\n\n');
    s = s.replace(/<dt[^>]*>([\s\S]*?)<\/dt>/gi, '\n\n<b>$1</b>\n\n');
    s = s.replace(/<dd[^>]*>([\s\S]*?)<\/dd>/gi, '\n\n$1\n\n');

    // List items
    s = s.replace(/<li[^>]*>\s*(?=\(?\d+[\.\)])/gi, '\n');
    s = s.replace(/<li[^>]*>/gi, '\n• ');
    s = s.replace(/<\/li>/gi, '\n');

    // Block elements -> paragraph / line breaks
    s = s.replace(/<\/?(p|blockquote|pre|section|article|aside|figure|figcaption|details)[^>]*>/gi, '\n\n');
    s = s.replace(/<\/?(div|header|footer|main|nav|fieldset|legend|summary|label|tr|table|tbody|thead|tfoot)[^>]*>/gi, '\n');
    s = s.replace(/<\/?(td|th)[^>]*>/gi, ' ');

    // Convert strong -> b, em -> i, ins -> u
    s = s.replace(/<strong\b[^>]*>/gi, '<b>').replace(/<\/strong>/gi, '</b>');
    s = s.replace(/<em\b[^>]*>/gi, '<i>').replace(/<\/em>/gi, '</i>');
    s = s.replace(/<ins\b[^>]*>/gi, '<u>').replace(/<\/ins>/gi, '</u>');

    // Strip any other unwanted tags, preserving only safe inline tags
    s = s.replace(new RegExp('<(?!/?(b|i|u|sub|sup|br)\\b)[^>]+>', 'gi'), '');

    return formatParagraphs(s);
}

function formatParagraphs(s) {
    // Normalize newlines
    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Normalize double <br> or more to \n\n, single <br> to \n
    s = s.replace(/(?:\s*<br\s*\/?>\s*){2,}/gi, '\n\n');
    s = s.replace(/\s*<br\s*\/?>\s*/gi, '\n');
    // Collapse excess newlines: 3 or more \n into \n\n
    s = s.replace(/\n{3,}/g, '\n\n');

    const rawParagraphs = s.split(/\n\s*\n+/);

    const cleanedParagraphs = rawParagraphs.map(para => {
        const rawLines = para.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (rawLines.length === 0) return '';

        let merged = [];
        for (let i = 0; i < rawLines.length; i++) {
            let current = rawLines[i];
            if (merged.length === 0) {
                merged.push(current);
                continue;
            }

            let prev = merged[merged.length - 1];
            const plainCurrent = current.replace(/<[^>]+>/g, '').trim();
            const plainPrev = prev.replace(/<[^>]+>/g, '').trim();

            const isCurrStructural = isStructuralLine(current);
            const isPrevHead = isHeadingLine(prev);

            if (isCurrStructural || isPrevHead) {
                merged.push(current);
            } else {
                if (plainPrev.endsWith('-') && /^[a-záéíóúñ]/i.test(plainCurrent)) {
                    merged[merged.length - 1] = prev.replace(/-(<\/?[a-z]+>)*$/, '$1') + current;
                } else {
                    merged[merged.length - 1] = prev + ' ' + current;
                }
            }
        }
        return merged.join('<br>');
    });

    return cleanedParagraphs.filter(p => p.trim() !== '').join('<br><br>').trim();
}

export function convertSlackShortcodes(text) {
    if (!text) return text;
    
    // Country flag shortcodes :flag-xx: → 🇽🇽
    text = text.replace(/:flag-([a-z]{2}):/gi, (match, code) => {
        const upper = code.toUpperCase();
        // Convert country code to regional indicator symbols
        const char1 = String.fromCodePoint(0x1F1E6 + upper.charCodeAt(0) - 65);
        const char2 = String.fromCodePoint(0x1F1E6 + upper.charCodeAt(1) - 65);
        return char1 + char2;
    });
    
    // Common Slack emoji shortcodes
    const emojiMap = {
        // Faces & People
        ':smile:': '😄', ':grinning:': '😀', ':laughing:': '😆', ':blush:': '😊',
        ':smiley:': '😃', ':relaxed:': '☺️', ':smirk:': '😏', ':heart_eyes:': '😍',
        ':kissing_heart:': '😘', ':kissing:': '😗', ':wink:': '😉', ':stuck_out_tongue_winking_eye:': '😜',
        ':stuck_out_tongue:': '😛', ':flushed:': '😳', ':grin:': '😁', ':pensive:': '😔',
        ':relieved:': '😌', ':unamused:': '😒', ':disappointed:': '😞', ':persevere:': '😣',
        ':cry:': '😢', ':joy:': '😂', ':sob:': '😭', ':scream:': '😱',
        ':confused:': '😕', ':open_mouth:': '😮', ':hushed:': '😯', ':sweat_smile:': '😅',
        ':sweat:': '😓', ':weary:': '😩', ':tired_face:': '😫', ':angry:': '😠',
        ':rage:': '😡', ':triumph:': '😤', ':mask:': '😷', ':sunglasses:': '😎',
        ':sleeping:': '😴', ':dizzy_face:': '😵', ':astonished:': '😲', ':worried:': '😟',
        ':fearful:': '😨', ':cold_sweat:': '😰', ':innocent:': '😇', ':thinking_face:': '🤔',
        ':thinking:': '🤔', ':face_with_rolling_eyes:': '🙄', ':zipper_mouth_face:': '🤐',
        ':nerd_face:': '🤓', ':rofl:': '🤣', ':hugging_face:': '🤗',
        ':clown_face:': '🤡', ':cowboy:': '🤠', ':nauseated_face:': '🤢', ':sneezing_face:': '🤧',
        ':star_struck:': '🤩', ':zany_face:': '🤪', ':shushing_face:': '🤫', ':exploding_head:': '🤯',
        ':pleading_face:': '🥺', ':yawning_face:': '🥱', ':partying_face:': '🥳',
        ':skull:': '💀', ':ghost:': '👻', ':alien:': '👽', ':robot_face:': '🤖',
        ':poop:': '💩', ':hankey:': '💩',
        
        // Gestures & Body
        ':wave:': '👋', ':raised_hands:': '🙌', ':clap:': '👏', ':pray:': '🙏',
        ':thumbsup:': '👍', ':+1:': '👍', ':thumbsdown:': '👎', ':-1:': '👎',
        ':punch:': '👊', ':fist:': '✊', ':v:': '✌️', ':ok_hand:': '👌',
        ':raised_hand:': '✋', ':open_hands:': '👐', ':muscle:': '💪',
        ':point_up:': '☝️', ':point_down:': '👇', ':point_left:': '👈', ':point_right:': '👉',
        ':middle_finger:': '🖕', ':hand:': '✋', ':metal:': '🤘',
        ':call_me_hand:': '🤙', ':handshake:': '🤝', ':crossed_fingers:': '🤞',
        ':love_you_gesture:': '🤟', ':palms_up_together:': '🤲',
        ':eyes:': '👀', ':eye:': '👁️', ':tongue:': '👅', ':lips:': '👄',
        ':brain:': '🧠',
        
        // Hearts & Symbols
        ':heart:': '❤️', ':yellow_heart:': '💛', ':green_heart:': '💚',
        ':blue_heart:': '💙', ':purple_heart:': '💜', ':broken_heart:': '💔',
        ':heartpulse:': '💗', ':heartbeat:': '💓', ':sparkling_heart:': '💖',
        ':cupid:': '💘', ':gift_heart:': '💝', ':revolving_hearts:': '💞',
        ':two_hearts:': '💕', ':heart_decoration:': '💟', ':black_heart:': '🖤',
        ':orange_heart:': '🧡', ':white_heart:': '🤍', ':brown_heart:': '🤎',
        ':fire:': '🔥', ':100:': '💯', ':star:': '⭐', ':star2:': '🌟',
        ':sparkles:': '✨', ':dizzy:': '💫', ':boom:': '💥', ':collision:': '💥',
        ':zap:': '⚡', ':snowflake:': '❄️',
        ':sunny:': '☀️', ':cloud:': '☁️', ':umbrella:': '☂️', ':rainbow:': '🌈',
        ':droplet:': '💧', ':ocean:': '🌊',
        
        // Objects & Activities
        ':tada:': '🎉', ':confetti_ball:': '🎊', ':balloon:': '🎈', ':party_popper:': '🎉',
        ':gift:': '🎁', ':trophy:': '🏆', ':medal:': '🏅', ':crown:': '👑',
        ':gem:': '💎', ':ring:': '💍', ':moneybag:': '💰', ':dollar:': '💵',
        ':bulb:': '💡', ':flashlight:': '🔦', ':wrench:': '🔧', ':hammer:': '🔨',
        ':nut_and_bolt:': '🔩', ':gear:': '⚙️', ':link:': '🔗', ':chains:': '⛓️',
        ':key:': '🔑', ':lock:': '🔒', ':unlock:': '🔓',
        ':bell:': '🔔', ':no_bell:': '🔕', ':loudspeaker:': '📢', ':mega:': '📣',
        ':phone:': '☎️', ':iphone:': '📱', ':computer:': '💻', ':desktop_computer:': '🖥️',
        ':keyboard:': '⌨️', ':email:': '📧', ':envelope:': '✉️', ':inbox_tray:': '📥',
        ':outbox_tray:': '📤', ':package:': '📦', ':mailbox:': '📫',
        ':memo:': '📝', ':pencil:': '✏️', ':pencil2:': '✏️', ':pen:': '🖊️',
        ':paperclip:': '📎', ':scissors:': '✂️', ':round_pushpin:': '📍',
        ':book:': '📖', ':books:': '📚', ':bookmark:': '🔖',
        ':newspaper:': '📰', ':calendar:': '📅', ':date:': '📅',
        ':chart_with_upwards_trend:': '📈', ':chart_with_downwards_trend:': '📉',
        ':bar_chart:': '📊', ':clipboard:': '📋', ':pushpin:': '📌',
        ':rocket:': '🚀', ':airplane:': '✈️', ':car:': '🚗', ':taxi:': '🚕',
        ':bus:': '🚌', ':train:': '🚆', ':ship:': '🚢', ':bike:': '🚲',
        ':camera:': '📷', ':movie_camera:': '🎬', ':tv:': '📺', ':radio:': '📻',
        ':musical_note:': '🎵', ':notes:': '🎶', ':microphone:': '🎤', ':headphones:': '🎧',
        ':guitar:': '🎸', ':trumpet:': '🎺', ':violin:': '🎻', ':drum:': '🥁',
        ':art:': '🎨', ':paintbrush:': '🖌️',
        ':soccer:': '⚽', ':basketball:': '🏀', ':football:': '🏈', ':baseball:': '⚾',
        ':tennis:': '🎾', ':volleyball:': '🏐', ':golf:': '⛳', ':ping_pong:': '🏓',
        ':dart:': '🎯', ':8ball:': '🎱',
        
        // Food & Drink
        ':pizza:': '🍕', ':hamburger:': '🍔', ':fries:': '🍟', ':hotdog:': '🌭',
        ':taco:': '🌮', ':burrito:': '🌯', ':sushi:': '🍣', ':ramen:': '🍜',
        ':coffee:': '☕', ':tea:': '🍵', ':beer:': '🍺', ':beers:': '🍻',
        ':wine_glass:': '🍷', ':cocktail:': '🍸', ':tropical_drink:': '🍹',
        ':apple:': '🍎', ':green_apple:': '🍏', ':banana:': '🍌', ':grapes:': '🍇',
        ':strawberry:': '🍓', ':watermelon:': '🍉', ':lemon:': '🍋', ':peach:': '🍑',
        ':avocado:': '🥑', ':eggplant:': '🍆', ':tomato:': '🍅', ':corn:': '🌽',
        ':cake:': '🍰', ':birthday:': '🎂', ':cookie:': '🍪', ':chocolate_bar:': '🍫',
        ':candy:': '🍬', ':ice_cream:': '🍦', ':doughnut:': '🍩',
        
        // Animals & Nature
        ':dog:': '🐶', ':cat:': '🐱', ':mouse:': '🐭', ':hamster:': '🐹',
        ':rabbit:': '🐰', ':bear:': '🐻', ':panda_face:': '🐼', ':koala:': '🐨',
        ':tiger:': '🐯', ':lion_face:': '🦁', ':lion:': '🦁', ':cow:': '🐮',
        ':pig:': '🐷', ':frog:': '🐸', ':monkey_face:': '🐵', ':see_no_evil:': '🙈',
        ':hear_no_evil:': '🙉', ':speak_no_evil:': '🙊', ':chicken:': '🐔',
        ':penguin:': '🐧', ':bird:': '🐦', ':eagle:': '🦅', ':duck:': '🦆',
        ':owl:': '🦉', ':bat:': '🦇', ':wolf:': '🐺', ':fox_face:': '🦊',
        ':butterfly:': '🦋', ':bug:': '🐛', ':ant:': '🐜', ':bee:': '🐝',
        ':ladybug:': '🐞', ':spider:': '🕷️', ':turtle:': '🐢', ':snake:': '🐍',
        ':dragon:': '🐉', ':dinosaur:': '🦕', ':unicorn:': '🦄',
        ':whale:': '🐳', ':dolphin:': '🐬', ':fish:': '🐟', ':tropical_fish:': '🐠',
        ':octopus:': '🐙', ':crab:': '🦀', ':shrimp:': '🦐', ':squid:': '🦑',
        ':rose:': '🌹', ':sunflower:': '🌻', ':hibiscus:': '🌺', ':tulip:': '🌷',
        ':cherry_blossom:': '🌸', ':bouquet:': '💐', ':seedling:': '🌱',
        ':evergreen_tree:': '🌲', ':deciduous_tree:': '🌳', ':palm_tree:': '🌴',
        ':cactus:': '🌵', ':four_leaf_clover:': '🍀', ':mushroom:': '🍄',
        ':fallen_leaf:': '🍂', ':leaves:': '🍃', ':maple_leaf:': '🍁',
        
        // Miscellaneous
        ':checkered_flag:': '🏁', ':triangular_flag_on_post:': '🚩',
        ':crossed_flags:': '🎌', ':white_flag:': '🏳️', ':rainbow_flag:': '🏳️‍🌈',
        ':pirate_flag:': '🏴‍☠️',
        ':warning:': '⚠️', ':no_entry:': '⛔', ':x:': '❌', ':o:': '⭕',
        ':white_check_mark:': '✅', ':heavy_check_mark:': '✔️',
        ':heavy_plus_sign:': '➕', ':heavy_minus_sign:': '➖',
        ':heavy_multiplication_x:': '✖️', ':heavy_division_sign:': '➗',
        ':exclamation:': '❗', ':question:': '❓', ':grey_exclamation:': '❕',
        ':grey_question:': '❔',
        ':arrow_right:': '➡️', ':arrow_left:': '⬅️', ':arrow_up:': '⬆️', ':arrow_down:': '⬇️',
        ':recycle:': '♻️', ':copyright:': '©️', ':registered:': '®️', ':tm:': '™️',
        ':information_source:': 'ℹ️', ':abc:': '🔤', ':abcd:': '🔡',
        ':1234:': '🔢', ':symbols:': '🔣', ':a:': '🅰️', ':b:': '🅱️',
        ':ab:': '🆎', ':cl:': '🆑', ':sos:': '🆘', ':id:': '🆔',
        ':new:': '🆕', ':ng:': '🆖', ':ok:': '🆗', ':cool:': '🆒',
        ':free:': '🆓', ':up:': '🆙', ':vs:': '🆚',
        ':clock1:': '🕐', ':clock2:': '🕑', ':clock3:': '🕒', ':clock4:': '🕓',
        ':hourglass:': '⌛', ':watch:': '⌚', ':alarm_clock:': '⏰',
        ':earth_americas:': '🌎', ':earth_africa:': '🌍', ':earth_asia:': '🌏',
        ':globe_with_meridians:': '🌐', ':world_map:': '🗺️',
        ':mag:': '🔍', ':mag_right:': '🔎',
        ':speech_balloon:': '💬', ':thought_balloon:': '💭',
    };
    
    // Replace all known shortcodes
    text = text.replace(/:([a-zA-Z0-9_+-]+):/g, (match) => {
        return emojiMap[match] || match;
    });
    
    return text;
}

/**
 * Convert LaTeX math notation to Unicode equivalents.
 * Handles: $\tau_d$ → τ_d, $\alpha$ → α, subscripts, superscripts, fractions.
 */

export function wrapSentences(text) {
    if (!text) return '';
    // Normalize newlines: convert <br> to \n while stripping adjoining whitespace
    let cleanText = text.replace(/[\t ]*<br\s*\/?>[\t ]*/gi, '\n');
    cleanText = cleanText.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n');
    const lines = cleanText.split('\n');
    let globalIndex = 0;

    return lines.map(line => {
        const trimmed = line.trim();
        if (trimmed === '') {
            return '<div class="tf-line tf-line-empty"></div>';
        }

        const plainLength = line.replace(/<[^>]+>/g, '').length;
        // List numbers (e.g. "1. "), headers, or short lines (< 90 chars) should be kept as 1 sentence unit
        if (plainLength < 90 || /^<[^>]+>\s*\d+[\.\)]/i.test(line) || /^\d+[\.\)]/.test(trimmed)) {
            return `<div class="tf-line"><span class="tf-sentence" data-index="${globalIndex++}">${line}</span></div>`;
        }

        // For paragraphs, split by sentence endings (. ! ?) only when followed by space and capital letter,
        // while ignoring numbered lists (e.g. "1. ")
        const sentenceRegex = /(?<=[.!?])(?<!\b\d[.!?])(?<!\b[A-Za-z][.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡<])/;
        const parts = line.split(sentenceRegex);

        // Verify HTML tag balance: if any part has unclosed tags, don't split to avoid breaking DOM
        let canSplit = true;
        for (const part of parts) {
            const openB = (part.match(/<b\b[^>]*>/gi) || []).length;
            const closeB = (part.match(/<\/b>/gi) || []).length;
            const openI = (part.match(/<i\b[^>]*>/gi) || []).length;
            const closeI = (part.match(/<\/i>/gi) || []).length;
            if (openB !== closeB || openI !== closeI) {
                canSplit = false;
                break;
            }
        }

        if (canSplit && parts.length > 1) {
            const content = parts.map(s => `<span class="tf-sentence" data-index="${globalIndex++}">${s}</span>`).join(' ');
            return `<div class="tf-line">${content}</div>`;
        } else {
            return `<div class="tf-line"><span class="tf-sentence" data-index="${globalIndex++}">${line}</span></div>`;
        }
    }).join('');
}
