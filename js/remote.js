/*
 * remote.js
 * Mapeamento das teclas do controle remoto (Tizen) + navegação espacial
 * por coordenadas entre elementos .focusable visíveis.
 */
(function (global) {
    'use strict';

    var KEY = {
        ENTER: 13,
        PAUSE: 19,
        LEFT: 37,
        UP: 38,
        RIGHT: 39,
        DOWN: 40,
        RED: 403,
        GREEN: 404,
        YELLOW: 405,
        BLUE: 406,
        REW: 412,
        STOP: 413,
        PLAY: 415,
        FF: 417,
        INFO: 457,
        CHUP: 427,
        CHDOWN: 428,
        BACK: 10009,
        EXIT: 10182
    };

    var REGISTER_KEYS = [
        KEY.ENTER, KEY.PAUSE, KEY.LEFT, KEY.UP, KEY.RIGHT, KEY.DOWN,
        KEY.RED, KEY.GREEN, KEY.YELLOW, KEY.BLUE,
        KEY.REW, KEY.STOP, KEY.PLAY, KEY.FF, KEY.INFO, KEY.BACK, KEY.EXIT
    ];

    function isVisible(element) {
        if (!element || element.disabled) return false;
        if (element.hidden) return false;
        var rects = element.getClientRects();
        if (!rects.length) return false;
        var style = global.getComputedStyle(element);
        return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
    }

    function centerOf(rect) {
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    function scoreFor(direction, currentRect, candidateRect) {
        var current = centerOf(currentRect);
        var candidate = centerOf(candidateRect);
        var dx = candidate.x - current.x;
        var dy = candidate.y - current.y;

        if (direction === 'left' && dx > -2) return null;
        if (direction === 'right' && dx < 2) return null;
        if (direction === 'up' && dy > -2) return null;
        if (direction === 'down' && dy < 2) return null;

        var horizontal = direction === 'left' || direction === 'right';
        var primary = horizontal ? Math.abs(dx) : Math.abs(dy);
        var secondary = horizontal ? Math.abs(dy) : Math.abs(dx);

        var overlap = horizontal
            ? Math.max(0, Math.min(currentRect.bottom, candidateRect.bottom) - Math.max(currentRect.top, candidateRect.top))
            : Math.max(0, Math.min(currentRect.right, candidateRect.right) - Math.max(currentRect.left, candidateRect.left));

        return primary + secondary * 3 - (overlap > 0 ? overlap : 0);
    }

    var Remote = {
        KEY: KEY,

        init: function () {
            var self = this;
            this.registerKeys();

            document.addEventListener('keydown', function (event) {
                self.handle(event);
            }, false);

            document.addEventListener('focusin', function (event) {
                if (!self.reopening && self.isTextField(event.target)) {
                    event.target.setAttribute('readonly', '');
                }
            }, false);

            document.addEventListener('focusout', function (event) {
                if (!self.reopening && self.isTextField(event.target)) {
                    event.target.setAttribute('readonly', '');
                }
            }, false);

            document.addEventListener('focusin', function (event) {
                var target = event.target;
                if (target && target.classList && target.classList.contains('focusable')) {
                    try {
                        target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                    } catch (e) { /* ignore */ }
                }
            });
        },

        registerKeys: function () {
            if (!global.tizen || !tizen.tvinput || typeof tizen.tvinput.registerKey !== 'function') return;
            REGISTER_KEYS.forEach(function (code) {
                try {
                    tizen.tvinput.registerKey(code);
                } catch (e) { /* tecla não suportada no dispositivo */ }
            });
        },

        isTextField: function (el) {
            if (!el || !el.tagName) return false;
            if (el.tagName === 'TEXTAREA') return true;
            if (el.tagName !== 'INPUT') return false;
            return !/^(button|checkbox|radio|submit|reset|range|color|file|image|hidden)$/i.test(el.type || '');
        },

        /* Abre o teclado somente quando o usuário pressiona OK num campo de texto. */
        reopenForTyping: function (el) {
            this.reopening = true;
            try {
                el.removeAttribute('readonly');
                el.blur();
                el.focus({ preventScroll: true });
            } finally {
                this.reopening = false;
            }
        },

        focusables: function (root) {
            var scope = root || document;
            var nodes = scope.querySelectorAll('.focusable');
            var list = [];
            for (var i = 0; i < nodes.length; i++) {
                if (isVisible(nodes[i])) list.push(nodes[i]);
            }
            return list;
        },

        focus: function (element) {
            if (!element) return false;
            try {
                element.focus({ preventScroll: true });
            } catch (e) {
                element.focus();
            }
            return true;
        },

        focusFirst: function (root) {
            var list = this.focusables(root);
            return this.focus(list[0]);
        },

        move: function (direction) {
            var current = document.activeElement;
            if (!current || !current.classList || !current.classList.contains('focusable') || !isVisible(current)) {
                this.focusFirst();
                return;
            }

            var currentRect = current.getBoundingClientRect();
            var candidates = this.focusables();
            var best = null;
            var bestScore = Infinity;

            for (var i = 0; i < candidates.length; i++) {
                var candidate = candidates[i];
                if (candidate === current) continue;

                var score = scoreFor(direction, currentRect, candidate.getBoundingClientRect());
                if (score === null) continue;
                if (score < bestScore) {
                    bestScore = score;
                    best = candidate;
                }
            }

            if (best) this.focus(best);
        },

        handle: function (event) {
            var code = event.keyCode;
            if (!code) return;

            var target = event.target || {};
            var isTextInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

            var screenHandler = global.App && global.App.keyHandler;
            if (typeof screenHandler === 'function' && screenHandler(code, event) === true) {
                event.preventDefault();
                return;
            }

            if (global.Player && global.Player.onKey(code)) {
                event.preventDefault();
                return;
            }

            if (code === KEY.BACK || code === KEY.EXIT) {
                event.preventDefault();
                if (global.App) global.App.back();
                return;
            }

            var direction = code === KEY.LEFT ? 'left'
                : code === KEY.RIGHT ? 'right'
                    : code === KEY.UP ? 'up'
                        : code === KEY.DOWN ? 'down' : null;

            if (direction) {
                if (isTextInput && !target.readOnly && (direction === 'left' || direction === 'right')) return;
                event.preventDefault();
                this.move(direction);
                return;
            }

            if (code === KEY.ENTER) {
                var active = document.activeElement;
                if (!active || active === document.body) return;

                if (isTextInput && active.readOnly) {
                    event.preventDefault();
                    this.reopenForTyping(active);
                    return;
                }

                if (isTextInput) {
                    event.preventDefault();
                    active.blur();
                    this.move('down');
                    return;
                }

                if (active.classList && active.classList.contains('focusable') && !active.disabled) {
                    event.preventDefault();
                    active.click();
                }
            }
        }
    };

    global.Remote = Remote;

})(window);
