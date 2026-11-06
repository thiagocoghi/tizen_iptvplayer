/*
 * app.js
 * Núcleo do aplicativo: registro de telas, roteador (pilha de navegação),
 * carregamento e normalização dos catálogos (Xtream Codes e M3U), helpers
 * de UI (loader, toast, diálogo), favoritos e início da reprodução.
 *
 * As views (js/views/*.js) registram-se aqui através de App.registerView().
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
        BACK: 10009,
        EXIT: 10182
    };

    /* Normaliza texto para busca: minúsculas e sem acentos. */
    function normalizeText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    var views = {};
    var stack = [];
    var catalogCache = {};
    var seriesCache = {};
    var movieCache = {};
    var dialogResolve = null;
    var toastTimer = null;

    var state = {
        screen: '',
        payload: null,
        view: null
    };

    /* =========================================================
     * Helpers de DOM
     * ========================================================= */

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function esc(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function pick(value, fallback) {
        return (value === undefined || value === null || value === '') ? (fallback || '') : value;
    }

    function pad(value) {
        return value < 10 ? '0' + value : String(value);
    }

    function yearOf(name) {
        var text = String(name || '');
        var match = /\((19\d{2}|20\d{2})\)/.exec(text) || /\b(19\d{2}|20\d{2})\s*$/.exec(text);
        return match ? match[1] : '';
    }

    /* =========================================================
     * Normalização dos catálogos
     * ========================================================= */

    function categoryEntries(rawList) {
        return (rawList || []).map(function (category) {
            return {
                id: String(pick(category.category_id, '')),
                name: pick(category.category_name, 'Sem categoria')
            };
        });
    }

    function withAll(categories, items, allLabel) {
        var counts = {};
        (items || []).forEach(function (item) {
            counts[item.categoryId] = (counts[item.categoryId] || 0) + 1;
        });

        var list = (categories || []).filter(function (category) {
            return counts[category.id];
        }).map(function (category) {
            return { id: category.id, name: category.name, count: counts[category.id] };
        }).sort(function (a, b) {
            return String(a.name).localeCompare(String(b.name));
        });

        if (!list.length) return [];
        return [{ id: 'all', name: allLabel || 'Todos', count: (items || []).length }].concat(list);
    }

    function loadXtream(account) {
        var api = new global.Xtream(account);

        return api.auth().then(function () {
            return Promise.all([
                api.getLiveCategories(),
                api.getLiveStreams(),
                api.getVodCategories(),
                api.getVodStreams(),
                api.getSeriesCategories(),
                api.getSeries()
            ]);
        }).then(function (results) {
            var liveItems = (results[1] || []).map(function (stream) {
                return {
                    id: String(stream.stream_id),
                    name: pick(stream.name, 'Canal'),
                    logo: pick(stream.stream_icon, ''),
                    categoryId: String(pick(stream.category_id, '')),
                    url: api.liveUrl(stream.stream_id),
                    epgChannelId: pick(stream.epg_channel_id, ''),
                    number: pick(stream.num, 0),
                    kind: 'live'
                };
            });

            var movieItems = (results[3] || []).map(function (stream) {
                return {
                    id: String(stream.stream_id),
                    name: pick(stream.name, 'Filme'),
                    poster: pick(stream.stream_icon, ''),
                    categoryId: String(pick(stream.category_id, '')),
                    url: api.vodUrl(stream.stream_id, pick(stream.container_extension, 'mp4')),
                    ext: pick(stream.container_extension, 'mp4'),
                    year: yearOf(stream.name),
                    rating: pick(stream.rating, ''),
                    plot: '',
                    kind: 'movie'
                };
            });

            var seriesItems = (results[5] || []).map(function (series) {
                return {
                    id: String(series.series_id),
                    name: pick(series.name, 'Série'),
                    poster: pick(series.cover, ''),
                    categoryId: String(pick(series.category_id, '')),
                    plot: pick(series.plot, ''),
                    year: String(pick(series.releaseDate, '')).slice(0, 4),
                    rating: pick(series.rating, ''),
                    kind: 'series'
                };
            });

            return {
                type: 'xtream',
                epgUrl: '',
                live: {
                    categories: withAll(categoryEntries(results[0]), liveItems, 'Todos os canais'),
                    items: liveItems
                },
                movies: {
                    categories: withAll(categoryEntries(results[2]), movieItems, 'Todos os filmes'),
                    items: movieItems
                },
                series: {
                    categories: withAll(categoryEntries(results[4]), seriesItems, 'Todas as séries'),
                    items: seriesItems
                }
            };
        });
    }

    function loadM3U(account) {
        return global.M3UParser.load(account.url).then(function (data) {
            function normalize(categories, items) {
                return (categories || []).map(function (category) {
                    return { id: String(category.id), name: pick(category.name, 'Sem categoria') };
                });
            }

            var liveItems = data.live.items.map(function (item) {
                item.kind = 'live';
                return item;
            });
            var movieItems = data.movies.items.map(function (item) {
                item.kind = 'movie';
                return item;
            });

            return {
                type: 'm3u',
                epgUrl: pick(data.epgUrl, ''),
                live: {
                    categories: withAll(normalize(data.live.categories), liveItems, 'Todos os canais'),
                    items: liveItems
                },
                movies: {
                    categories: withAll(normalize(data.movies.categories), movieItems, 'Todos os filmes'),
                    items: movieItems
                },
                series: { categories: [], items: [] }
            };
        });
    }

    /* =========================================================
     * API pública
     * ========================================================= */

    var App = {
        KEY: KEY,
        catalog: null,

        registerView: function (name, view) {
            views[name] = view;
        },

        el: el,
        esc: esc,

        initials: function (value) {
            var text = String(value || '').trim();
            if (!text) return '?';
            var words = text.split(/\s+/).filter(Boolean);
            if (words.length > 1) {
                return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
            }
            return text.slice(0, 2).toUpperCase();
        },

        clock: function (date) {
            if (!date || typeof date.getTime !== 'function') return '--:--';
            return pad(date.getHours()) + ':' + pad(date.getMinutes());
        },

        /* ---------------- Roteador ---------------- */

        show: function (name, payload, options) {
            options = options || {};

            var view = views[name];
            var section = document.getElementById('screen-' + name);
            if (!view || !section) {
                console.error('[app] tela inválida: ' + name);
                return;
            }

            /* Recria o nó da tela para descartar listeners delegados antigos
             * (evita handlers duplicados quando a mesma tela é re-renderizada). */
            var fresh = section.cloneNode(false);
            fresh.hidden = false;
            section.parentNode.replaceChild(fresh, section);
            section = fresh;

            if (state.view && state.view !== view && typeof state.view.destroy === 'function') {
                try {
                    state.view.destroy();
                } catch (error) {
                    console.warn('[app] destroy falhou', error);
                }
            }

            var screens = document.querySelectorAll('.screen');
            for (var i = 0; i < screens.length; i++) {
                screens[i].hidden = screens[i] !== section;
            }

            if (options.stack !== false && state.screen && state.screen !== name) {
                stack.push({ name: state.screen, payload: state.payload });
            }

            state.screen = name;
            state.payload = payload || {};
            state.view = view;

            section.innerHTML = '';
            try {
                view.render(section, state.payload);
            } catch (error) {
                console.error('[app] falha ao renderizar ' + name, error);
                section.innerHTML = '<p class="empty">Não foi possível abrir esta tela: ' +
                    esc(error && error.message) + '</p>';
            }

            this.focusFirst(section);
        },

        navigate: function (name, payload) {
            this.show(name, payload, { stack: true });
        },

        replace: function (name, payload) {
            this.show(name, payload, { stack: false });
        },

        back: function () {
            if (global.Player && global.Player.isOpen()) {
                global.Player.close();
                return;
            }
            if (dialogResolve) {
                this.closeDialog(false);
                return;
            }
            if (state.view && typeof state.view.back === 'function' && state.view.back(state.payload) === true) {
                return;
            }

            var previous = stack.pop();
            if (previous) {
                this.show(previous.name, previous.payload, { stack: false });
                return;
            }
            if (state.screen !== 'home' && views.home) {
                this.show('home', {}, { stack: false });
                return;
            }
            this.exit();
        },

        exit: function () {
            try {
                if (global.tizen && global.tizen.application) {
                    global.tizen.application.getCurrentApplication().exit();
                }
            } catch (error) {
                console.warn('[app] não foi possível encerrar o app', error);
            }
        },

        keyHandler: function (code, event) {
            if (global.Player && global.Player.isOpen()) return false;

            if (dialogResolve) {
                if (code === KEY.BACK || code === KEY.EXIT) {
                    this.closeDialog(false);
                    return true;
                }
                if (code === KEY.LEFT || code === KEY.RIGHT) {
                    var confirmBtn = document.getElementById('dialog-confirm');
                    var cancelBtn = document.getElementById('dialog-cancel');
                    this.focus(document.activeElement === confirmBtn ? cancelBtn : confirmBtn);
                    return true;
                }
                if (code === KEY.UP || code === KEY.DOWN) return true;
                return false;
            }

            var view = state.view;
            if (view && typeof view.onKey === 'function') {
                if (view.onKey(code, event, state.payload) === true) return true;
            }
            return false;
        },

        /* ---------------- UI ---------------- */

        loader: function (visible, text) {
            var node = document.getElementById('loader');
            if (!node) return;
            var label = document.getElementById('loader-text');
            if (label) label.textContent = text || 'Carregando...';
            node.hidden = !visible;
        },

        toast: function (message, ms) {
            var node = document.getElementById('toast');
            if (!node) return;
            node.textContent = String(message || '');
            node.hidden = false;
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(function () {
                node.hidden = true;
                toastTimer = null;
            }, ms || 2800);
        },

        dialogOpen: function () {
            return !!dialogResolve;
        },

        confirm: function (title, message, options) {
            options = options || {};
            var self = this;

            return new Promise(function (resolve) {
                dialogResolve = resolve;

                document.getElementById('dialog-title').textContent = title || 'Confirmação';
                document.getElementById('dialog-message').textContent = message || '';
                document.getElementById('dialog-confirm').textContent = options.confirmText || 'Confirmar';

                var confirmBtn = document.getElementById('dialog-confirm');
                var cancelBtn = document.getElementById('dialog-cancel');

                confirmBtn.onclick = function () { App.closeDialog(true); };
                cancelBtn.onclick = function () { App.closeDialog(false); };

                document.getElementById('dialog').hidden = false;
                self.focus(confirmBtn);
            });
        },

        closeDialog: function (result) {
            var resolve = dialogResolve;
            dialogResolve = null;
            document.getElementById('dialog').hidden = true;
            if (resolve) resolve(!!result);
        },

        focus: function (element) {
            if (!element) return false;
            if (global.Remote && typeof global.Remote.focus === 'function') {
                return global.Remote.focus(element);
            }
            try { element.focus({ preventScroll: true }); } catch (e) { element.focus(); }
            return true;
        },

        focusFirst: function (root) {
            if (global.Remote && typeof global.Remote.focusFirst === 'function') {
                return global.Remote.focusFirst(root);
            }
            return false;
        },

        /**
         * Renderiza uma lista longa em blocos, anexando mais itens conforme o
         * foco do controle remoto avança (evita milhares de nós no DOM da TV).
         */
        renderList: function (container, items, factory, options) {
            options = options || {};
            var chunkSize = options.chunk || 80;
            var total = (items || []).length;
            var rendered = 0;
            var sentinel = null;

            container.innerHTML = '';

            function appendChunk() {
                if (rendered >= total) return;
                var end = Math.min(total, rendered + chunkSize);
                var fragment = document.createDocumentFragment();

                for (var i = rendered; i < end; i++) {
                    fragment.appendChild(factory(items[i], i));
                }
                container.appendChild(fragment);
                rendered = end;

                if (sentinel && sentinel.parentNode) sentinel.parentNode.removeChild(sentinel);
                sentinel = null;

                if (rendered < total) {
                    sentinel = el('div', 'list-sentinel', 'Continue navegando para ver mais itens...');
                    container.appendChild(sentinel);
                }
            }

            container.addEventListener('focusin', function (event) {
                var row = event.target && event.target.getAttribute ? event.target : null;
                if (!row) return;
                var index = Number(row.getAttribute('data-index'));
                if (isNaN(index)) return;
                if (index >= rendered - 10 && rendered < total) appendChunk();
            });

            appendChunk();
            return { container: container, total: total };
        },

        /* ---------------- Contas / catálogo ---------------- */

        loadCatalog: function (force) {
            var self = this;
            var account = global.Store.getActiveAccount();

            if (!account) {
                return Promise.reject(new Error('Nenhuma lista cadastrada.'));
            }

            var cached = catalogCache[account.id];
            if (cached && !force) {
                this.catalog = cached;
                return Promise.resolve(cached);
            }

            var request = account.type === 'm3u' ? loadM3U(account) : loadXtream(account);
            return request.then(function (catalog) {
                catalog.account = account;
                catalogCache[account.id] = catalog;
                self.catalog = catalog;
                return catalog;
            });
        },

        invalidateCatalog: function (accountId) {
            if (accountId) delete catalogCache[accountId];
            else catalogCache = {};
            this.catalog = null;
        },

        items: function (kind, categoryId) {
            var catalog = this.catalog;
            if (!catalog || !catalog[kind]) return [];

            var items = catalog[kind].items || [];
            if (!categoryId || categoryId === 'all') return items;

            return items.filter(function (item) {
                return String(item.categoryId) === String(categoryId);
            });
        },

        /* Busca por nome em TODAS as categorias (ignora categoria e acentos). */
        search: function (kind, query) {
            var needle = normalizeText(query);
            if (!needle) return [];
            return this.items(kind, 'all').filter(function (item) {
                return normalizeText(item.name).indexOf(needle) !== -1;
            });
        },

        categoryName: function (kind, categoryId) {
            var catalog = this.catalog;
            if (!catalog || !catalog[kind]) return '';
            var list = catalog[kind].categories || [];
            for (var i = 0; i < list.length; i++) {
                if (String(list[i].id) === String(categoryId)) return list[i].name;
            }
            return '';
        },

        getMovieInfo: function (movie) {
            var account = global.Store.getActiveAccount();
            if (!movie || !account || account.type !== 'xtream') return Promise.resolve({});

            var key = account.id + ':' + movie.id;
            if (movieCache[key]) return Promise.resolve(movieCache[key]);

            var api = new global.Xtream(account);
            return api.getVodInfo(movie.id).then(function (data) {
                var info = (data && data.info) || {};
                var movieData = (data && data.movie_data) || {};
                var normalized = {
                    name: pick(movieData.name, pick(info.name, movie.name)),
                    poster: pick(info.movie_image, movie.poster),
                    plot: pick(info.plot, pick(info.description, '')),
                    genre: pick(info.genre, ''),
                    cast: pick(info.cast, pick(info.actors, '')),
                    duration: pick(info.duration, ''),
                    year: String(pick(info.releasedate, pick(info.releaseDate, ''))).slice(0, 4),
                    rating: pick(info.rating, movie.rating)
                };
                movieCache[key] = normalized;
                return normalized;
            }).catch(function () {
                return {};
            });
        },

        getSeriesInfo: function (series) {
            var account = global.Store.getActiveAccount();
            if (!series) return Promise.reject(new Error('Série inválida.'));
            if (!account || account.type !== 'xtream') {
                return Promise.reject(new Error('Séries ficam disponíveis apenas em listas Xtream Codes.'));
            }

            var key = account.id + ':' + series.id;
            if (seriesCache[key]) return Promise.resolve(seriesCache[key]);

            var api = new global.Xtream(account);
            return api.getSeriesInfo(series.id).then(function (data) {
                var info = (data && data.info) || {};
                var rawEpisodes = (data && data.episodes) || {};
                var seasons = [];

                Object.keys(rawEpisodes).sort(function (a, b) {
                    return Number(a) - Number(b);
                }).forEach(function (seasonKey) {
                    var episodes = (rawEpisodes[seasonKey] || []).map(function (episode) {
                        var episodeInfo = episode.info || {};
                        return {
                            id: String(episode.id),
                            episode: pick(episode.episode_num, episodeInfo.episode_num),
                            title: pick(episode.title, 'Episódio ' + pick(episode.episode_num, '')),
                            season: Number(pick(episode.season, seasonKey)),
                            plot: pick(episodeInfo.plot, pick(episodeInfo.overview, '')),
                            duration: pick(episodeInfo.duration, ''),
                            url: api.seriesUrl(episode.id, pick(episode.container_extension, 'mp4'))
                        };
                    });

                    if (episodes.length) {
                        seasons.push({ season: Number(seasonKey), episodes: episodes });
                    }
                });

                var payload = {
                    info: {
                        plot: pick(info.plot, series.plot),
                        genre: pick(info.genre, ''),
                        cast: pick(info.cast, ''),
                        year: String(pick(info.releaseDate, series.year)).slice(0, 4),
                        rating: pick(info.rating, series.rating),
                        duration: pick(info.episode_run_time, '')
                    },
                    seasons: seasons
                };

                seriesCache[key] = payload;
                return payload;
            });
        },

        /* ---------------- Reprodução ---------------- */

        playStream: function (options) {
            var self = this;

            if (!options || !options.url) {
                this.toast('Este item não possui endereço de vídeo.');
                return;
            }

            if (options.type && options.id !== undefined && options.id !== null && options.id !== '') {
                global.Store.pushRecent({
                    type: options.type,
                    id: options.id,
                    seriesId: options.seriesId || '',
                    title: options.title || 'Sem título',
                    subtitle: options.subtitle || '',
                    logo: options.logo || '',
                    cover: options.cover || '',
                    url: options.url
                });
            }

            global.Player.play({
                url: options.url,
                urls: options.urls,
                onStart: options.onStart,
                title: options.title || '',
                subtitle: options.subtitle || '',
                isLive: !!options.isLive,
                onClose: function () {
                    if (state.screen === 'home') self.show('home', {}, { stack: false });
                }
            });
        },

        playLive: function (channel) {
            if (!channel) return;
            var account = global.Store.getActiveAccount();
            var urls = [channel.url];
            var formats = [];
            var onStart = null;
            if (account && account.type === 'xtream' && channel.id) {
                var api = new global.Xtream(account);
                var preferred = global.Store.getStreamFormat(account.id);
                formats = preferred === 'm3u8' ? ['m3u8', 'ts'] : ['ts', 'm3u8'];
                urls = formats.map(function (format) { return api.liveUrl(channel.id, format); });
                onStart = function (index) {
                    global.Store.setStreamFormat(account.id, formats[index]);
                };
            }
            this.playStream({
                url: urls[0],
                urls: urls,
                onStart: onStart,
                title: channel.name,
                subtitle: this.categoryName('live', channel.categoryId),
                isLive: true,
                type: 'live',
                id: channel.id,
                logo: channel.logo
            });
        },

        playMovie: function (movie, extra) {
            if (!movie) return;
            this.playStream({
                url: movie.url,
                title: movie.name,
                subtitle: [pick(extra && extra.year, movie.year), pick(extra && extra.genre, '')]
                    .filter(Boolean).join(' · '),
                isLive: false,
                type: 'movie',
                id: movie.id,
                cover: movie.poster
            });
        },

        playEpisode: function (series, episode, season) {
            if (!episode) {
                this.toast('Selecione um episódio para assistir.');
                return;
            }
            this.playStream({
                url: episode.url,
                title: series ? series.name : episode.title,
                subtitle: 'Temporada ' + season + ' · ' +
                    (episode.title || ('Episódio ' + episode.episode)),
                isLive: false,
                type: 'series',
                id: series ? series.id : episode.id,
                seriesId: series ? series.id : '',
                cover: series ? series.poster : ''
            });
        },

        toggleFavorite: function (type, item) {
            if (!item) return false;
            var added = global.Store.toggleFavorite(type, item);
            this.toast(added ? 'Adicionado aos favoritos' : 'Removido dos favoritos');
            return added;
        },

        /* ---------------- Boot ---------------- */

        init: function () {
            document.addEventListener('error', function (event) {
                var target = event.target;
                if (target && target.tagName === 'IMG') {
                    target.classList.add('is-broken');
                }
            }, true);

            if (global.Player && typeof global.Player.init === 'function') {
                global.Player.init();
            }
            if (global.Remote && typeof global.Remote.init === 'function') {
                global.Remote.init();
            }

            var account = global.Store.getActiveAccount();
            this.show(account ? 'home' : 'login', {}, { stack: false });
        }
    };

    global.App = App;

    function boot() {
        try {
            App.init();
        } catch (error) {
            console.error('[app] falha ao iniciar', error);
            var section = document.getElementById('screen-login');
            if (section) {
                section.hidden = false;
                section.innerHTML = '<p class="empty">Falha ao iniciar o aplicativo: ' +
                    esc(error && error.message) + '</p>';
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, false);
    } else {
        boot();
    }

})(window);
