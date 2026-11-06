/*
 * player/avplay.js
 * Player em tela cheia: usa webapis.avplay (Tizen) e cai para <video> HTML5
 * quando a API nativa não existe (navegador/emulador sem AVPlay).
 * Inclui o mini preview (HTML5) usado no painel do Live TV.
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
        REW: 412,
        STOP: 413,
        PLAY: 415,
        FF: 417,
        BACK: 10009,
        EXIT: 10182
    };

    function hasAvPlay() {
        return !!(global.webapis && global.webapis.avplay &&
            typeof global.webapis.avplay.open === 'function');
    }

    function pad(value) {
        return value < 10 ? '0' + value : String(value);
    }

    function formatTime(ms) {
        var total = Math.max(0, Math.floor((ms || 0) / 1000));
        var hours = Math.floor(total / 3600);
        var minutes = Math.floor((total % 3600) / 60);
        var seconds = total % 60;
        return hours > 0 ? hours + ':' + pad(minutes) + ':' + pad(seconds) : pad(minutes) + ':' + pad(seconds);
    }

    function describeError(error) {
        if (!error) return 'O canal está fora do ar ou o formato não é suportado.';
        if (typeof error === 'string') return error;
        if (error.message) return error.message;

        var name = error.name || error.code || '';
        var map = {
            PLAYER_ERROR_INVALID_URI: 'Endereço do stream inválido.',
            PLAYER_ERROR_CONNECTION_FAILED: 'Falha de conexão com o servidor da lista.',
            PLAYER_ERROR_NOT_SUPPORTED_FILE: 'Formato de vídeo não suportado pela TV.',
            PLAYER_ERROR_INVALID_OPERATION: 'O player não conseguiu iniciar este stream.'
        };
        return map[name] || 'O canal está fora do ar ou o formato não é suportado.';
    }

    /* =========================================================
     * Mini preview do Live TV (vídeo HTML5)
     * ========================================================= */
    var Preview = {
        wrap: null,
        video: null,
        url: '',
        bound: false,

        bind: function (wrapEl) {
            this.stop();
            this.wrap = wrapEl;
            this.video = wrapEl ? wrapEl.querySelector('video') : null;
            if (!this.video) return;

            var self = this;
            if (!this.bound) {
                this.bound = true;
                this.video.addEventListener('playing', function () {
                    self.wrap.classList.remove('is-loading', 'is-error');
                });
                this.video.addEventListener('waiting', function () {
                    if (self.url) self.wrap.classList.add('is-loading');
                });
                this.video.addEventListener('error', function () {
                    self.wrap.classList.remove('is-loading');
                    self.wrap.classList.add('is-error');
                });
            }
            this.wrap.classList.remove('is-error');
            this.wrap.classList.add('is-idle');
        },

        play: function (url) {
            if (!this.video || !url) return;
            if (this.url === url && !this.video.error) return;

            this.url = url;
            if (this.wrap) {
                this.wrap.classList.remove('is-idle', 'is-error');
                this.wrap.classList.add('is-loading');
            }
            this.video.src = url;
            var promise = this.video.play();
            if (promise && typeof promise.catch === 'function') {
                promise.catch(function () { /* autoplay bloqueado */ });
            }
        },

        stop: function () {
            this.url = '';
            if (!this.video) return;
            try {
                this.video.pause();
                this.video.removeAttribute('src');
                this.video.load();
            } catch (e) { /* ignore */ }
            if (this.wrap) {
                this.wrap.classList.add('is-idle');
                this.wrap.classList.remove('is-loading', 'is-error');
            }
        }
    };

    /* =========================================================
     * Player em tela cheia
     * ========================================================= */
    var Player = {
        layer: null,
        surface: null,
        ui: null,
        titleEl: null,
        subtitleEl: null,
        liveBadge: null,
        spinner: null,
        errorEl: null,
        errorText: null,
        progressEl: null,
        progressFill: null,
        timeCurrent: null,
        timeTotal: null,
        toggleBtn: null,

        mode: null,
        status: 'idle',
        meta: null,
        url: '',
        isLive: false,
        paused: false,
        duration: 0,
        position: 0,
        pollTimer: null,
        hideTimer: null,
        htmlVideo: null,
        previousFocus: null,
        forceHtml5: false,

        init: function () {
            this.layer = document.getElementById('player-layer');
            this.surface = document.getElementById('player-surface');
            this.ui = document.getElementById('player-ui');
            this.titleEl = document.getElementById('player-title');
            this.subtitleEl = document.getElementById('player-subtitle');
            this.liveBadge = document.getElementById('player-live');
            this.spinner = document.getElementById('player-spinner');
            this.errorEl = document.getElementById('player-error');
            this.errorText = document.getElementById('player-error-text');
            this.progressEl = document.getElementById('player-progress');
            this.progressFill = document.getElementById('player-progress-fill');
            this.timeCurrent = document.getElementById('player-time-current');
            this.timeTotal = document.getElementById('player-time-total');
            this.toggleBtn = document.getElementById('player-toggle');

            var self = this;
            this.ui.addEventListener('click', function (event) {
                var button = event.target.closest('[data-player-action]');
                if (!button) return;
                var action = button.getAttribute('data-player-action');
                if (action === 'toggle') self.toggle();
                else if (action === 'rew') self.seekBy(-10000);
                else if (action === 'ff') self.seekBy(10000);
                else if (action === 'back') self.close();
                self.showUi();
            });

            document.getElementById('player-close').addEventListener('click', function () {
                self.close();
            });
            document.getElementById('player-retry').addEventListener('click', function () {
                if (self.meta) self.play(self.meta);
            });
        },

        isOpen: function () {
            return !!(this.layer && !this.layer.hidden);
        },

        play: function (options) {
            if (!options || !options.url) return;

            this.stopPlayback();
            this.meta = options;
            this.urls = (options.urls && options.urls.length) ? options.urls.slice() : [options.url];
            this.urlIndex = 0;
            this.started = false;
            this.url = options.url;
            this.isLive = !!options.isLive;
            this.paused = false;
            this.position = 0;
            this.duration = 0;
            this.setStatus('loading');
            this.previousFocus = document.activeElement;

            this.titleEl.textContent = options.title || '';
            this.subtitleEl.textContent = options.subtitle || '';
            this.liveBadge.hidden = !this.isLive;
            this.progressEl.style.display = this.isLive ? 'none' : '';
            this.errorEl.hidden = true;
            this.toggleBtn.textContent = '⏸ Pausar';
            this.updateProgress();

            this.layer.hidden = false;
            document.body.classList.add('player-fullscreen');
            this.showUi();
            this.open(options);
            this.armWatchdog();
        },

        open: function (options) {
            var self = this;
            this.url = options.url;

            if (hasAvPlay() && !this.forceHtml5) {
                try {
                    this.openAvPlay(options);
                    return;
                } catch (error) {
                    console.warn('[player] AVPlay falhou, usando HTML5', error);
                    this.stopAvPlay();
                }
            }
            this.openHtml5(options);

            if (this.htmlVideo) {
                var promise = this.htmlVideo.play();
                if (promise && typeof promise.catch === 'function') {
                    promise.catch(function (error) {
                        if (error && error.name === 'NotAllowedError') return;
                        self.showError(error);
                    });
                }
            }
        },

        openAvPlay: function (options) {
            var self = this;
            var av = global.webapis.avplay;

            this.mode = 'avplay';
            this.ensureAvObject();

            av.open(options.url);
            av.setDisplayRect(0, 0, global.innerWidth || 1920, global.innerHeight || 1080);
            av.setListener({
                onbufferingstart: function () { self.setStatus('buffering'); },
                onbufferingprogress: function () { self.setStatus('buffering'); },
                onbufferingcomplete: function () {
                    self.setStatus(self.paused ? 'paused' : 'playing');
                },
                oncurrentplaytime: function (ms) { self.position = ms || 0; },
                onstreamcompleted: function () {
                    self.setStatus('ended');
                    self.stopPolling();
                },
                onerror: function (error) { self.showError(error); },
                onevent: function () { /* eventos internos ignorados */ }
            });

            var started = function () {
                try {
                    av.play();
                    self.setStatus('playing');
                    self.startPolling();
                } catch (error) {
                    self.showError(error);
                }
            };

            if (typeof av.prepareAsync === 'function') {
                av.prepareAsync(started, function (error) { self.showError(error); });
            } else {
                av.prepare();
                started();
            }
        },

        ensureAvObject: function () {
            if (this.avObject || !this.surface) return;
            var object = document.createElement('object');
            object.setAttribute('type', 'application/avplayer');
            object.className = 'player-avplayer';
            object.style.width = '100%';
            object.style.height = '100%';
            this.surface.appendChild(object);
            this.avObject = object;
        },

        openHtml5: function () {
            var self = this;

            this.mode = 'html5';
            if (this.avObject) {
                try { this.avObject.remove(); } catch (e) { /* ignore */ }
                this.avObject = null;
            }

            if (!this.htmlVideo) {
                var video = document.createElement('video');
                video.className = 'player-video';
                video.setAttribute('playsinline', '');
                video.setAttribute('autoplay', '');
                video.preload = 'auto';

                video.addEventListener('playing', function () {
                    self.setStatus('playing');
                    self.startPolling();
                });
                video.addEventListener('pause', function () {
                    if (self.status === 'playing') self.setStatus('paused');
                });
                video.addEventListener('waiting', function () { self.setStatus('buffering'); });
                video.addEventListener('timeupdate', function () { self.updateProgress(); });
                video.addEventListener('ended', function () { self.setStatus('ended'); self.stopPolling(); });
                video.addEventListener('error', function () {
                    var code = video.error ? video.error.code : 0;
                    var message = code === 4 ? 'Formato não suportado por este dispositivo (HLS precisa da TV ou de um navegador com suporte).'
                        : 'Não foi possível carregar o stream.';
                    self.showError(message);
                });

                this.surface.appendChild(video);
                this.htmlVideo = video;
            }
            this.htmlVideo.src = this.url;
        },

        toggle: function () {
            if (!this.isOpen() || this.errorEl.hidden === false) return;

            if (this.mode === 'avplay') {
                var av = global.webapis.avplay;
                try {
                    var state = typeof av.getState === 'function' ? av.getState() : '';
                    if (state === 'PLAYING') {
                        av.pause();
                        this.paused = true;
                    } else {
                        av.play();
                        this.paused = false;
                    }
                } catch (error) {
                    this.showError(error);
                    return;
                }
            } else if (this.htmlVideo) {
                if (this.htmlVideo.paused) {
                    var promise = this.htmlVideo.play();
                    if (promise && promise.catch) promise.catch(function () { /* ignore */ });
                    this.paused = false;
                } else {
                    this.htmlVideo.pause();
                    this.paused = true;
                }
            }

            this.setStatus(this.paused ? 'paused' : 'playing');
            this.toggleBtn.textContent = this.paused ? '▶ Reproduzir' : '⏸ Pausar';
            this.showUi();
        },

        seekBy: function (deltaMs) {
            if (!this.isOpen() || this.isLive) return;

            if (this.mode === 'avplay') {
                var av = global.webapis.avplay;
                try {
                    var target = Math.max(0, (av.getCurrentTime() || 0) + deltaMs);
                    av.seekTo(target);
                } catch (error) {
                    console.warn('[player] seek falhou', error);
                }
            } else if (this.htmlVideo && isFinite(this.htmlVideo.duration)) {
                this.htmlVideo.currentTime = Math.min(
                    Math.max(0, this.htmlVideo.currentTime + deltaMs / 1000),
                    this.htmlVideo.duration || 0
                );
            }
            this.showUi();
        },

        setStatus: function (status) {
            this.status = status;
            if (status === 'playing' && !this.started) {
                this.started = true;
                clearTimeout(this.watchdog);
                if (this.meta && typeof this.meta.onStart === 'function') {
                    try { this.meta.onStart(this.urlIndex); } catch (e) { /* ignore */ }
                }
            }
            if (this.spinner) {
                this.spinner.hidden = !(status === 'loading' || status === 'buffering');
            }
            if (status === 'playing') {
                this.errorEl.hidden = true;
                this.scheduleHide();
            } else if (status === 'paused' || status === 'ended') {
                this.showUi(true);
            }
        },

        updateProgress: function () {
            if (this.mode === 'avplay' && this.isOpen()) {
                var av = global.webapis.avplay;
                try {
                    if (typeof av.getDuration === 'function') this.duration = av.getDuration() || this.duration;
                    if (typeof av.getCurrentTime === 'function') this.position = av.getCurrentTime() || this.position;
                } catch (e) { /* ignore */ }
            } else if (this.htmlVideo) {
                this.duration = (this.htmlVideo.duration || 0) * 1000;
                this.position = (this.htmlVideo.currentTime || 0) * 1000;
            }

            if (this.isLive) return;

            var percent = this.duration > 0 ? Math.min(100, (this.position / this.duration) * 100) : 0;
            if (this.progressFill) this.progressFill.style.width = percent + '%';
            if (this.timeCurrent) this.timeCurrent.textContent = formatTime(this.position);
            if (this.timeTotal) this.timeTotal.textContent = formatTime(this.duration);
        },

        startPolling: function () {
            var self = this;
            this.stopPolling();
            this.pollTimer = setInterval(function () {
                self.updateProgress();
            }, 500);
        },

        stopPolling: function () {
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
                this.pollTimer = null;
            }
        },

        /* Troca automaticamente para o próximo formato (ts/m3u8) antes do primeiro frame. */
        tryNextUrl: function () {
            if (this.started || !this.meta || !this.urls || this.urlIndex + 1 >= this.urls.length) return false;
            this.urlIndex += 1;
            var next = this.urls[this.urlIndex];
            this.stopPlayback();
            this.setStatus('loading');
            this.open(Object.assign({}, this.meta, { url: next }));
            this.armWatchdog();
            return true;
        },

        armWatchdog: function () {
            var self = this;
            clearTimeout(this.watchdog);
            if (this.started || !this.urls || this.urls.length < 2) return;
            this.watchdog = setTimeout(function () {
                if (!self.started && self.isOpen()) self.tryNextUrl();
            }, 12000);
        },

        showError: function (error) {
            if (this.tryNextUrl()) return;
            this.status = 'error';
            this.paused = true;
            this.stopPolling();
            this.spinner.hidden = true;
            this.errorText.textContent = describeError(error);
            this.errorEl.hidden = false;
            this.ui.classList.remove('is-hidden');
            if (this.hideTimer) clearTimeout(this.hideTimer);
        },

        showUi: function (keepVisible) {
            if (!this.ui) return;
            this.ui.classList.remove('is-hidden');
            if (this.hideTimer) {
                clearTimeout(this.hideTimer);
                this.hideTimer = null;
            }
            if (!keepVisible) this.scheduleHide();
        },

        scheduleHide: function () {
            var self = this;
            if (this.hideTimer) clearTimeout(this.hideTimer);
            if (this.paused || this.status === 'error' || this.isLive === null) return;

            this.hideTimer = setTimeout(function () {
                if (self.status === 'playing' && !self.paused) {
                    self.ui.classList.add('is-hidden');
                }
            }, 4000);
        },

        onKey: function (code) {
            if (!this.isOpen()) return false;

            switch (code) {
                case KEY.ENTER:
                case KEY.PLAY:
                case KEY.PAUSE:
                    this.toggle();
                    return true;
                case KEY.LEFT:
                case KEY.REW:
                    this.seekBy(code === KEY.REW ? -30000 : -10000);
                    return true;
                case KEY.RIGHT:
                case KEY.FF:
                    this.seekBy(code === KEY.FF ? 30000 : 10000);
                    return true;
                case KEY.UP:
                case KEY.DOWN:
                    this.showUi();
                    return true;
                case KEY.BACK:
                case KEY.EXIT:
                case KEY.STOP:
                    this.close();
                    return true;
                default:
                    return false;
            }
        },

        close: function () {
            if (!this.isOpen()) return;
            var meta = this.meta;

            this.stopPlayback();
            this.layer.hidden = true;
            document.body.classList.remove('player-fullscreen');
            this.ui.classList.remove('is-hidden');
            this.status = 'idle';
            this.meta = null;

            if (this.previousFocus && document.contains(this.previousFocus)) {
                try { this.previousFocus.focus(); } catch (e) { /* ignore */ }
            }
            this.previousFocus = null;

            if (meta && typeof meta.onClose === 'function') {
                try { meta.onClose(); } catch (e) { console.warn(e); }
            }
        },

        stopAvPlay: function () {
            if (!hasAvPlay()) return;
            var av = global.webapis.avplay;
            try { av.stop(); } catch (e) { /* ignore */ }
            try { av.close(); } catch (e) { /* ignore */ }
        },

        stopPlayback: function () {
            this.stopPolling();
            clearTimeout(this.watchdog);
            if (this.hideTimer) {
                clearTimeout(this.hideTimer);
                this.hideTimer = null;
            }

            if (this.mode === 'avplay') {
                this.stopAvPlay();
            }
            if (this.htmlVideo) {
                try {
                    this.htmlVideo.pause();
                    this.htmlVideo.removeAttribute('src');
                    this.htmlVideo.load();
                } catch (e) { /* ignore */ }
            }
            if (this.avObject) {
                try { this.avObject.remove(); } catch (e) { /* ignore */ }
                this.avObject = null;
            }
            this.mode = null;
            this.errorEl.hidden = true;
            this.spinner.hidden = true;
        }
    };

    global.Player = Player;
    global.Preview = Preview;

})(window);
