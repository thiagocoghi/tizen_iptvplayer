/*
 * views/series.js
 * Séries em duas telas:
 *   1) Grade: categorias + capas + busca por nome (em todas as categorias).
 *   2) Episódios: ao selecionar uma série, abre a tela com a capa, a sinopse,
 *      os botões de temporada (T1, T2...; só aparecem se houver mais de uma)
 *      e a lista de episódios. Voltar (BACK) retorna à grade.
 */
(function (global) {
    'use strict';

    var App = global.App;

    var state = {
        section: null,
        catalog: null,
        categoryId: 'all',
        query: '',
        items: [],
        mode: 'grid',          // 'grid' | 'episodes'
        series: null,
        seasons: [],
        seasonNumber: null,
        episodes: [],
        episode: null,
        token: 0
    };

    var searchTimer = null;

    function buildShell(section) {
        section.innerHTML =
            '<div class="layout layout-detail" data-role="grid-screen">' +
                '<aside class="pane pane-cats">' +
                    '<h2 class="pane-title">Categorias</h2>' +
                    '<div class="list scroll" data-role="cats"></div>' +
                '</aside>' +
                '<div class="pane pane-grid">' +
                    '<div class="search-bar">' +
                        '<input type="search" class="input search-input focusable" data-role="search" ' +
                            'placeholder="Buscar série por nome (todas as categorias)" autocomplete="off"/>' +
                    '</div>' +
                    '<div class="pane-head">' +
                        '<h2 class="pane-title" data-role="cat-name">Séries</h2>' +
                        '<span class="pane-count" data-role="count"></span>' +
                    '</div>' +
                    '<div class="grid scroll" data-role="grid"></div>' +
                '</div>' +
            '</div>' +
            '<div class="series-episodes" data-role="episodes-screen" style="display:none"></div>';
    }

    function gridScreen() {
        return state.section.querySelector('[data-role="grid-screen"]');
    }

    function episodesScreen() {
        return state.section.querySelector('[data-role="episodes-screen"]');
    }

    function seriesCard(series, index) {
        var card = App.el('button', 'poster-card focusable', '');
        card.type = 'button';
        card.setAttribute('data-index', index);
        card.innerHTML =
            (series.poster
                ? '<img class="poster-img" src="' + App.esc(series.poster) + '" alt="">'
                : '<span class="poster-fallback">' + App.esc(App.initials(series.name)) + '</span>') +
            '<span class="poster-caption">' +
                '<span class="poster-title">' + App.esc(series.name) + '</span>' +
                '<span class="poster-meta">' +
                    App.esc([series.year, series.rating].filter(Boolean).join(' · ')) +
                '</span>' +
            '</span>';
        return card;
    }

    function metaLine(series, info) {
        info = info || {};
        var parts = [];
        if (series.year || info.year) parts.push(series.year || info.year);
        if (info.genre) parts.push(info.genre);
        if (series.rating || info.rating) parts.push('★ ' + (series.rating || info.rating));
        return parts.join(' · ');
    }

    /* ---------------- Grade ---------------- */

    function renderGrid(section, items, title, focusFirst) {
        state.items = items;
        section.querySelector('[data-role="cat-name"]').textContent = title;
        section.querySelector('[data-role="count"]').textContent =
            items.length + (items.length === 1 ? ' série' : ' séries');

        var grid = section.querySelector('[data-role="grid"]');
        grid.innerHTML = '';

        if (!items.length) {
            grid.innerHTML = '<p class="empty">Nenhuma série encontrada.</p>';
            return;
        }

        App.renderList(grid, items, seriesCard, { chunk: 60 });

        if (focusFirst) {
            var first = grid.querySelector('[data-index]');
            if (first) App.focus(first);
        }
    }

    function renderCategories(section) {
        var container = section.querySelector('[data-role="cats"]');
        container.innerHTML = '';

        (state.catalog.series.categories || []).forEach(function (category) {
            var button = App.el('button', 'list-item focusable', '');
            button.type = 'button';
            button.setAttribute('data-cat', category.id);
            if (category.id === state.categoryId) button.classList.add('is-active');
            button.innerHTML =
                '<span class="list-item-body"><span class="list-item-title">' +
                    App.esc(category.name) + '</span></span>' +
                '<span class="list-item-badge">' + category.count + '</span>';
            container.appendChild(button);
        });
    }

    function selectCategory(section, categoryId, focusFirst) {
        state.categoryId = categoryId;

        var cats = section.querySelectorAll('[data-cat]');
        for (var i = 0; i < cats.length; i++) {
            cats[i].classList.toggle('is-active', cats[i].getAttribute('data-cat') === categoryId);
        }

        var category = state.catalog.series.categories.filter(function (item) {
            return String(item.id) === String(categoryId);
        })[0];

        renderGrid(section, App.items('series', categoryId),
            category ? category.name : 'Séries', focusFirst);
    }

    function clearSearch(section) {
        var input = section.querySelector('[data-role="search"]');
        if (input) input.value = '';
        state.query = '';
    }

    /* Busca em todas as categorias. */
    function runSearch(section) {
        if (!state.query) {
            selectCategory(section, state.categoryId, false);
            return;
        }
        renderGrid(section, App.search('series', state.query), 'Busca: ' + state.query, false);
    }

    /* ---------------- Tela de episódios ---------------- */

    function updateEpisodeDescription() {
        var screen = state.section ? episodesScreen() : null;
        var description = screen ? screen.querySelector('[data-role="ep-desc"]') : null;
        if (!description) return;

        if (!state.episode) {
            description.textContent = '';
            return;
        }

        var parts = [];
        if (state.episode.title) parts.push(state.episode.title);
        if (state.episode.duration) parts.push(state.episode.duration);
        var header = parts.join(' · ');
        description.textContent = header +
            (state.episode.plot ? ' — ' + state.episode.plot : '');
    }

    function selectSeason(screen, seasonNumber, focusFirst) {
        var season = state.seasons.filter(function (item) {
            return String(item.season) === String(seasonNumber);
        })[0];
        if (!season) return;

        state.seasonNumber = season.season;
        state.episodes = season.episodes || [];
        state.episode = state.episodes[0] || null;

        var chips = screen.querySelectorAll('[data-season]');
        for (var i = 0; i < chips.length; i++) {
            chips[i].classList.toggle('is-active',
                chips[i].getAttribute('data-season') === String(seasonNumber));
        }

        var list = screen.querySelector('[data-role="episodes"]');
        list.innerHTML = '';
        list.scrollTop = 0;

        if (!state.episodes.length) {
            list.innerHTML = '<p class="empty">Nenhum episódio nesta temporada.</p>';
            updateEpisodeDescription();
            return;
        }

        state.episodes.forEach(function (episode, index) {
            var row = App.el('button', 'episode focusable', '');
            row.type = 'button';
            row.setAttribute('data-episode', index);
            row.innerHTML =
                '<span class="episode-num">' + App.esc(episode.episode || (index + 1)) + '</span>' +
                '<span class="episode-title">' +
                    App.esc(episode.title || ('Episódio ' + (index + 1))) +
                '</span>';
            list.appendChild(row);
        });

        updateEpisodeDescription();

        if (focusFirst) {
            var first = list.querySelector('[data-episode]');
            if (first) App.focus(first);
        }
    }

    function renderSeasons(screen) {
        var chipsBox = screen.querySelector('[data-role="seasons"]');
        chipsBox.innerHTML = '';

        if (!state.seasons.length) {
            screen.querySelector('[data-role="episodes"]').innerHTML =
                '<p class="empty">Sem temporadas disponíveis para esta série.</p>';
            return;
        }

        // Botões T1, T2... só quando há mais de uma temporada.
        if (state.seasons.length > 1) {
            state.seasons.forEach(function (season) {
                var chip = App.el('button', 'chip focusable', 'T' + season.season);
                chip.type = 'button';
                chip.setAttribute('data-season', season.season);
                chipsBox.appendChild(chip);
            });
        }

        selectSeason(screen, state.seasons[0].season, false);
    }

    function openEpisodes(series) {
        if (!series || !state.section) return;

        state.mode = 'episodes';
        state.series = series;
        state.seasons = [];
        state.seasonNumber = null;
        state.episodes = [];
        state.episode = null;

        gridScreen().style.display = 'none';
        var screen = episodesScreen();
        screen.style.display = '';

        var favorite = global.Store.isFavorite('series', series.id);

        screen.innerHTML =
            '<div class="episodes-head">' +
                '<div class="detail-poster">' +
                    (series.poster
                        ? '<img class="detail-img" src="' + App.esc(series.poster) + '" alt="">'
                        : '<span class="detail-fallback">' + App.esc(App.initials(series.name)) + '</span>') +
                '</div>' +
                '<div class="detail-info">' +
                    '<h2 class="detail-title">' + App.esc(series.name) + '</h2>' +
                    '<p class="detail-meta" data-role="meta">' + App.esc(metaLine(series)) + '</p>' +
                    '<p class="plot" data-role="plot">' + App.esc(series.plot || 'Carregando sinopse...') + '</p>' +
                '</div>' +
            '</div>' +
            '<div class="chips" data-role="seasons"></div>' +
            '<div class="episodes-body">' +
                '<div class="episodes scroll" data-role="episodes">' +
                    '<p class="empty">Carregando episódios...</p>' +
                '</div>' +
                '<div class="episodes-side">' +
                    '<p class="episode-desc" data-role="ep-desc"></p>' +
                    '<div class="detail-actions">' +
                        '<button type="button" class="btn btn-primary focusable" data-action="watch">▶ Assistir</button>' +
                        '<button type="button" class="btn focusable' + (favorite ? ' is-fav' : '') +
                            '" data-action="fav">' + (favorite ? '★ Favorito' : '☆ Favorito') + '</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        var token = ++state.token;

        App.getSeriesInfo(series).then(function (data) {
            if (token !== state.token || state.mode !== 'episodes' || !state.section) return;

            state.seasons = data.seasons || [];

            var plot = screen.querySelector('[data-role="plot"]');
            var meta = screen.querySelector('[data-role="meta"]');
            if (plot && data.info && data.info.plot) plot.textContent = data.info.plot;
            if (meta) meta.textContent = metaLine(series, data.info);

            renderSeasons(screen);
        }).catch(function (error) {
            if (token !== state.token || state.mode !== 'episodes' || !state.section) return;
            screen.querySelector('[data-role="episodes"]').innerHTML = '<p class="empty">' +
                App.esc(error && error.message || 'Não foi possível carregar os episódios.') + '</p>';
        });

        var focusTarget = screen.querySelector('[data-action="watch"]');
        if (focusTarget) App.focus(focusTarget);
    }

    function closeEpisodes() {
        if (!state.section) return;

        var seriesId = state.series ? state.series.id : null;
        state.mode = 'grid';
        state.series = null;
        state.token++;

        episodesScreen().style.display = 'none';
        episodesScreen().innerHTML = '';
        gridScreen().style.display = '';

        if (seriesId !== null) {
            var card = state.section.querySelector('[data-index="' + indexOfSeries(seriesId) + '"]');
            if (card) App.focus(card);
        }
    }

    function indexOfSeries(seriesId) {
        for (var i = 0; i < state.items.length; i++) {
            if (String(state.items[i].id) === String(seriesId)) return i;
        }
        return -1;
    }

    function toggleFavorite() {
        if (!state.series) return;

        var added = App.toggleFavorite('series', {
            id: state.series.id,
            name: state.series.name,
            poster: state.series.poster,
            plot: state.series.plot,
            year: state.series.year,
            rating: state.series.rating
        });

        var button = episodesScreen().querySelector('[data-action="fav"]');
        if (button) {
            button.textContent = added ? '★ Favorito' : '☆ Favorito';
            button.classList.toggle('is-fav', added);
        }
    }

    function playSelected() {
        if (!state.series) return;

        var episode = state.episode || (state.episodes.length ? state.episodes[0] : null);
        if (!episode) {
            App.toast('Escolha uma temporada com episódios para assistir.');
            return;
        }

        App.playEpisode(state.series, episode, state.seasonNumber);
    }

    function bindEvents(section) {
        section.addEventListener('click', function (event) {
            if (App.dialogOpen()) return;

            var target = event.target;
            if (!target || !target.closest) return;

            if (target.closest('[data-action="watch"]')) {
                playSelected();
                return;
            }
            if (target.closest('[data-action="fav"]')) {
                toggleFavorite();
                return;
            }

            var categoryBtn = target.closest('[data-cat]');
            if (categoryBtn) {
                clearSearch(section);
                selectCategory(section, categoryBtn.getAttribute('data-cat'), true);
                return;
            }

            var seasonBtn = target.closest('[data-season]');
            if (seasonBtn) {
                selectSeason(episodesScreen(), seasonBtn.getAttribute('data-season'), false);
                return;
            }

            var episodeBtn = target.closest('[data-episode]');
            if (episodeBtn) {
                var episode = state.episodes[Number(episodeBtn.getAttribute('data-episode'))];
                if (episode) {
                    state.episode = episode;
                    updateEpisodeDescription();
                    App.playEpisode(state.series, episode, state.seasonNumber);
                }
                return;
            }

            var card = target.closest('[data-index]');
            if (card && state.mode === 'grid') {
                var series = state.items[Number(card.getAttribute('data-index'))];
                if (series) openEpisodes(series);
            }
        });

        section.addEventListener('input', function (event) {
            var input = event.target;
            if (!input || input.getAttribute('data-role') !== 'search') return;

            state.query = input.value.trim();
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () { runSearch(section); }, 250);
        });

        section.addEventListener('focusin', function (event) {
            var target = event.target;
            if (!target || !target.closest) return;

            var episodeBtn = target.closest('[data-episode]');
            if (episodeBtn) {
                var episode = state.episodes[Number(episodeBtn.getAttribute('data-episode'))];
                if (episode) {
                    state.episode = episode;
                    updateEpisodeDescription();
                }
            }
        });
    }

    var SeriesView = {
        render: function (section, payload) {
            state.section = section;
            state.catalog = null;
            state.mode = 'grid';
            state.series = null;
            state.query = '';

            buildShell(section);
            bindEvents(section);

            App.loader(true, 'Carregando séries...');

            App.loadCatalog().then(function (catalog) {
                App.loader(false);
                state.catalog = catalog;

                if (!catalog.series.items.length) {
                    section.querySelector('[data-role="grid"]').innerHTML =
                        '<p class="empty">Séries ficam disponíveis apenas em listas Xtream Codes.</p>';
                    return;
                }

                renderCategories(section);
                selectCategory(section, 'all', !(payload && payload.seriesId));

                // Vindo de Favoritos: abre direto a tela de episódios da série.
                if (payload && payload.seriesId) {
                    var target = App.items('series', 'all').filter(function (item) {
                        return String(item.id) === String(payload.seriesId);
                    })[0];

                    if (target) {
                        openEpisodes(target);
                    } else {
                        App.toast('Esta série não está na lista atual.');
                    }
                }
            }).catch(function (error) {
                App.loader(false);
                section.querySelector('[data-role="grid"]').innerHTML =
                    '<p class="empty">' + App.esc(error && error.message || 'Falha ao carregar as séries.') + '</p>';
                App.toast(error && error.message || 'Falha ao carregar as séries.');
            });
        },

        /* BACK: na tela de episódios volta para a grade e consome a tecla. */
        back: function () {
            if (state.mode === 'episodes') {
                closeEpisodes();
                return true;
            }
            return false;
        },

        onKey: function (code) {
            if (code === App.KEY.YELLOW && state.mode === 'episodes') {
                toggleFavorite();
                return true;
            }
            return false;
        },

        destroy: function () {
            clearTimeout(searchTimer);
            state.token++;
            state.section = null;
            state.series = null;
            state.mode = 'grid';
            state.seasons = [];
            state.episodes = [];
        }
    };

    App.registerView('series', SeriesView);

})(window);
