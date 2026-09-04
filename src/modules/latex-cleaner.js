/**
 * LaTeX Cleaner and Unicode Converter Module
 */

export function convertLatexToUnicode(text) {
    if (!text) return text;
    
    // ═══════════════════════════════════════════════════════════════════
    // COMPLETE LaTeX → Unicode dictionary (~500+ symbols)
    // Covers: Greek, operators, relations, arrows, sets, logic, geometry,
    // blackboard bold, script, fraktur, delimiters, accents, and more.
    // ═══════════════════════════════════════════════════════════════════
    const latexToUnicode = {
        // ── Greek lowercase ──
        'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ', 'epsilon': 'ε',
        'zeta': 'ζ', 'eta': 'η', 'theta': 'θ', 'iota': 'ι', 'kappa': 'κ',
        'lambda': 'λ', 'mu': 'μ', 'nu': 'ν', 'xi': 'ξ', 'omicron': 'ο',
        'pi': 'π', 'rho': 'ρ', 'sigma': 'σ', 'tau': 'τ', 'upsilon': 'υ',
        'phi': 'φ', 'chi': 'χ', 'psi': 'ψ', 'omega': 'ω',
        // ── Greek lowercase variants ──
        'varepsilon': 'ε', 'varphi': 'φ', 'varsigma': 'ς', 'vartheta': 'ϑ',
        'varpi': 'ϖ', 'varrho': 'ϱ', 'varkappa': 'ϰ', 'digamma': 'ϝ',
        // ── Greek uppercase ──
        'Alpha': 'Α', 'Beta': 'Β', 'Gamma': 'Γ', 'Delta': 'Δ', 'Epsilon': 'Ε',
        'Zeta': 'Ζ', 'Eta': 'Η', 'Theta': 'Θ', 'Iota': 'Ι', 'Kappa': 'Κ',
        'Lambda': 'Λ', 'Mu': 'Μ', 'Nu': 'Ν', 'Xi': 'Ξ', 'Omicron': 'Ο',
        'Pi': 'Π', 'Rho': 'Ρ', 'Sigma': 'Σ', 'Tau': 'Τ', 'Upsilon': 'Υ',
        'Phi': 'Φ', 'Chi': 'Χ', 'Psi': 'Ψ', 'Omega': 'Ω',
        // ── Hebrew ──
        'aleph': 'ℵ', 'beth': 'ℶ', 'gimel': 'ℷ', 'daleth': 'ℸ',

        // ══════════════ ARITHMETIC & BASIC OPERATORS ══════════════
        'plus': '+', 'minus': '−', 'times': '×', 'div': '÷',
        'cdot': '·', 'ast': '∗', 'star': '⋆', 'circ': '∘',
        'bullet': '•', 'pm': '±', 'mp': '∓',
        'oplus': '⊕', 'ominus': '⊖', 'otimes': '⊗', 'oslash': '⊘', 'odot': '⊙',
        'bigcirc': '◯', 'dagger': '†', 'ddagger': '‡',
        'amalg': '⨿', 'wr': '≀', 'setminus': '∖', 'smallsetminus': '∖',

        // ══════════════ RELATIONS ══════════════
        'leq': '≤', 'le': '≤', 'geq': '≥', 'ge': '≥',
        'neq': '≠', 'ne': '≠', 'approx': '≈', 'equiv': '≡',
        'sim': '∼', 'simeq': '≃', 'cong': '≅', 'doteq': '≐',
        'propto': '∝', 'asymp': '≍',
        'll': '≪', 'gg': '≫', 'lll': '⋘', 'ggg': '⋙',
        'prec': '≺', 'succ': '≻', 'preceq': '⪯', 'succeq': '⪰',
        'preccurlyeq': '≼', 'succcurlyeq': '≽',
        'lesssim': '≲', 'gtrsim': '≳', 'lessapprox': '⪅', 'gtrapprox': '⪆',
        'lessgtr': '≶', 'gtrless': '≷', 'lesseqgtr': '⋚', 'gtreqless': '⋛',
        'leqslant': '⩽', 'geqslant': '⩾',
        'eqslantless': '⪕', 'eqslantgtr': '⪖',
        'triangleleft': '◁', 'triangleright': '▷',
        'trianglelefteq': '⊴', 'trianglerighteq': '⊵',
        'vdash': '⊢', 'dashv': '⊣', 'models': '⊨',
        'Vdash': '⊩', 'Vvdash': '⊪', 'vDash': '⊨',
        'mid': '∣', 'nmid': '∤', 'parallel': '∥', 'nparallel': '∦',
        'perp': '⊥', 'top': '⊤', 'bot': '⊥',
        'smile': '⌣', 'frown': '⌢', 'bowtie': '⋈',
        'Join': '⋈', 'ltimes': '⋉', 'rtimes': '⋊',
        'leftthreetimes': '⋋', 'rightthreetimes': '⋌',
        'backsim': '∽', 'backsimeq': '⋍',
        'Bumpeq': '≎', 'bumpeq': '≏', 'circeq': '≗', 'eqcirc': '≖',
        'fallingdotseq': '≒', 'risingdotseq': '≓',
        'pitchfork': '⋔', 'therefore': '∴', 'because': '∵',
        'between': '≬', 'curlyeqprec': '⋞', 'curlyeqsucc': '⋟',
        'sqsubset': '⊏', 'sqsupset': '⊐', 'sqsubseteq': '⊑', 'sqsupseteq': '⊒',
        'Subset': '⋐', 'Supset': '⋑',

        // ── Negated relations ──
        'nleq': '≰', 'ngeq': '≱', 'nless': '≮', 'ngtr': '≯',
        'nleqslant': '≰', 'ngeqslant': '≱',
        'nprec': '⊀', 'nsucc': '⊁', 'npreceq': '⋠', 'nsucceq': '⋡',
        'nsim': '≁', 'ncong': '≇',
        'nvdash': '⊬', 'nvDash': '⊭', 'nVdash': '⊮', 'nVDash': '⊯',
        'ntriangleleft': '⋪', 'ntriangleright': '⋫',
        'ntrianglelefteq': '⋬', 'ntrianglerighteq': '⋭',
        'lneq': '⪇', 'gneq': '⪈', 'lneqq': '≨', 'gneqq': '≩',
        'lnsim': '⋦', 'gnsim': '⋧', 'lnapprox': '⪉', 'gnapprox': '⪊',
        'precnsim': '⋨', 'succnsim': '⋩', 'precnapprox': '⪹', 'succnapprox': '⪺',
        'subsetneq': '⊊', 'supsetneq': '⊋', 'subsetneqq': '⫋', 'supsetneqq': '⫌',
        'nsubseteq': '⊈', 'nsupseteq': '⊉',

        // ══════════════ SET THEORY & LOGIC ══════════════
        'in': '∈', 'notin': '∉', 'ni': '∋', 'notni': '∌',
        'subset': '⊂', 'supset': '⊃', 'subseteq': '⊆', 'supseteq': '⊇',
        'cap': '∩', 'cup': '∪', 'Cap': '⋒', 'Cup': '⋓',
        'sqcap': '⊓', 'sqcup': '⊔',
        'bigcap': '⋂', 'bigcup': '⋃', 'bigsqcup': '⨆',
        'uplus': '⊎', 'biguplus': '⨄',
        'emptyset': '∅', 'varnothing': '∅', 'O': '∅',
        'land': '∧', 'lor': '∨', 'lnot': '¬', 'neg': '¬',
        'wedge': '∧', 'vee': '∨', 'bigwedge': '⋀', 'bigvee': '⋁',
        'forall': '∀', 'exists': '∃', 'nexists': '∄',
        'complement': '∁',

        // ══════════════ ARROWS ══════════════
        // ── Basic arrows ──
        'leftarrow': '←', 'rightarrow': '→', 'uparrow': '↑', 'downarrow': '↓',
        'leftrightarrow': '↔', 'updownarrow': '↕',
        'Leftarrow': '⇐', 'Rightarrow': '⇒', 'Uparrow': '⇑', 'Downarrow': '⇓',
        'Leftrightarrow': '⇔', 'Updownarrow': '⇕',
        'to': '→', 'gets': '←', 'iff': '⟺',
        'implies': '⟹', 'impliedby': '⟸',
        // ── Long arrows ──
        'longleftarrow': '⟵', 'longrightarrow': '⟶', 'longleftrightarrow': '⟷',
        'Longleftarrow': '⟸', 'Longrightarrow': '⟹', 'Longleftrightarrow': '⟺',
        'longmapsto': '⟼',
        // ── Mapsto ──
        'mapsto': '↦', 'hookleftarrow': '↩', 'hookrightarrow': '↪',
        // ── Harpoons ──
        'leftharpoonup': '↼', 'leftharpoondown': '↽',
        'rightharpoonup': '⇀', 'rightharpoondown': '⇁',
        'upharpoonleft': '↿', 'upharpoonright': '↾',
        'downharpoonleft': '⇃', 'downharpoonright': '⇂',
        'rightleftharpoons': '⇌', 'leftrightharpoons': '⇋',
        // ── Diagonal / corner arrows ──
        'nearrow': '↗', 'searrow': '↘', 'swarrow': '↙', 'nwarrow': '↖',
        // ── Double-headed ──
        'twoheadleftarrow': '↞', 'twoheadrightarrow': '↠',
        // ── Tail arrows ──
        'leftarrowtail': '↢', 'rightarrowtail': '↣',
        // ── Squig arrows ──
        'rightsquigarrow': '⇝', 'leftrightsquigarrow': '↭', 'leadsto': '⇝',
        // ── Looped ──
        'looparrowleft': '↫', 'looparrowright': '↬',
        // ── Circular ──
        'circlearrowleft': '↺', 'circlearrowright': '↻',
        'curvearrowleft': '↶', 'curvearrowright': '↷',
        // ── Dashed / multimap ──
        'dashleftarrow': '⇠', 'dashrightarrow': '⇢',
        'multimap': '⊸', 'Lsh': '↰', 'Rsh': '↱',

        // ══════════════ LARGE OPERATORS ══════════════
        'sum': '∑', 'prod': '∏', 'coprod': '∐',
        'int': '∫', 'iint': '∬', 'iiint': '∭', 'iiiint': '⨌',
        'oint': '∮', 'oiint': '∯', 'oiiint': '∰',
        'intclockwise': '∱', 'varointclockwise': '∲', 'ointctrclockwise': '∳',
        'bigotimes': '⨂', 'bigoplus': '⨁', 'bigodot': '⨀',
        'bigstar': '★',

        // ══════════════ CALCULUS & ANALYSIS ══════════════
        'infty': '∞', 'partial': '∂', 'nabla': '∇',
        'sqrt': '√', 'cbrt': '∛', 'fourthroot': '∜',
        'degree': '°',
        'prime': '′', 'dprime': '″', 'tprime': '‴', 'backprime': '‵',

        // ══════════════ GEOMETRY ══════════════
        'angle': '∠', 'measuredangle': '∡', 'sphericalangle': '∢',
        'triangle': '△', 'triangledown': '▽',
        'blacktriangle': '▲', 'blacktriangledown': '▼',
        'blacktriangleleft': '◀', 'blacktriangleright': '▶',
        'square': '□', 'blacksquare': '■', 'boxdot': '⊡',
        'boxplus': '⊞', 'boxminus': '⊟', 'boxtimes': '⊠',
        'diamond': '◇', 'Diamond': '◇', 'lozenge': '◊', 'blacklozenge': '⧫',
        'pentagon': '⬠', 'hexagon': '⬡',
        'circle': '○',

        // ══════════════ DOTS ══════════════
        'dots': '…', 'ldots': '…', 'cdots': '⋯', 'vdots': '⋮', 'ddots': '⋱',
        'iddots': '⋰', 'dotsb': '⋯', 'dotsc': '…', 'dotsi': '⋯', 'dotsm': '⋯',

        // ══════════════ DELIMITERS ══════════════
        'langle': '⟨', 'rangle': '⟩',
        'lfloor': '⌊', 'rfloor': '⌋', 'lceil': '⌈', 'rceil': '⌉',
        'lbrace': '{', 'rbrace': '}', 'lbrack': '[', 'rbrack': ']',
        'vert': '|', 'Vert': '‖', 'lvert': '|', 'rvert': '|',
        'lVert': '‖', 'rVert': '‖',
        'ulcorner': '⌜', 'urcorner': '⌝', 'llcorner': '⌞', 'lrcorner': '⌟',
        'lgroup': '⟮', 'rgroup': '⟯',

        // ══════════════ LETTERLIKE SYMBOLS ══════════════
        'hbar': 'ℏ', 'ell': 'ℓ', 'Re': 'ℜ', 'Im': 'ℑ',
        'wp': '℘', 'mho': '℧', 'Finv': 'Ⅎ', 'Game': 'ℷ',
        'Bbbk': '𝕜', 'N': 'ℕ', 'Z': 'ℤ', 'Q': 'ℚ', 'R': 'ℝ', 'C': 'ℂ',
        'imath': 'ı', 'jmath': 'ȷ',
        'eth': 'ð', 'thorn': 'þ',

        // ══════════════ BLACKBOARD BOLD (mathbb) ══════════════
        'mathbb{A}': '𝔸', 'mathbb{B}': '𝔹', 'mathbb{C}': 'ℂ', 'mathbb{D}': '𝔻',
        'mathbb{E}': '𝔼', 'mathbb{F}': '𝔽', 'mathbb{G}': '𝔾', 'mathbb{H}': 'ℍ',
        'mathbb{I}': '𝕀', 'mathbb{J}': '𝕁', 'mathbb{K}': '𝕂', 'mathbb{L}': '𝕃',
        'mathbb{M}': '𝕄', 'mathbb{N}': 'ℕ', 'mathbb{O}': '𝕆', 'mathbb{P}': 'ℙ',
        'mathbb{Q}': 'ℚ', 'mathbb{R}': 'ℝ', 'mathbb{S}': '𝕊', 'mathbb{T}': '𝕋',
        'mathbb{U}': '𝕌', 'mathbb{V}': '𝕍', 'mathbb{W}': '𝕎', 'mathbb{X}': '𝕏',
        'mathbb{Y}': '𝕐', 'mathbb{Z}': 'ℤ',
        'mathbb{0}': '𝟘', 'mathbb{1}': '𝟙', 'mathbb{2}': '𝟚', 'mathbb{3}': '𝟛',
        'mathbb{4}': '𝟜', 'mathbb{5}': '𝟝', 'mathbb{6}': '𝟞', 'mathbb{7}': '𝟟',
        'mathbb{8}': '𝟠', 'mathbb{9}': '𝟡',

        // ══════════════ SCRIPT / CALLIGRAPHIC (mathcal) ══════════════
        'mathcal{A}': '𝒜', 'mathcal{B}': 'ℬ', 'mathcal{C}': '𝒞', 'mathcal{D}': '𝒟',
        'mathcal{E}': 'ℰ', 'mathcal{F}': 'ℱ', 'mathcal{G}': '𝒢', 'mathcal{H}': 'ℋ',
        'mathcal{I}': 'ℐ', 'mathcal{J}': '𝒥', 'mathcal{K}': '𝒦', 'mathcal{L}': 'ℒ',
        'mathcal{M}': 'ℳ', 'mathcal{N}': '𝒩', 'mathcal{O}': '𝒪', 'mathcal{P}': '𝒫',
        'mathcal{Q}': '𝒬', 'mathcal{R}': 'ℛ', 'mathcal{S}': '𝒮', 'mathcal{T}': '𝒯',
        'mathcal{U}': '𝒰', 'mathcal{V}': '𝒱', 'mathcal{W}': '𝒲', 'mathcal{X}': '𝒳',
        'mathcal{Y}': '𝒴', 'mathcal{Z}': '𝒵',

        // ══════════════ FRAKTUR (mathfrak) ══════════════
        'mathfrak{A}': '𝔄', 'mathfrak{B}': '𝔅', 'mathfrak{C}': 'ℭ', 'mathfrak{D}': '𝔇',
        'mathfrak{E}': '𝔈', 'mathfrak{F}': '𝔉', 'mathfrak{G}': '𝔊', 'mathfrak{H}': 'ℌ',
        'mathfrak{I}': 'ℑ', 'mathfrak{J}': '𝔍', 'mathfrak{K}': '𝔎', 'mathfrak{L}': '𝔏',
        'mathfrak{M}': '𝔐', 'mathfrak{N}': '𝔑', 'mathfrak{O}': '𝔒', 'mathfrak{P}': '𝔓',
        'mathfrak{Q}': '𝔔', 'mathfrak{R}': 'ℜ', 'mathfrak{S}': '𝔖', 'mathfrak{T}': '𝔗',
        'mathfrak{U}': '𝔘', 'mathfrak{V}': '𝔙', 'mathfrak{W}': '𝔚', 'mathfrak{X}': '𝔛',
        'mathfrak{Y}': '𝔜', 'mathfrak{Z}': 'ℨ',
        'mathfrak{a}': '𝔞', 'mathfrak{b}': '𝔟', 'mathfrak{c}': '𝔠', 'mathfrak{d}': '𝔡',
        'mathfrak{e}': '𝔢', 'mathfrak{f}': '𝔣', 'mathfrak{g}': '𝔤', 'mathfrak{h}': '𝔥',
        'mathfrak{i}': '𝔦', 'mathfrak{j}': '𝔧', 'mathfrak{k}': '𝔨', 'mathfrak{l}': '𝔩',
        'mathfrak{m}': '𝔪', 'mathfrak{n}': '𝔫', 'mathfrak{o}': '𝔬', 'mathfrak{p}': '𝔭',
        'mathfrak{q}': '𝔮', 'mathfrak{r}': '𝔯', 'mathfrak{s}': '𝔰', 'mathfrak{t}': '𝔱',
        'mathfrak{u}': '𝔲', 'mathfrak{v}': '𝔳', 'mathfrak{w}': '𝔴', 'mathfrak{x}': '𝔵',
        'mathfrak{y}': '𝔶', 'mathfrak{z}': '𝔷',

        // ══════════════ MISCELLANEOUS MATH SYMBOLS ══════════════
        'surd': '√', 'checkmark': '✓',
        'maltese': '✠', 'clubsuit': '♣', 'diamondsuit': '♢',
        'heartsuit': '♡', 'spadesuit': '♠',
        'flat': '♭', 'natural': '♮', 'sharp': '♯',
        'S': '§', 'P': '¶', 'dag': '†', 'ddag': '‡',
        'copyright': '©', 'pounds': '£', 'yen': '¥', 'euro': '€',
        'cent': '¢', 'registered': '®', 'trademark': '™',

        // ══════════════ SPACING & TYPOGRAPHY ══════════════
        'quad': ' ', 'qquad': '  ', 'thinspace': ' ', 'enspace': ' ', 'emspace': ' ',
        'textendash': '\u2013', 'textemdash': '\u2014',
        'textquoteleft': '\u2018', 'textquoteright': '\u2019',
        'textquotedblleft': '\u201C', 'textquotedblright': '\u201D',
        'textellipsis': '\u2026', 'textbullet': '\u2022',
        'laquo': '\u00AB', 'raquo': '\u00BB',

        // ══════════════ BINARY OPERATIONS (extended) ══════════════
        'barwedge': '⊼', 'veebar': '⊻', 'doublebarwedge': '⩞',
        'curlywedge': '⋏', 'curlyvee': '⋎',
        'divideontimes': '⋇', 'dotplus': '∔',
        'centerdot': '·', 'intercal': '⊺',
        'circledast': '⊛', 'circledcirc': '⊚', 'circleddash': '⊝',

        // ══════════════ MISCELLANEOUS RELATIONS ══════════════
        'coloneq': '≔', 'eqcolon': '≕',
        'Coloneq': '⩴', 'defs': '≝', 'questeq': '≟',
        'approxeq': '≊', 'thicksim': '∼', 'thickapprox': '≈',

        // ══════════════ STACKS & ACCENTS (rendered as chars) ══════════════
        'hat': '̂', 'tilde': '̃', 'bar': '̄', 'vec': '⃗',
        'dot': '̇', 'ddot': '̈', 'dddot': '⃛',
        'breve': '̆', 'check': '̌', 'acute': '́', 'grave': '̀',
        'ring': '̊',

        // ══════════════ OTHER USEFUL SYMBOLS ══════════════
        'Box': '□', 'nBox': '■', 'Diamondblack': '◆',
        'sun': '☉', 'fullmoon': '🌕', 'leftmoon': '☽', 'rightmoon': '☾',
        'female': '♀', 'male': '♂',
        'phone': '☎', 'recorder': '⌕', 'checked': '✓',
        'smiley': '☺', 'frownie': '☹',
        'lightning': '↯', 'danger': '☡', 'radioactive': '☢', 'biohazard': '☣',
        'peace': '☮', 'yinyang': '☯',
        'skull': '☠', 'anchor': '⚓', 'swords': '⚔', 'warning': '⚠',
        'atom': '⚛', 'gear': '⚙', 'scissors': '✂', 'envelope': '✉',
        'pencil': '✎', 'snowflake': '❄', 'sparkle': '❇',
    };
    
    // Use HTML <sub> and <sup> tags for subscripts/superscripts
    function toSubscript(str) {
        return '<sub>' + str + '</sub>';
    }
    
    function toSuperscript(str) {
        return '<sup>' + str + '</sup>';
    }
    
    // Process math environments: $$...$$, \[...\], \(...\), $...$
    const processMathBlock = (mathContent) => {
        let result = mathContent.trim();
        
        // Handle \frac{a}{b} → (a/b)
        result = result.replace(/\\frac{([^}]+)}{([^}]+)}/g, '($1/$2)');
        
        // Handle \text{...} → just the text
        result = result.replace(/\\text(?:normal|rm)?{([^}]+)}/g, '$1');
        result = result.replace(/\\textbf{([^}]+)}/g, '$1');
        result = result.replace(/\\textit{([^}]+)}/g, '$1');
        result = result.replace(/\\mathrm{([^}]+)}/g, '$1');
        result = result.replace(/\\mathbf{([^}]+)}/g, '$1');
        result = result.replace(/\\mathit{([^}]+)}/g, '$1');
        result = result.replace(/\\mathbb{([^}]+)}/g, '$1');
        result = result.replace(/\\mathcal{([^}]+)}/g, '$1');
        result = result.replace(/\\operatorname{([^}]+)}/g, '$1');
        
        // Replace LaTeX commands: \alpha, \beta, \rightarrow, etc.
        result = result.replace(/\\([a-zA-Z]+(?:{[^}]*})?)/g, (m, cmd) => {
            return latexToUnicode[cmd] || m;
        });
        
        // Handle subscripts: _{...} or _x (single char)
        result = result.replace(/_{([^}]+)}/g, (m, sub) => toSubscript(sub));
        result = result.replace(/_([a-zA-Z0-9])/g, (m, sub) => toSubscript(sub));
        
        // Handle superscripts: ^{...} or ^x (single char)
        result = result.replace(/\^{([^}]+)}/g, (m, sup) => toSuperscript(sup));
        result = result.replace(/\^([a-zA-Z0-9])/g, (m, sup) => toSuperscript(sup));
        
        // Clean up remaining braces
        result = result.replace(/[{}]/g, '');
        
        // Clean up remaining backslashes before known symbols
        result = result.replace(/\\,/g, ' ').replace(/\\;/g, ' ').replace(/\\!/g, '').replace(/\\ /g, ' ');
        
        return result;
    };

    // 1. Display math $$...$$
    text = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, mathContent) => {
        return processMathBlock(mathContent);
    });

    // 2. Display math \[...\]
    text = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, mathContent) => {
        return processMathBlock(mathContent);
    });

    // 3. Inline math \(...\)
    text = text.replace(/\\\(([\s\S]*?)\\\)/g, (match, mathContent) => {
        return processMathBlock(mathContent);
    });

    // 4. Inline math $...$
    text = text.replace(/(?<!\$)\$(?!\$)([^$]+?)\$/g, (match, mathContent) => {
        return processMathBlock(mathContent);
    });
    
    // Also handle standalone LaTeX commands outside of $ delimiters
    // e.g., \text{...}, \tau, \rightarrow, \infty without $ signs (common in copy-paste)
    text = text.replace(/\\text(?:normal|rm)?\{([^}]+)\}/g, '$1');
    text = text.replace(/\\textbf\{([^}]+)\}/g, '<b>$1</b>');
    text = text.replace(/\\textit\{([^}]+)\}/g, '<i>$1</i>');
    text = text.replace(/\\mathrm\{([^}]+)\}/g, '$1');
    text = text.replace(/\\mathbf\{([^}]+)\}/g, '$1');
    text = text.replace(/\\mathit\{([^}]+)\}/g, '$1');
    text = text.replace(/\\operatorname\{([^}]+)\}/g, '$1');
    text = text.replace(/\\([a-zA-Z]+(?:{[^}]*})?)/g, (m, cmd) => {
        return latexToUnicode[cmd] || latexToUnicode[cmd.charAt(0).toLowerCase() + cmd.slice(1)] || m;
    });
    
    return text;
}

/**
 * Fix broken accents and combining diacritics from OCR, ChatGPT, LaTeX, Overleaf
 * e.g. "dina´mica" → "dinámica", "sinte´ticos" → "sintéticos", "a´" → "á", "\'e" → "é"
 */

export function fixBrokenAccents(text) {
    if (!text) return '';
    
    // Unify broken vertical OCR letters and floating accents (e.g. 'e\n´' or 'sint\ne\n´\nticos')
    text = text.replace(/([aeiouAEIOU])\s*\n+\s*([´'\u0301\u00B4`\u0300])/g, '$1$2');
    text = text.replace(/([´'\u0301\u00B4`\u0300])\s*\n+\s*([aeiouAEIOU])/g, '$1$2');
    text = text.replace(/([a-zA-ZáéíóúÁÉÍÓÚñÑ]{2,})\s*\n+\s*([aeiouAEIOU])\s*\n+\s*([´'\u0301\u00B4`\u0300])\s*\n+\s*([a-zA-ZáéíóúÁÉÍÓÚñÑ]+)/g, '$1$2$3$4');
    // Also join broken word fragments across newline with single vowel/accent: e.g. 'sint\né\nticos' -> 'sintéticos'
    text = text.replace(/([a-zA-ZáéíóúÁÉÍÓÚñÑ]{2,})\s*\n+\s*([aeiouAEIOUáéíóúÁÉÍÓÚ][´'\u0301\u00B4`\u0300]?)\s*\n+\s*([a-zA-ZáéíóúÁÉÍÓÚñÑ]{2,})/g, '$1$2$3');
    
    let s = text;
    
    const acuteVowels = { 'a': 'á', 'e': 'é', 'i': 'í', 'o': 'ó', 'u': 'ú', 'A': 'Á', 'E': 'É', 'I': 'Í', 'O': 'Ó', 'U': 'Ú' };
    const graveVowels = { 'a': 'à', 'e': 'è', 'i': 'ì', 'o': 'ò', 'u': 'ù', 'A': 'À', 'E': 'È', 'I': 'Ì', 'O': 'Ò', 'U': 'Ù' };
    const tildeLetters = { 'n': 'ñ', 'N': 'Ñ', 'a': 'ã', 'o': 'õ', 'A': 'Ã', 'O': 'Õ' };
    const circVowels = { 'a': 'â', 'e': 'ê', 'i': 'î', 'o': 'ô', 'u': 'û', 'A': 'Â', 'E': 'Ê', 'I': 'Î', 'O': 'Ô', 'U': 'Û' };
    const umlautVowels = { 'a': 'ä', 'e': 'ë', 'i': 'ï', 'o': 'ö', 'u': 'ü', 'A': 'Ä', 'E': 'Ë', 'I': 'Ï', 'O': 'Ö', 'U': 'Ü' };

    // Broken spacing accents: "dina´mica" -> "dinámica", "sinte´ticos" -> "sintéticos"
    // Note: Do NOT match standard ASCII apostrophe ' or quote " or comma , or caret ^ as accents!
    // They corrupt normal text (e.g. contractions like you're, quotes like she "said", commas like ic,, or powers like e^2)
    s = s.replace(/([aeiouAEIOU])[\s\u00A0]*[´\u0301\u00B4]/g, (m, l) => acuteVowels[l] || m);
    s = s.replace(/[´\u0301\u00B4][\s\u00A0]*([aeiouAEIOU])/g, (m, l) => acuteVowels[l] || m);

    s = s.replace(/([aeiouAEIOU])[\s\u00A0]*[`\u0300]/g, (m, l) => graveVowels[l] || m);
    s = s.replace(/([nNaAoO])[\s\u00A0]*[~\u0303]/g, (m, l) => tildeLetters[l] || m);
    s = s.replace(/([aeiouAEIOU])[\s\u00A0]*[\u0302]/g, (m, l) => circVowels[l] || m);
    s = s.replace(/([aeiouAEIOU])[\s\u00A0]*[¨\u0308]/g, (m, l) => umlautVowels[l] || m);
    s = s.replace(/([cC])[\s\u00A0]*[\u0327¸]/g, (m, l) => l === 'c' ? 'ç' : 'Ç');

    // LaTeX escaped accents: \'a, \`a, \~n, \^a, \"u, \c{c}, \acute{a}
    s = s.replace(/\\acute\{([aeiouAEIOU])\}/gi, (m, l) => acuteVowels[l] || m);
    s = s.replace(/\\grave\{([aeiouAEIOU])\}/gi, (m, l) => graveVowels[l] || m);
    s = s.replace(/\\tilde\{([nNaAoO])\}/gi, (m, l) => tildeLetters[l] || m);
    s = s.replace(/\\hat\{([aeiouAEIOU])\}/gi, (m, l) => circVowels[l] || m);
    s = s.replace(/\\ddot\{([aeiouAEIOU])\}/gi, (m, l) => umlautVowels[l] || m);
    s = s.replace(/\\c\{([cC])\}/gi, (m, l) => l.toLowerCase() === 'c' ? (l === 'C' ? 'Ç' : 'ç') : m);

    s = s.replace(/\\'([aeiouAEIOU])/gi, (m, l) => acuteVowels[l] || m);
    s = s.replace(/\\`([aeiouAEIOU])/gi, (m, l) => graveVowels[l] || m);
    s = s.replace(/\\~([nNaAoO])/gi, (m, l) => tildeLetters[l] || m);
    s = s.replace(/\\\^([aeiouAEIOU])/gi, (m, l) => circVowels[l] || m);
    s = s.replace(/\\"([aeiouAEIOU])/gi, (m, l) => umlautVowels[l] || m);

    // NFC Unicode normalization (merges base char + combining diacritics into single codepoints)
    return s.normalize('NFC');
}

/**
 * Clean LaTeX, MathJax, KaTeX, Overleaf and ChatGPT artifacts:
 * - Solves duplicate text artifacts: "causalidad\text{causalidad}" → "causalidad"
 * - Converts display math & symbols
 * - Normalizes accents and formatting
 */

export function cleanLatexAndAiArtifacts(text) {
    if (!text) return '';

    // 1. Fix broken accents first
    let s = fixBrokenAccents(text);

    // 2. KaTeX / MathJax duplicated math and text artifact:
    // e.g. "causalidad\text{causalidad}" or "paneles sintéticos/pseudo-paneles\text{paneles sintéticos/pseudo-paneles}"
    // Safely handle KaTeX/MathJax duplicate terms without eating previous words
    s = s.replace(/([\p{L}\p{N}]+)\s*\\text(?:normal|rm)?\{\1\}/gu, '');

    // 3. Convert all LaTeX math & symbols to Unicode equivalents
    s = convertLatexToUnicode(s);

    // 4. Standalone text commands: \text{...}, \textbf{...}, \textit{...}, etc.
    s = s.replace(/\\text(?:normal|rm)?\{([^}]+)\}/g, '$1');
    s = s.replace(/\\textbf\{([^}]+)\}/g, '<b>$1</b>');
    s = s.replace(/\\textit\{([^}]+)\}/g, '<i>$1</i>');
    s = s.replace(/\\underline\{([^}]+)\}/g, '<u>$1</u>');
    s = s.replace(/\\(?:mathrm|mathbf|mathit|mathsf|mathtt|mathbb|mathcal|mathfrak)\{([^}]+)\}/g, '$1');

    // 5. LaTeX environment tags like \begin{equation}, \end{equation}, etc.
    s = s.replace(/\\(?:begin|end)\{[a-zA-Z0-9*]+\}/g, '');

    // 6. LaTeX line breaks: \\
    s = s.replace(/\\\\(?:\s*\[[\d\w\.]+\])?/g, '\n');

    // 7. Lingering \text{...} or broken accents
    s = s.replace(/\\text\{([^}]+)\}/g, '$1');
    s = fixBrokenAccents(s);

    return s;
}
